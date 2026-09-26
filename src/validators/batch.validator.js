import { body } from 'express-validator'

export const batchValidator = [
  body('number').trim().notEmpty().withMessage('Batch number required').isLength({ max: 100 }),
  body('productId').isInt({ min: 1 }).withMessage('Valid product required'),
  body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be >= 0'),
  body('initial_quantity').isFloat({ min: 0 }).withMessage('Initial quantity must be >= 0'),
  body('expiration_date').isISO8601().withMessage('Valid expiration date required'),
  body('manufacturing_date').optional().isISO8601(),
  body('unit_type').optional(),
  body('unit_quantity').optional().isFloat({ min: 0 }),
]
