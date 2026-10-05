import { eq, and, isNull, gte, lte, lt, asc, count } from 'drizzle-orm'
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
