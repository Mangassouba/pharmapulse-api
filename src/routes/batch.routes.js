import { Router } from 'express'
import * as ctrl from '../controllers/batch.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { batchValidator } from '../validators/batch.validator.js'

const router = Router()
router.use(authenticate)

/**
 * @route  GET /api/batches
 * @desc   List batches (filter: status, productId, expiringSoon)
 * @access Private
 */
router.get('/', ctrl.list)

/**
 * @route  GET /api/batches/expiring
 * @desc   Batches expiring in 30 days
 * @access Private
 */
router.get('/expiring', ctrl.expiring)

/**
 * @route  GET /api/batches/:id
 * @desc   Get batch by ID
 * @access Private
 */
router.get('/:id', ctrl.getOne)

/**
 * @route  POST /api/batches
 * @desc   Create a batch manually
 * @access Private (ADMIN, MANAGER, STOCK_MANAGER)
 */
router.post('/', authorize('ADMIN', 'MANAGER', 'STOCK_MANAGER'), batchValidator, validate, ctrl.create)

/**
 * @route  PUT /api/batches/:id
 * @desc   Update batch
 * @access Private (ADMIN, MANAGER, STOCK_MANAGER)
 */
router.put('/:id', authorize('ADMIN', 'MANAGER', 'STOCK_MANAGER'), ctrl.update)

export default router
