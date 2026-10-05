import { eq, and, isNull, gte, lte, desc, count } from 'drizzle-orm'
import db from '../config/database.js'
import { orders, orderDetails } from '../db/schema.js'
import { contains } from '../db/helpers.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

const orderWith = {
  user:      { columns: { id: true, name: true } },
  validator: { columns: { id: true, name: true } },
  details:   { with: { product: { columns: { id: true, name: true } } } },
}

export async function createOrder(pharmacyId, userId, data, req) {
  const { customer, customer_phone, customer_email, delivery_date, items } = data

  let totalAmount = 0
  const detailsData = items.map(item => {
    const lineTotal = item.quantity * parseFloat(item.price)
    totalAmount += lineTotal
    return {
      productId: item.productId,
      quantity:  item.quantity,
      price:     parseFloat(item.price),
      total:     lineTotal,
      unit_type: item.unit_type || null,
    }
  })

  const orderId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(orders).values({
      pharmacyId,
      userId,
      customer,
      customer_phone: customer_phone || null,
      customer_email: customer_email || null,
      delivery_date:  delivery_date ? new Date(delivery_date) : null,
      total_amount:   totalAmount,
    }).returning({ id: orders.id })

    await tx.insert(orderDetails).values(detailsData.map(d => ({ ...d, orderId: created.id })))
    return created.id
  })

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: orderWith })

  await createAuditLog({
    action: 'CREATE', entity: 'orders', entity_id: order.id,
    new_values: { customer, total: totalAmount }, userId, pharmacyId, req,
  })

  return order
}

export async function getOrders(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { status, search, dateFrom, dateTo } = query

  const where = and(
    eq(orders.pharmacyId, pharmacyId),
    isNull(orders.deletedAt),
    status   ? eq(orders.status, status) : undefined,
    search   ? contains(orders.customer, search) : undefined,
    dateFrom ? gte(orders.order_date, new Date(dateFrom)) : undefined,
    dateTo   ? lte(orders.order_date, new Date(dateTo + 'T23:59:59')) : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db.query.orders.findMany({
      where, offset: skip, limit: take,
      with: orderWith,
      orderBy: [desc(orders.order_date)],
    }),
    db.select({ total: count() }).from(orders).where(where),
  ])

  return { orders: rows, total, page, pageSize }
}

export async function getOrderById(id, pharmacyId) {
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, id), eq(orders.pharmacyId, pharmacyId), isNull(orders.deletedAt)),
    with: orderWith,
  })
  return order ?? null
}

export async function updateOrderStatus(id, pharmacyId, userId, status, req) {
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, id), eq(orders.pharmacyId, pharmacyId), isNull(orders.deletedAt)),
  })
  if (!order) throw { statusCode: 404, message: req.t('order.not_found') }

  const [updated] = await db.update(orders).set({ status }).where(eq(orders.id, id)).returning()

  await createAuditLog({
    action: 'UPDATE_STATUS', entity: 'orders', entity_id: id,
    old_values: { status: order.status }, new_values: { status },
    userId, pharmacyId, req,
  })

  return updated
}

export async function cancelOrder(id, pharmacyId) {
  const [cancelled] = await db.update(orders)
    .set({ deletedAt: new Date(), status: 'CANCELLED' })
    .where(and(eq(orders.id, id), eq(orders.pharmacyId, pharmacyId)))
    .returning({ id: orders.id })
  return cancelled ?? null
}
