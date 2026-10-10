import { eq, ne, and, isNull, gt, lt, asc, desc, count, sum, inArray } from 'drizzle-orm'
import db from '../config/database.js'
import { products, productImages, batches, stockMovements, category } from '../db/schema.js'
import { contains, toRow, withCounts } from '../db/helpers.js'
import { getPaginationParams } from '../utils/response.js'
import { createAuditLog } from '../utils/audit.js'
import { parseImageDataUrl } from '../utils/image.js'
import { UNIT_TYPES } from '../validators/product.validator.js'

const withCategory = { category: { columns: { id: true, name: true } } }

// image_updated_at is only set through the image endpoints
const ROW_OMIT = ['id', 'createdAt', 'updatedAt', 'image_updated_at']

export async function getProducts(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const where = buildWhere(pharmacyId, query)

  const [rows, [{ total }]] = await Promise.all([
    db.query.products.findMany({
      where,
      offset: skip, limit: take,
      with: {
        ...withCategory,
        user: { columns: { id: true, name: true } },
      },
      orderBy: [asc(products.name)],
    }),
    db.select({ total: count() }).from(products).where(where),
  ])

  const productsWithCounts = await withCounts(rows, {
    batches:        [batches, batches.productId],
    stockMovements: [stockMovements, stockMovements.productId],
  })

  return { products: productsWithCounts, total, page, pageSize }
}

function buildWhere(pharmacyId, query) {
  const { search, status, categoryId, lowStock, outOfStock } = query
  return and(
    eq(products.pharmacyId, pharmacyId),
    isNull(products.deletedAt),
    search     ? contains(products.name, search) : undefined,
    status     ? eq(products.status, status) : undefined,
    categoryId ? eq(products.categoryId, parseInt(categoryId)) : undefined,
    outOfStock === 'true' ? eq(products.stock, 0) : undefined,
    ...(lowStock === 'true' ? [gt(products.stock, 0), lt(products.stock, products.threshold)] : []),
  )
}

export async function getProductById(id, pharmacyId, req) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
    with: {
      category: { columns: { id: true, name: true, description: true } },
      user:     { columns: { id: true, name: true } },
      batches:  {
        where: (b, { eq, and, isNull }) => and(eq(b.status, 'ACTIVE'), isNull(b.deletedAt)),
        orderBy: (b, { asc }) => [asc(b.expiration_date)],
      },
      stockMovements: {
        orderBy: (m, { desc }) => [desc(m.movement_date)],
        limit: 10,
        with: { user: { columns: { id: true, name: true } } },
      },
    },
  })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }
  return product
}

export async function createProduct(pharmacyId, userId, data, req) {
  // Barcode uniqueness check
  const existing = await db.query.products.findFirst({
    where: and(eq(products.barcode, data.barcode), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
  })
  if (existing) throw { statusCode: 409, message: req.t('product.barcode_taken') }

  const [created] = await db.insert(products).values({
    ...toRow(products, data, ROW_OMIT),
    pharmacyId,
    userId,
    sale_price:     parseFloat(data.sale_price),
    purchase_price: parseFloat(data.purchase_price),
    stock:          parseFloat(data.stock || 0),
    threshold:      parseFloat(data.threshold || 10),
  }).returning({ id: products.id, stock: products.stock })

  // Create initial stock movement if stock > 0
  if (created.stock > 0) {
    await db.insert(stockMovements).values({
      productId:    created.id,
      pharmacyId,
      userId,
      type:         'ENTRY',
      quantity:     created.stock,
      previous_stock: 0,
      new_stock:    created.stock,
      reason:       'Stock initial',
    })
  }

  const product = await db.query.products.findFirst({ where: eq(products.id, created.id), with: withCategory })

  await createAuditLog({
    action: 'CREATE', entity: 'products', entity_id: product.id,
    new_values: data, userId, pharmacyId, req,
  })

  return product
}

export async function updateProduct(id, pharmacyId, userId, data, req) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
  })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

  // Barcode uniqueness check (exclude self)
  if (data.barcode && data.barcode !== product.barcode) {
    const existing = await db.query.products.findFirst({
      where: and(
        eq(products.barcode, data.barcode), eq(products.pharmacyId, pharmacyId),
        isNull(products.deletedAt), ne(products.id, id),
      ),
    })
    if (existing) throw { statusCode: 409, message: req.t('product.barcode_taken') }
  }

  await db.update(products)
    .set({
      ...toRow(products, data, ROW_OMIT),
      ...(data.sale_price     !== undefined && { sale_price: parseFloat(data.sale_price) }),
      ...(data.purchase_price !== undefined && { purchase_price: parseFloat(data.purchase_price) }),
      ...(data.threshold      !== undefined && { threshold: parseFloat(data.threshold) }),
    })
    .where(eq(products.id, id))

  const updated = await db.query.products.findFirst({ where: eq(products.id, id), with: withCategory })

  await createAuditLog({
    action: 'UPDATE', entity: 'products', entity_id: id,
    old_values: product, new_values: data, userId, pharmacyId, req,
  })

  return updated
}

