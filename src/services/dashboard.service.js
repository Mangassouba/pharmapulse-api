import { eq, and, isNull, gt, gte, lte, asc } from 'drizzle-orm'
import db from '../config/database.js'
import { batches, products } from '../db/schema.js'
import { getSalesStats } from './sale.service.js'
import { getProductStats } from './product.service.js'
import { getMovementStats } from './movement.service.js'

export async function getDashboardData(pharmacyId) {
  const [salesStats, productStats, movementStats, expiringBatches, alerts] = await Promise.all([
    getSalesStats(pharmacyId),
    getProductStats(pharmacyId),
    getMovementStats(pharmacyId),

    // Batches expiring in 30 days
    db.query.batches.findMany({
      where: and(
        eq(batches.pharmacyId, pharmacyId),
        eq(batches.status, 'ACTIVE'),
        isNull(batches.deletedAt),
        lte(batches.expiration_date, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        gte(batches.expiration_date, new Date()),
      ),
      with: { product: { columns: { id: true, name: true } } },
      orderBy: [asc(batches.expiration_date)],
      limit: 10,
    }),

    // Products needing alerts
    db.query.products.findMany({
      where: and(eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt), eq(products.stock, 0)),
      columns: { id: true, name: true, stock: true, threshold: true, status: true },
      limit: 20,
    }),
  ])

  // Low stock (not out of stock)
  const lowStockProducts = await db.query.products.findMany({
    where: and(eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt), gt(products.stock, 0)),
    columns: { id: true, name: true, stock: true, threshold: true },
    with: { category: { columns: { name: true } } },
  })
  const lowStock = lowStockProducts.filter(p => p.stock < p.threshold)

  return {
    sales:     salesStats,
    products:  productStats,
    movements: movementStats,
    expiringBatches,
    alerts: {
      outOfStock: alerts,
      lowStock:   lowStock.slice(0, 10),
      total:      alerts.length + lowStock.length,
    },
  }
}
