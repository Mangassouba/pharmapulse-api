import { body } from 'express-validator'

export const batchValidator = [
  body('number').trim().notEmpty().withMessage('validation.required').isLength({ max: 100 }),
  body('productId').isInt({ min: 1 }).withMessage('validation.select'),
  body('quantity').isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('initial_quantity').isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('expiration_date').isISO8601().withMessage('validation.invalid_date'),
  body('manufacturing_date').optional().isISO8601(),
  body('unit_type').optional(),
  body('unit_quantity').optional().isFloat({ min: 0 }),
]
