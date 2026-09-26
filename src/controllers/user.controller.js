import * as userService from '../services/user.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const { users, total, page, pageSize } = await userService.getUsers(req.user.pharmacyId, req.query)
    return paginatedResponse(res, { message: req.t('user.list_success'), data: users, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function getOne(req, res, next) {
  try {
    const user = await userService.getUserById(parseInt(req.params.id), req.user.pharmacyId, req)
    return successResponse(res, { data: user })
  } catch (err) { next(err) }
}

export async function create(req, res, next) {
  try {
    const user = await userService.createUser(req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('user.created'), data: user, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function update(req, res, next) {
  try {
    const user = await userService.updateUser(parseInt(req.params.id), req.user.pharmacyId, req.user.id, req.body, req)
    return successResponse(res, { message: req.t('user.updated'), data: user })
  } catch (err) { next(err) }
}

export async function remove(req, res, next) {
  try {
    await userService.deleteUser(parseInt(req.params.id), req.user.pharmacyId, req.user.id, req)
    return successResponse(res, { message: req.t('user.deleted') })
  } catch (err) { next(err) }
}
