import { eq, and, isNull } from 'drizzle-orm'
import db from '../config/database.js'
import { settings } from '../db/schema.js'

// Platform-wide settings (rows of `settings` with pharmacyId = null), managed by the SuperAdmin
export const DEFAULT_SITE_NAME = 'PharmaPulse'
const KEYS = { name: 'site_name', logo: 'site_logo' }

const whereKey = key => and(eq(settings.key, key), isNull(settings.pharmacyId))

// (key, pharmacyId) is unique but NULLs are distinct in Postgres: upsert by hand
async function upsert(key, value, description) {
  const [row] = await db.transaction(async (tx) => {
    const existing = await tx.query.settings.findFirst({ where: whereKey(key), columns: { id: true } })
    return existing
      ? tx.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.id, existing.id)).returning({ updatedAt: settings.updatedAt })
      : tx.insert(settings).values({ key, value, description }).returning({ updatedAt: settings.updatedAt })
  })
  return row
}

const remove = key => db.delete(settings).where(whereKey(key))

// ── Name (cached: read by every email) ────────────────────────────────────────

const NAME_TTL_MS = 60 * 1000
let nameCache = null // { value, at }

export async function getSiteName() {
  if (nameCache && Date.now() - nameCache.at < NAME_TTL_MS) return nameCache.value
  const row = await db.query.settings.findFirst({ where: whereKey(KEYS.name), columns: { value: true } })
  const value = row?.value?.name || DEFAULT_SITE_NAME
  nameCache = { value, at: Date.now() }
  return value
}

/** Empty name = back to the default. */
export async function setSiteName(name) {
  name = (name || '').trim()
  if (name && name !== DEFAULT_SITE_NAME) await upsert(KEYS.name, { name }, 'Nom de la plateforme')
  else await remove(KEYS.name)
  nameCache = null
  return getSiteName()
}

// ── Logo ──────────────────────────────────────────────────────────────────────

export function getSiteLogo({ withData = true } = {}) {
  return db.query.settings.findFirst({
    where: whereKey(KEYS.logo),
    columns: withData ? { value: true, updatedAt: true } : { updatedAt: true },
  })
}

export const setSiteLogo    = value => upsert(KEYS.logo, value, 'Logo de la plateforme')
export const removeSiteLogo = ()    => remove(KEYS.logo)
