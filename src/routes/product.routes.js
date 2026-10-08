import { Router } from 'express'
import { body } from 'express-validator'
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

// PUT  /api/products/:id/image — upload the product image as a data URL (PNG, JPEG or WebP, max 512 KB)
router.put('/:id/image', authorize('ADMIN','MANAGER','STOCK_MANAGER'),
  body('image').isString().withMessage('validation.required'), validate, ctrl.updateImage)

// DELETE /api/products/:id/image — remove the product image
router.delete('/:id/image', authorize('ADMIN','MANAGER','STOCK_MANAGER'), ctrl.deleteImage)

// Public read: GET /api/public/products/:id/image

// DELETE /api/products/:id    — soft delete (ADMIN only)
router.delete('/:id', authorize('ADMIN','MANAGER'), ctrl.remove)

export default router
