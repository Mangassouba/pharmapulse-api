import logger from '../config/logger.js'
import { errorResponse } from '../utils/response.js'
import { pgError } from '../db/helpers.js'
import { i18next } from '../i18n/index.js'

// Unique constraint → message telling the user which value is already taken
const UNIQUE_MESSAGES = {
  users_email_pharmacyId_key:      'auth.email_taken',
  pharmacy_license_number_key:     'pharmacy.license_taken',
  products_barcode_pharmacyId_key: 'product.barcode_taken',
  category_name_key:               'category.name_taken',
  batches_number_pharmacyId_key:   'batch.number_taken',
}

export function errorHandler(err, req, res, next) {
  logger.error(err)
  // Error raised before the i18n middleware ran (e.g. CORS): fall back to the default language
  if (typeof req.t !== 'function') req.t = i18next.getFixedT('fr')

  // PostgreSQL constraint errors
  const pgErr = pgError(err)
  if (pgErr) {
    // unique_violation
    if (pgErr.code === '23505') {
      return errorResponse(res, {
        message: req.t(UNIQUE_MESSAGES[pgErr.constraint] ?? 'error.conflict'),
        statusCode: 409,
      })
    }
    // foreign_key_violation
    if (pgErr.code === '23503') {
      return errorResponse(res, { message: req.t('error.linked_data'), statusCode: 409 })
    }
  }

  // Validation errors (express-validator)
  if (err.type === 'validation') {
    return errorResponse(res, {
      message: req.t('error.validation'),
      errors: err.errors,
      statusCode: 422,
    })
  }

  // JWT
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return errorResponse(res, { message: req.t('auth.token_invalid'), statusCode: 401 })
  }

  // Malformed / too large request body (express.json)
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return errorResponse(res, { message: req.t('error.bad_request'), statusCode: err.status || 400 })
  }

  // Errors thrown on purpose ({ statusCode: 4xx, message, errors? }) are meant for the user: show them as-is.
  // Unexpected errors only show their technical message outside production.
  const statusCode = err.statusCode || err.status || 500
  const expected   = statusCode < 500 && err.message
  return errorResponse(res, {
    message: expected || process.env.NODE_ENV !== 'production' && err.message || req.t('error.internal'),
    errors: (expected && Array.isArray(err.errors)) ? err.errors : null,
    statusCode,
  })
}

export function notFoundHandler(req, res) {
  return errorResponse(res, {
    message: `Route ${req.method} ${req.path} not found`,
    statusCode: 404,
  })
}
