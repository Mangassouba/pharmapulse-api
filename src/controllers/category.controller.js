import * as categoryService from '../services/category.service.js'
import { successResponse } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const categories = await categoryService.getCategories(req.query)
    return successResponse(res, { data: categories })
  } catch (err) { next(err) }
}

export async function create(req, res, next) {
  try {
    const category = await categoryService.createCategory(req.body, req.user.id, req.user.pharmacyId, req)
    return successResponse(res, { message: req.t('category.created'), data: category, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function update(req, res, next) {
  try {
    const category = await categoryService.updateCategory(parseInt(req.params.id), req.body, req.user.id, req.user.pharmacyId, req)
    return successResponse(res, { message: req.t('category.updated'), data: category })
  } catch (err) { next(err) }
}

export async function remove(req, res, next) {
  try {
    await categoryService.deleteCategory(parseInt(req.params.id), req.user.id, req.user.pharmacyId, req)
    return successResponse(res, { message: req.t('category.deleted') })
  } catch (err) { next(err) }
}
