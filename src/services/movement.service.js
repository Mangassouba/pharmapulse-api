import prisma from '../config/database.js'
import { getPaginationParams } from '../utils/response.js'

export async function getMovements(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { type, productId, dateFrom, dateTo, search } = query

  const where = {
    pharmacyId,
    ...(type      && { type }),
    ...(productId && { productId: parseInt(productId) }),
    ...(dateFrom || dateTo ? {
      movement_date: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
      },
    } : {}),
    ...(search && {
      product: { name: { contains: search, mode: 'insensitive' } },
    }),
  }

  const [movements, total] = await prisma.$transaction([
    prisma.stockMovements.findMany({
      where, skip, take,
      include: {
        product: { select: { id: true, name: true, unit_type: true } },
        user:    { select: { id: true, name: true } },
        batch:   { select: { id: true, number: true } },
      },
      orderBy: { movement_date: 'desc' },
    }),
    prisma.stockMovements.count({ where }),
  ])

  return { movements, total, page, pageSize }
}

export async function getMovementStats(pharmacyId) {
  const [totalEntries, totalSales, totalAdjustments, recentMovements] = await Promise.all([
    prisma.stockMovements.aggregate({
      where: { pharmacyId, type: 'ENTRY' },
      _sum: { quantity: true },
      _count: true,
    }),
    prisma.stockMovements.aggregate({
      where: { pharmacyId, type: 'SALE' },
      _sum: { quantity: true },
      _count: true,
    }),
    prisma.stockMovements.count({ where: { pharmacyId, type: 'INVENTORY' } }),
    prisma.stockMovements.findMany({
      where: { pharmacyId },
      orderBy: { movement_date: 'desc' },
      take: 10,
      include: {
        product: { select: { id: true, name: true } },
        user:    { select: { id: true, name: true } },
      },
    }),
  ])

  return {
    totalEntries:    totalEntries._sum.quantity  || 0,
    entriesCount:    totalEntries._count,
    totalSales:      Math.abs(totalSales._sum.quantity || 0),
    salesCount:      totalSales._count,
    totalAdjustments,
    recentMovements,
  }
}
