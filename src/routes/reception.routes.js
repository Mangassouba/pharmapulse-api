import { Router } from 'express'
import * as ctrl from '../controllers/reception.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { receptionValidator, completeReceptionValidator } from '../validators/reception.validator.js'

const router = Router()

router.use(authenticate)

// GET  /api/receptions
router.get('/',            ctrl.list)

// GET  /api/receptions/:id
router.get('/:id',         ctrl.getOne)

// POST /api/receptions       — create reception (ADMIN, MANAGER, STOCK_MANAGER)
router.post('/',           authorize('ADMIN','MANAGER','STOCK_MANAGER'), receptionValidator, validate, ctrl.create)

// PATCH /api/receptions/:id/complete — update status & apply stock
router.patch('/:id/complete', authorize('ADMIN','MANAGER','STOCK_MANAGER'), completeReceptionValidator, validate, ctrl.complete)

export default router
