import { Router } from 'express'
import * as ctrl from '../controllers/superAdmin.controller.js'
import { authenticate, superAdminOnly } from '../middlewares/auth.js'
import { body } from 'express-validator'
import { validate } from '../middlewares/validate.js'
import { DURATIONS } from '../utils/subscription.js'

const router = Router()

// All routes require authentication + superAdminOnly
router.use(authenticate, superAdminOnly)

// ── Auth (login is public, called before middleware above — mounted separately) ─

/**
 * GET /api/super/stats
 * Platform-wide statistics
 */
router.get('/stats', ctrl.platformStats)

/**
 * GET /api/super/logs
 * SuperAdmin activity logs
 */
router.get('/logs', ctrl.getLogs)

// ── Pharmacies ────────────────────────────────────────────────────────────────

/**
 * GET  /api/super/pharmacies
 * POST /api/super/pharmacies
 */
router.get('/pharmacies', ctrl.listPharmacies)

router.post('/pharmacies', [
  body('pharmacyName').trim().notEmpty().withMessage('Nom pharmacie requis'),
  body('adminName').trim().notEmpty().withMessage('Nom admin requis'),
  body('adminEmail').isEmail().withMessage('Email admin invalide'),
  body('adminPassword').isLength({ min: 6 }).withMessage('Mot de passe min. 6 caractères'),
  body('trialDays').optional().isInt({ min: 0 }),
], validate, ctrl.createPharmacy)

/**
 * GET    /api/super/pharmacies/:id
 * PUT    /api/super/pharmacies/:id
 * DELETE /api/super/pharmacies/:id
 */
router.get   ('/pharmacies/:id', ctrl.getPharmacy)
router.put   ('/pharmacies/:id', ctrl.updatePharmacy)
router.delete('/pharmacies/:id', ctrl.deletePharmacy)

/**
 * PATCH /api/super/pharmacies/:id/status
 * Activate / Suspend / Deactivate
 */
router.patch('/pharmacies/:id/status', [
  body('status').isIn(['ACTIVE','SUSPENDED','INACTIVE','PENDING']).withMessage('Statut invalide'),
  body('reason').optional().trim().isLength({ max: 500 }),
], validate, ctrl.setPharmacyStatus)

// ── Subscriptions ─────────────────────────────────────────────────────────────

/**
 * POST /api/super/pharmacies/:pharmacyId/renew
 * Renew/upgrade subscription + record payment
 */
router.post('/pharmacies/:pharmacyId/renew', [
  body('months').isIn(DURATIONS).withMessage(`Durée invalide (${DURATIONS.join(', ')} mois)`).toInt(),
  body('method').optional().isIn(['CASH','CARD','TRANSFER','MOBILE_MONEY']),
  body('reference').optional().trim(),
], validate, ctrl.renewSubscription)

/**
 * GET /api/super/pharmacies/:pharmacyId/payments
 * Payment history for a pharmacy
 */
router.get('/pharmacies/:pharmacyId/payments', ctrl.getPayments)

// ── Global users view ─────────────────────────────────────────────────────────

/**
 * GET /api/super/users
 * All users across all pharmacies
 */
router.get('/users', ctrl.listAllUsers)

export default router
