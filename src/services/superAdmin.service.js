import bcrypt from 'bcryptjs'
import { eq, ne, and, or, isNull, isNotNull, gte, lte, inArray, desc, count, countDistinct, sum, sql } from 'drizzle-orm'
import db from '../config/database.js'
import {
  superAdmins, superAdminLogs, pharmacy as pharmacyTable, users, products, sales, receptions,
  category, subscriptions, subscriptionPayments, notifications, siteVisits, auditLogs,
} from '../db/schema.js'
import { contains, withCounts, accountExistsForPharmacyName } from '../db/helpers.js'
import { signToken, signResetToken, decodeResetToken, verifyResetToken } from '../config/jwt.js'
import { sendMail, passwordResetEmail } from '../config/mailer.js'
import { getPaginationParams } from '../utils/response.js'
import { parseImageDataUrl } from '../utils/image.js'
import { notif } from '../utils/notification.js'
import { getSiteName, setSiteName, setSiteLogo, removeSiteLogo } from './site.service.js'
import { subscriptionAmount, DEFAULT_PLAN, CURRENCY, MONTHLY_PRICE, TRIAL_DAYS } from '../utils/subscription.js'

// Users whose pharmacy was not deleted (a deleted pharmacy's accounts are hidden from the platform)
const inLivePharmacy = sql`not exists (select 1 from ${pharmacyTable} p where p.id = ${users.pharmacyId} and p."deletedAt" is not null)`

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function superAdminLogin(email, password, req) {
  const admin = await db.query.superAdmins.findFirst({ where: eq(superAdmins.email, email) })
  if (!admin || !admin.is_active) throw { statusCode: 401, message: req.t('super.invalid_credentials') }

  const valid = await bcrypt.compare(password, admin.password)
  if (!valid) throw { statusCode: 401, message: req.t('super.invalid_credentials') }

  await db.update(superAdmins).set({ last_login: new Date() }).where(eq(superAdmins.id, admin.id))
  await logAction(admin.id, 'LOGIN', 'Connexion au panel SuperAdmin', null, null, req)

  const token = signToken({ id: admin.id, role: 'SUPER_ADMIN', email: admin.email, isSuperAdmin: true })
  const { password: _, ...safe } = admin
  return { admin: safe, token }
}

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
const SUPER_RESET_PURPOSE = 'super_reset'

export async function requestSuperAdminPasswordReset(email, req) {
  const admin = await db.query.superAdmins.findFirst({ where: eq(superAdmins.email, email) })
  if (!admin || !admin.is_active) return

  const link = `${FRONTEND_URL}/super/reset-password?token=${signResetToken(admin.id, admin.password, SUPER_RESET_PURPOSE)}`
  try {
    await sendMail({ to: admin.email, ...await passwordResetEmail({ name: admin.name, account: 'Super Administrateur', link, color: '#7c3aed' }) })
  } catch {
    // Already logged by sendMail; the response stays generic to avoid revealing accounts.
    return
  }
  await logAction(admin.id, 'REQUEST_PASSWORD_RESET', 'Demande de réinitialisation du mot de passe', null, null, req)
}

export async function resetSuperAdminPassword(token, newPassword, req) {
  const invalid = { statusCode: 400, message: req.t('auth.reset_token_invalid') }

  const payload = decodeResetToken(token)
  if (payload?.purpose !== SUPER_RESET_PURPOSE || !payload.id) throw invalid

  const admin = await db.query.superAdmins.findFirst({ where: eq(superAdmins.id, payload.id) })
  if (!admin || !admin.is_active) throw invalid

  try { verifyResetToken(token, admin.password) } catch { throw invalid }

  const hashed = await bcrypt.hash(newPassword, 12)
  await db.update(superAdmins).set({ password: hashed }).where(eq(superAdmins.id, admin.id))
  await logAction(admin.id, 'RESET_PASSWORD', 'Mot de passe réinitialisé', null, null, req)
}

// ── Platform stats ────────────────────────────────────────────────────────────

