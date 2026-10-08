import { eq, and, or, isNull, desc, count } from 'drizzle-orm'
import db from '../config/database.js'
import { notifications } from '../db/schema.js'
import { successResponse, paginatedResponse, getPaginationParams } from '../utils/response.js'
import { localizeNotification } from '../utils/notification.js'

const visibleTo = (user) => and(
  eq(notifications.pharmacyId, user.pharmacyId),
  or(eq(notifications.userId, user.id), isNull(notifications.userId)),
)

export async function list(req, res, next) {
  try {
    const { page, pageSize, skip, take } = getPaginationParams(req.query)
    const where = visibleTo(req.user)
    const [rows, [{ total }]] = await Promise.all([
      db.query.notifications.findMany({ where, offset: skip, limit: take, orderBy: [desc(notifications.createdAt)] }),
      db.select({ total: count() }).from(notifications).where(where),
    ])
    return paginatedResponse(res, { message: req.t('notification.list_success'), data: rows.map(r => localizeNotification(r, req)), total, page, pageSize })
  } catch (err) { next(err) }
}

export async function unreadCount(req, res, next) {
  try {
    const [{ count: unread }] = await db.select({ count: count() }).from(notifications)
      .where(and(visibleTo(req.user), eq(notifications.is_read, false)))
    return successResponse(res, { data: { count: unread } })
  } catch (err) { next(err) }
}

export async function markAllRead(req, res, next) {
  try {
    await db.update(notifications)
      .set({ is_read: true })
      .where(and(
        eq(notifications.pharmacyId, req.user.pharmacyId),
        eq(notifications.userId, req.user.id),
        eq(notifications.is_read, false),
      ))
    return successResponse(res, { message: req.t('notification.marked_read') })
  } catch (err) { next(err) }
}

export async function markRead(req, res, next) {
  try {
    const [updated] = await db.update(notifications)
      .set({ is_read: true })
      .where(and(eq(notifications.id, parseInt(req.params.id)), eq(notifications.pharmacyId, req.user.pharmacyId)))
      .returning({ id: notifications.id })
    if (!updated) return res.status(404).json({ success: false, message: req.t('error.not_found') })
    return successResponse(res, { message: req.t('notification.marked_read') })
  } catch (err) { next(err) }
}

export async function remove(req, res, next) {
  try {
    const [deleted] = await db.delete(notifications)
      .where(and(eq(notifications.id, parseInt(req.params.id)), eq(notifications.pharmacyId, req.user.pharmacyId)))
      .returning({ id: notifications.id })
    if (!deleted) return res.status(404).json({ success: false, message: req.t('error.not_found') })
    return successResponse(res, { message: req.t('notification.deleted') })
  } catch (err) { next(err) }
}
