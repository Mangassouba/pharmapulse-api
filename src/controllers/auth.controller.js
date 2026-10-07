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

export async function forgotPassword(req, res, next) {
  try {
    await authService.requestPasswordReset(req.body.email, req)
    return successResponse(res, { message: req.t('auth.reset_link_sent') })
  } catch (err) { next(err) }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body
    await authService.resetPassword(token, newPassword, req)
    return successResponse(res, { message: req.t('auth.reset_success') })
  } catch (err) { next(err) }
}

export async function updateDuty(req, res, next) {
  try {
    const data = await authService.updateDuty(req.user.pharmacyId, req.body, req)
    return successResponse(res, { message: 'Garde mise à jour', data })
  } catch (err) { next(err) }
}

export async function updateLocation(req, res, next) {
  try {
    const data = await authService.updateLocation(req.user.pharmacyId, req.body, req)
    return successResponse(res, { message: 'Position mise à jour', data })
  } catch (err) { next(err) }
}

export async function updateLogo(req, res, next) {
  try {
    const data = await authService.updateLogo(req.user.pharmacyId, req.body.logo, req)
    return successResponse(res, { message: 'Logo mis à jour', data })
  } catch (err) { next(err) }
}

export async function deleteLogo(req, res, next) {
  try {
    const data = await authService.deleteLogo(req.user.pharmacyId, req)
    return successResponse(res, { message: 'Logo supprimé', data })
  } catch (err) { next(err) }
}

export async function logout(req, res) {
  return successResponse(res, { message: req.t('auth.logout_success') })
}
