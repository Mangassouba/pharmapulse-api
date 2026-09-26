import * as inventoryService from '../services/inventory.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

export async function apply(req, res, next) {
  try {
    const results = await inventoryService.applyInventory(req.user.pharmacyId, req.user.id, req.body.items, req)
    return successResponse(res, { message: req.t('inventory.applied'), data: results, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function list(req, res, next) {
  try {
    const { inventories, total, page, pageSize } = await inventoryService.getInventories(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('inventory.list_success'), data: inventories, total, page, pageSize })
  } catch (err) { next(err) }
}