const countWhere = (table, where) =>
  db.select({ n: count() }).from(table).where(where).then(([row]) => row.n)

export async function getPlatformStats() {
  const [
    totalPharmacies, activePharmacies, suspendedPharmacies,
    totalUsers, [totalSalesAgg], expiringSubs,
  ] = await Promise.all([
    countWhere(pharmacyTable, isNull(pharmacyTable.deletedAt)),
    countWhere(pharmacyTable, and(eq(pharmacyTable.status, 'ACTIVE'), isNull(pharmacyTable.deletedAt))),
    countWhere(pharmacyTable, and(eq(pharmacyTable.status, 'SUSPENDED'), isNull(pharmacyTable.deletedAt))),
    countWhere(users, and(isNull(users.deletedAt), inLivePharmacy)),
    db.select({ sum: sum(sales.total_amount), count: count() }).from(sales),
    countWhere(subscriptions, and(
      inArray(subscriptions.status, ['ACTIVE', 'TRIAL']),
      lte(subscriptions.end_date, new Date(Date.now() + 30 * 86400000)),
    )),
  ])

  // Revenue this month
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [monthRevenue] = await db
    .select({ sum: sum(subscriptionPayments.amount) })
    .from(subscriptionPayments)
    .where(gte(subscriptionPayments.paid_at, startOfMonth))

  // Recent registrations (last 7 days)
  const recentPharmacies = await db.query.pharmacy.findMany({
    where: gte(pharmacyTable.createdAt, new Date(Date.now() - 7 * 86400000)),
    columns: { id: true, name: true, city: true, status: true, createdAt: true },
    orderBy: [desc(pharmacyTable.createdAt)],
    limit: 5,
  })

  const visitors = await getVisitorStats()

  return {
    visitors,
    pharmacies: { total: totalPharmacies, active: activePharmacies, suspended: suspendedPharmacies, pending: totalPharmacies - activePharmacies - suspendedPharmacies },
    users: { total: totalUsers },
    sales: { total: totalSalesAgg.count, amount: parseFloat(totalSalesAgg.sum || 0) },
    subscriptions: { expiringSoon: expiringSubs },
    revenue: { thisMonth: parseFloat(monthRevenue.sum || 0) },
    recentPharmacies,
  }
}

// Unique visitors of the public site (site_visits holds one row per browser per UTC day)
async function getVisitorStats() {
  const dayOffset = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
  const today = dayOffset(0)
  const distinctSince = (from) => db
    .select({ n: countDistinct(siteVisits.visitorId) }).from(siteVisits)
    .where(from ? gte(siteVisits.day, from) : undefined)
    .then(([r]) => r.n)

  const [todayCount, last7, last30, total, perDay] = await Promise.all([
    distinctSince(today),
    distinctSince(dayOffset(6)),
    distinctSince(dayOffset(29)),
    distinctSince(null),
    db.select({ day: siteVisits.day, n: count() }).from(siteVisits)
      .where(gte(siteVisits.day, dayOffset(29)))
      .groupBy(siteVisits.day),
  ])

  // Last 30 days, oldest first, days without visits included as 0
  const byDay = Object.fromEntries(perDay.map(r => [r.day, r.n]))
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = dayOffset(29 - i)
    return { day, visitors: byDay[day] || 0 }
  })

  return { today: todayCount, last7, last30, total, daily }
}

// ── Pharmacies management ─────────────────────────────────────────────────────

export async function listPharmacies(query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, status, deleted } = query

  const where = and(
    deleted === 'true' ? isNotNull(pharmacyTable.deletedAt) : isNull(pharmacyTable.deletedAt),
    search ? contains(pharmacyTable.name, search) : undefined,
    status ? eq(pharmacyTable.status, status) : undefined,
  )

  const [rows, total] = await Promise.all([
    db.query.pharmacy.findMany({
      where, offset: skip, limit: take,
      with: { subscription: { columns: { plan: true, status: true, end_date: true } } },
      orderBy: [deleted === 'true' ? desc(pharmacyTable.deletedAt) : desc(pharmacyTable.createdAt)],
    }),
    countWhere(pharmacyTable, where),
  ])

  const pharmacies = await withCounts(rows, {
    users:    [users, users.pharmacyId],
    products: [products, products.pharmacyId],
    sales:    [sales, sales.pharmacyId],
  })

  return { pharmacies, total, page, pageSize }
}

