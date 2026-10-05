import { eq } from 'drizzle-orm'
import { verifyToken } from '../config/jwt.js'
import { errorResponse } from '../utils/response.js'
import db from '../config/database.js'
import { pharmacy as pharmacyTable } from '../db/schema.js'
import { getSiteName } from '../services/site.service.js'

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse(res, { message: req.t('auth.unauthorized'), statusCode: 401 })
  }
  try {
    req.user = verifyToken(authHeader.split(' ')[1])
    next()
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? req.t('auth.token_expired') : req.t('auth.token_invalid')
    return errorResponse(res, { message: msg, statusCode: 401 })
  }
}

/** Only SUPER_ADMIN can pass */
export function superAdminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return errorResponse(res, { message: req.t('auth.forbidden'), statusCode: 403 })
  }
  next()
}

/** Role-based — SUPER_ADMIN bypasses all */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return errorResponse(res, { message: req.t('auth.unauthorized'), statusCode: 401 })
    if (req.user.role === 'SUPER_ADMIN') return next()
    if (!roles.includes(req.user.role)) {
      return errorResponse(res, { message: req.t('auth.forbidden'), statusCode: 403 })
    }
    next()
  }
}

/** Block access if pharmacy is inactive or subscription expired */
export async function requireActivePharmacy(req, res, next) {
  if (req.user?.role === 'SUPER_ADMIN') return next()
  if (!req.user?.pharmacyId) return errorResponse(res, { message: req.t('auth.unauthorized'), statusCode: 401 })

  try {
    const pharmacy = await db.query.pharmacy.findFirst({
      where: eq(pharmacyTable.id, req.user.pharmacyId),
      columns: { is_active: true, status: true },
      with: { subscription: { columns: { status: true, end_date: true } } },
    })

    if (!pharmacy) return errorResponse(res, { message: req.t('pharmacy.not_found'), statusCode: 404 })

    if (!pharmacy.is_active || pharmacy.status !== 'ACTIVE') {
      const msg = pharmacy.status === 'SUSPENDED'
        ? 'Pharmacie suspendue pour non-paiement. Contactez votre administrateur.'
        : `Pharmacie désactivée. Contactez le support ${await getSiteName()}.`
      return errorResponse(res, { message: msg, statusCode: 403 })
    }

    const sub = pharmacy.subscription
    if (sub && sub.status !== 'ACTIVE' && sub.status !== 'TRIAL' && new Date(sub.end_date) < new Date()) {
      return errorResponse(res, {
        message: 'Abonnement expiré. Veuillez renouveler pour continuer.',
        statusCode: 402,
      })
    }

    next()
  } catch (err) { next(err) }
}
