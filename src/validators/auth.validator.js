import { body } from 'express-validator'

export const registerValidator = [
  body('pharmacyName').trim().notEmpty().withMessage('validation.required').isLength({ max: 100 }),
  body('pharmacyEmail').optional().isEmail().withMessage('validation.invalid_email'),
  body('pharmacyCity').optional().trim().isLength({ max: 100 }),
  body('pharmacyCountry').optional().trim().isLength({ max: 100 }),
  body('name').trim().notEmpty().withMessage('validation.required').isLength({ min: 2, max: 100 }),
  body('email').isEmail().withMessage('validation.invalid_email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('validation.password_min'),
]

export const loginValidator = [
  body('email').isEmail().withMessage('validation.invalid_email').normalizeEmail(),
  body('password').notEmpty().withMessage('validation.required'),
]

export const forgotPasswordValidator = [
  body('email').isEmail().withMessage('validation.invalid_email').normalizeEmail(),
]

export const resetPasswordValidator = [
  body('token').notEmpty().withMessage('validation.required'),
  body('newPassword').isLength({ min: 6 }).withMessage('validation.password_min'),
]

export const updateMeValidator = [
  body('name').trim().notEmpty().withMessage('validation.required').isLength({ min: 2, max: 100 }),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
]

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export const dutyValidator = [
  body('dutyDays').isArray({ max: 7 }).withMessage('validation.invalid'),
  body('dutyDays.*').isInt({ min: 0, max: 6 }).withMessage('validation.invalid_choice').toInt(),
  body('dutyStart').optional({ values: 'null' }).matches(HHMM).withMessage('validation.invalid_time'),
  body('dutyEnd').optional({ values: 'null' }).matches(HHMM).withMessage('validation.invalid_time'),
  body('dutyEnd').custom((end, { req }) => {
    const start = req.body.dutyStart ?? null
    if ((start === null) !== ((end ?? null) === null)) throw new Error('validation.duty_both_or_none')
    if (start !== null && start === end) throw new Error('validation.duty_same_time')
    return true
  }),
]

export const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('validation.required'),
  body('newPassword').isLength({ min: 6 }).withMessage('validation.password_min'),
]

// Both coordinates, or both null to clear the position
export const locationValidator = [
  body('latitude').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }).withMessage('validation.invalid').toFloat(),
  body('longitude').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }).withMessage('validation.invalid').toFloat(),
  body('longitude').custom((lng, { req }) => {
    if (((req.body.latitude ?? null) === null) !== ((lng ?? null) === null)) throw new Error('validation.location_both_or_none')
    return true
  }),
]
