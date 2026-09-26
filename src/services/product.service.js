import prisma from '../config/database.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

export async function getProducts(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, status, categoryId, lowStock, outOfStock } = query

  const where = {
    pharmacyId,
    deletedAt: null,
    ...(search && { name: { contains: search, mode: 'insensitive' } }),
    ...(status && { status }),
    ...(categoryId && { categoryId: parseInt(categoryId) }),
    ...(lowStock === 'true' && { stock: { gt: 0 }, AND: [{ stock: { lt: prisma.products.fields.threshold } }] }),
    ...(outOfStock === 'true' && { stock: 0 }),
  }

  // Handle lowStock/outOfStock filter with a raw approach
  let finalWhere = { pharmacyId, deletedAt: null }
  if (search)     finalWhere.name = { contains: search, mode: 'insensitive' }
  if (status)     finalWhere.status = status
  if (categoryId) finalWhere.categoryId = parseInt(categoryId)
  if (outOfStock === 'true') finalWhere.stock = 0
  if (lowStock === 'true')   finalWhere = { ...finalWhere, stock: { gt: 0, lt: prisma.raw ? undefined : 0 } }

  // Use simpler approach for threshold comparison
  const [products, total] = await prisma.$transaction([
    prisma.products.findMany({
      where: buildWhere(pharmacyId, query),
      skip, take,
      include: {
        category: { select: { id: true, name: true } },
        user:     { select: { id: true, name: true } },
        _count:   { select: { batches: true, stockMovements: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.products.count({ where: buildWhere(pharmacyId, query) }),
  ])

  return { products, total, page, pageSize }
}

function buildWhere(pharmacyId, query) {
  const { search, status, categoryId, lowStock, outOfStock } = query
  const w = { pharmacyId, deletedAt: null }
  if (search)            w.name = { contains: search, mode: 'insensitive' }
  if (status)            w.status = status
  if (categoryId)        w.categoryId = parseInt(categoryId)
  if (outOfStock === 'true') w.stock = 0
  // lowStock is handled post-fetch or via raw
  return w
}

export async function getProductById(id, pharmacyId, req) {
  const product = await prisma.products.findFirst({
    where: { id, pharmacyId, deletedAt: null },
    include: {
      category:  { select: { id: true, name: true, description: true } },
      user:      { select: { id: true, name: true } },
      batches:   {
        where: { status: 'ACTIVE', deletedAt: null },
        orderBy: { expiration_date: 'asc' },
      },
      stockMovements: {
        orderBy: { movement_date: 'desc' },
        take: 10,
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }
  return product
}

export async function createProduct(pharmacyId, userId, data, req) {
  // Barcode uniqueness check
  const existing = await prisma.products.findFirst({
    where: { barcode: data.barcode, pharmacyId, deletedAt: null },
  })
  if (existing) throw { statusCode: 409, message: req.t('product.barcode_taken') }

  const product = await prisma.products.create({
    data: {
      ...data,
      pharmacyId,
      userId,
      sale_price:     parseFloat(data.sale_price),
      purchase_price: parseFloat(data.purchase_price),
      stock:          parseFloat(data.stock || 0),
      threshold:      parseFloat(data.threshold || 10),
    },
    include: { category: { select: { id: true, name: true } } },
  })

  // Create initial stock movement if stock > 0
  if (product.stock > 0) {
    await prisma.stockMovements.create({
      data: {
        productId:    product.id,
        pharmacyId,
        userId,
        type:         'ENTRY',
        quantity:     product.stock,
        previous_stock: 0,
        new_stock:    product.stock,
        reason:       'Stock initial',
      },
    })
  }

  await createAuditLog({
    action: 'CREATE', entity: 'products', entity_id: product.id,
    new_values: data, userId, pharmacyId, req,
  })

  return product
}

export async function updateProduct(id, pharmacyId, userId, data, req) {
  const product = await prisma.products.findFirst({ where: { id, pharmacyId, deletedAt: null } })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

  // Barcode uniqueness check (exclude self)
  if (data.barcode && data.barcode !== product.barcode) {
    const existing = await prisma.products.findFirst({
      where: { barcode: data.barcode, pharmacyId, deletedAt: null, NOT: { id } },
    })
    if (existing) throw { statusCode: 409, message: req.t('product.barcode_taken') }
  }

  const updated = await prisma.products.update({
    where: { id },
    data: {
      ...data,
      ...(data.sale_price     !== undefined && { sale_price: parseFloat(data.sale_price) }),
      ...(data.purchase_price !== undefined && { purchase_price: parseFloat(data.purchase_price) }),
      ...(data.threshold      !== undefined && { threshold: parseFloat(data.threshold) }),
    },
    include: { category: { select: { id: true, name: true } } },
  })

  await createAuditLog({
    action: 'UPDATE', entity: 'products', entity_id: id,
    old_values: product, new_values: data, userId, pharmacyId, req,
  })

  return updated
}

export async function deleteProduct(id, pharmacyId, userId, req) {
  const product = await prisma.products.findFirst({ where: { id, pharmacyId, deletedAt: null } })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

  await prisma.products.update({ where: { id }, data: { deletedAt: new Date() } })

  await createAuditLog({
    action: 'DELETE', entity: 'products', entity_id: id,
    old_values: product, userId, pharmacyId, req,
  })
}

export async function getProductStats(pharmacyId) {
  const [total, outOfStock, lowStockItems, totalValue] = await Promise.all([
    prisma.products.count({ where: { pharmacyId, deletedAt: null } }),
    prisma.products.count({ where: { pharmacyId, deletedAt: null, stock: 0 } }),
    prisma.products.findMany({
      where: { pharmacyId, deletedAt: null, stock: { gt: 0 } },
      select: { id: true, stock: true, threshold: true },
    }),
    prisma.products.aggregate({
      where: { pharmacyId, deletedAt: null },
      _sum: { stock: true },
    }),
  ])

  const lowStock = lowStockItems.filter(p => p.stock < p.threshold).length

  return { total, outOfStock, lowStock, totalUnits: totalValue._sum.stock || 0 }
}
