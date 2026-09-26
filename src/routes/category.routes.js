import { Router } from 'express'
import * as ctrl from '../controllers/category.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { body } from 'express-validator'
import { validate } from '../middlewares/validate.js'

const router = Router()
router.use(authenticate)

const categoryValidator = [
  body('name').trim().notEmpty().withMessage('Category name required').isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 255 }),
]

/**
 * @route  GET /api/categories
 * @desc   List all categories
 * @access Private
 */
router.get('/', ctrl.list)

/**
 * @route  POST /api/categories
 * @desc   Create a category
 * @access Private (ADMIN, MANAGER)
 */
router.post('/', authorize('ADMIN', 'MANAGER'), categoryValidator, validate, ctrl.create)

/**
 * @route  PUT /api/categories/:id
 * @desc   Update a category
 * @access Private (ADMIN, MANAGER)
 */
router.put('/:id', authorize('ADMIN', 'MANAGER'), categoryValidator, validate, ctrl.update)

/**
 * @route  DELETE /api/categories/:id
 * @desc   Delete a category (only if no products linked)
 * @access Private (ADMIN)
 */
router.delete('/:id', authorize('ADMIN'), ctrl.remove)

export default router
