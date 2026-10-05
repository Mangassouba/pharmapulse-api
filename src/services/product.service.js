import { eq, ne, and, isNull, gt, lt, asc, desc, count, sum } from 'drizzle-orm'
import db from '../config/database.js'
import { products, batches, stockMovements } from '../db/schema.js'
import { contains, toRow, withCounts } from '../db/helpers.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

const withCategory = { category: { columns: { id: true, name: true } } }

export async function getProducts(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const where = buildWhere(pharmacyId, query)

  const [rows, [{ total }]] = await Promise.all([
    db.query.products.findMany({
      where,
      offset: skip, limit: take,
      with: {
        ...withCategory,
        user: { columns: { id: true, name: true } },
      },
      orderBy: [asc(products.name)],
    }),
    db.select({ total: count() }).from(products).where(where),
  ])

  const productsWithCounts = await withCounts(rows, {
    batches:        [batches, batches.productId],
    stockMovements: [stockMovements, stockMovements.productId],
  })

  return { products: productsWithCounts, total, page, pageSize }
}

function buildWhere(pharmacyId, query) {
  const { search, status, categoryId, lowStock, outOfStock } = query
  return and(
    eq(products.pharmacyId, pharmacyId),
    isNull(products.deletedAt),
    search     ? contains(products.name, search) : undefined,
    status     ? eq(products.status, status) : undefined,
    categoryId ? eq(products.categoryId, parseInt(categoryId)) : undefined,
    outOfStock === 'true' ? eq(products.stock, 0) : undefined,
    ...(lowStock === 'true' ? [gt(products.stock, 0), lt(products.stock, products.threshold)] : []),
  )
}

export async function getProductById(id, pharmacyId, req) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
    with: {
      category: { columns: { id: true, name: true, description: true } },
      user:     { columns: { id: true, name: true } },
      batches:  {
        where: (b, { eq, and, isNull }) => and(eq(b.status, 'ACTIVE'), isNull(b.deletedAt)),
        orderBy: (b, { asc }) => [asc(b.expiration_date)],
      },
      stockMovements: {
        orderBy: (m, { desc }) => [desc(m.movement_date)],
        limit: 10,
        with: { user: { columns: { id: true, name: true } } },
      },
    },
  })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }
  return product
}

export async function createProduct(pharmacyId, userId, data, req) {
  // Barcode uniqueness check
  const existing = await db.query.products.findFirst({
    where: and(eq(products.barcode, data.barcode), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
  })
  if (existing) throw { statusCode: 409, message: req.t('product.barcode_taken') }

  const [created] = await db.insert(products).values({
    ...toRow(products, data),
    pharmacyId,
    userId,
    sale_price:     parseFloat(data.sale_price),
    purchase_price: parseFloat(data.purchase_price),
    stock:          parseFloat(data.stock || 0),
    threshold:      parseFloat(data.threshold || 10),
  }).returning({ id: products.id, stock: products.stock })

  // Create initial stock movement if stock > 0
  if (created.stock > 0) {
    await db.insert(stockMovements).values({
      productId:    created.id,
      pharmacyId,
      userId,
      type:         'ENTRY',
      quantity:     created.stock,
      previous_stock: 0,
      new_stock:    created.stock,
      reason:       'Stock initial',
    })
  }

  const product = await db.query.products.findFirst({ where: eq(products.id, created.id), with: withCategory })

  await createAuditLog({
    action: 'CREATE', entity: 'products', entity_id: product.id,
    new_values: data, userId, pharmacyId, req,
  })

  return product
}

export async function updateProduct(id, pharmacyId, userId, data, req) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
  })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

  // Barcode uniqueness check (exclude self)
  if (data.barcode && data.barcode !== product.barcode) {
    const existing = await db.query.products.findFirst({
      where: and(
        eq(products.barcode, data.barcode), eq(products.pharmacyId, pharmacyId),
        isNull(products.deletedAt), ne(products.id, id),
      ),
    })
    if (existing) throw { statusCode: 409, message: req.t('product.barcode_taken') }
  }

  await db.update(products)
    .set({
      ...toRow(products, data),
      ...(data.sale_price     !== undefined && { sale_price: parseFloat(data.sale_price) }),
      ...(data.purchase_price !== undefined && { purchase_price: parseFloat(data.purchase_price) }),
      ...(data.threshold      !== undefined && { threshold: parseFloat(data.threshold) }),
    })
    .where(eq(products.id, id))

  const updated = await db.query.products.findFirst({ where: eq(products.id, id), with: withCategory })

  await createAuditLog({
    action: 'UPDATE', entity: 'products', entity_id: id,
    old_values: product, new_values: data, userId, pharmacyId, req,
  })

  return updated
}

export async function deleteProduct(id, pharmacyId, userId, req) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
  })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

  await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, id))

  await createAuditLog({
    action: 'DELETE', entity: 'products', entity_id: id,
    old_values: product, userId, pharmacyId, req,
  })
}

export async function getProductStats(pharmacyId) {
  const active = and(eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt))

  const [[{ total, totalUnits }], [{ outOfStock }], [{ lowStock }]] = await Promise.all([
    db.select({ total: count(), totalUnits: sum(products.stock).mapWith(Number) }).from(products).where(active),
    db.select({ outOfStock: count() }).from(products).where(and(active, eq(products.stock, 0))),
    db.select({ lowStock: count() }).from(products)
      .where(and(active, gt(products.stock, 0), lt(products.stock, products.threshold))),
  ])

  return { total, outOfStock, lowStock, totalUnits: totalUnits || 0 }
}