export async function deleteProduct(id, pharmacyId, userId, req) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
  })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }

  await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, id))

  await createAuditLog({
    action: 'DELETE', entity: 'products', entity_id: id,
    old_values: product, userId, pharmacyId, req,
  })
}

async function findOwnProduct(id, pharmacyId, req) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
    columns: { id: true },
  })
  if (!product) throw { statusCode: 404, message: req.t('product.not_found') }
}

export async function updateProductImage(id, pharmacyId, userId, dataUrl, req) {
  await findOwnProduct(id, pharmacyId, req)
  const { mime, data, bytes } = parseImageDataUrl(dataUrl)

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx.insert(productImages)
      .values({ productId: id, mime, data })
      .onConflictDoUpdate({ target: productImages.productId, set: { mime, data, updatedAt: now } })
    await tx.update(products).set({ image_updated_at: now }).where(eq(products.id, id))
  })

  await createAuditLog({
    action: 'UPDATE_IMAGE', entity: 'products', entity_id: id,
    new_values: { mime, bytes }, userId, pharmacyId, req,
  })

  return { image_updated_at: now }
}

export async function deleteProductImage(id, pharmacyId, userId, req) {
  await findOwnProduct(id, pharmacyId, req)

  await db.transaction(async (tx) => {
    await tx.delete(productImages).where(eq(productImages.productId, id))
    await tx.update(products).set({ image_updated_at: null }).where(eq(products.id, id))
  })

  await createAuditLog({
    action: 'DELETE_IMAGE', entity: 'products', entity_id: id,
    userId, pharmacyId, req,
  })

  return { image_updated_at: null }
}

// All active products of the pharmacy, unpaginated: the frontend turns them into a spreadsheet
export async function exportProducts(pharmacyId) {
  return db.query.products.findMany({
    where: and(eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt)),
    columns: {
      barcode: true, name: true, description: true, sale_price: true, purchase_price: true, stock: true,
      threshold: true, unit_type: true, unit_quantity: true, prescription_req: true, is_divisible: true,
    },
    with: withCategory,
    orderBy: [asc(products.name)],
  })
}

// ── Import ───────────────────────────────────────────────────────────────────
// Each row: { line, barcode, name, category, sale_price, purchase_price, stock?, threshold?, unit_type?,
// unit_quantity?, prescription_req?, is_divisible?, description? }. A product is found by its barcode:
// known → updated, unknown → created. Stock only counts for new products (an "Stock initial" movement is
// written, as in createProduct); an existing product's stock only changes through receptions, sales, inventory.
// All or nothing: one invalid row and nothing is saved, so the user fixes the file and imports it again.

const blank = v => v === undefined || v === null || String(v).trim() === ''
const text  = v => (blank(v) ? undefined : String(v).trim())

// Spreadsheets give 12.5, "12.5" or "12,5"; undefined when empty, NaN when not a number
function num(v) {
  if (blank(v)) return undefined
  return typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
}

const TRUE_WORDS  = ['true', '1', 'oui', 'yes', 'vrai', 'نعم']
const FALSE_WORDS = ['false', '0', 'non', 'no', 'faux', 'لا']
function bool(v) {
  if (blank(v)) return undefined
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (TRUE_WORDS.includes(s))  return true
  if (FALSE_WORDS.includes(s)) return false
  return null // invalid
}

// One row → { data } ready for the products table, or { error } (already translated)
function parseImportRow(raw, categoryIds, t) {
  const field = name => t(`fields.${name}`, { defaultValue: name })
  const invalid = (key, name) => ({ error: t(key, { field: field(name) }) })

  const name    = text(raw.name)
  const barcode = text(raw.barcode)
  const catName = text(raw.category)
  if (!name)    return invalid('validation.required', 'name')
  if (name.length > 200) return invalid('validation.invalid', 'name')
  if (!barcode) return invalid('validation.required', 'barcode')
  if (!catName) return invalid('validation.required', 'categoryId')
  const categoryId = categoryIds.get(catName.toLowerCase())
  if (!categoryId) return { error: t('product.import_unknown_category', { name: catName }) }

  const data = { name, barcode, categoryId, description: text(raw.description) }

  for (const key of ['sale_price', 'purchase_price']) {
    const n = num(raw[key])
    if (n === undefined) return invalid('validation.required', key)
    if (!(n >= 0))       return invalid('validation.min_zero', key)
    data[key] = n
  }
  for (const key of ['stock', 'threshold', 'unit_quantity']) {
    const n = num(raw[key])
    if (n !== undefined && !(n >= 0)) return invalid('validation.min_zero', key)
    data[key] = n
  }
  const unitType = text(raw.unit_type)?.toUpperCase()
  if (unitType && !UNIT_TYPES.includes(unitType)) return invalid('validation.invalid_choice', 'unit_type')
  data.unit_type = unitType

  for (const key of ['prescription_req', 'is_divisible']) {
    const b = bool(raw[key])
    if (b === null) return invalid('validation.invalid', key)
    data[key] = b
  }
  return { data }
}

