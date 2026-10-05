import bcrypt from 'bcryptjs'
import { eq, and, or, isNull, gte, lte, inArray, desc, count, sum } from 'drizzle-orm'
import db from '../config/database.js'
import {
  superAdmins, superAdminLogs, pharmacy as pharmacyTable, users, products, sales, receptions,
  category, subscriptions, subscriptionPayments, notifications,
} from '../db/schema.js'
import { contains, withCounts } from '../db/helpers.js'
import { signToken } from '../config/jwt.js'
import { getPaginationParams } from '../utils/response.js'
import { subscriptionAmount, DEFAULT_PLAN, CURRENCY, MONTHLY_PRICE, TRIAL_DAYS } from '../utils/subscription.js'

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function superAdminLogin(email, password, req) {
  const admin = await db.query.superAdmins.findFirst({ where: eq(superAdmins.email, email) })
  if (!admin || !admin.is_active) throw { statusCode: 401, message: 'Identifiants incorrects ou compte inactif.' }

  const valid = await bcrypt.compare(password, admin.password)
  if (!valid) throw { statusCode: 401, message: 'Identifiants incorrects.' }

  await db.update(superAdmins).set({ last_login: new Date() }).where(eq(superAdmins.id, admin.id))
  await logAction(admin.id, 'LOGIN', 'Connexion au panel SuperAdmin', null, null, req)

  const token = signToken({ id: admin.id, role: 'SUPER_ADMIN', email: admin.email, isSuperAdmin: true })
  const { password: _, ...safe } = admin
  return { admin: safe, token }
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
    countWhere(users, isNull(users.deletedAt)),
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

  return {
    pharmacies: { total: totalPharmacies, active: activePharmacies, suspended: suspendedPharmacies, pending: totalPharmacies - activePharmacies - suspendedPharmacies },
    users: { total: totalUsers },
    sales: { total: totalSalesAgg.count, amount: parseFloat(totalSalesAgg.sum || 0) },
    subscriptions: { expiringSoon: expiringSubs },
    revenue: { thisMonth: parseFloat(monthRevenue.sum || 0) },
    recentPharmacies,
  }
}

// ── Pharmacies management ─────────────────────────────────────────────────────

export async function listPharmacies(query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, status } = query

  const where = and(
    isNull(pharmacyTable.deletedAt),
    search ? contains(pharmacyTable.name, search) : undefined,
    status ? eq(pharmacyTable.status, status) : undefined,
  )

  const [rows, total] = await Promise.all([
    db.query.pharmacy.findMany({
      where, offset: skip, limit: take,
      with: { subscription: { columns: { plan: true, status: true, end_date: true } } },
      orderBy: [desc(pharmacyTable.createdAt)],
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
    title: isActive ? '✅ Pharmacie réactivée' : '⚠️ Pharmacie suspendue',
    message: isActive
      ? 'Votre pharmacie a été réactivée. Vous pouvez à nouveau utiliser PharmaPulse.'
      : `Votre pharmacie a été suspendue. Raison: ${reason || 'Non précisée'}. Contactez le support.`,
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

export async function deletePharmacy(id, adminId, req) {
  const pharmacy = await db.query.pharmacy.findFirst({ where: eq(pharmacyTable.id, id) })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  await db.update(pharmacyTable)
    .set({ deletedAt: new Date(), status: 'INACTIVE', is_active: false })
    .where(eq(pharmacyTable.id, id))
  await logAction(adminId, 'DELETE_PHARMACY', `Pharmacie supprimée: ${pharmacy.name}`, 'pharmacy', id, req)
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
      title:   sub ? '✅ Abonnement renouvelé' : '✅ Abonnement activé',
      message: `Votre abonnement de ${months} mois (${newAmount} ${CURRENCY}) est ${sub ? 'renouvelé' : 'activé'} jusqu'au ${newEnd.toLocaleDateString('fr-FR')}.`,
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
