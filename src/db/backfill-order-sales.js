/**
 * Crée les ventes manquantes pour les commandes déjà validées (retirées)
 * avant que la validation n'enregistre automatiquement une vente.
 * Idempotent : une commande dont la vente CMD-xxxxxx existe déjà est ignorée.
 *
 *   npm run db:backfill-order-sales
 */
import 'dotenv/config'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import db, { pool } from '../config/database.js'
import { orders, sales } from './schema.js'
import { createSaleFromOrder, orderInvoiceNumber } from '../services/sale.service.js'

async function main() {
  const completed = await db.query.orders.findMany({
    where: and(eq(orders.status, 'COMPLETED'), isNull(orders.deletedAt)),
    with: { details: true },
  })
  if (!completed.length) return console.log('Aucune commande validée.')

  const invoices = completed.map(o => orderInvoiceNumber(o.id))
  const existing = new Set(
    (await db.select({ inv: sales.invoice_number }).from(sales).where(inArray(sales.invoice_number, invoices)))
      .map(r => r.inv),
  )

  let created = 0
  for (const order of completed) {
    if (existing.has(orderInvoiceNumber(order.id))) continue
    await db.transaction(tx => createSaleFromOrder(tx, order, {
      userId:    order.validated_by,
      sale_date: order.validated_at ?? order.updatedAt,
    }))
    created++
  }
  console.log(`${created} vente(s) créée(s), ${completed.length - created} déjà présente(s).`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => pool.end())
