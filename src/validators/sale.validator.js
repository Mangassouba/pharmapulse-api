import { body } from 'express-validator'

export const saleValidator = [
  body('items').isArray({ min: 1 }).withMessage('validation.at_least_one_item'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('validation.select'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('validation.above_zero'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('items.*.batchId').optional().isInt({ min: 1 }),
  body('items.*.discount').optional().isFloat({ min: 0 }),
  body('customer').optional().trim().isLength({ max: 100 }),
  body('customer_phone').optional().trim().isLength({ max: 30 }),
  body('customer_email').optional().isEmail(),
  body('payment_method').optional().isIn(['CASH','CARD','TRANSFER','INSURANCE']),
  body('discount').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
]
