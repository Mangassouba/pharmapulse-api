import { body } from 'express-validator'

export const orderValidator = [
  body('customer').trim().notEmpty().withMessage('Customer name required').isLength({ max: 150 }),
  body('customer_phone').optional().trim().isLength({ max: 30 }),
  body('customer_email').optional().isEmail(),
  body('delivery_date').optional().isISO8601().withMessage('Valid delivery date required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('Valid product required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be > 0'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be >= 0'),
]

export const updateOrderStatusValidator = [
  body('status').isIn(['PENDING','CONFIRMED','SHIPPED','DELIVERED','CANCELLED'])
    .withMessage('Invalid order status'),
]
