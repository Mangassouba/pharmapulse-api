import prisma from '../config/database.js'
import { successResponse, paginatedResponse, getPaginationParams } from '../utils/response.js'

export async function list(req, res, next) {
  try {
    const { page, pageSize, skip, take } = getPaginationParams(req.query)
    const where = {
      pharmacyId: req.user.pharmacyId,
      OR: [{ userId: req.user.id }, { userId: null }],
    }
    const [notifications, total] = await prisma.$transaction([
      prisma.notifications.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.notifications.count({ where }),
    ])
    return paginatedResponse(res, { message: req.t('notification.list_success'), data: notifications, total, page, pageSize })
  } catch (err) { next(err) }
}

export async function unreadCount(req, res, next) {
  try {
    const count = await prisma.notifications.count({
      where: { pharmacyId: req.user.pharmacyId, is_read: false,
        OR: [{ userId: req.user.id }, { userId: null }] },
    })
    return successResponse(res, { data: { count } })
  } catch (err) { next(err) }
}

export async function markAllRead(req, res, next) {
  try {
    await prisma.notifications.updateMany({
      where: { pharmacyId: req.user.pharmacyId, userId: req.user.id, is_read: false },
      data:  { is_read: true },
    })
    return successResponse(res, { message: req.t('notification.marked_read') })
  } catch (err) { next(err) }
}

export async function markRead(req, res, next) {
  try {
    await prisma.notifications.update({
      where: { id: parseInt(req.params.id) },
      data:  { is_read: true },
    })
    return successResponse(res, { message: req.t('notification.marked_read') })
  } catch (err) { next(err) }
}

export async function remove(req, res, next) {
  try {
    await prisma.notifications.delete({ where: { id: parseInt(req.params.id) } })
    return successResponse(res, { message: req.t('notification.deleted') })
  } catch (err) { next(err) }
}
