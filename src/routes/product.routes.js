import { Router } from 'express'
import * as ctrl from '../controllers/product.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { productValidator, productQueryValidator } from '../validators/product.validator.js'

const router = Router()

router.use(authenticate)

// GET  /api/products          — list with pagination & filters
router.get('/',       productQueryValidator, validate, ctrl.list)

// GET  /api/products/stats    — aggregate stats
router.get('/stats',  ctrl.stats)

// GET  /api/products/:id      — single product with batches & movements
router.get('/:id',    ctrl.getOne)

// POST /api/products          — create (ADMIN, MANAGER, STOCK_MANAGER)
router.post('/',      authorize('ADMIN','MANAGER','STOCK_MANAGER'), productValidator, validate, ctrl.create)

// PUT  /api/products/:id      — update
router.put('/:id',    authorize('ADMIN','MANAGER','STOCK_MANAGER'), productValidator, validate, ctrl.update)

// DELETE /api/products/:id    — soft delete (ADMIN only)
router.delete('/:id', authorize('ADMIN','MANAGER'), ctrl.remove)

export default router
