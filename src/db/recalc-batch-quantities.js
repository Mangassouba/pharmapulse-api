/**
 * Recalcule la quantité des lots à partir du stock des produits.
 *
 * Avant la sortie automatique des lots (FEFO), les ventes ne diminuaient jamais les lots :
 * leurs quantités sont donc trop élevées. Le stock du produit, lui, est juste. Les lots qui
 * expirent en premier sortent en premier : le stock restant se trouve dans les lots qui
 * expirent le plus tard. On répartit donc le stock du produit sur ses lots, du plus tardif au
 * plus proche, sans jamais dépasser la quantité actuelle d'un lot ; les autres passent à 0.
 *
 *   npm run db:recalc-batches                     → simulation : affiche les changements, n'écrit rien
 *   npm run db:recalc-batches -- --apply          → applique les changements
 *   npm run db:recalc-batches -- --pharmacy=12    → limite à une pharmacie (avec ou sans --apply)
 *
 * Idempotent : relancé après --apply, il n'a plus rien à changer.
 */
import 'dotenv/config'
import { pathToFileURL } from 'url'
import { eq, and, isNull, inArray, desc } from 'drizzle-orm'
import db, { pool } from '../config/database.js'
import { products, batches } from './schema.js'

/**
 * Nouvelle quantité et nouveau statut de chaque lot d'un produit.
 * `list` : lots du produit triés du plus tardif au plus proche (expiration, puis id).
 */
export function allocate(stock, list, now = new Date()) {
  let remaining = Math.max(0, Number(stock) || 0)
  return list.map(b => {
    const quantity = Math.min(remaining, Math.max(0, b.quantity))
    remaining -= quantity

    let status = b.status
    if (quantity === 0 && status === 'ACTIVE') status = 'DEPLETED'
    if (quantity > 0 && status === 'DEPLETED') status = new Date(b.expiration_date) < now ? 'EXPIRED' : 'ACTIVE'
    return { id: b.id, number: b.number, before: b.quantity, quantity, statusBefore: b.status, status }
  })
}

function parseArgs(argv) {
  const apply    = argv.includes('--apply')
  const pharmacy = argv.find(a => a.startsWith('--pharmacy='))?.split('=')[1]
  if (pharmacy !== undefined && !/^\d+$/.test(pharmacy)) throw new Error('--pharmacy doit être un identifiant numérique')
  return { apply, pharmacyId: pharmacy ? Number(pharmacy) : null }
}

async function main() {
  const { apply, pharmacyId } = parseArgs(process.argv.slice(2))
  console.log(apply ? '▶ Mode APPLICATION : les quantités vont être modifiées.\n' : '▶ Mode SIMULATION : rien ne sera modifié (ajoutez --apply pour appliquer).\n')

  // Produits qui ont au moins un lot
  const productIds = (await db.selectDistinct({ id: batches.productId }).from(batches)
    .where(and(isNull(batches.deletedAt), pharmacyId ? eq(batches.pharmacyId, pharmacyId) : undefined)))
    .map(r => r.id)
  if (!productIds.length) return console.log('Aucun lot trouvé.')

  const productRows = await db.select({ id: products.id, name: products.name, stock: products.stock, pharmacyId: products.pharmacyId })
    .from(products).where(inArray(products.id, productIds))

  let changedBatches = 0, changedProducts = 0, removed = 0
  for (const product of productRows.sort((a, b) => a.pharmacyId - b.pharmacyId || a.name.localeCompare(b.name))) {
    // Une transaction par produit, lots verrouillés : une vente simultanée attend la fin du recalcul
    const changes = await db.transaction(async (tx) => {
      const [{ stock }] = await tx.select({ stock: products.stock }).from(products).where(eq(products.id, product.id)).for('update')
      const list = await tx.select().from(batches)
        .where(and(eq(batches.productId, product.id), eq(batches.pharmacyId, product.pharmacyId), isNull(batches.deletedAt)))
        .orderBy(desc(batches.expiration_date), desc(batches.id))
        .for('update')

      const result = allocate(stock, list).filter(r => r.quantity !== r.before || r.status !== r.statusBefore)
      if (apply) {
        for (const r of result) {
          await tx.update(batches).set({ quantity: r.quantity, status: r.status }).where(eq(batches.id, r.id))
        }
      }
      return { stock, total: list.reduce((s, b) => s + b.quantity, 0), result }
    })

    if (!changes.result.length) continue
    changedProducts++
    changedBatches += changes.result.length
    console.log(`Pharmacie ${product.pharmacyId} · ${product.name} — stock produit ${changes.stock}, total des lots ${changes.total}`)
    for (const r of changes.result) {
      removed += r.before - r.quantity
      const status = r.status !== r.statusBefore ? `  (${r.statusBefore} → ${r.status})` : ''
      console.log(`    lot ${r.number} : ${r.before} → ${r.quantity}${status}`)
    }
  }

  console.log(`\n${changedBatches} lot(s) à corriger sur ${changedProducts} produit(s), ${removed} unité(s) retirée(s) des lots.`)
  if (!apply && changedBatches) console.log('Simulation uniquement. Relancez avec --apply pour appliquer.')
  if (apply) console.log('Changements appliqués.')
}

// Lancé en commande (pas quand le fichier est importé, ex. par un test)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e.message ?? e); process.exitCode = 1 }).finally(() => pool.end())
}
