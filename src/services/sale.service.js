import prisma from '../config/database.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'
import { generateInvoiceNumber } from '../utils/invoice.js'

export async function createSale(pharmacyId, userId, data, req) {
  const { items, customer, customer_phone, customer_email, payment_method, discount = 0, tax = 0 } = data

  // ── 1. Validate stock for all items ──────────────────────────────────────
  const productIds = [...new Set(items.map(i => i.productId))]
  const products   = await prisma.products.findMany({
    where: { id: { in: productIds }, pharmacyId, deletedAt: null },
  })

  const productMap = Object.fromEntries(products.map(p => [p.id, p]))

  for (const item of items) {
    const product = productMap[item.productId]
    if (!product) throw { statusCode: 404, message: req.t('product.not_found') }
    if (product.stock < item.quantity) {
      throw {
        statusCode: 422,
        message: req.t('product.insufficient_stock', {
          name: product.name,
          available: product.stock,
          requested: item.quantity,
        }),
      }
    }
  }

  // ── 2. Create sale + details + update stock + movements in transaction ────
  const invoiceNumber = generateInvoiceNumber('VTE')

  const sale = await prisma.$transaction(async (tx) => {
    // Calculate totals
    let subtotal = 0
    const detailsData = items.map(item => {
      const lineTotal = item.quantity * parseFloat(item.price) - parseFloat(item.discount || 0)
      subtotal += lineTotal
      return {
        productId: item.productId,
        batchId:   item.batchId || null,
        quantity:  item.quantity,
        price:     parseFloat(item.price),
        discount:  parseFloat(item.discount || 0),
        total:     lineTotal,
        unit_type: item.unit_type || null,
        unit_name: item.unit_name || null,
        unit_quantity: item.unit_quantity || null,
      }
    })

    const totalAmount = subtotal - parseFloat(discount) + parseFloat(tax)

    // Create sale
    const newSale = await tx.sales.create({
      data: {
        pharmacyId,
        userId,
        invoice_number: invoiceNumber,
        customer:       customer || null,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        payment_method: payment_method || 'CASH',
        discount:       parseFloat(discount),
        tax:            parseFloat(tax),
        total_amount:   Math.max(0, totalAmount),
        details: { create: detailsData },
      },
      include: {
        details: { include: { product: { select: { id: true, name: true } } } },
        user:    { select: { id: true, name: true } },
      },
    })

    // Update stock + create movements for each item
    for (const item of items) {
      const product = productMap[item.productId]
      const newStock = product.stock - item.quantity

      await tx.products.update({
        where: { id: item.productId },
        data: {
          stock: newStock,
          status: newStock === 0 ? 'OUT_OF_STOCK' : 'AVAILABLE',
        },
      })

      await tx.stockMovements.create({
        data: {
          productId:      item.productId,
          pharmacyId,
          userId,
          batchId:        item.batchId || null,
          type:           'SALE',
          quantity:       -item.quantity,
          previous_stock: product.stock,
          new_stock:      newStock,
          reference_id:   newSale.id,
          reason:         `Vente ${invoiceNumber}`,
          unit_type:      item.unit_type || null,
        },
      })

      // Update batch quantity if specified
      if (item.batchId) {
        await tx.batches.update({
          where: { id: item.batchId },
          data: {
            quantity: { decrement: item.quantity },
          },
        })
      }
    }

    return newSale
  })

  await createAuditLog({
    action: 'CREATE', entity: 'sales', entity_id: sale.id,
    new_values: { invoice: invoiceNumber, total: sale.total_amount },
    userId, pharmacyId, req,
  })

  return sale
}

export async function getSales(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, dateFrom, dateTo, payment_method } = query

  const where = {
    pharmacyId,
    deletedAt: null,
    ...(search && {
      OR: [
        { customer: { contains: search, mode: 'insensitive' } },
        { invoice_number: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(dateFrom || dateTo ? {
      sale_date: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
      },
    } : {}),
    ...(payment_method && { payment_method }),
  }

  const [sales, total] = await prisma.$transaction([
    prisma.sales.findMany({
      where,
      skip, take,
      include: {
        user:    { select: { id: true, name: true } },
        details: {
          include: { product: { select: { id: true, name: true } } },
        },
      },
      orderBy: { sale_date: 'desc' },
    }),
    prisma.sales.count({ where }),
  ])

  return { sales, total, page, pageSize }
}

export async function getSaleById(id, pharmacyId, req) {
  const sale = await prisma.sales.findFirst({
    where: { id, pharmacyId, deletedAt: null },
    include: {
      user:    { select: { id: true, name: true } },
      details: {
        include: {
          product: { select: { id: true, name: true, barcode: true, unit_type: true } },
          batch:   { select: { id: true, number: true, expiration_date: true } },
        },
      },
    },
  })
  if (!sale) throw { statusCode: 404, message: req.t('sale.not_found') }
  return sale
}

export async function getSalesStats(pharmacyId) {
  const today = new Date()
  const startOfDay   = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const [caToday, caMonth, totalSales, last7days] = await Promise.all([
    prisma.sales.aggregate({
      where: { pharmacyId, deletedAt: null, sale_date: { gte: startOfDay } },
      _sum: { total_amount: true },
      _count: true,
    }),
    prisma.sales.aggregate({
      where: { pharmacyId, deletedAt: null, sale_date: { gte: startOfMonth } },
      _sum: { total_amount: true },
      _count: true,
    }),
    prisma.sales.count({ where: { pharmacyId, deletedAt: null } }),
    // Last 7 days daily breakdown
    prisma.$queryRaw`
      SELECT
        DATE(sale_date) as date,
        COUNT(*)::int as count,
        COALESCE(SUM(total_amount), 0)::float as total
      FROM sales
      WHERE "pharmacyId" = ${pharmacyId}
        AND "deletedAt" IS NULL
        AND sale_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(sale_date)
      ORDER BY date ASC
    `,
  ])

  return {
    caToday:     parseFloat(caToday._sum.total_amount  || 0),
    salesCountToday: caToday._count,
    caMonth:     parseFloat(caMonth._sum.total_amount  || 0),
    salesCountMonth: caMonth._count,
    totalSales,
    last7days,
  }
}
