import { eq, and, isNull, gte, lte, lt, gt, asc, count, sql } from 'drizzle-orm'
import db from '../config/database.js'
import { batches } from '../db/schema.js'
import { toRow } from '../db/helpers.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

export async function getBatches(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { status, productId, expiringSoon } = query

  const where = and(
    eq(batches.pharmacyId, pharmacyId),
    isNull(batches.deletedAt),
    status    ? eq(batches.status, status) : undefined,
    productId ? eq(batches.productId, parseInt(productId)) : undefined,
    ...(expiringSoon === 'true'
      ? [lte(batches.expiration_date, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), gte(batches.expiration_date, new Date())]
      : []),
  )

  const [rows, [{ total }]] = await Promise.all([
    db.query.batches.findMany({
      where, offset: skip, limit: take,
      with: { product: { columns: { id: true, name: true, unit_type: true } } },
      orderBy: [asc(batches.expiration_date)],
    }),
    db.select({ total: count() }).from(batches).where(where),
  ])

  return { batches: rows, total, page, pageSize }
}

export async function getBatchById(id, pharmacyId, req) {
  const batch = await db.query.batches.findFirst({
    where: and(eq(batches.id, id), eq(batches.pharmacyId, pharmacyId), isNull(batches.deletedAt)),
    with: { product: { columns: { id: true, name: true } } },
  })
  if (!batch) throw { statusCode: 404, message: req.t('batch.not_found') }
  return batch
}

export async function createBatch(pharmacyId, userId, data, req) {
  const exists = await db.query.batches.findFirst({
    where: and(eq(batches.number, data.number), eq(batches.pharmacyId, pharmacyId)),
  })
  if (exists) throw { statusCode: 409, message: req.t('batch.number_taken') }

  const [created] = await db.insert(batches).values({
    ...toRow(batches, data),
    pharmacyId,
    expiration_date:    new Date(data.expiration_date),
    manufacturing_date: data.manufacturing_date ? new Date(data.manufacturing_date) : null,
  }).returning({ id: batches.id })

  const batch = await db.query.batches.findFirst({
    where: eq(batches.id, created.id),
    with: { product: { columns: { id: true, name: true } } },
  })

  await createAuditLog({
    action: 'CREATE', entity: 'batches', entity_id: batch.id,
    new_values: data, userId, pharmacyId, req,
  })

  return batch
}

export async function updateBatch(id, pharmacyId, userId, data, req) {
  const batch = await db.query.batches.findFirst({
    where: and(eq(batches.id, id), eq(batches.pharmacyId, pharmacyId), isNull(batches.deletedAt)),
  })
  if (!batch) throw { statusCode: 404, message: req.t('batch.not_found') }

  const [updated] = await db.update(batches).set(toRow(batches, data)).where(eq(batches.id, id)).returning()

  await createAuditLog({
    action: 'UPDATE', entity: 'batches', entity_id: id,
    old_values: batch, new_values: data, userId, pharmacyId, req,
  })

  return updated
}

export async function checkAndUpdateExpiredBatches(pharmacyId) {
  const updated = await db.update(batches)
    .set({ status: 'EXPIRED' })
    .where(and(
      eq(batches.pharmacyId, pharmacyId),
      eq(batches.status, 'ACTIVE'),
      lt(batches.expiration_date, new Date()),
    ))
    .returning({ id: batches.id })
  return updated.length
}

/**
 * Take `quantity` of a product out of its batches, earliest expiry first (FEFO).
 * `preferredBatchId` (optional) is used first and must be an available batch of this pharmacy/product.
 * Only active, unexpired batches are used; whatever they cannot cover stays untracked.
 * Must run inside the stock-exit transaction (rows are locked FOR UPDATE).
 * Returns [{ batchId, quantity }] in consumption order.
 */
export async function consumeBatches(tx, { pharmacyId, productId, quantity, preferredBatchId = null }, req) {
  const available = await tx.select({ id: batches.id, quantity: batches.quantity })
    .from(batches)
    .where(and(
      eq(batches.pharmacyId, pharmacyId),
      eq(batches.productId, productId),
      eq(batches.status, 'ACTIVE'),
      isNull(batches.deletedAt),
      gt(batches.quantity, 0),
      gte(batches.expiration_date, new Date()),
    ))
    .orderBy(asc(batches.expiration_date), asc(batches.id))
    .for('update')

  if (preferredBatchId) {
    const i = available.findIndex(b => b.id === Number(preferredBatchId))
    if (i === -1) throw { statusCode: 422, message: req.t('batch.not_available') }
    available.unshift(...available.splice(i, 1))
  }

  const allocations = []
  let remaining = quantity
  for (const batch of available) {
    if (remaining <= 0) break
    const take = Math.min(remaining, batch.quantity)
    await tx.update(batches)
      .set({ quantity: sql`${batches.quantity} - ${take}`, ...(take >= batch.quantity ? { status: 'DEPLETED' } : {}) })
      .where(eq(batches.id, batch.id))
    allocations.push({ batchId: batch.id, quantity: take })
    remaining -= take
  }
  return allocations
}

/**
 * Split a stock exit of `quantity` into one part per batch allocation (+ any untracked remainder),
 * with the running product stock before/after each part — one stock movement per part.
 */
export function movementParts(quantity, allocations, startStock) {
  const parts   = allocations.map(a => ({ batchId: a.batchId, quantity: a.quantity }))
  const tracked = parts.reduce((s, p) => s + p.quantity, 0)
  if (quantity - tracked > 0 || !parts.length) parts.push({ batchId: null, quantity: quantity - tracked })
  let stock = startStock
  return parts.map(p => ({ ...p, previous: stock, next: (stock -= p.quantity) }))
}
