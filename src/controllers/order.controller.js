import * as orderService from '../services/order.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'
import prisma from '../config/database.js'

export async function list(req, res, next) {
  try {
    const { orders, total, page, pageSize } = await orderService.getOrders(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('order.list_success'), data: orders, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function getOne(req, res, next) {
  try {
    const order = await prisma.orders.findFirst({
      where: { id: parseInt(req.params.id), pharmacyId: req.user.pharmacyId, deletedAt: null },
      include: {
        user:    { select: { id: true, name: true } },
        details: { include: { product: { select: { id: true, name: true } } } },
      },
    })
    if (!order) return res.status(404).json({ success: false, message: req.t('order.not_found') })
    return successResponse(res, { data: order })
  } catch (err) { next(err) }
}

export async function create(req, res, next) {
  try {
    const order = await orderService.createOrder(req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('order.created'), data: order, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function updateStatus(req, res, next) {
  try {
    const order = await orderService.updateOrderStatus(parseInt(req.params.id), req.user.pharmacyId, req.user.id, req.body.status, req)
    return successResponse(res, { message: req.t('order.updated'), data: order })
  } catch (err) { next(err) }
}

export async function remove(req, res, next) {
  try {
    await prisma.orders.update({
      where: { id: parseInt(req.params.id) },
      data:  { deletedAt: new Date(), status: 'CANCELLED' },
    })
    return successResponse(res, { message: req.t('order.cancelled') })
  } catch (err) { next(err) }
}
