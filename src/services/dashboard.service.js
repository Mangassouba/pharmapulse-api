import prisma from '../config/database.js'
import { getSalesStats } from './sale.service.js'
import { getProductStats } from './product.service.js'
import { getMovementStats } from './movement.service.js'

export async function getDashboardData(pharmacyId) {
  const [salesStats, productStats, movementStats, expiringBatches, alerts] = await Promise.all([
    getSalesStats(pharmacyId),
    getProductStats(pharmacyId),
    getMovementStats(pharmacyId),

    // Batches expiring in 30 days
    prisma.batches.findMany({
      where: {
        pharmacyId,
        status: 'ACTIVE',
        deletedAt: null,
        expiration_date: {
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          gte: new Date(),
        },
      },
      include: { product: { select: { id: true, name: true } } },
      orderBy: { expiration_date: 'asc' },
      take: 10,
    }),

    // Products needing alerts
    prisma.products.findMany({
      where: { pharmacyId, deletedAt: null, stock: 0 },
      select: { id: true, name: true, stock: true, threshold: true, status: true },
      take: 20,
    }),
  ])

  // Low stock (not out of stock)
  const lowStockProducts = await prisma.products.findMany({
    where: { pharmacyId, deletedAt: null, stock: { gt: 0 } },
    select: { id: true, name: true, stock: true, threshold: true, category: { select: { name: true } } },
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
