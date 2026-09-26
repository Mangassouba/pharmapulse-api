import { Router } from 'express'
import * as ctrl from '../controllers/movement.controller.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()
router.use(authenticate)

/**
 * @route  GET /api/movements
 * @desc   List stock movements with filters (type, productId, date range)
 * @access Private
 */
router.get('/', ctrl.list)

/**
 * @route  GET /api/movements/stats
 * @desc   Movement statistics (total entries, sales, adjustments)
 * @access Private
 */
router.get('/stats', ctrl.stats)

export default router
