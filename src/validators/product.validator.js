import { body, query } from 'express-validator'

const UNIT_TYPES = ['PIECE','BOX','BOTTLE','PACKET','TUBE','JAR','VIAL','AMPOULE',
  'CAPSULE','TABLET','ML','LITER','MG','G','KG','SPRAY','DROP','PATCH','INHALER','SUPPOSITORY','OTHER']

export const productValidator = [
  body('name').trim().notEmpty().withMessage('Product name required').isLength({ max: 200 }),
  body('categoryId').isInt({ min: 1 }).withMessage('Valid category required'),
  body('sale_price').isFloat({ min: 0 }).withMessage('Sale price must be >= 0'),
  body('purchase_price').isFloat({ min: 0 }).withMessage('Purchase price must be >= 0'),
  body('barcode').trim().notEmpty().withMessage('Barcode required'),
  body('threshold').optional().isFloat({ min: 0 }).withMessage('Threshold must be >= 0'),
  body('stock').optional().isFloat({ min: 0 }).withMessage('Stock must be >= 0'),
  body('unit_type').optional().isIn(UNIT_TYPES).withMessage('Invalid unit type'),
  body('subunit_type').optional().isIn(UNIT_TYPES).withMessage('Invalid subunit type'),
  body('unit_quantity').optional().isFloat({ min: 0 }),
  body('is_divisible').optional().isBoolean(),
  body('prescription_req').optional().isBoolean(),
]

export const productQueryValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['AVAILABLE','OUT_OF_STOCK','DISCONTINUED','COMING_SOON']),
  query('categoryId').optional().isInt({ min: 1 }),
  query('search').optional().trim().isLength({ max: 100 }),
]
