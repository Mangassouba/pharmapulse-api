import { eq, desc, count } from 'drizzle-orm'
import db from '../config/database.js'
import { superAdminNotifications } from '../db/schema.js'
import logger from '../config/logger.js'

/**
 * Add a notification to the SuperAdmin panel. Never throws: a notification
 * must not make the action that triggered it fail (registration, job…).
 */
export async function notifySuperAdmins({ title, message, key = null, params = null, type = 'INFO', link = null, pharmacyId = null }) {
  try {
    await db.insert(superAdminNotifications).values({ title, message, key, params, type, link, pharmacyId })
  } catch (err) {
    logger.error(`Notification SuperAdmin non créée (${title}): ${err.message}`)
  }
}

export async function listSuperNotifications({ limit = 20 } = {}) {
  const [items, [{ unread }]] = await Promise.all([
    db.query.superAdminNotifications.findMany({
      orderBy: [desc(superAdminNotifications.createdAt)],
      limit: Math.min(Number(limit) || 20, 100),
    }),
    db.select({ unread: count() }).from(superAdminNotifications).where(eq(superAdminNotifications.is_read, false)),
  ])
  return { items, unread }
}

export async function markSuperNotificationRead(id) {
  await db.update(superAdminNotifications).set({ is_read: true }).where(eq(superAdminNotifications.id, id))
}

export async function markAllSuperNotificationsRead() {
  await db.update(superAdminNotifications).set({ is_read: true }).where(eq(superAdminNotifications.is_read, false))
}
