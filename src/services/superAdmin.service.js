import bcrypt from 'bcryptjs'
import prisma from '../config/database.js'
import { signToken } from '../config/jwt.js'
import { getPaginationParams } from '../utils/response.js'

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function superAdminLogin(email, password, req) {
  const admin = await prisma.superAdmins.findUnique({ where: { email } })
  if (!admin || !admin.is_active) throw { statusCode: 401, message: 'Identifiants incorrects ou compte inactif.' }

  const valid = await bcrypt.compare(password, admin.password)
  if (!valid) throw { statusCode: 401, message: 'Identifiants incorrects.' }

  await prisma.superAdmins.update({ where: { id: admin.id }, data: { last_login: new Date() } })
  await logAction(admin.id, 'LOGIN', 'Connexion au panel SuperAdmin', null, null, req)

  const token = signToken({ id: admin.id, role: 'SUPER_ADMIN', email: admin.email, isSuperAdmin: true })
  const { password: _, ...safe } = admin
  return { admin: safe, token }
}

// ── Platform stats ────────────────────────────────────────────────────────────

export async function getPlatformStats() {
  const [
    totalPharmacies, activePharmacies, suspendedPharmacies,
    totalUsers, totalSalesAgg, expiringSubs,
  ] = await Promise.all([
    prisma.pharmacy.count({ where: { deletedAt: null } }),
    prisma.pharmacy.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    prisma.pharmacy.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
    prisma.users.count({ where: { deletedAt: null } }),
    prisma.sales.aggregate({ _sum: { total_amount: true }, _count: true }),
    prisma.subscriptions.count({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
        end_date: { lte: new Date(Date.now() + 30 * 86400000) },
      },
    }),
  ])

  // Revenue this month
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthRevenue = await prisma.subscriptionPayments.aggregate({
    where: { paid_at: { gte: startOfMonth } },
    _sum: { amount: true },
  })

  // Recent registrations (last 7 days)
  const recentPharmacies = await prisma.pharmacy.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    select: { id: true, name: true, city: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  return {
    pharmacies: { total: totalPharmacies, active: activePharmacies, suspended: suspendedPharmacies, pending: totalPharmacies - activePharmacies - suspendedPharmacies },
    users: { total: totalUsers },
    sales: { total: totalSalesAgg._count, amount: parseFloat(totalSalesAgg._sum.total_amount || 0) },
    subscriptions: { expiringSoon: expiringSubs },
    revenue: { thisMonth: parseFloat(monthRevenue._sum.amount || 0) },
    recentPharmacies,
  }
}

// ── Pharmacies management ─────────────────────────────────────────────────────

export async function listPharmacies(query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, status } = query

  const where = {
    deletedAt: null,
    ...(search && { name: { contains: search, mode: 'insensitive' } }),
    ...(status && { status }),
  }

  const [pharmacies, total] = await prisma.$transaction([
    prisma.pharmacy.findMany({
      where, skip, take,
      include: {
        subscription: { select: { plan: true, status: true, end_date: true } },
        _count: { select: { users: true, products: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.pharmacy.count({ where }),
  ])

  return { pharmacies, total, page, pageSize }
}

export async function getPharmacyDetail(id, req) {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id },
    include: {
      subscription: { include: { payments: { orderBy: { paid_at: 'desc' }, take: 10 } } },
      users:        { where: { deletedAt: null }, select: { id: true, name: true, email: true, role: true, status: true, last_login: true } },
      _count:       { select: { products: true, sales: true, receptions: true } },
    },
  })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }
  return pharmacy
}

