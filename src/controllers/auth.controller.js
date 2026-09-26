import * as authService from '../services/auth.service.js'
import { successResponse } from '../utils/response.js'

export async function register(req, res, next) {
  try {
    const result = await authService.registerPharmacyAndAdmin(req.body, req)
    return successResponse(res, {
      message:    req.t('auth.register_success'),
      data:       result,
      statusCode: 201,
    })
  } catch (err) { next(err) }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body
    const result = await authService.loginUser(email, password, req)
    return successResponse(res, { message: req.t('auth.login_success'), data: result })
  } catch (err) { next(err) }
}

export async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id)
    return successResponse(res, { data: user })
  } catch (err) { next(err) }
}

export async function updateMe(req, res, next) {
  try {
    const user = await authService.updateMe(req.user.id, req.body, req)
    return successResponse(res, { message: req.t('user.updated'), data: user })
  } catch (err) { next(err) }
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body
    await authService.changePassword(req.user.id, currentPassword, newPassword, req)
    return successResponse(res, { message: req.t('user.password_changed') })
  } catch (err) { next(err) }
}

export async function logout(req, res) {
  return successResponse(res, { message: req.t('auth.logout_success') })
}
