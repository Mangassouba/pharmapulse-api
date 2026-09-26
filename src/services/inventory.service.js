import prisma from '../config/database.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

export async function applyInventory(pharmacyId, userId, items, req) {
  const results = []

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const product = await tx.products.findFirst({
        where: { id: item.productId, pharmacyId, deletedAt: null },
      })
      if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

      const diff       = item.stock - product.stock
      const newStock   = item.stock

      // Save inventory record
      const inv = await tx.inventories.create({
        data: {
          productId:      item.productId,
          pharmacyId,
          userId,
          stock:          newStock,
          expected_stock: product.stock,
          difference:     diff,
          notes:          item.notes || null,
        },
      })

      // Update product stock
      await tx.products.update({
        where: { id: item.productId },
        data: {
          stock:  newStock,
          status: newStock === 0 ? 'OUT_OF_STOCK' : 'AVAILABLE',
        },
      })

      // Create stock movement only if there's a difference
      if (diff !== 0) {
        await tx.stockMovements.create({
          data: {
            productId:      item.productId,
            pharmacyId,
            userId,
            type:           'INVENTORY',
            quantity:       diff,
            previous_stock: product.stock,
            new_stock:      newStock,
            reference_id:   inv.id,
            reason:         item.notes || 'Ajustement inventaire',
          },
        })
      }

      results.push({ productId: item.productId, name: product.name, previousStock: product.stock, newStock, diff })
    }
  })

  await createAuditLog({
    action: 'INVENTORY', entity: 'inventories', entity_id: 0,
    new_values: { itemCount: items.length }, userId, pharmacyId, req,
  })

  return results
}

export async function getInventories(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { productId, dateFrom, dateTo } = query

  const where = {
    pharmacyId,
    deletedAt: null,
    ...(productId && { productId: parseInt(productId) }),
    ...(dateFrom || dateTo ? {
      inventory_date: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
      },
    } : {}),
  }

  const [inventories, total] = await prisma.$transaction([
    prisma.inventories.findMany({
      where, skip, take,
      include: {
        product: { select: { id: true, name: true, unit_type: true } },
        user:    { select: { id: true, name: true } },
      },
      orderBy: { inventory_date: 'desc' },
    }),
    prisma.inventories.count({ where }),
  ])

  return { inventories, total, page, pageSize }
}
