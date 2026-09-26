import prisma from '../config/database.js'
import { createAuditLog } from '../utils/audit.js'

export async function getCategories(query = {}) {
  const { search } = query
  return prisma.category.findMany({
    where: {
      deletedAt: null,
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    },
    include: { _count: { select: { produit: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function createCategory(data, userId, pharmacyId, req) {
  const exists = await prisma.category.findFirst({
    where: { name: { equals: data.name, mode: 'insensitive' }, deletedAt: null },
  })
  if (exists) throw { statusCode: 409, message: req.t('category.name_taken') }

  const category = await prisma.category.create({ data })

  await createAuditLog({
    action: 'CREATE', entity: 'category', entity_id: category.id,
    new_values: data, userId, pharmacyId, req,
  })

  return category
}

export async function updateCategory(id, data, userId, pharmacyId, req) {
  const category = await prisma.category.findFirst({ where: { id, deletedAt: null } })
  if (!category) throw { statusCode: 404, message: req.t('category.not_found') }

  const updated = await prisma.category.update({ where: { id }, data })

  await createAuditLog({
    action: 'UPDATE', entity: 'category', entity_id: id,
    old_values: category, new_values: data, userId, pharmacyId, req,
  })

  return updated
}

export async function deleteCategory(id, userId, pharmacyId, req) {
  const category = await prisma.category.findFirst({ where: { id, deletedAt: null } })
  if (!category) throw { statusCode: 404, message: req.t('category.not_found') }

  // Check if products use this category
  const count = await prisma.products.count({ where: { categoryId: id, deletedAt: null } })
  if (count > 0) throw { statusCode: 409, message: `Cannot delete: ${count} products use this category` }

  await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } })

  await createAuditLog({
    action: 'DELETE', entity: 'category', entity_id: id,
    userId, pharmacyId, req,
  })
}