export async function createPharmacy(data, adminId, req) {
  const { pharmacyName, pharmacyEmail, pharmacyPhone, pharmacyAddress, pharmacyCity, pharmacyCountry,
    pharmacyLicense, plan = 'STARTER', trialDays = 30,
    adminName, adminEmail, adminPassword } = data

  if (pharmacyLicense) {
    const ex = await prisma.pharmacy.findUnique({ where: { license_number: pharmacyLicense } })
    if (ex) throw { statusCode: 409, message: req.t('pharmacy.license_taken') }
  }

  const hashed = await bcrypt.hash(adminPassword, 12)
  const trialEnd = new Date(Date.now() + trialDays * 86400000)
  const subEnd   = new Date(Date.now() + 365 * 86400000)

  const result = await prisma.$transaction(async (tx) => {
    const pharmacy = await tx.pharmacy.create({
      data: {
        name: pharmacyName, email: pharmacyEmail, phone: pharmacyPhone,
        address: pharmacyAddress, city: pharmacyCity, country: pharmacyCountry,
        license_number: pharmacyLicense || null,
        status: 'ACTIVE', is_active: true,
      },
    })

    const adminUser = await tx.users.create({
      data: { name: adminName, email: adminEmail, password: hashed, role: 'ADMIN', status: 'ACTIVE', pharmacyId: pharmacy.id },
    })

    // Seed categories
    await tx.category.createMany({
      data: ['Analgésique','Antibiotique','Anti-inflammatoire','Antihypertenseur','Antidiabétique',
        'Antihistaminique','Gastro-entérologie','Pédiatrie','Complément alimentaire','Dermatologie']
        .map(name => ({ name })),
      skipDuplicates: true,
    })

    const subscription = await tx.subscriptions.create({
      data: {
        pharmacyId: pharmacy.id,
        plan,
        status: 'TRIAL',
        start_date: new Date(),
        end_date: subEnd,
        trial_end_date: trialEnd,
        amount: planAmount(plan),
        currency: 'XOF',
      },
    })

    return { pharmacy, adminUser, subscription }
  })

  await logAction(adminId, 'CREATE_PHARMACY', `Pharmacie créée: ${pharmacyName}`, 'pharmacy', result.pharmacy.id, req)
  const { password: _, ...safeAdmin } = result.adminUser
  return { ...result, adminUser: safeAdmin }
}

export async function updatePharmacyStatus(id, status, reason, adminId, req) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id } })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  const isActive = status === 'ACTIVE'
  await prisma.pharmacy.update({
    where: { id },
    data: {
      status,
      is_active: isActive,
      suspended_at:     !isActive ? new Date() : null,
      suspended_reason: !isActive ? (reason || null) : null,
    },
  })

  // Notify pharmacy admin
  await prisma.notifications.create({
    data: {
      pharmacyId: id,
      title: isActive ? '✅ Pharmacie réactivée' : '⚠️ Pharmacie suspendue',
      message: isActive
        ? 'Votre pharmacie a été réactivée. Vous pouvez à nouveau utiliser PharmaPulse.'
        : `Votre pharmacie a été suspendue. Raison: ${reason || 'Non précisée'}. Contactez le support.`,
      type: isActive ? 'SUCCESS' : 'ERROR',
    },
  })

  await logAction(adminId, `PHARMACY_${status}`, `Statut changé: ${pharmacy.name} → ${status}. ${reason || ''}`, 'pharmacy', id, req)
}

export async function updatePharmacy(id, data, adminId, req) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id } })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  const updated = await prisma.pharmacy.update({
    where: { id },
    data: {
      name:           data.name           ?? undefined,
      email:          data.email          ?? undefined,
      phone:          data.phone          ?? undefined,
      address:        data.address        ?? undefined,
      city:           data.city           ?? undefined,
      country:        data.country        ?? undefined,
      license_number: data.license_number ?? undefined,
      max_users:      data.max_users      ?? undefined,
    },
    include: { subscription: true },
  })

  await logAction(adminId, 'UPDATE_PHARMACY', `Pharmacie modifiée: ${pharmacy.name}`, 'pharmacy', id, req)
  return updated
}

export async function deletePharmacy(id, adminId, req) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id } })
  if (!pharmacy) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  await prisma.pharmacy.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE', is_active: false } })
  await logAction(adminId, 'DELETE_PHARMACY', `Pharmacie supprimée: ${pharmacy.name}`, 'pharmacy', id, req)
}

// ── Subscriptions management ──────────────────────────────────────────────────

