import * as saleService from '../services/sale.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const { sales, total, page, pageSize } = await saleService.getSales(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('sale.list_success'), data: sales, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function getOne(req, res, next) {
  try {
    const sale = await saleService.getSaleById(parseInt(req.params.id), req.user.pharmacyId, req)
    return successResponse(res, { data: sale })
  } catch (err) { next(err) }
}

export async function create(req, res, next) {
  try {
    const sale = await saleService.createSale(req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('sale.created'), data: sale, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function statsCA(req, res, next) {
  try {
    const data = await saleService.getSalesStats(req.user.pharmacyId)
    return successResponse(res, { data })
  } catch (err) { next(err) }
}
