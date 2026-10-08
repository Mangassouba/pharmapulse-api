import { validationResult } from 'express-validator'
import { errorResponse } from '../utils/response.js'

// Readable label of a request field: "items[0].quantity" → "Ligne 1 – Quantité"
function fieldLabel(path, t) {
  const label = name => t(`fields.${name}`, { defaultValue: name })
  const line  = /^(\w+)\[(\d+)\]\.(\w+)$/.exec(path)
  if (line) return t('validation.line', { n: Number(line[2]) + 1, field: label(line[3]) })
  return label(path.replace(/\[\d+\]$/, ''))
}

// Validators give an i18n key ('validation.xxx'); rules without a message fall back to a generic one
function errorText(e, t) {
  const key = e.msg === 'Invalid value' ? 'validation.invalid' : e.msg
  if (typeof key !== 'string' || !key.startsWith('validation.')) return String(e.msg)
  return t(key, { field: fieldLabel(e.path, t) })
}

export function validate(req, res, next) {
  const result = validationResult(req)
  if (result.isEmpty()) return next()

  // One message per field, in the order the rules are declared
  const errors = result.array({ onlyFirstError: true }).map(e => ({ field: e.path, message: errorText(e, req.t) }))
  const texts  = [...new Set(errors.map(e => e.message))]

  return errorResponse(res, {
    message: texts.length === 1 ? texts[0] : req.t('validation.summary', { list: texts.join(' ') }),
    errors,
    statusCode: 422,
  })
}