export async function getPharmacyDetail(id, req) {
  const pharmacy = await db.query.pharmacy.findFirst({
    where: eq(pharmacyTable.id, id),
    with: {
      subscription: {
        with: {
          payments: { orderBy: (p, { desc }) => [desc(p.paid_at)], limit: 10 },
        },
      },
      users: {
        where: (u, { isNull }) => isNull(u.deletedAt),
        columns: { id: true, name: true, email: true, role: true, status: true, last_login: true },
      },
    },
  })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  const [withCount] = await withCounts([pharmacy], {
    products:   [products, products.pharmacyId],
    sales:      [sales, sales.pharmacyId],
    receptions: [receptions, receptions.pharmacyId],
  })
  return withCount
}

export async function createPharmacy(data, adminId, req) {
  const { pharmacyName, pharmacyEmail, pharmacyPhone, pharmacyAddress, pharmacyCity, pharmacyCountry,
    pharmacyLicense, trialDays = TRIAL_DAYS,
    adminName, adminEmail, adminPassword } = data

  if (pharmacyLicense) {
    const ex = await db.query.pharmacy.findFirst({ where: eq(pharmacyTable.license_number, pharmacyLicense) })
    if (ex) throw { statusCode: 409, message: req.t('pharmacy.license_taken') }
  }

  const hashed = await bcrypt.hash(adminPassword, 12)
  const trialEnd = new Date(Date.now() + trialDays * 86400000)

  const result = await db.transaction(async (tx) => {
    if (await accountExistsForPharmacyName(tx, adminEmail, pharmacyName)) {
      throw { statusCode: 409, message: req.t('auth.account_exists') }
    }

    const [pharmacy] = await tx.insert(pharmacyTable).values({
      name: pharmacyName, email: pharmacyEmail, phone: pharmacyPhone,
      address: pharmacyAddress, city: pharmacyCity, country: pharmacyCountry,
      license_number: pharmacyLicense || null,
      status: 'ACTIVE', is_active: true,
    }).returning()

    const [adminUser] = await tx.insert(users).values({
      name: adminName, email: adminEmail, password: hashed, role: 'ADMIN', status: 'ACTIVE', pharmacyId: pharmacy.id,
    }).returning()

    // Seed categories
    await tx.insert(category).values(
      ['Analgésique','Antibiotique','Anti-inflammatoire','Antihypertenseur','Antidiabétique',
        'Antihistaminique','Gastro-entérologie','Pédiatrie','Complément alimentaire','Dermatologie']
        .map(name => ({ name })),
    ).onConflictDoNothing()

    const [subscription] = await tx.insert(subscriptions).values({
      pharmacyId: pharmacy.id,
      plan: DEFAULT_PLAN,
      status: 'TRIAL',
      start_date: new Date(),
      end_date: trialEnd,
      trial_end_date: trialEnd,
      amount: 0,
      currency: CURRENCY,
    }).returning()

    return { pharmacy, adminUser, subscription }
  })

  await logAction(adminId, 'CREATE_PHARMACY', `Pharmacie créée: ${pharmacyName}`, 'pharmacy', result.pharmacy.id, req)
  const { password: _, ...safeAdmin } = result.adminUser
  return { ...result, adminUser: safeAdmin }
}

