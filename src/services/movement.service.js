import { eq, and, gte, lte, inArray, desc, count, sum } from 'drizzle-orm'
import db from '../config/database.js'
import { stockMovements, products } from '../db/schema.js'
import { contains } from '../db/helpers.js'
import { getPaginationParams } from '../utils/response.js'

export async function getMovements(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { type, productId, dateFrom, dateTo, search } = query

  const where = and(
    eq(stockMovements.pharmacyId, pharmacyId),
    type      ? eq(stockMovements.type, type) : undefined,
    productId ? eq(stockMovements.productId, parseInt(productId)) : undefined,
    dateFrom  ? gte(stockMovements.movement_date, new Date(dateFrom)) : undefined,
    dateTo    ? lte(stockMovements.movement_date, new Date(dateTo + 'T23:59:59')) : undefined,
    search
      ? inArray(stockMovements.productId, db.select({ id: products.id }).from(products).where(contains(products.name, search)))
      : undefined,
  )

  const [movements, [{ total }]] = await Promise.all([
    db.query.stockMovements.findMany({
      where, offset: skip, limit: take,
      with: {
        product: { columns: { id: true, name: true, unit_type: true } },
        user:    { columns: { id: true, name: true } },
        batch:   { columns: { id: true, number: true } },
      },
      orderBy: [desc(stockMovements.movement_date)],
    }),
    db.select({ total: count() }).from(stockMovements).where(where),
  ])

  return { movements, total, page, pageSize }
}

function aggregateByType(pharmacyId, type) {
  return db
    .select({ sum: sum(stockMovements.quantity).mapWith(Number), count: count() })
    .from(stockMovements)
    .where(and(eq(stockMovements.pharmacyId, pharmacyId), eq(stockMovements.type, type)))
    .then(([row]) => row)
}

export async function getMovementStats(pharmacyId) {
  const [totalEntries, totalSales, [{ totalAdjustments }], recentMovements] = await Promise.all([
    aggregateByType(pharmacyId, 'ENTRY'),
    aggregateByType(pharmacyId, 'SALE'),
    db.select({ totalAdjustments: count() }).from(stockMovements)
      .where(and(eq(stockMovements.pharmacyId, pharmacyId), eq(stockMovements.type, 'INVENTORY'))),
    db.query.stockMovements.findMany({
      where: eq(stockMovements.pharmacyId, pharmacyId),
      orderBy: [desc(stockMovements.movement_date)],
      limit: 10,
      with: {
        product: { columns: { id: true, name: true } },
        user:    { columns: { id: true, name: true } },
      },
    }),
  ])

  return {
    totalEntries:    totalEntries.sum || 0,
    entriesCount:    totalEntries.count,
    totalSales:      Math.abs(totalSales.sum || 0),
    salesCount:      totalSales.count,
    totalAdjustments,
    recentMovements,
  }
}
