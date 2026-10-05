import * as orderService from '../services/order.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const { orders, total, page, pageSize } = await orderService.getOrders(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('order.list_success'), data: orders, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function getOne(req, res, next) {
  try {
    const order = await orderService.getOrderById(parseInt(req.params.id), req.user.pharmacyId)
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
    const cancelled = await orderService.cancelOrder(parseInt(req.params.id), req.user.pharmacyId)
    if (!cancelled) return res.status(404).json({ success: false, message: req.t('order.not_found') })
    return successResponse(res, { message: req.t('order.cancelled') })
  } catch (err) { next(err) }
}