export async function updatePharmacyStatus(id, status, reason, adminId, req) {
  const pharmacy = await db.query.pharmacy.findFirst({ where: eq(pharmacyTable.id, id) })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  const isActive = status === 'ACTIVE'
  await db.update(pharmacyTable)
    .set({
      status,
      is_active: isActive,
      suspended_at:     !isActive ? new Date() : null,
      suspended_reason: !isActive ? (reason || null) : null,
    })
    .where(eq(pharmacyTable.id, id))

  // Notify pharmacy admin
  await db.insert(notifications).values({
    pharmacyId: id,
    ...(isActive
      ? notif('pharmacy_reactivated', { site: await getSiteName() })
      : notif('pharmacy_suspended', { reason: reason || null })),
    type: isActive ? 'SUCCESS' : 'ERROR',
  })

  await logAction(adminId, `PHARMACY_${status}`, `Statut changé: ${pharmacy.name} → ${status}. ${reason || ''}`, 'pharmacy', id, req)
}

export async function updatePharmacy(id, data, adminId, req) {
  const pharmacy = await db.query.pharmacy.findFirst({ where: eq(pharmacyTable.id, id) })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  await db.update(pharmacyTable)
    .set({
      name:           data.name           ?? undefined,
      email:          data.email          ?? undefined,
      phone:          data.phone          ?? undefined,
      address:        data.address        ?? undefined,
      city:           data.city           ?? undefined,
      country:        data.country        ?? undefined,
      license_number: data.license_number ?? undefined,
      max_users:      data.max_users      ?? undefined,
    })
    .where(eq(pharmacyTable.id, id))

  const updated = await db.query.pharmacy.findFirst({
    where: eq(pharmacyTable.id, id),
    with: { subscription: true },
  })

  await logAction(adminId, 'UPDATE_PHARMACY', `Pharmacie modifiée: ${pharmacy.name}`, 'pharmacy', id, req)
  return updated
}

/**
 * Soft delete: the pharmacy and its data stay in the database (sales history), but it disappears
 * from the platform and all its accounts are deactivated. `confirmName` must repeat its name.
 */
export async function deletePharmacy(id, confirmName, adminId, req) {
  const pharmacy = await db.query.pharmacy.findFirst({ where: and(eq(pharmacyTable.id, id), isNull(pharmacyTable.deletedAt)) })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }
  if (String(confirmName ?? '').trim() !== pharmacy.name.trim()) {
    throw { statusCode: 422, message: req.t('super.delete_name_mismatch') }
  }

  const deactivated = await db.transaction(async (tx) => {
    await tx.update(pharmacyTable)
      .set({ deletedAt: new Date(), status: 'INACTIVE', is_active: false })
      .where(eq(pharmacyTable.id, id))
    const accounts = await tx.update(users)
      .set({ status: 'INACTIVE' })
      .where(and(eq(users.pharmacyId, id), isNull(users.deletedAt), eq(users.status, 'ACTIVE')))
      .returning({ id: users.id })
    // What a restore must put back: only the accounts this deletion deactivated, and the previous status
    await tx.insert(auditLogs).values({
      action: DELETE_SNAPSHOT, entity: 'pharmacy', entity_id: id, pharmacyId: id,
      old_values: { status: pharmacy.status, is_active: pharmacy.is_active, userIds: accounts.map(a => a.id) },
    })
    return accounts
  })
  await logAction(adminId, 'DELETE_PHARMACY',
    `Pharmacie supprimée: ${pharmacy.name} (${deactivated.length} compte(s) désactivé(s))`, 'pharmacy', id, req)
}

const DELETE_SNAPSHOT = 'DELETE_PHARMACY'

/**
 * Undo deletePharmacy: the pharmacy comes back with its previous status, and only the accounts the
 * deletion deactivated are reactivated. Refused if one of its emails now has an account in another
 * live pharmacy with the same name (signed up again after the deletion).
 */
