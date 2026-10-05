import { Router } from 'express'
import * as ctrl from '../controllers/order.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { orderValidator, updateOrderStatusValidator } from '../validators/order.validator.js'
import { eq, and, isNull } from 'drizzle-orm'
import db from '../config/database.js'
import { orders, products, stockMovements, notifications, users } from '../db/schema.js'
import { createSaleFromOrder } from '../services/sale.service.js'

const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'INSURANCE']

const router = Router()
router.use(authenticate)

// ── VERIFY PICKUP CODE — doit être AVANT /:id pour éviter le conflit ──
/**
 * GET /api/orders/verify/:code
 * Pharmacie vérifie un code de retrait client — retourne commande complète
 */
router.get('/verify/:code', async (req, res, next) => {
  try {
    const code       = req.params.code.toUpperCase().trim()
    const pharmacyId = req.user.pharmacyId

    // Sécurité: le code doit appartenir à CETTE pharmacie
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.pickup_code, code), eq(orders.pharmacyId, pharmacyId), isNull(orders.deletedAt)),
      with: {
        details: {
          with: {
            product: {
              columns: { id:true, name:true, barcode:true, unit_type:true, unit_quantity:true }
            }
          }
        }
      }
    })

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Code invalide ou commande introuvable pour cette pharmacie.'
      })
    }

    // Vérifier expiration
    const expired = order.pickup_expires_at && new Date(order.pickup_expires_at) < new Date()
    if (expired && order.status !== 'COMPLETED') {
      return res.status(410).json({
        success: false,
        message: `Ce code a expiré le ${new Date(order.pickup_expires_at).toLocaleDateString('fr-FR')}.`,
        data: { pickup_code: order.pickup_code, status: order.status, expired: true }
      })
    }

    // Déjà utilisé
    if (order.pickup_code_used || order.status === 'COMPLETED') {
      return res.status(409).json({
        success: false,
        message: 'Cette commande a déjà été récupérée et validée.',
        data: { pickup_code: order.pickup_code, status: order.status, already_used: true }
      })
    }

    // Annulée
    if (order.status === 'CANCELLED') {
      return res.status(409).json({
        success: false,
        message: 'Cette commande a été annulée.',
        data: { pickup_code: order.pickup_code, status: order.status }
      })
    }

    res.json({
      success: true,
      data: {
        id:                order.id,
        pickup_code:       order.pickup_code,
        pickup_expires_at: order.pickup_expires_at,
        status:            order.status,
        source:            order.source,
        total_amount:      order.total_amount,
        customer:          order.customer,
        customer_phone:    order.customer_phone,
        customer_email:    order.customer_email,
        customer_note:     order.customer_note,
        order_date:        order.order_date,
        items:             order.details,
      }
    })
  } catch (err) { next(err) }
})

// ── VALIDATE PICKUP — Valide le retrait + décrémente stock ──────────
/**
 * PATCH /api/orders/:id/validate-pickup
 * Marque la commande COMPLETED, stock décrément si ONLINE
 */
router.patch('/:id/validate-pickup', authorize('ADMIN','MANAGER','CAISSIER'), async (req, res, next) => {
  try {
    const orderId    = parseInt(req.params.id)
    const pharmacyId = req.user.pharmacyId
    const userId     = req.user.id
    const { note }   = req.body
    const payment_method = PAYMENT_METHODS.includes(req.body.payment_method) ? req.body.payment_method : 'CASH'

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.pharmacyId, pharmacyId), isNull(orders.deletedAt)),
      with: { details: { with: { product: true } } }
    })

    if (!order)                                     return res.status(404).json({ success:false, message:'Commande introuvable.'       })
    if (order.pickup_code_used || order.status === 'COMPLETED') return res.status(409).json({ success:false, message:'Déjà validée.'             })
    if (order.status === 'CANCELLED')               return res.status(409).json({ success:false, message:'Commande annulée.'           })

    // Pour commandes ONLINE: vérifier stock
    if (order.source === 'ONLINE') {
      const errors = []
      for (const d of order.details) {
        if (d.product.stock < d.quantity)
          errors.push(`"${d.product.name}" : seulement ${d.product.stock} en stock.`)
      }
      if (errors.length) return res.status(422).json({ success: false, message: errors.join(' ') })
    }

    const { completed: updated, sale } = await db.transaction(async (tx) => {
      // Pour commandes ONLINE: décrémenter stock maintenant
      if (order.source === 'ONLINE') {
        for (const d of order.details) {
          const ns = Math.max(0, d.product.stock - d.quantity)
          await tx.update(products)
            .set({ stock: ns, status: ns <= 0 ? 'OUT_OF_STOCK' : 'AVAILABLE' })
            .where(eq(products.id, d.product.id))
          await tx.insert(stockMovements).values({
            productId:     d.product.id,
            pharmacyId,
            userId,
            type:          'SALE',
            quantity:      -d.quantity,
            previous_stock: d.product.stock,
            new_stock:     ns,
            reference_id:  order.id,
            reason:        `Retrait commande en ligne ${order.pickup_code}`
          })
        }
      }

      // Marquer COMPLETED
      const [completed] = await tx.update(orders)
        .set({
          status:           'COMPLETED',
          pickup_code_used: true,
          validated_by:     userId,
          validated_at:     new Date(),
          validated_note:   note?.trim() || null
        })
        .where(eq(orders.id, orderId))
        .returning()

      // Enregistrer le retrait comme vente (historique des ventes + CA)
      const sale = await createSaleFromOrder(tx, order, { userId, payment_method, sale_date: completed.validated_at })

      // Notification
      await tx.insert(notifications).values({
        pharmacyId,
        title:   `✅ Commande ${order.pickup_code} validée`,
        message: `Retrait de ${order.customer} confirmé — ${Number(order.total_amount||0).toLocaleString('fr-FR')} MRU.`,
        type:    'SUCCESS'
      })

      return { completed, sale }
    })

    const validator = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, name: true } })

    res.json({
      success: true,
      message: `Commande ${order.pickup_code} validée avec succès.`,
      data: { ...updated, validator: validator ?? null, sale: { id: sale.id, invoice_number: sale.invoice_number } },
    })
  } catch (err) { next(err) }
})

// ── CRUD standard ────────────────────────────────────────────────────
router.get('/',    ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/',   orderValidator, validate, ctrl.create)
router.patch('/:id/status', authorize('ADMIN','MANAGER'), updateOrderStatusValidator, validate, ctrl.updateStatus)
router.delete('/:id', authorize('ADMIN','MANAGER'), ctrl.remove)

export default router
