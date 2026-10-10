import { body, query } from 'express-validator'

export const UNIT_TYPES = ['PIECE','BOX','BOTTLE','PACKET','TUBE','JAR','VIAL','AMPOULE',
  'CAPSULE','TABLET','ML','LITER','MG','G','KG','SPRAY','DROP','PATCH','INHALER','SUPPOSITORY','OTHER']

export const productValidator = [
  body('name').trim().notEmpty().withMessage('validation.required').isLength({ max: 200 }),
  body('categoryId').isInt({ min: 1 }).withMessage('validation.select'),
  body('sale_price').isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('purchase_price').isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('barcode').trim().notEmpty().withMessage('validation.required'),
  body('threshold').optional().isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('stock').optional().isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('unit_type').optional().isIn(UNIT_TYPES).withMessage('validation.invalid_choice'),
  body('subunit_type').optional().isIn(UNIT_TYPES).withMessage('validation.invalid_choice'),
  // Field left empty in the form arrives as null or '' → store null
  body('unit_quantity').customSanitizer(v => (v === '' ? null : v)),
  body('unit_quantity').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('validation.min_zero'),
  body('is_divisible').optional().isBoolean(),
  body('prescription_req').optional().isBoolean(),
]

// Rows already read from the spreadsheet by the frontend; each row is checked by the import service
export const productImportValidator = [
  body('rows').isArray({ min: 1, max: 2000 }).withMessage('validation.import_rows'),
]

export const productQueryValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['AVAILABLE','OUT_OF_STOCK','DISCONTINUED','COMING_SOON']),
  query('categoryId').optional().isInt({ min: 1 }),
  query('search').optional().trim().isLength({ max: 100 }),
]
