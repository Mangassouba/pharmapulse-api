import * as productService from '../services/product.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const { products, total, page, pageSize } = await productService.getProducts(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('product.list_success'), data: products, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function getOne(req, res, next) {
  try {
    const product = await productService.getProductById(parseInt(req.params.id), req.user.pharmacyId, req)
    return successResponse(res, { data: product })
  } catch (err) { next(err) }
}

export async function create(req, res, next) {
  try {
    const product = await productService.createProduct(req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('product.created'), data: product, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function update(req, res, next) {
  try {
    const product = await productService.updateProduct(parseInt(req.params.id), req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('product.updated'), data: product })
  } catch (err) { next(err) }
}

export async function remove(req, res, next) {
  try {
    await productService.deleteProduct(parseInt(req.params.id), req.user.pharmacyId, req.user.id, req)
    return successResponse(res, { message: req.t('product.deleted') })
  } catch (err) { next(err) }
}

export async function stats(req, res, next) {
  try {
    const data = await productService.getProductStats(req.user.pharmacyId)
    return successResponse(res, { data })
  } catch (err) { next(err) }
}
