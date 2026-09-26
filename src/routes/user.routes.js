import { Router } from 'express'
import * as ctrl from '../controllers/user.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { createUserValidator, updateUserValidator } from '../validators/user.validator.js'

const router = Router()
router.use(authenticate)

/**
 * @route  GET /api/users
 * @desc   List users of the pharmacy
 * @access Private (ADMIN, MANAGER)
 */
router.get('/', authorize('ADMIN', 'MANAGER'), ctrl.list)

/**
 * @route  GET /api/users/:id
 * @desc   Get single user
 * @access Private (ADMIN, MANAGER)
 */
router.get('/:id', authorize('ADMIN', 'MANAGER'), ctrl.getOne)

/**
 * @route  POST /api/users
 * @desc   Create a new user in the pharmacy
 * @access Private (ADMIN)
 */
router.post('/', authorize('ADMIN'), createUserValidator, validate, ctrl.create)

/**
 * @route  PUT /api/users/:id
 * @desc   Update user info / role / status
 * @access Private (ADMIN)
 */
router.put('/:id', authorize('ADMIN'), updateUserValidator, validate, ctrl.update)

/**
 * @route  DELETE /api/users/:id
 * @desc   Soft-delete a user
 * @access Private (ADMIN)
 */
router.delete('/:id', authorize('ADMIN'), ctrl.remove)

export default router
