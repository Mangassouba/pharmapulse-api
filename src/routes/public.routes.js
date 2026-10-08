/**
 * Routes publiques — Aucune authentification requise
 * Interface client vitrine
 */
import { Router } from 'express'
import { eq, ne, and, gt, isNull, inArray, asc, desc, count } from 'drizzle-orm'
import db from '../config/database.js'
import { pharmacy, pharmacyLogos, products, productImages, siteVisits, users, orders, orderDetails, notifications } from '../db/schema.js'
import { contains, withCounts } from '../db/helpers.js'
import { sendImage } from '../utils/image.js'
import { getSiteLogo, getSiteName } from '../services/site.service.js'
import { notif } from '../utils/notification.js'

const router = Router()

// ── Haversine distance ──────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2
  return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2)
}

// ── Génère un code lisible unique (PH-XXXXXX) ──────────────────
async function makePickupCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempts = 0; attempts < 20; attempts++) {
    let code = 'PH-'
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
    const exists = await db.query.orders.findFirst({ where: eq(orders.pickup_code, code), columns: { id: true } })
    if (!exists) return code
  }
  throw new Error('Impossible de générer un code unique.')
}

// ── Pharmacie publique: abonnement + compteurs produits/utilisateurs ──
const activePharmacy = and(eq(pharmacy.status, 'ACTIVE'), eq(pharmacy.is_active, true))

async function findPublicPharmacies(where) {
  const rows = await db.query.pharmacy.findMany({
    where,
    with: { subscription: { columns: { plan: true, status: true } } },
  })
  return withCounts(rows, {
    products: [products, products.pharmacyId],
    users:    [users, users.pharmacyId],
  })
}

const orderPublicWith = {
  details:  { with: { product: { columns: { id: true, name: true, unit_type: true } } } },
  pharmacy: { columns: { id: true, name: true, phone: true, address: true, city: true, latitude: true, longitude: true } },
}

// ══════════════════════════════════════════════════════════════
// PHARMACIES
// ══════════════════════════════════════════════════════════════

router.get('/pharmacies', async (req, res, next) => {
  try {
    const { lat, lng } = req.query
    const rows = await findPublicPharmacies(and(activePharmacy, isNull(pharmacy.deletedAt)))

    const uLat = parseFloat(lat); const uLng = parseFloat(lng)
    const data = rows.map(p => ({
      ...p,
      distance: (lat && lng && p.latitude && p.longitude)
        ? haversine(uLat, uLng, p.latitude, p.longitude)
        : null,
    }))
    if (lat && lng) data.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999))
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/pharmacies/:id', async (req, res, next) => {
  try {
    const [ph] = await findPublicPharmacies(and(eq(pharmacy.id, parseInt(req.params.id)), activePharmacy))
    if (!ph) return res.status(404).json({ success: false, message: req.t('pharmacy.not_found') })
    res.json({ success: true, data: ph })
  } catch (err) { next(err) }
})

// ══════════════════════════════════════════════════════════════
// VISITES (compteur de visiteurs du site public)
// ══════════════════════════════════════════════════════════════

const VISITOR_ID = /^[A-Za-z0-9-]{16,64}$/

router.post('/visit', async (req, res, next) => {
  try {
    const { visitorId } = req.body || {}
    if (!VISITOR_ID.test(visitorId || '')) return res.status(400).json({ success: false, message: req.t('error.bad_request') })

    // Counted once per browser per day (UTC = heure de Nouakchott)
    const day = new Date().toISOString().slice(0, 10)
    await db.insert(siteVisits).values({ day, visitorId }).onConflictDoNothing()
    res.status(204).end()
  } catch (err) { next(err) }
})

router.get('/pharmacies/:id/logo', async (req, res, next) => {
  try {
    const logo = await db.query.pharmacyLogos.findFirst({ where: eq(pharmacyLogos.pharmacyId, parseInt(req.params.id)) })
    if (!logo) return res.status(404).json({ success: false, message: req.t('public.logo_not_found') })

    sendImage(res, logo, !!req.query.v)
  } catch (err) { next(err) }
})

// ══════════════════════════════════════════════════════════════
// SITE (logo de la plateforme, géré par le SuperAdmin)
// ══════════════════════════════════════════════════════════════

router.get('/site', async (req, res, next) => {
  try {
    const [name, logo] = await Promise.all([getSiteName(), getSiteLogo({ withData: false })])
    res.json({ success: true, data: { name, logo_updated_at: logo?.updatedAt ?? null } })
  } catch (err) { next(err) }
})

