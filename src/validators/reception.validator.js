import { body } from 'express-validator'

export const receptionValidator = [
  body('supplier').trim().notEmpty().withMessage('Supplier required').isLength({ max: 150 }),
  body('invoice_number').optional().trim().isLength({ max: 100 }),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('Valid product required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be > 0'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be >= 0'),
  body('items.*.batchNumber').optional().trim().isLength({ max: 100 }),
  // Date left empty in the form arrives as '' → treat as absent
  body('items.*.expirationDate').optional({ values: 'falsy' }).isISO8601().withMessage('Valid expiration date required'),
  // A batch is only created with its expiry date: require it as soon as a batch number is given
  body('items').custom(items => {
    if (Array.isArray(items) && items.some(i => i?.batchNumber?.trim?.() && !i.expirationDate)) {
      throw new Error('Expiration date required when a batch number is given')
    }
    return true
  }),
  body('items.*.unit_type').optional(),
]

export const completeReceptionValidator = [
  body('status').isIn(['COMPLETED','PARTIAL','CANCELLED']).withMessage('Invalid status'),
]
