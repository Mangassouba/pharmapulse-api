import { Router } from 'express'
import { login } from '../controllers/superAdmin.controller.js'
import { body } from 'express-validator'
import { validate } from '../middlewares/validate.js'

const router = Router()

/**
 * POST /api/super/auth/login
 * SuperAdmin login (separate from pharmacy login)
 */
router.post('/login', [
  body('email').isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
], validate, login)

export default router
