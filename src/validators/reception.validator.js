import { body } from 'express-validator'

export const receptionValidator = [
  body('supplier').trim().notEmpty().withMessage('validation.required').isLength({ max: 150 }),
  body('invoice_number').optional().trim().isLength({ max: 100 }),
  body('items').isArray({ min: 1 }).withMessage('validation.at_least_one_item'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('validation.select'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('validation.above_zero'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('items.*.batchNumber').optional().trim().isLength({ max: 100 }),
  // Date left empty in the form arrives as '' → treat as absent
  body('items.*.expirationDate').optional({ values: 'falsy' }).isISO8601().withMessage('validation.invalid_date'),
  // A batch is only created with its expiry date: require it as soon as a batch number is given
  body('items').custom(items => {
    if (Array.isArray(items) && items.some(i => i?.batchNumber?.trim?.() && !i.expirationDate)) {
      throw new Error('validation.expiry_required_with_batch')
    }
    return true
  }),
  body('items.*.unit_type').optional(),
]

export const completeReceptionValidator = [
  body('status').isIn(['COMPLETED','PARTIAL','CANCELLED']).withMessage('validation.invalid_choice'),
]
