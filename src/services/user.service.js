import bcrypt from 'bcryptjs'
import prisma from '../config/database.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

const safeSelect = {
  id: true, name: true, email: true, role: true, status: true,
  phone: true, address: true, last_login: true, createdAt: true,
}

export async function getUsers(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, role, status } = query

  const where = {
    pharmacyId,
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(role   && { role }),
    ...(status && { status }),
  }

  const [users, total] = await prisma.$transaction([
    prisma.users.findMany({ where, skip, take, select: safeSelect, orderBy: { name: 'asc' } }),
    prisma.users.count({ where }),
  ])

  return { users, total, page, pageSize }
}

export async function getUserById(id, pharmacyId, req) {
  const user = await prisma.users.findFirst({
    where: { id, pharmacyId, deletedAt: null },
    select: safeSelect,
  })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }
  return user
}

export async function createUser(pharmacyId, requesterId, data, req) {
  const exists = await prisma.users.findFirst({
    where: { email: data.email, pharmacyId, deletedAt: null },
  })
  if (exists) throw { statusCode: 409, message: req.t('auth.email_taken') }

  const hashed = await bcrypt.hash(data.password, 12)

  const user = await prisma.users.create({
    data: { ...data, password: hashed, pharmacyId },
    select: safeSelect,
  })

  await createAuditLog({
    action: 'CREATE', entity: 'users', entity_id: user.id,
    new_values: { email: data.email, role: data.role },
    userId: requesterId, pharmacyId, req,
  })

  return user
}

export async function updateUser(id, pharmacyId, requesterId, data, req) {
  const user = await prisma.users.findFirst({ where: { id, pharmacyId, deletedAt: null } })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }

  const updated = await prisma.users.update({
    where: { id },
    data,
    select: safeSelect,
  })

  await createAuditLog({
    action: 'UPDATE', entity: 'users', entity_id: id,
    old_values: user, new_values: data,
    userId: requesterId, pharmacyId, req,
  })

  return updated
}

export async function deleteUser(id, pharmacyId, requesterId, req) {
  const user = await prisma.users.findFirst({ where: { id, pharmacyId, deletedAt: null } })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }
  if (id === requesterId) throw { statusCode: 400, message: 'Cannot delete yourself' }

  await prisma.users.update({ where: { id }, data: { deletedAt: new Date() } })

  await createAuditLog({
    action: 'DELETE', entity: 'users', entity_id: id,
    userId: requesterId, pharmacyId, req,
  })
}
