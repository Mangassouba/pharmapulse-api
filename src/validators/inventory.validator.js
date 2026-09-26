import { body } from 'express-validator'

export const inventoryValidator = [
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('Valid product required'),
  body('items.*.stock').isFloat({ min: 0 }).withMessage('Stock must be >= 0'),
  body('items.*.notes').optional().trim().isLength({ max: 500 }),
]

export const singleInventoryValidator = [
  body('productId').isInt({ min: 1 }).withMessage('Valid product required'),
  body('stock').isFloat({ min: 0 }).withMessage('Stock must be >= 0'),
  body('notes').optional().trim().isLength({ max: 500 }),
]
