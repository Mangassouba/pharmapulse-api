import { validationResult } from 'express-validator'
import { errorResponse } from '../utils/response.js'

export function validate(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return errorResponse(res, {
      message: req.t('error.validation'),
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
      statusCode: 422,
    })
  }
  next()
}