export async function restorePharmacy(id, adminId, req) {
  const pharmacy = await db.query.pharmacy.findFirst({ where: and(eq(pharmacyTable.id, id), isNotNull(pharmacyTable.deletedAt)) })
  if (!pharmacy) throw { statusCode: 404, message: req.t('super.restore_not_deleted') }

  const conflict = await db.select({ email: users.email }).from(users)
    .innerJoin(pharmacyTable, eq(users.pharmacyId, pharmacyTable.id))
    .where(and(
      ne(pharmacyTable.id, id),
      isNull(pharmacyTable.deletedAt),
      isNull(users.deletedAt),
      sql`lower(trim(${pharmacyTable.name})) = lower(trim(${pharmacy.name}))`,
      sql`lower(trim(${users.email})) in (select lower(trim(u.email)) from ${users} u where u."pharmacyId" = ${id} and u."deletedAt" is null)`,
    ))
    .limit(1)
  if (conflict.length) throw { statusCode: 409, message: req.t('super.restore_conflict', { email: conflict[0].email }) }

  const [snapshot] = await db.select({ values: auditLogs.old_values }).from(auditLogs)
    .where(and(eq(auditLogs.action, DELETE_SNAPSHOT), eq(auditLogs.entity, 'pharmacy'), eq(auditLogs.entity_id, id)))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(1)

  const reactivated = await db.transaction(async (tx) => {
    await tx.update(pharmacyTable)
      .set({
        deletedAt: null,
        status:    snapshot?.values?.status ?? 'ACTIVE',
        is_active: snapshot?.values?.is_active ?? true,
      })
      .where(eq(pharmacyTable.id, id))

    // Deleted before snapshots existed: its accounts were deactivated in the same instant as the
    // pharmacy (within a few seconds of deletedAt); accounts already inactive before stay inactive.
    const deletedAt = new Date(pharmacy.deletedAt).getTime()
    const userFilter = snapshot?.values?.userIds
      ? (snapshot.values.userIds.length ? inArray(users.id, snapshot.values.userIds) : sql`false`)
      : and(gte(users.updatedAt, new Date(deletedAt - 5000)), lte(users.updatedAt, new Date(deletedAt + 5000)))

    return tx.update(users)
      .set({ status: 'ACTIVE' })
      .where(and(eq(users.pharmacyId, id), isNull(users.deletedAt), eq(users.status, 'INACTIVE'), userFilter))
      .returning({ id: users.id })
  })

  await logAction(adminId, 'RESTORE_PHARMACY',
    `Pharmacie restaurée: ${pharmacy.name} (${reactivated.length} compte(s) réactivé(s))`, 'pharmacy', id, req)
  return { reactivated: reactivated.length }
}

// ── Subscriptions management ──────────────────────────────────────────────────

export async function renewSubscription(pharmacyId, data, adminId, req) {
  const { months, method = 'CASH', reference } = data

  const pharmacy = await db.query.pharmacy.findFirst({ where: eq(pharmacyTable.id, pharmacyId) })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  // Pharmacies created via public registration before trials existed have no subscription yet
  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.pharmacyId, pharmacyId) })

  const newAmount = subscriptionAmount(months)
  const now       = new Date()
  const baseDate  = sub && sub.end_date > now ? sub.end_date : now
  const newEnd    = new Date(baseDate.getTime() + months * 30 * 86400000)

  const updated = await db.transaction(async (tx) => {
    let updatedSub
    if (sub) {
      [updatedSub] = await tx.update(subscriptions)
        .set({ status: 'ACTIVE', end_date: newEnd, amount: newAmount, currency: CURRENCY })
        .where(eq(subscriptions.pharmacyId, pharmacyId))
        .returning()
    } else {
      [updatedSub] = await tx.insert(subscriptions).values({
        pharmacyId,
        plan:       DEFAULT_PLAN,
        status:     'ACTIVE',
        start_date: now,
        end_date:   newEnd,
        amount:     newAmount,
        currency:   CURRENCY,
      }).returning()
    }

    await tx.insert(subscriptionPayments).values({
      subscriptionId: updatedSub.id,
      amount:         newAmount,
      currency:       CURRENCY,
      method,
      reference:      reference || null,
      period_start:   baseDate,
      period_end:     newEnd,
      notes:          `${sub ? 'Renouvellement' : 'Souscription'} ${months} mois × ${MONTHLY_PRICE} ${CURRENCY}`,
    })

    // Reactivate pharmacy if suspended for expiry
    await tx.update(pharmacyTable)
      .set({ status: 'ACTIVE', is_active: true, suspended_at: null, suspended_reason: null })
      .where(eq(pharmacyTable.id, pharmacyId))

    // Notify
    await tx.insert(notifications).values({
      pharmacyId,
      ...notif(sub ? 'subscription_renewed' : 'subscription_activated',
        { months, amount: newAmount, currency: CURRENCY, end_date: newEnd }),
      type:    'SUCCESS',
    })

    return updatedSub
  })

  await logAction(adminId, 'RENEW_SUBSCRIPTION', `Renouvellement ${months}m pour pharmacyId=${pharmacyId}`, 'subscription', updated.id, req)
  return updated
}