router.get('/site/logo', async (req, res, next) => {
  try {
    const logo = await getSiteLogo()
    if (!logo) return res.status(404).json({ success: false, message: req.t('public.logo_not_found') })
    sendImage(res, logo.value, !!req.query.v)
  } catch (err) { next(err) }
})

router.get('/pharmacies/:id/products', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 12, search, categoryId, inStock, sortBy = 'name' } = req.query
    const pId  = parseInt(req.params.id)
    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const take = parseInt(pageSize)

    const where = and(
      eq(products.pharmacyId, pId),
      isNull(products.deletedAt),
      ne(products.status, 'DISCONTINUED'),
      search             ? contains(products.name, search) : undefined,
      categoryId         ? eq(products.categoryId, parseInt(categoryId)) : undefined,
      inStock === 'true' ? gt(products.stock, 0) : undefined,
    )

    const orderBy = {
      price_asc:  asc(products.sale_price),
      price_desc: desc(products.sale_price),
      stock:      desc(products.stock),
    }[sortBy] || asc(products.name)

    const [rows, [{ total }]] = await Promise.all([
      db.query.products.findMany({
        where,
        with: { category: { columns: { id: true, name: true } } },
        orderBy: [orderBy], offset: skip, limit: take,
      }),
      db.select({ total: count() }).from(products).where(where),
    ])
    res.json({ success: true, data: rows, meta: { total, page: parseInt(page), totalPages: Math.ceil(total / take) } })
  } catch (err) { next(err) }
})

router.get('/products/:id/image', async (req, res, next) => {
  try {
    const image = await db.query.productImages.findFirst({ where: eq(productImages.productId, parseInt(req.params.id)) })
    if (!image) return res.status(404).json({ success: false, message: req.t('public.image_not_found') })

    sendImage(res, image, !!req.query.v)
  } catch (err) { next(err) }
})

// ══════════════════════════════════════════════════════════════
// RECHERCHE
// ══════════════════════════════════════════════════════════════

router.get('/products/search', async (req, res, next) => {
  try {
    const { q, pharmacyId, lat, lng } = req.query
    if (!q || q.trim().length < 2) return res.json({ success: true, data: [] })

    const found = await db.query.products.findMany({
      where: and(
        contains(products.name, q.trim()),
        isNull(products.deletedAt),
        inArray(products.pharmacyId, db.select({ id: pharmacy.id }).from(pharmacy).where(activePharmacy)),
        pharmacyId ? eq(products.pharmacyId, parseInt(pharmacyId)) : undefined,
      ),
      with: {
        category: { columns: { id: true, name: true } },
        pharmacy: { columns: { id: true, name: true, city: true, phone: true, latitude: true, longitude: true } },
      },
      orderBy: [desc(products.stock), asc(products.name)],
      limit: 60,
    })

    const uLat = parseFloat(lat); const uLng = parseFloat(lng)
    const data = found.map(p => ({
      productId:       p.id,
      id:              p.id,
      name:            p.name,
      sale_price:      p.sale_price,
      stock:           p.stock,
      unit_type:       p.unit_type,
      unit_quantity:   p.unit_quantity,
      prescription_req: p.prescription_req,
      image_updated_at: p.image_updated_at,
      category:        p.category,
      pharmacyId:      p.pharmacyId,
      pharmacyName:    p.pharmacy?.name,
      pharmacyCity:    p.pharmacy?.city,
      pharmacyPhone:   p.pharmacy?.phone,
      distance:        (lat && lng && p.pharmacy?.latitude && p.pharmacy?.longitude)
        ? haversine(uLat, uLng, p.pharmacy.latitude, p.pharmacy.longitude)
        : null,
    })).sort((a, b) => {
      if (a.stock > 0 && b.stock === 0) return -1
      if (a.stock === 0 && b.stock > 0) return 1
      return (a.distance ?? 999) - (b.distance ?? 999)
    })

    res.json({ success: true, data })
  } catch (err) { next(err) }
})

// ══════════════════════════════════════════════════════════════
// COMMANDES — Création avec pickup_code persisté en base
// ══════════════════════════════════════════════════════════════

