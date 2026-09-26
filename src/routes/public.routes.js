/**
 * Routes publiques — Aucune authentification requise
 * Interface client vitrine
 */
import { Router } from 'express'
import prisma     from '../config/database.js'

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
    const exists = await prisma.orders.findUnique({ where: { pickup_code: code } })
    if (!exists) return code
  }
  throw new Error('Impossible de générer un code unique.')
}

// ══════════════════════════════════════════════════════════════
// PHARMACIES
// ══════════════════════════════════════════════════════════════

router.get('/pharmacies', async (req, res, next) => {
  try {
    const { lat, lng } = req.query
    const rows = await prisma.pharmacy.findMany({
      where:   { status: 'ACTIVE', is_active: true, deletedAt: null },
      include: {
        subscription: { select: { plan: true, status: true } },
        _count:       { select: { products: true, users: true } },
      },
    })

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
    const ph = await prisma.pharmacy.findFirst({
      where:   { id: parseInt(req.params.id), status: 'ACTIVE', is_active: true },
      include: {
        subscription: { select: { plan: true, status: true } },
        _count:       { select: { products: true, users: true } },
      },
    })
    if (!ph) return res.status(404).json({ success: false, message: 'Pharmacie introuvable.' })
    res.json({ success: true, data: ph })
  } catch (err) { next(err) }
})

router.get('/pharmacies/:id/products', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 12, search, categoryId, inStock, sortBy = 'name' } = req.query
    const pId  = parseInt(req.params.id)
    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const take = parseInt(pageSize)

    const where = { pharmacyId: pId, deletedAt: null, status: { not: 'DISCONTINUED' } }
    if (search)          where.name       = { contains: search, mode: 'insensitive' }
    if (categoryId)      where.categoryId = parseInt(categoryId)
    if (inStock === 'true') where.stock   = { gt: 0 }

    const orderBy = {
      price_asc:  { sale_price: 'asc'  },
      price_desc: { sale_price: 'desc' },
      stock:      { stock: 'desc'      },
    }[sortBy] || { name: 'asc' }

    const [products, total] = await prisma.$transaction([
      prisma.products.findMany({ where, include: { category: { select: { id: true, name: true } } }, orderBy, skip, take }),
      prisma.products.count({ where }),
    ])
    res.json({ success: true, data: products, meta: { total, page: parseInt(page), totalPages: Math.ceil(total / take) } })
  } catch (err) { next(err) }
})

// ══════════════════════════════════════════════════════════════
// RECHERCHE
// ══════════════════════════════════════════════════════════════

router.get('/products/search', async (req, res, next) => {
  try {
    const { q, pharmacyId, lat, lng } = req.query
    if (!q || q.trim().length < 2) return res.json({ success: true, data: [] })

    const where = {
      name:      { contains: q.trim(), mode: 'insensitive' },
      deletedAt: null,
      pharmacy:  { status: 'ACTIVE', is_active: true },
    }
    if (pharmacyId) where.pharmacyId = parseInt(pharmacyId)

    const products = await prisma.products.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        pharmacy: { select: { id: true, name: true, city: true, phone: true, latitude: true, longitude: true } },
      },
      orderBy: [{ stock: 'desc' }, { name: 'asc' }],
      take: 60,
    })

    const uLat = parseFloat(lat); const uLng = parseFloat(lng)
    const data = products.map(p => ({
      productId:       p.id,
      id:              p.id,
      name:            p.name,
      sale_price:      p.sale_price,
      stock:           p.stock,
      unit_type:       p.unit_type,
      unit_quantity:   p.unit_quantity,
      prescription_req: p.prescription_req,
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
    if (!customerName?.trim())  return res.status(422).json({ success: false, message: 'Nom du client obligatoire.' })
    if (!customerPhone?.trim()) return res.status(422).json({ success: false, message: 'Téléphone obligatoire.' })
    if (!pharmacyId)            return res.status(422).json({ success: false, message: 'Pharmacie non spécifiée.' })
    if (!items?.length)         return res.status(422).json({ success: false, message: 'Au moins un article requis.' })

    // Pharmacie active ?
    const pharmacy = await prisma.pharmacy.findFirst({
      where: { id: parseInt(pharmacyId), status: 'ACTIVE', is_active: true },
    })
    if (!pharmacy) return res.status(404).json({ success: false, message: 'Pharmacie introuvable ou inactive.' })

    // Vérifier stock
    const errors = []
    for (const item of items) {
      const prod = await prisma.products.findFirst({
        where: { id: item.productId, pharmacyId: parseInt(pharmacyId), deletedAt: null },
      })
      if (!prod)               { errors.push(`Produit introuvable (ID: ${item.productId}).`); continue }
      if (prod.stock < item.quantity) errors.push(`"${prod.name}" : seulement ${prod.stock} en stock.`)
    }
    if (errors.length) return res.status(422).json({ success: false, message: errors.join(' ') })

    // ── Générer et sauvegarder le code de retrait ──
    const pickup_code        = await makePickupCode()
    const pickup_expires_at  = new Date(Date.now() + 48 * 3600 * 1000)   // 48h

    const totalAmount = items.reduce((s, i) => s + i.quantity * parseFloat(i.price), 0)

    const order = await prisma.orders.create({
      data: {
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
        details: {
          create: items.map(i => ({
            productId: i.productId,
            quantity:  i.quantity,
            price:     parseFloat(i.price),
            total:     i.quantity * parseFloat(i.price),
          })),
        },
      },
      include: {
        details:  { include: { product: { select: { id: true, name: true, unit_type: true } } } },
        pharmacy: { select: { id: true, name: true, phone: true, address: true, city: true } },
      },
    })

    // Notifier la pharmacie (dans son panel)
    await prisma.notifications.create({
      data: {
        pharmacyId: parseInt(pharmacyId),
        title:   `🛒 Commande en ligne — ${pickup_code}`,
        message: `${customerName} · ${totalAmount.toLocaleString('fr-FR')} FCFA · Code : ${pickup_code}. À préparer.`,
        type:    'INFO',
      },
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
    const order = await prisma.orders.findUnique({
      where:   { pickup_code: code },
      include: {
        details:  { include: { product: { select: { id: true, name: true, unit_type: true } } } },
        pharmacy: { select: { id: true, name: true, phone: true, address: true, city: true } },
      },
    })
    if (!order) return res.status(404).json({ success: false, message: 'Code invalide ou commande introuvable.' })

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
