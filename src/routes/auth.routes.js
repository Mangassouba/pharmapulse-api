import { Router } from 'express'
import { body } from 'express-validator'
import * as ctrl from '../controllers/auth.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { registerValidator, loginValidator, changePasswordValidator, updateMeValidator, dutyValidator, locationValidator, forgotPasswordValidator, resetPasswordValidator } from '../validators/auth.validator.js'

const router = Router()

/**
 * @route  POST /api/auth/register
 * @desc   Register a new pharmacy + admin user
 * @access Public
 */
router.post('/register', registerValidator, validate, ctrl.register)

/**
 * @route  POST /api/auth/login
 * @desc   Login with email + password
 * @access Public
 */
router.post('/login', loginValidator, validate, ctrl.login)

/**
 * @route  POST /api/auth/forgot-password
 * @desc   Email a password reset link (generic response, never reveals whether the account exists)
 * @access Public
 */
router.post('/forgot-password', forgotPasswordValidator, validate, ctrl.forgotPassword)

/**
 * @route  POST /api/auth/reset-password
 * @desc   Set a new password from a reset link token
 * @access Public
 */
router.post('/reset-password', resetPasswordValidator, validate, ctrl.resetPassword)

/**
 * @route  GET /api/auth/me
 * @desc   Get current authenticated user
 * @access Private
 */
router.get('/me', authenticate, ctrl.me)

/**
 * @route  PUT /api/auth/me
 * @desc   Update current authenticated user's profile (name, phone, address)
 * @access Private
 */
router.put('/me', authenticate, updateMeValidator, validate, ctrl.updateMe)

/**
 * @route  POST /api/auth/logout
 * @desc   Logout (client-side token removal)
 * @access Private
 */
router.post('/logout', authenticate, ctrl.logout)

/**
 * @route  PUT /api/auth/password
 * @desc   Change current user password
 * @access Private
 */
router.put('/password', authenticate, changePasswordValidator, validate, ctrl.changePassword)

/**
 * @route  PUT /api/auth/pharmacy/duty
 * @desc   Set the pharmacy duty schedule: weekdays (0 = Sunday … 6 = Saturday) + optional hours 'HH:MM'
 * @access Private (ADMIN)
 */
router.put('/pharmacy/duty', authenticate, authorize('ADMIN'), dutyValidator, validate, ctrl.updateDuty)

/**
 * @route  PUT /api/auth/pharmacy/location
 * @desc   Set the pharmacy GPS position (latitude/longitude), or both null to clear it
 * @access Private (ADMIN)
 */
router.put('/pharmacy/location', authenticate, authorize('ADMIN'), locationValidator, validate, ctrl.updateLocation)

/**
 * @route  PUT /api/auth/pharmacy/logo
 * @desc   Upload the pharmacy logo as a data URL (PNG, JPEG or WebP, max 512 KB)
 * @access Private (ADMIN)
 */
router.put('/pharmacy/logo', authenticate, authorize('ADMIN'), body('logo').isString().withMessage('Logo requis'), validate, ctrl.updateLogo)

/**
 * @route  DELETE /api/auth/pharmacy/logo
 * @desc   Remove the pharmacy logo
 * @access Private (ADMIN)
 */
router.delete('/pharmacy/logo', authenticate, authorize('ADMIN'), ctrl.deleteLogo)

export default router
