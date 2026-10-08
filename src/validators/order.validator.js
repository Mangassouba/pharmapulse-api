import { body } from 'express-validator'

export const orderValidator = [
  body('customer').trim().notEmpty().withMessage('validation.required').isLength({ max: 150 }),
  body('customer_phone').optional().trim().isLength({ max: 30 }),
  body('customer_email').optional().isEmail(),
  body('delivery_date').optional().isISO8601().withMessage('validation.invalid_date'),
  body('items').isArray({ min: 1 }).withMessage('validation.at_least_one_item'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('validation.select'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('validation.above_zero'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('validation.min_zero'),
]

export const updateOrderStatusValidator = [
  body('status').isIn(['PENDING','CONFIRMED','SHIPPED','DELIVERED','CANCELLED'])
    .withMessage('validation.invalid_choice'),
]
