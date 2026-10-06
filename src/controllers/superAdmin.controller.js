import * as svc from '../services/superAdmin.service.js'
import * as notif from '../services/superNotification.service.js'
import { successResponse, paginatedResponse } from '../utils/response.js'

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(req, res, next) {
  try {
    const { email, password } = req.body
    const result = await svc.superAdminLogin(email, password, req)
    return successResponse(res, { message: 'Connexion SuperAdmin réussie', data: result })
  } catch (err) { next(err) }
}

export async function forgotPassword(req, res, next) {
  try {
    await svc.requestSuperAdminPasswordReset(req.body.email, req)
    return successResponse(res, { message: 'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.' })
  } catch (err) { next(err) }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body
    await svc.resetSuperAdminPassword(token, newPassword, req)
    return successResponse(res, { message: 'Mot de passe réinitialisé, vous pouvez vous connecter.' })
  } catch (err) { next(err) }
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function listNotifications(req, res, next) {
  try {
    const data = await notif.listSuperNotifications({ limit: req.query.limit })
    return successResponse(res, { data })
  } catch (err) { next(err) }
}

export async function markNotificationRead(req, res, next) {
  try {
    await notif.markSuperNotificationRead(parseInt(req.params.id))
    return successResponse(res, { message: 'Notification lue' })
  } catch (err) { next(err) }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    await notif.markAllSuperNotificationsRead()
    return successResponse(res, { message: 'Toutes les notifications sont lues' })
  } catch (err) { next(err) }
}

// ── Site (name + logo) ────────────────────────────────────────────────────────

export async function updateSiteName(req, res, next) {
  try {
    const data = await svc.updateSiteName(req.body.name, req.user.id, req)
    return successResponse(res, { message: 'Nom du site mis à jour', data })
  } catch (err) { next(err) }
}

export async function updateSiteLogo(req, res, next) {
  try {
    const data = await svc.updateSiteLogo(req.body.logo, req.user.id, req)
    return successResponse(res, { message: 'Logo du site mis à jour', data })
  } catch (err) { next(err) }
}

export async function deleteSiteLogo(req, res, next) {
  try {
    const data = await svc.deleteSiteLogo(req.user.id, req)
    return successResponse(res, { message: 'Logo du site supprimé', data })
  } catch (err) { next(err) }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function platformStats(req, res, next) {
  try {
    const data = await svc.getPlatformStats()
    return successResponse(res, { data })
  } catch (err) { next(err) }
}

// ── Pharmacies ────────────────────────────────────────────────────────────────

export async function listPharmacies(req, res, next) {
  try {
    const { pharmacies, total, page, pageSize } = await svc.listPharmacies(req.query)
    return paginatedResponse(res, { message: 'Pharmacies récupérées', data: pharmacies, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function getPharmacy(req, res, next) {
  try {
    const data = await svc.getPharmacyDetail(parseInt(req.params.id), req)
    return successResponse(res, { data })
  } catch (err) { next(err) }
}

export async function createPharmacy(req, res, next) {
  try {
    const data = await svc.createPharmacy(req.body, req.user.id, req)
    return successResponse(res, { message: 'Pharmacie créée avec succès', data, statusCode: 201 })
  } catch (err) { next(err) }
}

export async function updatePharmacy(req, res, next) {
  try {
    const data = await svc.updatePharmacy(parseInt(req.params.id), req.body, req.user.id, req)
    return successResponse(res, { message: 'Pharmacie mise à jour', data })
  } catch (err) { next(err) }
}

export async function setPharmacyStatus(req, res, next) {
  try {
    const { status, reason } = req.body
    await svc.updatePharmacyStatus(parseInt(req.params.id), status, reason, req.user.id, req)
    return successResponse(res, { message: `Pharmacie ${status === 'ACTIVE' ? 'activée' : 'suspendue'} avec succès` })
  } catch (err) { next(err) }
}

export async function deletePharmacy(req, res, next) {
  try {
    await svc.deletePharmacy(parseInt(req.params.id), req.user.id, req)
    return successResponse(res, { message: 'Pharmacie supprimée' })
  } catch (err) { next(err) }
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export async function renewSubscription(req, res, next) {
  try {
    const data = await svc.renewSubscription(parseInt(req.params.pharmacyId), req.body, req.user.id, req)
    return successResponse(res, { message: 'Abonnement renouvelé avec succès', data })
  } catch (err) { next(err) }
}

export async function getPayments(req, res, next) {
  try {
    const { payments, total, page, pageSize } = await svc.getSubscriptionPayments(parseInt(req.params.pharmacyId), req.query)
    return paginatedResponse(res, { message: 'Paiements récupérés', data: payments, total, page, pageSize })
  } catch (err) { next(err) }
}

// ── Users (global) ────────────────────────────────────────────────────────────

export async function listAllUsers(req, res, next) {
  try {
    const { users, total, page, pageSize } = await svc.listAllUsers(req.query)
    return paginatedResponse(res, { message: 'Utilisateurs récupérés', data: users, total, page, pageSize })
  } catch (err) { next(err) }
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export async function getLogs(req, res, next) {
  try {
    const { logs, total, page, pageSize } = await svc.getSuperAdminLogs(req.query)
    return paginatedResponse(res, { message: 'Logs récupérés', data: logs, total, page, pageSize })
  } catch (err) { next(err) }
}
