import bcrypt from 'bcryptjs'
import { eq, and, or, isNull, asc, count } from 'drizzle-orm'
import db from '../config/database.js'
import { users } from '../db/schema.js'
import { contains, toRow } from '../db/helpers.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'

const safeColumns = {
  id: users.id, name: users.name, email: users.email, role: users.role, status: users.status,
  phone: users.phone, address: users.address, last_login: users.last_login, createdAt: users.createdAt,
}

const activeUser = (id, pharmacyId) =>
  and(eq(users.id, id), eq(users.pharmacyId, pharmacyId), isNull(users.deletedAt))

export async function getUsers(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, role, status } = query

  const where = and(
    eq(users.pharmacyId, pharmacyId),
    isNull(users.deletedAt),
    search ? or(contains(users.name, search), contains(users.email, search)) : undefined,
    role   ? eq(users.role, role) : undefined,
    status ? eq(users.status, status) : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db.select(safeColumns).from(users).where(where).orderBy(asc(users.name)).offset(skip).limit(take),
    db.select({ total: count() }).from(users).where(where),
  ])

  return { users: rows, total, page, pageSize }
}

export async function getUserById(id, pharmacyId, req) {
  const [user] = await db.select(safeColumns).from(users).where(activeUser(id, pharmacyId))
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }
  return user
}

export async function createUser(pharmacyId, requesterId, data, req) {
  const exists = await db.query.users.findFirst({
    where: and(eq(users.email, data.email), eq(users.pharmacyId, pharmacyId), isNull(users.deletedAt)),
  })
  if (exists) throw { statusCode: 409, message: req.t('auth.email_taken') }

  const hashed = await bcrypt.hash(data.password, 12)

  const [user] = await db.insert(users)
    .values({ ...toRow(users, data), password: hashed, pharmacyId })
    .returning(safeColumns)

  await createAuditLog({
    action: 'CREATE', entity: 'users', entity_id: user.id,
    new_values: { email: data.email, role: data.role },
    userId: requesterId, pharmacyId, req,
  })

  return user
}

export async function updateUser(id, pharmacyId, requesterId, data, req) {
  const user = await db.query.users.findFirst({ where: activeUser(id, pharmacyId) })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }

  const [updated] = await db.update(users)
    .set(toRow(users, data, ['id', 'createdAt', 'updatedAt', 'password', 'pharmacyId']))
    .where(eq(users.id, id))
    .returning(safeColumns)

  await createAuditLog({
    action: 'UPDATE', entity: 'users', entity_id: id,
    old_values: user, new_values: data,
    userId: requesterId, pharmacyId, req,
  })

  return updated
}

export async function deleteUser(id, pharmacyId, requesterId, req) {
  const user = await db.query.users.findFirst({ where: activeUser(id, pharmacyId) })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }
  if (id === requesterId) throw { statusCode: 400, message: req.t('user.cannot_delete_self') }

  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id))

  await createAuditLog({
    action: 'DELETE', entity: 'users', entity_id: id,
    userId: requesterId, pharmacyId, req,
  })
}
