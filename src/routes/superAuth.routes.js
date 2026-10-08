import { Router } from 'express'
import { login, forgotPassword, resetPassword } from '../controllers/superAdmin.controller.js'
import { body } from 'express-validator'
import { validate } from '../middlewares/validate.js'

const router = Router()

/**
 * POST /api/super/auth/login
 * SuperAdmin login (separate from pharmacy login)
 */
router.post('/login', [
  body('email').isEmail().withMessage('validation.invalid_email'),
  body('password').notEmpty().withMessage('validation.required'),
], validate, login)

/**
 * POST /api/super/auth/forgot-password
 * Email a password reset link (generic response, never reveals whether the account exists)
 */
router.post('/forgot-password', [
  body('email').isEmail().withMessage('validation.invalid_email'),
], validate, forgotPassword)

/**
 * POST /api/super/auth/reset-password
 * Set a new password from a reset link token
 */
router.post('/reset-password', [
  body('token').notEmpty().withMessage('validation.invalid'),
  body('newPassword').isLength({ min: 6 }).withMessage('validation.password_min'),
], validate, resetPassword)

export default router
