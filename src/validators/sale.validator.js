import { body } from 'express-validator'

export const saleValidator = [
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('Valid product required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be > 0'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be >= 0'),
  body('items.*.batchId').optional().isInt({ min: 1 }),
  body('items.*.discount').optional().isFloat({ min: 0 }),
  body('customer').optional().trim().isLength({ max: 100 }),
  body('customer_phone').optional().trim().isLength({ max: 30 }),
  body('customer_email').optional().isEmail(),
  body('payment_method').optional().isIn(['CASH','CARD','TRANSFER','INSURANCE']),
  body('discount').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
]
