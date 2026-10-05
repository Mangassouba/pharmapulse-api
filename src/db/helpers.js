import { ilike, inArray, count, getTableColumns } from 'drizzle-orm'
import db from '../config/database.js'

/** Case-insensitive "contains" (equivalent of Prisma `{ contains, mode: 'insensitive' }`) */
export function contains(column, value) {
  const escaped = String(value).replace(/[\\%_]/g, '\\$&')
  return ilike(column, `%${escaped}%`)
}

/**
 * Keep only the keys of `data` that are real columns of `table` (Prisma rejected unknown keys,
 * Drizzle silently ignores them) and convert date strings for timestamp columns.
 */
export function toRow(table, data, omit = ['id', 'createdAt', 'updatedAt']) {
  const columns = getTableColumns(table)
  const row = {}
  for (const [key, value] of Object.entries(data ?? {})) {
    const column = columns[key]
    if (!column || omit.includes(key) || value === undefined) continue
    row[key] = column.columnType === 'PgTimestamp' && value !== null && !(value instanceof Date)
      ? new Date(value)
      : value
  }
  return row
}

/** Number of rows in `table` per value of `fkColumn`, restricted to `ids` → Map(id → count) */
export async function countBy(table, fkColumn, ids) {
  if (!ids.length) return new Map()
  const rows = await db
    .select({ id: fkColumn, count: count() })
    .from(table)
    .where(inArray(fkColumn, ids))
    .groupBy(fkColumn)
  return new Map(rows.map(r => [r.id, r.count]))
}

/**
 * Attach a Prisma-style `_count` object to each row.
 * spec: { relationName: [table, fkColumn] }
 */
export async function withCounts(rows, spec) {
  const ids     = rows.map(r => r.id)
  const entries = await Promise.all(
    Object.entries(spec).map(async ([key, [table, fkColumn]]) => [key, await countBy(table, fkColumn, ids)])
  )
  return rows.map(r => ({
    ...r,
    _count: Object.fromEntries(entries.map(([key, counts]) => [key, counts.get(r.id) ?? 0])),
  }))
}

/** Underlying PostgreSQL error (Drizzle wraps driver errors in DrizzleQueryError) */
export function pgError(err) {
  if (err?.code && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) return err
  if (err?.cause) return pgError(err.cause)
  return null
}
