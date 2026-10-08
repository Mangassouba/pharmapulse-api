import { eq, and, isNull, ilike, asc, count } from 'drizzle-orm'
import db from '../config/database.js'
import { category, products } from '../db/schema.js'
import { contains, toRow, withCounts } from '../db/helpers.js'
import { createAuditLog } from '../utils/audit.js'

export async function getCategories(query = {}) {
  const { search } = query
  const rows = await db.query.category.findMany({
    where: and(
      isNull(category.deletedAt),
      search ? contains(category.name, search) : undefined,
    ),
    orderBy: [asc(category.name)],
  })
  return withCounts(rows, { produit: [products, products.categoryId] })
}

export async function createCategory(data, userId, pharmacyId, req) {
  const exists = await db.query.category.findFirst({
    where: and(ilike(category.name, data.name.replace(/[\\%_]/g, '\\$&')), isNull(category.deletedAt)),
  })
  if (exists) throw { statusCode: 409, message: req.t('category.name_taken') }

  const [created] = await db.insert(category).values(toRow(category, data)).returning()

  await createAuditLog({
    action: 'CREATE', entity: 'category', entity_id: created.id,
    new_values: data, userId, pharmacyId, req,
  })

  return created
}

export async function updateCategory(id, data, userId, pharmacyId, req) {
  const existing = await db.query.category.findFirst({ where: and(eq(category.id, id), isNull(category.deletedAt)) })
  if (!existing) throw { statusCode: 404, message: req.t('category.not_found') }

  const [updated] = await db.update(category).set(toRow(category, data)).where(eq(category.id, id)).returning()

  await createAuditLog({
    action: 'UPDATE', entity: 'category', entity_id: id,
    old_values: existing, new_values: data, userId, pharmacyId, req,
  })

  return updated
}

export async function deleteCategory(id, userId, pharmacyId, req) {
  const existing = await db.query.category.findFirst({ where: and(eq(category.id, id), isNull(category.deletedAt)) })
  if (!existing) throw { statusCode: 404, message: req.t('category.not_found') }

  // Check if products use this category
  const [{ total }] = await db.select({ total: count() }).from(products)
    .where(and(eq(products.categoryId, id), isNull(products.deletedAt)))
  if (total > 0) throw { statusCode: 409, message: req.t('category.in_use', { count: total }) }

  await db.update(category).set({ deletedAt: new Date() }).where(eq(category.id, id))

  await createAuditLog({
    action: 'DELETE', entity: 'category', entity_id: id,
    userId, pharmacyId, req,
  })
}
