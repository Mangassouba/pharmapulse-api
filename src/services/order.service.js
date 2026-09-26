import prisma from '../config/database.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

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

  const order = await prisma.orders.create({
    data: {
      pharmacyId,
      userId,
      customer,
      customer_phone: customer_phone || null,
      customer_email: customer_email || null,
      delivery_date:  delivery_date ? new Date(delivery_date) : null,
      total_amount:   totalAmount,
      details: { create: detailsData },
    },
    include: {
      details: { include: { product: { select: { id: true, name: true } } } },
      user:    { select: { id: true, name: true } },
    },
  })

  await createAuditLog({
    action: 'CREATE', entity: 'orders', entity_id: order.id,
    new_values: { customer, total: totalAmount }, userId, pharmacyId, req,
  })

  return order
}

export async function getOrders(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { status, search, dateFrom, dateTo } = query

  const where = {
    pharmacyId,
    deletedAt: null,
    ...(status && { status }),
    ...(search && { customer: { contains: search, mode: 'insensitive' } }),
    ...(dateFrom || dateTo ? {
      order_date: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
      },
    } : {}),
  }

  const [orders, total] = await prisma.$transaction([
    prisma.orders.findMany({
      where, skip, take,
      include: {
        user:    { select: { id: true, name: true } },
        details: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: { order_date: 'desc' },
    }),
    prisma.orders.count({ where }),
  ])

  return { orders, total, page, pageSize }
}

export async function updateOrderStatus(id, pharmacyId, userId, status, req) {
  const order = await prisma.orders.findFirst({ where: { id, pharmacyId, deletedAt: null } })
  if (!order) throw { statusCode: 404, message: req.t('order.not_found') }

  const updated = await prisma.orders.update({ where: { id }, data: { status } })

  await createAuditLog({
    action: 'UPDATE_STATUS', entity: 'orders', entity_id: id,
    old_values: { status: order.status }, new_values: { status },
    userId, pharmacyId, req,
  })

  return updated
}
