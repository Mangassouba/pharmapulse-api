import logger from '../config/logger.js'
import { errorResponse } from '../utils/response.js'
import { pgError } from '../db/helpers.js'

export function errorHandler(err, req, res, next) {
  logger.error(err)

  // PostgreSQL constraint errors
  const pgErr = pgError(err)
  if (pgErr) {
    // unique_violation
    if (pgErr.code === '23505') {
      return errorResponse(res, {
        message: req.t('error.conflict'),
        errors: pgErr.constraint,
        statusCode: 409,
      })
    }
    // foreign_key_violation
    if (pgErr.code === '23503') {
      return errorResponse(res, {
        message: req.t('error.bad_request') + ': foreign key constraint',
        statusCode: 400,
      })
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

  // Default
  return errorResponse(res, {
    message: process.env.NODE_ENV === 'production'
      ? req.t('error.internal')
      : err.message,
    statusCode: err.statusCode || 500,
  })
}

export function notFoundHandler(req, res) {
  return errorResponse(res, {
    message: `Route ${req.method} ${req.path} not found`,
    statusCode: 404,
  })
}
