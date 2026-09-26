import { Router } from 'express'
import { getDashboard } from '../controllers/dashboard.controller.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()

/**
 * @route  GET /api/dashboard
 * @desc   Full dashboard data: CA, stock alerts, movements, expiring batches
 * @access Private
 */
router.get('/', authenticate, getDashboard)

export default router