export async function importProducts(pharmacyId, userId, rows, req) {
  const t = req.t
  const cats = await db.query.category.findMany({ where: isNull(category.deletedAt), columns: { id: true, name: true } })
  const categoryIds = new Map(cats.map(c => [c.name.trim().toLowerCase(), c.id]))

  const errors = []
  const parsed = []
  const seen   = new Set()
  rows.forEach((raw, i) => {
    const line = Number(raw?.line) || i + 2 // line 1 = column headers
    const { data, error } = parseImportRow(raw ?? {}, categoryIds, t)
    if (error) return errors.push({ line, message: t('product.import_line', { n: line, message: error }) })
    if (seen.has(data.barcode)) {
      return errors.push({ line, message: t('product.import_line', { n: line, message: t('product.import_duplicate_barcode', { barcode: data.barcode }) }) })
    }
    seen.add(data.barcode)
    parsed.push({ line, data })
  })

  // Barcodes already in this pharmacy (deleted ones too: the unique index still covers them)
  const existing = parsed.length ? await db.query.products.findMany({
    where: and(eq(products.pharmacyId, pharmacyId), inArray(products.barcode, parsed.map(p => p.data.barcode))),
    columns: { id: true, barcode: true, deletedAt: true },
  }) : []
  const byBarcode = new Map(existing.map(p => [p.barcode, p]))
  for (const { line, data } of parsed) {
    if (byBarcode.get(data.barcode)?.deletedAt) {
      errors.push({ line, message: t('product.import_line', { n: line, message: t('product.import_deleted_barcode', { barcode: data.barcode }) }) })
    }
  }

  if (errors.length) {
    errors.sort((a, b) => a.line - b.line)
    throw { statusCode: 422, message: t('product.import_invalid', { count: errors.length }), errors }
  }

  const toCreate = parsed.filter(p => !byBarcode.has(p.data.barcode)).map(p => p.data)
  const toUpdate = parsed.filter(p => byBarcode.has(p.data.barcode)).map(p => p.data)

  await db.transaction(async (tx) => {
    if (toCreate.length) {
      const created = await tx.insert(products).values(toCreate.map(d => ({
        ...toRow(products, d, ROW_OMIT),
        pharmacyId,
        userId,
        stock:     d.stock ?? 0,
        threshold: d.threshold ?? 10,
      }))).returning({ id: products.id, stock: products.stock })

      const movements = created.filter(p => p.stock > 0).map(p => ({
        productId:      p.id,
        pharmacyId,
        userId,
        type:           'ENTRY',
        quantity:       p.stock,
        previous_stock: 0,
        new_stock:      p.stock,
        reason:         'Stock initial',
      }))
      if (movements.length) await tx.insert(stockMovements).values(movements)
    }

    // Empty optional cells keep the current value (toRow skips undefined); stock is never changed here
    for (const { stock, ...d } of toUpdate) {
      await tx.update(products).set(toRow(products, d, ROW_OMIT)).where(eq(products.id, byBarcode.get(d.barcode).id))
    }
  })

  const result = { created: toCreate.length, updated: toUpdate.length }
  await createAuditLog({
    action: 'IMPORT_PRODUCTS', entity: 'pharmacy', entity_id: pharmacyId,
    new_values: result, userId, pharmacyId, req,
  })
  return result
}

export async function getProductStats(pharmacyId) {
  const active = and(eq(products.pharmacyId, pharmacyId), isNull(products.deletedAt))

  const [[{ total, totalUnits }], [{ outOfStock }], [{ lowStock }]] = await Promise.all([
    db.select({ total: count(), totalUnits: sum(products.stock).mapWith(Number) }).from(products).where(active),
    db.select({ outOfStock: count() }).from(products).where(and(active, eq(products.stock, 0))),
    db.select({ lowStock: count() }).from(products)
      .where(and(active, gt(products.stock, 0), lt(products.stock, products.threshold))),
  ])

  return { total, outOfStock, lowStock, totalUnits: totalUnits || 0 }
}
