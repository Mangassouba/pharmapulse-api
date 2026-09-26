/**
 * Standardized API response helpers
 */

export function successResponse(res, { message = 'Success', data = null, meta = null, statusCode = 200 } = {}) {
  const body = { success: true, message }
  if (data !== null) body.data = data
  if (meta !== null) body.meta = meta
  return res.status(statusCode).json(body)
}

export function errorResponse(res, { message = 'Error', errors = null, statusCode = 400 } = {}) {
  const body = { success: false, message }
  if (errors !== null) body.errors = errors
  return res.status(statusCode).json(body)
}

export function paginatedResponse(res, { message, data, total, page, pageSize }) {
  return res.status(200).json({
    success: true,
    message,
    data,
    meta: {
      total,
      page:       Number(page),
      pageSize:   Number(pageSize),
      totalPages: Math.ceil(total / pageSize),
      hasNext:    page * pageSize < total,
      hasPrev:    page > 1,
    },
  })
}

export function getPaginationParams(query) {
  const page     = Math.max(1, parseInt(query.page)     || 1)
  const pageSize = Math.min(
    parseInt(process.env.MAX_PAGE_SIZE) || 100,
    Math.max(1, parseInt(query.pageSize) || parseInt(process.env.DEFAULT_PAGE_SIZE) || 20)
  )
  const skip = (page - 1) * pageSize
  return { page, pageSize, skip, take: pageSize }
}
