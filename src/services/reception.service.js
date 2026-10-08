import { eq, and, isNull, gte, lte, desc, count, sql, inArray } from 'drizzle-orm'
import db from '../config/database.js'
import { products, batches, receptions, receptionDetails, stockMovements } from '../db/schema.js'
import { contains } from '../db/helpers.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

export async function createReception(pharmacyId, userId, data, req) {
  const { supplier, invoice_number, items } = data

  const receptionId = await db.transaction(async (tx) => {
    let totalAmount = 0
    const detailsData = []

    for (const item of items) {
      const product = await tx.query.products.findFirst({
        where: and(eq(products.id, item.productId), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
      })
      if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

      const lineTotal = item.quantity * parseFloat(item.price)
      totalAmount += lineTotal

      // Link the line to its batch. Quantities only enter the batch when the reception is validated.
      let batchId = null
      if (item.batchNumber && item.expirationDate) {
        const existing = await tx.query.batches.findFirst({
          where: and(eq(batches.number, item.batchNumber), eq(batches.pharmacyId, pharmacyId), isNull(batches.deletedAt)),
        })
        if (existing) {
          if (existing.productId !== item.productId) throw { statusCode: 409, message: req.t('batch.number_other_product') }
          batchId = existing.id
        } else {
          const [batch] = await tx.insert(batches).values({
            number:           item.batchNumber,
            productId:        item.productId,
            pharmacyId,
            quantity:         0,
            initial_quantity: 0,
            expiration_date:  new Date(item.expirationDate),
            unit_type:        item.unit_type || null,
            unit_quantity:    item.unit_quantity || null,
          }).returning({ id: batches.id })
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
    const [newReception] = await tx.insert(receptions).values({
      pharmacyId,
      userId,
      supplier,
      invoice_number: invoice_number || null,
      status:         'PENDING',
      total_amount:   totalAmount,
    }).returning({ id: receptions.id })

    await tx.insert(receptionDetails).values(detailsData.map(d => ({ ...d, receptionId: newReception.id })))

    return newReception.id
  })

  const reception = await db.query.receptions.findFirst({
    where: eq(receptions.id, receptionId),
    with: {
      details: { with: { product: { columns: { id: true, name: true } } } },
      user:    { columns: { id: true, name: true } },
    },
  })

  await createAuditLog({
    action: 'CREATE', entity: 'receptions', entity_id: reception.id,
    new_values: { supplier, invoice_number }, userId, pharmacyId, req,
  })

  return reception
}

export async function completeReception(id, pharmacyId, userId, status, req) {
  const reception = await db.query.receptions.findFirst({
    where: and(eq(receptions.id, id), eq(receptions.pharmacyId, pharmacyId), isNull(receptions.deletedAt)),
    with: { details: true },
  })
  if (!reception) throw { statusCode: 404, message: req.t('reception.not_found') }
  const alreadyProcessed = { statusCode: 409, message: req.t('reception.already_processed') }
  if (reception.status !== 'PENDING') throw alreadyProcessed

  await db.transaction(async (tx) => {
    // Only a PENDING reception can be processed, once (also guards against a double click)
    const [claimed] = await tx.update(receptions).set({ status })
      .where(and(eq(receptions.id, id), eq(receptions.status, 'PENDING')))
      .returning({ id: receptions.id })
    if (!claimed) throw alreadyProcessed

    if (status === 'CANCELLED') {
      // Drop batches this reception created that never received anything and no other pending reception uses
      const batchIds = [...new Set(reception.details.map(d => d.batchId).filter(Boolean))]
      if (batchIds.length) {
        await tx.update(batches)
          .set({ deletedAt: new Date() })
          .where(and(
            inArray(batches.id, batchIds),
            eq(batches.initial_quantity, 0),
            sql`not exists (
              select 1 from ${receptionDetails} rd join ${receptions} r on r.id = rd."receptionId"
              where rd."batchId" = ${batches.id} and r.id <> ${id} and r.status = 'PENDING'
            )`,
          ))
      }
    }

    if (status === 'COMPLETED' || status === 'PARTIAL') {
      for (const detail of reception.details) {
        if (detail.batchId) {
          await tx.update(batches)
            .set({
              quantity:         sql`${batches.quantity} + ${detail.quantity}`,
              initial_quantity: sql`${batches.initial_quantity} + ${detail.quantity}`,
              // A batch emptied by sales becomes usable again once refilled
              status:           sql`case when ${batches.status} = 'DEPLETED' then 'ACTIVE'::"BatchStatus" else ${batches.status} end`,
            })
            .where(eq(batches.id, detail.batchId))
        }

        const product = await tx.query.products.findFirst({ where: eq(products.id, detail.productId) })
        const newStock = (product?.stock || 0) + detail.quantity

        await tx.update(products)
          .set({
            stock:  newStock,
            status: newStock > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
          })
          .where(eq(products.id, detail.productId))

        await tx.insert(stockMovements).values({
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

  const where = and(
    eq(receptions.pharmacyId, pharmacyId),
    isNull(receptions.deletedAt),
    search   ? contains(receptions.supplier, search) : undefined,
    status   ? eq(receptions.status, status) : undefined,
    dateFrom ? gte(receptions.reception_date, new Date(dateFrom)) : undefined,
    dateTo   ? lte(receptions.reception_date, new Date(dateTo + 'T23:59:59')) : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db.query.receptions.findMany({
      where, offset: skip, limit: take,
      with: {
        user:    { columns: { id: true, name: true } },
        details: { with: { product: { columns: { id: true, name: true } } } },
      },
      orderBy: [desc(receptions.reception_date)],
    }),
    db.select({ total: count() }).from(receptions).where(where),
  ])

  return { receptions: rows, total, page, pageSize }
}

export async function getReceptionById(id, pharmacyId, req) {
  const reception = await db.query.receptions.findFirst({
    where: and(eq(receptions.id, id), eq(receptions.pharmacyId, pharmacyId), isNull(receptions.deletedAt)),
    with: {
      user:    { columns: { id: true, name: true } },
      details: {
        with: {
          product: { columns: { id: true, name: true, barcode: true } },
          batch:   { columns: { id: true, number: true, expiration_date: true } },
        },
      },
    },
  })
  if (!reception) throw { statusCode: 404, message: req.t('reception.not_found') }
  return reception
}
