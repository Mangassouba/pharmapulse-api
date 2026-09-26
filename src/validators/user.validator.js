import { body } from 'express-validator'

export const createUserValidator = [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ min: 2, max: 100 }),
  body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['ADMIN','MANAGER','CAISSIER','STOCK_MANAGER']).withMessage('Invalid role'),
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
