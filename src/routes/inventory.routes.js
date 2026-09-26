import { Router } from 'express'
import * as ctrl from '../controllers/inventory.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { inventoryValidator } from '../validators/inventory.validator.js'

const router = Router()
router.use(authenticate)

/**
 * @route  GET /api/inventories
 * @desc   List inventory records with filters
 * @access Private
 */
router.get('/', ctrl.list)

/**
 * @route  POST /api/inventories
 * @desc   Apply inventory correction (bulk)
 * @access Private (ADMIN, MANAGER, STOCK_MANAGER)
 */
router.post('/', authorize('ADMIN', 'MANAGER', 'STOCK_MANAGER'), inventoryValidator, validate, ctrl.apply)

export default router
