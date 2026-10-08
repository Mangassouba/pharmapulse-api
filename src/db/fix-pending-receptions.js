/**
 * Corrige les lots des réceptions EN ATTENTE créées avant la mise à jour « lots alimentés à la validation ».
 *
 * Avant : créer une réception ajoutait tout de suite sa quantité à ses lots.
 * Maintenant : la quantité n'entre dans les lots qu'à la validation.
 * Une ancienne réception encore en attente ajouterait donc sa quantité deux fois une fois validée.
 * Ce script retire de ses lots la quantité ajoutée trop tôt. La réception reste en attente :
 * la valider ensuite ajoute la quantité une seule fois, l'annuler ne laisse rien en trop.
 *
 *   npm run db:fix-pending-receptions -- --before=2026-10-08T20:00:00Z            → simulation
 *   npm run db:fix-pending-receptions -- --before=2026-10-08T20:00:00Z --apply    → applique
 *   (option : --pharmacy=12 pour une seule pharmacie)
 *
 * --before (obligatoire) : date/heure du déploiement de la mise à jour (voir les « Events » sur Render).
 * Seules les réceptions créées avant ce moment sont concernées.
 *
 * Idempotent : chaque réception corrigée est notée dans auditLogs (FIX_PENDING_RECEPTION) et ignorée ensuite.
 */
import 'dotenv/config'
import { pathToFileURL } from 'url'
import { eq, and, isNull, lt, inArray } from 'drizzle-orm'
import db, { pool } from '../config/database.js'
import { receptions, receptionDetails, batches, auditLogs } from './schema.js'

const ACTION = 'FIX_PENDING_RECEPTION'

/**
 * Corrections à faire pour une réception.
 * Un lot créé par la réception a le même createdAt qu'elle (même transaction, now() identique) :
 * l'ancien code lui avait aussi mis initial_quantity = quantité reçue, qu'on remet à 0.
 * Un lot créé par la réception avec initial_quantity = 0 prouve que la réception suit déjà la
 * nouvelle règle : on n'y touche pas (skip).
 */
export function planFix(reception, details, batchById) {
  const perBatch = new Map()
  for (const d of details) {
    if (d.batchId) perBatch.set(d.batchId, (perBatch.get(d.batchId) ?? 0) + Number(d.quantity))
  }

  const changes = []
  for (const [batchId, received] of perBatch) {
    const b = batchById.get(batchId)
    if (!b || b.deletedAt) continue
    const createdHere = new Date(b.createdAt).getTime() === new Date(reception.createdAt).getTime()
    if (createdHere && Number(b.initial_quantity) === 0) return { skip: 'déjà au nouveau format', changes: [] }

    const quantity = Math.max(0, b.quantity - received)
    changes.push({
      id: b.id,
      number: b.number,
      received,
      before: { quantity: b.quantity, initial_quantity: b.initial_quantity, status: b.status },
      after: {
        quantity,
        initial_quantity: createdHere ? Math.max(0, b.initial_quantity - received) : b.initial_quantity,
        // A batch that existed before and is now empty is depleted (validation reactivates it)
        status: quantity === 0 && !createdHere && b.status === 'ACTIVE' ? 'DEPLETED' : b.status,
      },
      // Part already sold out of the batch: cannot be taken back, reported only
      shortfall: Math.max(0, received - b.quantity),
    })
  }
  return { skip: null, changes }
}

function parseArgs(argv) {
  const get = name => argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
  const before = get('before')
  if (!before || isNaN(new Date(before))) {
    throw new Error('Indiquez la date du déploiement : --before=2026-10-08T20:00:00Z (date/heure ISO, Z = UTC)')
  }
  const pharmacy = get('pharmacy')
  if (pharmacy !== undefined && !/^\d+$/.test(pharmacy)) throw new Error('--pharmacy doit être un identifiant numérique')
  return { apply: argv.includes('--apply'), before: new Date(before), pharmacyId: pharmacy ? Number(pharmacy) : null }
}

