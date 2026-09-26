import { Router } from 'express'
import * as ctrl from '../controllers/notification.controller.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()
router.use(authenticate)

/**
 * @route  GET /api/notifications
 * @desc   Get notifications for current user
 * @access Private
 */
router.get('/', ctrl.list)

/**
 * @route  GET /api/notifications/unread-count
 * @desc   Count unread notifications
 * @access Private
 */
router.get('/unread-count', ctrl.unreadCount)

/**
 * @route  PATCH /api/notifications/read-all
 * @desc   Mark all notifications as read
 * @access Private
 */
router.patch('/read-all', ctrl.markAllRead)

/**
 * @route  PATCH /api/notifications/:id/read
 * @desc   Mark a single notification as read
 * @access Private
 */
router.patch('/:id/read', ctrl.markRead)

/**
 * @route  DELETE /api/notifications/:id
 * @desc   Delete a notification
 * @access Private
 */
router.delete('/:id', ctrl.remove)

export default router
