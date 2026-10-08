import { eq, and, or, isNull, gte, lte, inArray, desc, count, sum, sql } from 'drizzle-orm'
import db from '../config/database.js'
import { products, sales, saleDetails, stockMovements } from '../db/schema.js'
import { contains } from '../db/helpers.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'
import { generateInvoiceNumber } from '../utils/invoice.js'
import { consumeBatches, movementParts } from './batch.service.js'

export async function createSale(pharmacyId, userId, data, req) {
  const { items, customer, customer_phone, customer_email, payment_method, discount = 0, tax = 0 } = data

  // ── 1. Validate stock for all items ──────────────────────────────────────
  const productIds = [...new Set(items.map(i => i.productId))]
  const found      = await db.query.products.findMany({
    where: and(inArray(products.id, productIds), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
  })

  const productMap = Object.fromEntries(found.map(p => [p.id, p]))

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

  const saleId = await db.transaction(async (tx) => {
    // Take each line out of its batches, earliest expiry first
    const allocations = []
    for (const item of items) {
      allocations.push(await consumeBatches(tx, {
        pharmacyId, productId: item.productId, quantity: item.quantity, preferredBatchId: item.batchId,
      }, req))
    }

    // Calculate totals
    let subtotal = 0
    const detailsData = items.map((item, i) => {
      const lineTotal = item.quantity * parseFloat(item.price) - parseFloat(item.discount || 0)
      subtotal += lineTotal
      return {
        productId: item.productId,
        batchId:   allocations[i][0]?.batchId ?? null, // main batch; the per-batch split is in stockMovements
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
    const [newSale] = await tx.insert(sales).values({
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
    }).returning({ id: sales.id })

    await tx.insert(saleDetails).values(detailsData.map(d => ({ ...d, saleId: newSale.id })))

    // Update stock + one movement per batch used (plus one for any untracked remainder)
    for (const [i, item] of items.entries()) {
      const product = productMap[item.productId]
      const newStock = product.stock - item.quantity

      await tx.update(products)
        .set({
          stock: newStock,
          status: newStock === 0 ? 'OUT_OF_STOCK' : 'AVAILABLE',
        })
        .where(eq(products.id, item.productId))

      await tx.insert(stockMovements).values(movementParts(item.quantity, allocations[i], product.stock).map(part => ({
        productId:      item.productId,
        pharmacyId,
        userId,
        batchId:        part.batchId,
        type:           'SALE',
        quantity:       -part.quantity,
        previous_stock: part.previous,
        new_stock:      part.next,
        reference_id:   newSale.id,
        reason:         `Vente ${invoiceNumber}`,
        unit_type:      item.unit_type || null,
      })))
    }

    return newSale.id
  })

  const sale = await db.query.sales.findFirst({
    where: eq(sales.id, saleId),
    with: {
      details: { with: { product: { columns: { id: true, name: true } } } },
      user:    { columns: { id: true, name: true } },
    },
  })

  await createAuditLog({
    action: 'CREATE', entity: 'sales', entity_id: sale.id,
    new_values: { invoice: invoiceNumber, total: sale.total_amount },
    userId, pharmacyId, req,
  })

  return sale
}

/** Numéro de facture de la vente issue d'une commande — identique au n° du reçu de retrait */
export const orderInvoiceNumber = orderId => `CMD-${String(orderId).padStart(6, '0')}`

/**
 * Enregistre en vente une commande retirée (pour l'historique et le CA).
 * Ne touche pas au stock : validate-pickup s'en charge déjà.
 * `order` doit inclure ses `details`.
 */
export async function createSaleFromOrder(tx, order, { userId, payment_method = 'CASH', sale_date = new Date() }) {
  const [sale] = await tx.insert(sales).values({
    pharmacyId:     order.pharmacyId,
    userId,
    sale_date,
    invoice_number: orderInvoiceNumber(order.id),
    customer:       order.customer,
    customer_phone: order.customer_phone,
    customer_email: order.customer_email,
    payment_method,
    discount:       0,
    tax:            0,
    total_amount:   order.total_amount,
  }).returning()

  if (order.details.length) {
    await tx.insert(saleDetails).values(order.details.map(d => ({
      saleId:    sale.id,
      productId: d.productId,
      quantity:  d.quantity,
      price:     d.price,
      discount:  0,
      total:     d.total ?? d.quantity * d.price,
      unit_type: d.unit_type,
    })))
  }
  return sale
}

export async function getSales(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, dateFrom, dateTo, payment_method } = query

  const where = and(
    eq(sales.pharmacyId, pharmacyId),
    isNull(sales.deletedAt),
    search ? or(contains(sales.customer, search), contains(sales.invoice_number, search)) : undefined,
    dateFrom ? gte(sales.sale_date, new Date(dateFrom)) : undefined,
    dateTo   ? lte(sales.sale_date, new Date(dateTo + 'T23:59:59')) : undefined,
    payment_method ? eq(sales.payment_method, payment_method) : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db.query.sales.findMany({
      where,
      offset: skip, limit: take,
      with: {
        user:    { columns: { id: true, name: true } },
        details: {
          with: { product: { columns: { id: true, name: true } } },
        },
      },
      orderBy: [desc(sales.sale_date)],
    }),
    db.select({ total: count() }).from(sales).where(where),
  ])

  return { sales: rows, total, page, pageSize }
}

export async function getSaleById(id, pharmacyId, req) {
  const sale = await db.query.sales.findFirst({
    where: and(eq(sales.id, id), eq(sales.pharmacyId, pharmacyId), isNull(sales.deletedAt)),
    with: {
      user:    { columns: { id: true, name: true } },
      details: {
        with: {
          product: { columns: { id: true, name: true, barcode: true, unit_type: true } },
          batch:   { columns: { id: true, number: true, expiration_date: true } },
        },
      },
    },
  })
  if (!sale) throw { statusCode: 404, message: req.t('sale.not_found') }
  return sale
}

function salesSince(pharmacyId, since) {
  return db
    .select({ sum: sum(sales.total_amount), count: count() })
    .from(sales)
    .where(and(eq(sales.pharmacyId, pharmacyId), isNull(sales.deletedAt), gte(sales.sale_date, since)))
    .then(([row]) => row)
}

export async function getSalesStats(pharmacyId) {
  const today = new Date()
  const startOfDay   = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const [caToday, caMonth, [{ totalSales }], last7days] = await Promise.all([
    salesSince(pharmacyId, startOfDay),
    salesSince(pharmacyId, startOfMonth),
    db.select({ totalSales: count() }).from(sales)
      .where(and(eq(sales.pharmacyId, pharmacyId), isNull(sales.deletedAt))),
    // Last 7 days daily breakdown
    db.execute(sql`
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
    `).then(res => res.rows.map(r => ({ ...r, date: new Date(r.date) }))),
  ])

  return {
    caToday:     parseFloat(caToday.sum  || 0),
    salesCountToday: caToday.count,
    caMonth:     parseFloat(caMonth.sum  || 0),
    salesCountMonth: caMonth.count,
    totalSales,
    last7days,
  }
}