router.post('/orders', async (req, res, next) => {
  try {
    const { customerName, customerPhone, customerEmail, pharmacyId, items, note } = req.body

    // Validations
    if (!customerName?.trim())  return res.status(422).json({ success: false, message: req.t('validation.required', { field: req.t('fields.customer') }) })
    if (!customerPhone?.trim()) return res.status(422).json({ success: false, message: req.t('validation.required', { field: req.t('fields.phone') }) })
    if (!pharmacyId)            return res.status(422).json({ success: false, message: req.t('public.pharmacy_missing') })
    if (!items?.length)         return res.status(422).json({ success: false, message: req.t('validation.at_least_one_item') })

    // Pharmacie active ?
    const ph = await db.query.pharmacy.findFirst({
      where: and(eq(pharmacy.id, parseInt(pharmacyId)), activePharmacy),
    })
    if (!ph) return res.status(404).json({ success: false, message: req.t('public.pharmacy_unavailable') })

    // Vérifier stock
    const errors = []
    for (const item of items) {
      const prod = await db.query.products.findFirst({
        where: and(eq(products.id, item.productId), eq(products.pharmacyId, parseInt(pharmacyId)), isNull(products.deletedAt)),
      })
      if (!prod)               { errors.push(req.t('public.product_missing', { id: item.productId })); continue }
      if (prod.stock < item.quantity) errors.push(req.t('order.only_in_stock', { name: prod.name, stock: prod.stock }))
    }
    if (errors.length) return res.status(422).json({ success: false, message: errors.join(' ') })

    // ── Générer et sauvegarder le code de retrait ──
    const pickup_code        = await makePickupCode()
    const pickup_expires_at  = new Date(Date.now() + 48 * 3600 * 1000)   // 48h

    const totalAmount = items.reduce((s, i) => s + i.quantity * parseFloat(i.price), 0)

    const orderId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(orders).values({
        pharmacyId:        parseInt(pharmacyId),
        customer:          customerName.trim(),
        customer_phone:    customerPhone.trim(),
        customer_email:    customerEmail?.trim() || null,
        customer_note:     note?.trim()          || null,
        source:            'ONLINE',
        status:            'PENDING',
        total_amount:      totalAmount,
        pickup_code,                    // ← CODE SAUVEGARDÉ EN BASE
        pickup_expires_at,
      }).returning({ id: orders.id })

      await tx.insert(orderDetails).values(items.map(i => ({
        orderId:   created.id,
        productId: i.productId,
        quantity:  i.quantity,
        price:     parseFloat(i.price),
        total:     i.quantity * parseFloat(i.price),
      })))

      return created.id
    })

    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: orderPublicWith })

    // Notifier la pharmacie (dans son panel)
    await db.insert(notifications).values({
      pharmacyId: parseInt(pharmacyId),
      ...notif('online_order', { code: pickup_code, customer: customerName, amount: totalAmount }),
      type:    'INFO',
    })

    res.status(201).json({
      success: true,
      data: {
        id:                order.id,
        pickup_code:       order.pickup_code,          // ← Affiché au client
        pickup_expires_at: order.pickup_expires_at,
        status:            order.status,
        total_amount:      order.total_amount,
        customer:          order.customer,
        customer_phone:    order.customer_phone,
        pharmacy:          order.pharmacy,
        items:             order.details,
      },
    })
  } catch (err) { next(err) }
})

// ══════════════════════════════════════════════════════════════
// SUIVI COMMANDE CLIENT
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/public/orders/:code
 * Client suit sa commande via son code de retrait
 */
router.get('/orders/:code', async (req, res, next) => {
  try {
    const code  = req.params.code.toUpperCase().trim()
    const order = await db.query.orders.findFirst({
      where: eq(orders.pickup_code, code),
      with:  orderPublicWith,
    })
    if (!order) return res.status(404).json({ success: false, message: req.t('public.code_invalid') })

    const expired  = order.pickup_expires_at && new Date(order.pickup_expires_at) < new Date()
    const statusLabel = {
      PENDING:      '⏳ En attente de préparation',
      READY:        '✅ Prête à être récupérée',
      COMPLETED:    '✅ Retirée et payée',
      CANCELLED:    '❌ Annulée',
    }

    res.json({
      success: true,
      data: {
        id:                order.id,
        pickup_code:       order.pickup_code,
        pickup_code_used:  order.pickup_code_used,
        pickup_expires_at: order.pickup_expires_at,
        status:            order.status,
        status_label:      statusLabel[order.status] || order.status,
        total_amount:      order.total_amount,
        customer:          order.customer,
        customer_phone:    order.customer_phone,
        customer_note:     order.customer_note,
        order_date:        order.order_date,
        pharmacy:          order.pharmacy,
        items:             order.details,
        expired,
      },
    })
  } catch (err) { next(err) }
})

export default router
