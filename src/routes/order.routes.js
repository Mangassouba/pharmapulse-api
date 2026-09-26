import { Router } from 'express'
import * as ctrl from '../controllers/order.controller.js'
import { authenticate, authorize } from '../middlewares/auth.js'
import { validate } from '../middlewares/validate.js'
import { orderValidator, updateOrderStatusValidator } from '../validators/order.validator.js'
import prisma from '../config/database.js'

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
    const order = await prisma.orders.findFirst({
      where: { pickup_code: code, pharmacyId, deletedAt: null },
      include: {
        details: {
          include: {
            product: {
              select: { id:true, name:true, barcode:true, unit_type:true, unit_quantity:true }
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

    const order = await prisma.orders.findFirst({
      where: { id: orderId, pharmacyId, deletedAt: null },
      include: { details: { include: { product: true } } }
    })

    if (!order)                                     return res.status(404).json({ success:false, message:'Commande introuvable.'       })
    if (order.pickup_code_used || order.status === 'COMPLETED') return res.status(409).json({ success:false, message:'Déjà validée.'             })
    if (order.status === 'CANCELLED')               return res.status(409).json({ success:false, message:'Commande annulée.'           })

    // Pour commandes ONLINE: vérifier + décrémenter stock maintenant
    if (order.source === 'ONLINE') {
      const errors = []
      for (const d of order.details) {
        if (d.product.stock < d.quantity)
          errors.push(`"${d.product.name}" : seulement ${d.product.stock} en stock.`)
      }
      if (errors.length) return res.status(422).json({ success: false, message: errors.join(' ') })

      for (const d of order.details) {
        const ns = Math.max(0, d.product.stock - d.quantity)
        await prisma.products.update({
          where: { id: d.product.id },
          data: { stock: ns, status: ns <= 0 ? 'OUT_OF_STOCK' : 'AVAILABLE' }
        })
        await prisma.stockMovements.create({
          data: {
            productId:     d.product.id,
            pharmacyId,
            userId,
            type:          'SALE',
            quantity:      -d.quantity,
            previous_stock: d.product.stock,
            new_stock:     ns,
            reference_id:  order.id,
            reason:        `Retrait commande en ligne ${order.pickup_code}`
          }
        })
      }
    }

    // Marquer COMPLETED
    const updated = await prisma.orders.update({
      where: { id: orderId },
      data: {
        status:           'COMPLETED',
        pickup_code_used: true,
        validated_by:     userId,
        validated_at:     new Date(),
        validated_note:   note?.trim() || null
      }
    })

    // Notification
    await prisma.notifications.create({
      data: {
        pharmacyId,
        title:   `✅ Commande ${order.pickup_code} validée`,
        message: `Retrait de ${order.customer} confirmé — ${Number(order.total_amount||0).toLocaleString('fr-FR')} F.`,
        type:    'SUCCESS'
      }
    })

    res.json({ success: true, message: `Commande ${order.pickup_code} validée avec succès.`, data: updated })
  } catch (err) { next(err) }
})

// ── CRUD standard ────────────────────────────────────────────────────
router.get('/',    ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/',   orderValidator, validate, ctrl.create)
router.patch('/:id/status', authorize('ADMIN','MANAGER'), updateOrderStatusValidator, validate, ctrl.updateStatus)
router.delete('/:id', authorize('ADMIN','MANAGER'), ctrl.remove)

export default router
