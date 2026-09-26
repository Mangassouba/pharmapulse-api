import { Router } from 'express'
import * as ctrl from '../controllers/sale.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { saleValidator } from '../validators/sale.validator.js'

const router = Router()

router.use(authenticate)

// GET  /api/sales             — list with filters & pagination
router.get('/',        ctrl.list)

// GET  /api/sales/stats       — CA stats (today, month, 7-day chart)
router.get('/stats',   authorize('ADMIN','MANAGER'), ctrl.statsCA)

// GET  /api/sales/:id         — single sale detail
router.get('/:id',     ctrl.getOne)

// POST /api/sales             — create sale (all roles can sell)
router.post('/',       saleValidator, validate, ctrl.create)

export default router
