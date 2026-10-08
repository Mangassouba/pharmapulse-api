import { body } from 'express-validator'

export const inventoryValidator = [
  body('items').isArray({ min: 1 }).withMessage('validation.at_least_one_item'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('validation.select'),
  body('items.*.stock').isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('items.*.notes').optional().trim().isLength({ max: 500 }),
]

export const singleInventoryValidator = [
  body('productId').isInt({ min: 1 }).withMessage('validation.select'),
  body('stock').isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('notes').optional().trim().isLength({ max: 500 }),
]
