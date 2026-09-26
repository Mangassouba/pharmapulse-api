import prisma from '../config/database.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

export async function createReception(pharmacyId, userId, data, req) {
  const { supplier, invoice_number, items } = data

  const reception = await prisma.$transaction(async (tx) => {
    let totalAmount = 0
    const detailsData = []

    for (const item of items) {
      const product = await tx.products.findFirst({
        where: { id: item.productId, pharmacyId, deletedAt: null },
      })
      if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

      const lineTotal = item.quantity * parseFloat(item.price)
      totalAmount += lineTotal

      // Create or update batch if batch number provided
      let batchId = null
      if (item.batchNumber && item.expirationDate) {
        const existing = await tx.batches.findFirst({
          where: { number: item.batchNumber, pharmacyId },
        })
        if (existing) {
          await tx.batches.update({
            where: { id: existing.id },
            data: { quantity: { increment: item.quantity } },
          })
          batchId = existing.id
        } else {
          const batch = await tx.batches.create({
            data: {
              number:           item.batchNumber,
              productId:        item.productId,
              pharmacyId,
              quantity:         item.quantity,
              initial_quantity: item.quantity,
              expiration_date:  new Date(item.expirationDate),
              unit_type:        item.unit_type || null,
              unit_quantity:    item.unit_quantity || null,
            },
          })
          batchId = batch.id
        }
      }

      detailsData.push({
        productId:    item.productId,
        batchId,
        quantity:     item.quantity,
        price:        parseFloat(item.price),
        total:        lineTotal,
        unit_type:    item.unit_type || null,
        unit_quantity: item.unit_quantity || null,
      })
    }

    // Create reception with details
    const newReception = await tx.receptions.create({
      data: {
        pharmacyId,
        userId,
        supplier,
        invoice_number: invoice_number || null,
        status:         'PENDING',
        total_amount:   totalAmount,
        details: { create: detailsData },
      },
      include: {
        details: { include: { product: { select: { id: true, name: true } } } },
        user:    { select: { id: true, name: true } },
      },
    })

    return newReception
  })

  await createAuditLog({
    action: 'CREATE', entity: 'receptions', entity_id: reception.id,
    new_values: { supplier, invoice_number }, userId, pharmacyId, req,
  })

  return reception
}

export async function completeReception(id, pharmacyId, userId, status, req) {
  const reception = await prisma.receptions.findFirst({
    where: { id, pharmacyId, deletedAt: null },
    include: { details: true },
  })
  if (!reception) throw { statusCode: 404, message: req.t('reception.not_found') }
  if (reception.status === 'COMPLETED') throw { statusCode: 409, message: 'Reception already completed' }

  await prisma.$transaction(async (tx) => {
    await tx.receptions.update({ where: { id }, data: { status } })

    if (status === 'COMPLETED' || status === 'PARTIAL') {
      for (const detail of reception.details) {
        const product = await tx.products.findUnique({ where: { id: detail.productId } })
        const newStock = (product?.stock || 0) + detail.quantity

        await tx.products.update({
          where: { id: detail.productId },
          data: {
            stock:  newStock,
            status: newStock > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
          },
        })

        await tx.stockMovements.create({
          data: {
            productId:      detail.productId,
            pharmacyId,
            userId,
            batchId:        detail.batchId,
            type:           'ENTRY',
            quantity:       detail.quantity,
            previous_stock: product?.stock || 0,
            new_stock:      newStock,
            reference_id:   id,
            reason:         `Réception fournisseur: ${reception.supplier}`,
            unit_type:      detail.unit_type,
          },
        })
      }
    }
  })

  await createAuditLog({
    action: 'COMPLETE_RECEPTION', entity: 'receptions', entity_id: id,
    new_values: { status }, userId, pharmacyId, req,
  })
}

export async function getReceptions(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, status, dateFrom, dateTo } = query

  const where = {
    pharmacyId,
    deletedAt: null,
    ...(search && { supplier: { contains: search, mode: 'insensitive' } }),
    ...(status && { status }),
    ...(dateFrom || dateTo ? {
      reception_date: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
      },
    } : {}),
  }

  const [receptions, total] = await prisma.$transaction([
    prisma.receptions.findMany({
      where, skip, take,
      include: {
        user:    { select: { id: true, name: true } },
        details: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: { reception_date: 'desc' },
    }),
    prisma.receptions.count({ where }),
  ])

  return { receptions, total, page, pageSize }
}

export async function getReceptionById(id, pharmacyId, req) {
  const reception = await prisma.receptions.findFirst({
    where: { id, pharmacyId, deletedAt: null },
    include: {
      user:    { select: { id: true, name: true } },
      details: {
        include: {
          product: { select: { id: true, name: true, barcode: true } },
          batch:   { select: { id: true, number: true, expiration_date: true } },
        },
      },
    },
  })
  if (!reception) throw { statusCode: 404, message: req.t('reception.not_found') }
  return reception
}