export async function renewSubscription(pharmacyId, data, adminId, req) {
  const { plan, months = 12, amount, method = 'CASH', reference } = data

  const sub = await prisma.subscriptions.findUnique({ where: { pharmacyId } })
  if (!sub) throw { statusCode: 404, message: 'Abonnement introuvable.' }

  const now      = new Date()
  const baseDate = sub.end_date > now ? sub.end_date : now
  const newEnd   = new Date(baseDate.getTime() + months * 30 * 86400000)

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSub = await tx.subscriptions.update({
      where: { pharmacyId },
      data: {
        plan:     plan ?? sub.plan,
        status:   'ACTIVE',
        end_date: newEnd,
        amount:   amount ?? planAmount(plan ?? sub.plan),
      },
    })

    await tx.subscriptionPayments.create({
      data: {
        subscriptionId: sub.id,
        amount:         amount ?? planAmount(plan ?? sub.plan),
        method,
        reference:      reference || null,
        period_start:   baseDate,
        period_end:     newEnd,
        notes:          `Renouvellement ${months} mois — Plan ${plan ?? sub.plan}`,
      },
    })

    // Reactivate pharmacy if suspended for expiry
    await tx.pharmacy.update({
      where: { id: pharmacyId },
      data: { status: 'ACTIVE', is_active: true, suspended_at: null, suspended_reason: null },
    })

    // Notify
    await tx.notifications.create({
      data: {
        pharmacyId,
        title:   '✅ Abonnement renouvelé',
        message: `Votre abonnement ${plan ?? sub.plan} est renouvelé jusqu'au ${newEnd.toLocaleDateString('fr-FR')}.`,
        type:    'SUCCESS',
      },
    })

    return updatedSub
  })

  await logAction(adminId, 'RENEW_SUBSCRIPTION', `Renouvellement ${months}m pour pharmacyId=${pharmacyId}`, 'subscription', sub.id, req)
  return updated
}

export async function getSubscriptionPayments(pharmacyId, query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const sub = await prisma.subscriptions.findUnique({ where: { pharmacyId } })
  if (!sub) return { payments: [], total: 0, page, pageSize }

  const [payments, total] = await prisma.$transaction([
    prisma.subscriptionPayments.findMany({ where: { subscriptionId: sub.id }, skip, take, orderBy: { paid_at: 'desc' } }),
    prisma.subscriptionPayments.count({ where: { subscriptionId: sub.id } }),
  ])

  return { payments, total, page, pageSize }
}

// ── Users management (SuperAdmin view all pharmacies) ─────────────────────────

export async function listAllUsers(query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const { search, role, pharmacyId, status } = query

  const where = {
    deletedAt: null,
    ...(search && { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }),
    ...(role      && { role }),
    ...(status    && { status }),
    ...(pharmacyId && { pharmacyId: parseInt(pharmacyId) }),
  }

  const [users, total] = await prisma.$transaction([
    prisma.users.findMany({
      where, skip, take,
      select: { id: true, name: true, email: true, role: true, status: true, last_login: true, createdAt: true,
        pharmacy: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.users.count({ where }),
  ])

  return { users, total, page, pageSize }
}

// ── Audit logs ────────────────────────────────────────────────────────────────

export async function getSuperAdminLogs(query) {
  const { page, pageSize, skip, take } = getPaginationParams(query)
  const [logs, total] = await prisma.$transaction([
    prisma.superAdminLogs.findMany({
      skip, take,
      orderBy: { createdAt: 'desc' },
      include: { superAdmin: { select: { id: true, name: true, email: true } } },
    }),
    prisma.superAdminLogs.count(),
  ])
  return { logs, total, page, pageSize }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function planAmount(plan) {
  return { FREE: 0, STARTER: 15000, PRO: 35000, ENTERPRISE: 75000 }[plan] || 15000
}

async function logAction(superAdminId, action, description, targetType, targetId, req) {
  try {
    await prisma.superAdminLogs.create({
      data: {
        superAdminId,
        action,
        description,
        target_type: targetType || null,
        target_id:   targetId   || null,
        ip_address:  req?.ip    || null,
      },
    })
  } catch {}
}
