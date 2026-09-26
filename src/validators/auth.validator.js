import { body } from 'express-validator'

export const registerValidator = [
  body('pharmacyName').trim().notEmpty().withMessage('Pharmacy name required').isLength({ max: 100 }),
  body('pharmacyEmail').optional().isEmail().withMessage('Invalid pharmacy email'),
  body('pharmacyCity').optional().trim().isLength({ max: 100 }),
  body('pharmacyCountry').optional().trim().isLength({ max: 100 }),
  body('name').trim().notEmpty().withMessage('Name required').isLength({ min: 2, max: 100 }),
  body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
]

export const loginValidator = [
  body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password required'),
]

export const updateMeValidator = [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ min: 2, max: 100 }),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
]

export const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
]
