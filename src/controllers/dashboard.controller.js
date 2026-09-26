import * as dashboardService from '../services/dashboard.service.js'
import { successResponse } from '../utils/response.js'

export async function getDashboard(req, res, next) {
  try {
    const data = await dashboardService.getDashboardData(req.user.pharmacyId)
    return successResponse(res, { message: req.t('dashboard.success'), data })
  } catch (err) { next(err) }
}
