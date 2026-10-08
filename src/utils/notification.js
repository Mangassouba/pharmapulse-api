import { i18next, intlLocale } from '../i18n/index.js'

// Params are stored raw and formatted for each reader: *_date → date, amount → number,
// empty reason → "not specified", city → " · city" suffix.
function formatParams(params = {}, lng, t) {
  const locale = intlLocale(lng)
  const out = { ...params }
  for (const [k, v] of Object.entries(params)) {
    if (k.endsWith('date') && v) out[k] = new Date(v).toLocaleDateString(locale)
    if (k === 'amount' && v != null) out[k] = Number(v).toLocaleString(locale)
  }
  if ('reason' in params) out.reason = params.reason || t('notif.no_reason')
  out.city_suffix = params.city ? ` · ${params.city}` : ''
  return out
}

function render(key, params, lng, t) {
  const p = formatParams(params, lng, t)
  return { title: t(`notif.${key}.title`, p), message: t(`notif.${key}.message`, p) }
}

/**
 * Values to insert for a translatable notification: the key/params, plus the French text in
 * title/message as a fallback (rows are shown as-is if the key is ever missing).
 */
export function notif(key, params = {}) {
  return { key, params, ...render(key, params, 'fr', i18next.getFixedT('fr')) }
}

/** A notification row as seen by the reader of this request (rows without key are left as-is) */
export function localizeNotification(row, req) {
  if (!row?.key || !i18next.exists(`notif.${row.key}.title`)) return row
  return { ...row, ...render(row.key, row.params, req.language, req.t) }
}
