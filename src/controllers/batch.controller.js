import * as batchService from '../services/batch.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const { batches, total, page, pageSize } = await batchService.getBatches(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('batch.list_success'), data: batches, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function expiring(req, res, next) {
  try {
    const { batches, total, page, pageSize } = await batchService.getBatches(req.user.pharmacyId, { ...req.query, expiringSoon: 'true' })
    return paginatedResponse(res, { message: req.t('batch.list_success'), data: batches, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function getOne(req, res, next) {
  try {
    const batch = await batchService.getBatchById(parseInt(req.params.id), req.user.pharmacyId, req)
    return successResponse(res, { data: batch })
  } catch (err) { next(err) }
}

export async function create(req, res, next) {
  try {
    const batch = await batchService.createBatch(req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('batch.created'), data: batch, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function update(req, res, next) {
  try {
    const batch = await batchService.updateBatch(parseInt(req.params.id), req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('batch.updated'), data: batch })
  } catch (err) { next(err) }
}

export async function checkExpired(req, res, next) {
  try {
    const count = await batchService.checkAndUpdateExpiredBatches(req.user.pharmacyId)
    return successResponse(res, { message: `${count} batch(es) marked as expired`, data: { count } })
  } catch (err) { next(err) }
}
