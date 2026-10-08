import { body } from 'express-validator'

export const createUserValidator = [
  body('name').trim().notEmpty().withMessage('validation.required').isLength({ min: 2, max: 100 }),
  body('email').isEmail().withMessage('validation.invalid_email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('validation.password_min'),
  body('role').isIn(['ADMIN','MANAGER','CAISSIER','STOCK_MANAGER']).withMessage('validation.invalid_choice'),
  body('phone').optional().trim().isLength({ max: 30 }),
  body('address').optional().trim().isLength({ max: 255 }),
]

export const updateUserValidator = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().trim().isLength({ max: 30 }),
  body('address').optional().trim().isLength({ max: 255 }),
  body('role').optional().isIn(['ADMIN','MANAGER','CAISSIER','STOCK_MANAGER']),
  body('status').optional().isIn(['ACTIVE','INACTIVE','SUSPENDED']),
]
