import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { middleware as i18nMiddleware, i18next } from './i18n/index.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { authenticate, requireActivePharmacy } from './middlewares/auth.js'
import { verifyToken } from './config/jwt.js'
import logger from './config/logger.js'
import { pool } from './config/database.js'
import { startTrialReminderJob } from './jobs/trialReminders.js'

// ── Pharmacy routes ──────────────────────────────────────────────────────────
import authRoutes         from './routes/auth.routes.js'
import productRoutes      from './routes/product.routes.js'
import categoryRoutes     from './routes/category.routes.js'
import saleRoutes         from './routes/sale.routes.js'
import receptionRoutes    from './routes/reception.routes.js'
import inventoryRoutes    from './routes/inventory.routes.js'
import movementRoutes     from './routes/movement.routes.js'
import orderRoutes        from './routes/order.routes.js'
import batchRoutes        from './routes/batch.routes.js'
import userRoutes         from './routes/user.routes.js'
import dashboardRoutes    from './routes/dashboard.routes.js'
import notificationRoutes from './routes/notification.routes.js'

// ── SuperAdmin routes ────────────────────────────────────────────────────────
import superAuthRoutes  from './routes/superAuth.routes.js'
import superAdminRoutes from './routes/superAdmin.routes.js'

import publicRoutes from './routes/public.routes.js'

const app  = express()
const PORT = process.env.PORT || 3000

// ── Security ──────────────────────────────────────────────────────────────────
// Behind a host's proxy (Render…): read the real client IP from X-Forwarded-For,
// otherwise rate limits and audit IPs see every user as the proxy
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY)
app.use(helmet())
app.use(compression())
app.use(cors({
  origin:      (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept-Language'],
}))

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Logged-in users are limited per account, not per IP: the staff of a pharmacy share
// one public IP and would otherwise share one quota. Only a valid (verified) token
// counts; anonymous visitors and invalid tokens fall back to the IP.
function rateLimitKey(req) {
  const [scheme, token] = (req.get('authorization') || '').split(' ')
  if (scheme === 'Bearer' && token) {
    try {
      const { id, isSuperAdmin } = verifyToken(token)
      if (id) return `${isSuperAdmin ? 'super' : 'user'}:${id}`
    } catch { /* invalid or expired: treat as anonymous */ }
  }
  return `ip:${req.ip}`
}

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 300,
  keyGenerator: rateLimitKey,
  standardHeaders: true, legacyHeaders: false,
})
app.use('/api', limiter)
app.use('/api/auth/login',         rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }))
app.use('/api/auth/register',      rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }))
app.use('/api/auth/forgot-password', rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }))
app.use('/api/auth/reset-password',  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }))
app.use('/api/super/auth/login',   rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }))
app.use('/api/public/visit',        rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }))
app.use('/api/super/auth/forgot-password', rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }))
app.use('/api/super/auth/reset-password',  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }))

// ── Parsing ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── i18n ──────────────────────────────────────────────────────────────────────
app.use(i18nMiddleware.handle(i18next))

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: msg => logger.info(msg.trim()) },
    skip:   req => req.path === '/api/health',
  }))
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0' })
  } catch {
    res.status(503).json({ success: false, status: 'unhealthy' })
  }
})

const API = '/api'

// ── SuperAdmin routes (isolated, no pharmacy middleware) ──────────────────────
app.use(`${API}/super/auth`, superAuthRoutes)
app.use(`${API}/super`,      superAdminRoutes)

// ── Pharmacy auth (public) ────────────────────────────────────────────────────
app.use(`${API}/auth`, authRoutes)

// ── Protected pharmacy routes (auth + active pharmacy check) ─────────────────
const pharmacyMiddleware = [authenticate, requireActivePharmacy]
app.use(`${API}/dashboard`,     pharmacyMiddleware, dashboardRoutes)
app.use(`${API}/products`,      pharmacyMiddleware, productRoutes)
app.use(`${API}/categories`,    pharmacyMiddleware, categoryRoutes)
app.use(`${API}/sales`,         pharmacyMiddleware, saleRoutes)
app.use(`${API}/receptions`,    pharmacyMiddleware, receptionRoutes)
app.use(`${API}/inventories`,   pharmacyMiddleware, inventoryRoutes)
app.use(`${API}/movements`,     pharmacyMiddleware, movementRoutes)
app.use(`${API}/orders`,        pharmacyMiddleware, orderRoutes)
app.use(`${API}/batches`,       pharmacyMiddleware, batchRoutes)
app.use(`${API}/users`,         pharmacyMiddleware, userRoutes)
app.use(`${API}/notifications`, pharmacyMiddleware, notificationRoutes)
app.use(`${API}/public`, publicRoutes)

// ── Error handlers ────────────────────────────────────────────────────────────
app.use(notFoundHandler)
app.use(errorHandler)

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await pool.query('SELECT 1')
    logger.info('✅ Database connected')
    app.listen(PORT, () => {
      logger.info(`🚀 PharmaPulse API → http://localhost:${PORT}`)
      logger.info(`🔐 SuperAdmin panel → http://localhost:${PORT}/api/super`)
      logger.info(`📋 Environment: ${process.env.NODE_ENV || 'development'}`)
      if (process.env.NODE_ENV !== 'test') startTrialReminderJob()
    })
  } catch (err) {
    logger.error('❌ Failed to start:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', async () => { await pool.end(); process.exit(0) })
process.on('SIGINT',  async () => { await pool.end(); process.exit(0) })

bootstrap()
export default app