async function main() {
  const { apply, before, pharmacyId } = parseArgs(process.argv.slice(2))
  console.log(apply ? '▶ Mode APPLICATION : les lots vont être modifiés.' : '▶ Mode SIMULATION : rien ne sera modifié (ajoutez --apply pour appliquer).')
  console.log(`  Réceptions en attente créées avant le ${before.toISOString()}\n`)

  const pending = await db.select({ id: receptions.id }).from(receptions).where(and(
    eq(receptions.status, 'PENDING'),
    isNull(receptions.deletedAt),
    lt(receptions.createdAt, before),
    pharmacyId ? eq(receptions.pharmacyId, pharmacyId) : undefined,
  ))
  const done = new Set(pending.length
    ? (await db.select({ id: auditLogs.entity_id }).from(auditLogs).where(and(
        eq(auditLogs.action, ACTION), eq(auditLogs.entity, 'receptions'), inArray(auditLogs.entity_id, pending.map(r => r.id)),
      ))).map(r => r.id)
    : [])
  const todo = pending.filter(r => !done.has(r.id))
  console.log(`${pending.length} réception(s) en attente concernée(s), ${done.size} déjà corrigée(s).\n`)

  let fixed = 0, batchesChanged = 0, totalShortfall = 0
  for (const { id } of todo) {
    const outcome = await db.transaction(async (tx) => {
      // Locked and re-checked: it may have been validated since the list was read
      const [reception] = await tx.select().from(receptions).where(eq(receptions.id, id)).for('update')
      if (reception.status !== 'PENDING') return { reception, skip: 'plus en attente' }

      const details = await tx.select().from(receptionDetails).where(eq(receptionDetails.receptionId, id))
      const ids = [...new Set(details.map(d => d.batchId).filter(Boolean))]
      const rows = ids.length ? await tx.select().from(batches).where(inArray(batches.id, ids)).for('update') : []
      const plan = planFix(reception, details, new Map(rows.map(b => [b.id, b])))
      if (plan.skip) return { reception, skip: plan.skip }

      if (apply) {
        for (const c of plan.changes) {
          await tx.update(batches).set(c.after).where(eq(batches.id, c.id))
        }
        await tx.insert(auditLogs).values({
          action: ACTION, entity: 'receptions', entity_id: id, pharmacyId: reception.pharmacyId,
          old_values: plan.changes.map(c => ({ batchId: c.id, ...c.before })),
          new_values: plan.changes.map(c => ({ batchId: c.id, ...c.after })),
        })
      }
      return { reception, changes: plan.changes }
    })

    const r = outcome.reception
    const label = `Réception #${r.id} · pharmacie ${r.pharmacyId} · ${r.supplier} · ${new Date(r.createdAt).toLocaleDateString('fr-FR')}`
    if (outcome.skip) { console.log(`${label} — ignorée (${outcome.skip})`); continue }

    fixed++
    if (!outcome.changes.length) { console.log(`${label} — aucun lot à corriger (pas de numéro de lot)`); continue }
    console.log(label)
    for (const c of outcome.changes) {
      batchesChanged++
      totalShortfall += c.shortfall
      const status = c.after.status !== c.before.status ? `, ${c.before.status} → ${c.after.status}` : ''
      const initial = c.after.initial_quantity !== c.before.initial_quantity ? `, quantité initiale ${c.before.initial_quantity} → ${c.after.initial_quantity}` : ''
      const warn = c.shortfall ? `  ⚠ ${c.shortfall} déjà vendu(s) depuis ce lot` : ''
      console.log(`    lot ${c.number} : −${c.received} → ${c.before.quantity} → ${c.after.quantity}${initial}${status}${warn}`)
    }
  }

  console.log(`\n${fixed} réception(s) ${apply ? 'corrigée(s)' : 'à corriger'}, ${batchesChanged} lot(s) modifié(s).`)
  if (totalShortfall) {
    console.log(`⚠ ${totalShortfall} unité(s) avaient déjà été vendues depuis ces lots : ils sont mis à 0.`)
    console.log('  Lancez ensuite npm run db:recalc-batches pour réaligner les lots sur le stock des produits.')
  }
  if (!apply && fixed) console.log('Simulation uniquement. Relancez avec --apply pour appliquer.')
}

// Lancé en commande (pas quand le fichier est importé, ex. par un test)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e.message ?? e); process.exitCode = 1 }).finally(() => pool.end())
}
