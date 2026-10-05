import { eq, and, isNull, gte, lte, desc, count } from 'drizzle-orm'
import db from '../config/database.js'
import { products, inventories, stockMovements } from '../db/schema.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

export async function applyInventory(pharmacyId, userId, items, req) {
  const results = []

  await db.transaction(async (tx) => {
    for (const item of items) {
      const product = await tx.query.products.findFirst({
        where: and(eq(products.id, item.productId), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
      })
      if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

      const diff       = item.stock - product.stock
      const newStock   = item.stock

      // Save inventory record
      const [inv] = await tx.insert(inventories).values({
        productId:      item.productId,
        pharmacyId,
        userId,
        stock:          newStock,
        expected_stock: product.stock,
        difference:     diff,
        notes:          item.notes || null,
      }).returning({ id: inventories.id })

      // Update product stock
      await tx.update(products)
        .set({
          stock:  newStock,
          status: newStock === 0 ? 'OUT_OF_STOCK' : 'AVAILABLE',
        })
        .where(eq(products.id, item.productId))

      // Create stock movement only if there's a difference
      if (diff !== 0) {
        await tx.insert(stockMovements).values({
          productId:      item.productId,
          pharmacyId,
          userId,
          type:           'INVENTORY',
          quantity:       diff,
          previous_stock: product.stock,
          new_stock:      newStock,
          reference_id:   inv.id,
          reason:         item.notes || 'Ajustement inventaire',
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

  const where = and(
    eq(inventories.pharmacyId, pharmacyId),
    isNull(inventories.deletedAt),
    productId ? eq(inventories.productId, parseInt(productId)) : undefined,
    dateFrom  ? gte(inventories.inventory_date, new Date(dateFrom)) : undefined,
    dateTo    ? lte(inventories.inventory_date, new Date(dateTo + 'T23:59:59')) : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db.query.inventories.findMany({
      where, offset: skip, limit: take,
      with: {
        product: { columns: { id: true, name: true, unit_type: true } },
        user:    { columns: { id: true, name: true } },
      },
      orderBy: [desc(inventories.inventory_date)],
    }),
    db.select({ total: count() }).from(inventories).where(where),
  ])

  return { inventories: rows, total, page, pageSize }
}
