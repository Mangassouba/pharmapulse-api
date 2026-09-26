import prisma from '../config/database.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

export async function getBatches(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { status, productId, expiringSoon } = query

  const expiryFilter = expiringSoon === 'true'
    ? { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), gte: new Date() }
    : undefined

  const where = {
    pharmacyId,
    deletedAt: null,
    ...(status    && { status }),
    ...(productId && { productId: parseInt(productId) }),
    ...(expiryFilter && { expiration_date: expiryFilter }),
  }

  const [batches, total] = await prisma.$transaction([
    prisma.batches.findMany({
      where, skip, take,
      include: { product: { select: { id: true, name: true, unit_type: true } } },
      orderBy: { expiration_date: 'asc' },
    }),
    prisma.batches.count({ where }),
  ])

  return { batches, total, page, pageSize }
}

export async function getBatchById(id, pharmacyId, req) {
  const batch = await prisma.batches.findFirst({
    where: { id, pharmacyId, deletedAt: null },
    include: { product: { select: { id: true, name: true } } },
  })
  if (!batch) throw { statusCode: 404, message: req.t('batch.not_found') }
  return batch
}

export async function createBatch(pharmacyId, userId, data, req) {
  const exists = await prisma.batches.findFirst({
    where: { number: data.number, pharmacyId },
  })
  if (exists) throw { statusCode: 409, message: req.t('batch.number_taken') }

  const batch = await prisma.batches.create({
    data: {
      ...data,
      pharmacyId,
      expiration_date:    new Date(data.expiration_date),
      manufacturing_date: data.manufacturing_date ? new Date(data.manufacturing_date) : null,
    },
    include: { product: { select: { id: true, name: true } } },
  })

  await createAuditLog({
    action: 'CREATE', entity: 'batches', entity_id: batch.id,
    new_values: data, userId, pharmacyId, req,
  })

  return batch
}

export async function updateBatch(id, pharmacyId, userId, data, req) {
  const batch = await prisma.batches.findFirst({ where: { id, pharmacyId, deletedAt: null } })
  if (!batch) throw { statusCode: 404, message: req.t('batch.not_found') }

  const updated = await prisma.batches.update({ where: { id }, data })

  await createAuditLog({
    action: 'UPDATE', entity: 'batches', entity_id: id,
    old_values: batch, new_values: data, userId, pharmacyId, req,
  })

  return updated
}

export async function checkAndUpdateExpiredBatches(pharmacyId) {
  const updated = await prisma.batches.updateMany({
    where: {
      pharmacyId,
      status: 'ACTIVE',
      expiration_date: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  })
  return updated.count
}
