import * as movementService from '../services/movement.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const { movements, total, page, pageSize } = await movementService.getMovements(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('movement.list_success'), data: movements, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function stats(req, res, next) {
  try {
    const data = await movementService.getMovementStats(req.user.pharmacyId)
    return successResponse(res, { data })
  } catch (err) { next(err) }
}
