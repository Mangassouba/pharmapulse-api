import { body } from 'express-validator'

export const registerValidator = [
  body('pharmacyName').trim().notEmpty().withMessage('Pharmacy name required').isLength({ max: 100 }),
  body('pharmacyEmail').optional().isEmail().withMessage('Invalid pharmacy email'),
  body('pharmacyCity').optional().trim().isLength({ max: 100 }),
  body('pharmacyCountry').optional().trim().isLength({ max: 100 }),
  body('name').trim().notEmpty().withMessage('Name required').isLength({ min: 2, max: 100 }),
  body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
]

export const loginValidator = [
  body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password required'),
]

export const forgotPasswordValidator = [
  body('email').isEmail().withMessage('Invalid email').normalizeEmail(),
]

export const resetPasswordValidator = [
  body('token').notEmpty().withMessage('Token required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
]

export const updateMeValidator = [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ min: 2, max: 100 }),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
]

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export const dutyValidator = [
  body('dutyDays').isArray({ max: 7 }).withMessage('dutyDays must be an array'),
  body('dutyDays.*').isInt({ min: 0, max: 6 }).withMessage('Invalid weekday (0-6)').toInt(),
  body('dutyStart').optional({ values: 'null' }).matches(HHMM).withMessage('Heure de début invalide (HH:MM)'),
  body('dutyEnd').optional({ values: 'null' }).matches(HHMM).withMessage('Heure de fin invalide (HH:MM)'),
  body('dutyEnd').custom((end, { req }) => {
    const start = req.body.dutyStart ?? null
    if ((start === null) !== ((end ?? null) === null)) throw new Error("Renseignez l'heure de début et l'heure de fin, ou aucune des deux")
    if (start !== null && start === end) throw new Error("L'heure de début et l'heure de fin doivent être différentes")
    return true
  }),
]

export const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
]

// Both coordinates, or both null to clear the position
export const locationValidator = [
  body('latitude').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide').toFloat(),
  body('longitude').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide').toFloat(),
  body('longitude').custom((lng, { req }) => {
    if (((req.body.latitude ?? null) === null) !== ((lng ?? null) === null)) throw new Error('Renseignez la latitude et la longitude, ou aucune des deux')
    return true
  }),
]
