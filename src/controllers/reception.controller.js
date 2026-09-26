import * as receptionService from '../services/reception.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const { receptions, total, page, pageSize } = await receptionService.getReceptions(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('reception.list_success'), data: receptions, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function getOne(req, res, next) {
  try {
    const reception = await receptionService.getReceptionById(parseInt(req.params.id), req.user.pharmacyId, req)
    return successResponse(res, { data: reception })
  } catch (err) { next(err) }
}

export async function create(req, res, next) {
  try {
    const reception = await receptionService.createReception(req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('reception.created'), data: reception, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function complete(req, res, next) {
  try {
    const { status } = req.body
    await receptionService.completeReception(parseInt(req.params.id), req.user.pharmacyId, req.user.id, status, req)
    return successResponse(res, { message: req.t('reception.completed') })
  } catch (err) { next(err) }
}