export async function getSubscriptionPayments(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.pharmacyId, pharmacyId) })
  if (!sub) return { payments: [], total: 0, page, pageSize }

  const where = eq(subscriptionPayments.subscriptionId, sub.id)
  const [payments, total] = await Promise.all([
    db.query.subscriptionPayments.findMany({ where, offset: skip, limit: take, orderBy: [desc(subscriptionPayments.paid_at)] }),
    countWhere(subscriptionPayments, where),
  ])

  return { payments, total, page, pageSize }
}

// ── Users management (SuperAdmin view all pharmacies) ─────────────────────────

export async function listAllUsers(query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, role, pharmacyId, status } = query

  const where = and(
    isNull(users.deletedAt),
    inLivePharmacy,
    search     ? or(contains(users.name, search), contains(users.email, search)) : undefined,
    role       ? eq(users.role, role) : undefined,
    status     ? eq(users.status, status) : undefined,
    pharmacyId ? eq(users.pharmacyId, parseInt(pharmacyId)) : undefined,
  )

  const [rows, total] = await Promise.all([
    db.query.users.findMany({
      where, offset: skip, limit: take,
      columns: { id: true, name: true, email: true, role: true, status: true, last_login: true, createdAt: true },
      with: { pharmacy: { columns: { id: true, name: true, status: true } } },
      orderBy: [desc(users.createdAt)],
    }),
    countWhere(users, where),
  ])

  return { users: rows, total, page, pageSize }
}

// ── Audit logs ────────────────────────────────────────────────────────────────

export async function getSuperAdminLogs(query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const [logs, [{ total }]] = await Promise.all([
    db.query.superAdminLogs.findMany({
      offset: skip, limit: take,
      orderBy: [desc(superAdminLogs.createdAt)],
      with: { superAdmin: { columns: { id: true, name: true, email: true } } },
    }),
    db.select({ total: count() }).from(superAdminLogs),
  ])
  return { logs, total, page, pageSize }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function logAction(superAdminId, action, description, targetType, targetId, req) {
  try {
    await db.insert(superAdminLogs).values({
      superAdminId,
      action,
      description,
      target_type: targetType || null,
      target_id:   targetId   || null,
      ip_address:  req?.ip    || null,
    })
  } catch {}
}

// ── Site settings (name + logo) ───────────────────────────────────────────────

export async function updateSiteName(name, adminId, req) {
  const saved = await setSiteName(name)
  await logAction(adminId, 'UPDATE_SITE_NAME', `Nom du site : ${saved}`, null, null, req)
  return { name: saved }
}

export async function updateSiteLogo(dataUrl, adminId, req) {
  const { mime, data, bytes } = parseImageDataUrl(dataUrl)
  const row = await setSiteLogo({ mime, data })
  await logAction(adminId, 'UPDATE_SITE_LOGO', `Logo du site mis à jour (${mime}, ${Math.round(bytes / 1024)} Ko)`, null, null, req)
  return { logo_updated_at: row.updatedAt }
}

export async function deleteSiteLogo(adminId, req) {
  await removeSiteLogo()
  await logAction(adminId, 'DELETE_SITE_LOGO', 'Logo du site supprimé', null, null, req)
  return { logo_updated_at: null }
}
