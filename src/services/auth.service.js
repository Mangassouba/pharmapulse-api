import bcrypt from 'bcryptjs'
import { eq, and, isNull } from 'drizzle-orm'
import db from '../config/database.js'
import { pharmacy as pharmacyTable, users, category, subscriptions } from '../db/schema.js'
import { signToken, signRefreshToken } from '../config/jwt.js'
import { createAuditLog } from '../utils/audit.js'
import { TRIAL_DAYS, DEFAULT_PLAN, CURRENCY } from '../utils/subscription.js'

const meQuery = {
  columns: {
    id: true, name: true, email: true, role: true, status: true,
    phone: true, address: true, last_login: true, createdAt: true,
  },
  with: {
    pharmacy: {
      columns: { id: true, name: true, email: true, phone: true, address: true, city: true, country: true, is_active: true, duty_days: true, duty_start: true, duty_end: true },
    },
  },
}

export async function registerPharmacyAndAdmin(data, req) {
  const {
    pharmacyName, pharmacyEmail, pharmacyPhone,
    pharmacyAddress, pharmacyCity, pharmacyCountry,
    pharmacyLicense,
    name, email, password,
  } = data

  // Check license uniqueness
  if (pharmacyLicense) {
    const existing = await db.query.pharmacy.findFirst({ where: eq(pharmacyTable.license_number, pharmacyLicense) })
    if (existing) throw { statusCode: 409, message: req.t('pharmacy.license_taken') }
  }

  const hashed = await bcrypt.hash(password, 12)

  // Create pharmacy + admin in a single transaction
  const result = await db.transaction(async (tx) => {
    const [pharmacy] = await tx.insert(pharmacyTable).values({
      name: pharmacyName,
      email: pharmacyEmail,
      phone: pharmacyPhone,
      address: pharmacyAddress,
      city: pharmacyCity,
      country: pharmacyCountry,
      license_number: pharmacyLicense || null,
    }).returning()

    // Check email uniqueness in this pharmacy
    const userExists = await tx.query.users.findFirst({
      where: and(eq(users.email, email), eq(users.pharmacyId, pharmacy.id)),
    })
    if (userExists) throw { statusCode: 409, message: req.t('auth.email_taken') }

    const [user] = await tx.insert(users).values({
      name,
      email,
      password: hashed,
      role: 'ADMIN',
      status: 'ACTIVE',
      pharmacyId: pharmacy.id,
    }).returning()

    // Seed default categories
    await tx.insert(category).values([
      { name: 'Analgésique',    description: 'Médicaments contre la douleur' },
      { name: 'Antibiotique',   description: 'Médicaments antibactériens' },
      { name: 'Anti-inflammatoire', description: 'Réduction de l\'inflammation' },
      { name: 'Antihypertenseur',   description: 'Traitement de l\'hypertension' },
      { name: 'Antidiabétique',     description: 'Traitement du diabète' },
      { name: 'Antihistaminique',   description: 'Traitement des allergies' },
      { name: 'Gastro-entérologie', description: 'Système digestif' },
      { name: 'Pédiatrie',          description: 'Médicaments pour enfants' },
      { name: 'Complément alimentaire', description: 'Vitamines et minéraux' },
      { name: 'Dermatologie',       description: 'Soins de la peau' },
    ]).onConflictDoNothing()

    // Start a free trial so the pharmacy is billable from day one
    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400000)
    const [subscription] = await tx.insert(subscriptions).values({
      pharmacyId:     pharmacy.id,
      plan:           DEFAULT_PLAN,
      status:         'TRIAL',
      start_date:     new Date(),
      end_date:       trialEnd,
      trial_end_date: trialEnd,
      amount:         0,
      currency:       CURRENCY,
    }).returning()

    return { pharmacy, user, subscription }
  })

  await createAuditLog({
    action: 'REGISTER',
    entity: 'pharmacy',
    entity_id: result.pharmacy.id,
    new_values: { pharmacyName, adminEmail: email },
    userId: result.user.id,
    pharmacyId: result.pharmacy.id,
    req,
  })

  const { password: _, ...safeUser } = result.user
  const token        = signToken({ id: result.user.id, pharmacyId: result.pharmacy.id, role: 'ADMIN', email })
  const refreshToken = signRefreshToken({ id: result.user.id })

  return { user: safeUser, pharmacy: result.pharmacy, subscription: result.subscription, token, refreshToken }
}

export async function loginUser(email, password, req) {
  const user = await db.query.users.findFirst({
    where: and(eq(users.email, email), isNull(users.deletedAt)),
    with: { pharmacy: true },
  })

  if (!user) throw { statusCode: 401, message: req.t('auth.invalid_credentials') }
  if (user.status !== 'ACTIVE') throw { statusCode: 403, message: req.t('auth.account_inactive') }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw { statusCode: 401, message: req.t('auth.invalid_credentials') }

  // Update last_login
  await db.update(users).set({ last_login: new Date() }).where(eq(users.id, user.id))

  await createAuditLog({
    action: 'LOGIN',
    entity: 'users',
    entity_id: user.id,
    userId: user.id,
    pharmacyId: user.pharmacyId,
    req,
  })

  const { password: _, ...safeUser } = user
  const token        = signToken({ id: user.id, pharmacyId: user.pharmacyId, role: user.role, email: user.email })
  const refreshToken = signRefreshToken({ id: user.id })

  return { user: safeUser, token, refreshToken }
}

export async function changePassword(userId, currentPassword, newPassword, req) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) throw { statusCode: 401, message: req.t('auth.invalid_credentials') }

  const hashed = await bcrypt.hash(newPassword, 12)
  await db.update(users).set({ password: hashed }).where(eq(users.id, userId))

  await createAuditLog({
    action: 'CHANGE_PASSWORD',
    entity: 'users',
    entity_id: userId,
    userId,
    pharmacyId: user.pharmacyId,
    req,
  })
}

export async function updateMe(userId, data, req) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }

  const { name, phone, address } = data
  await db.update(users).set({ name, phone, address }).where(eq(users.id, userId))
  const updated = await getMe(userId)

  await createAuditLog({
    action: 'UPDATE',
    entity: 'users',
    entity_id: userId,
    old_values: { name: user.name, phone: user.phone, address: user.address },
    new_values: { name, phone, address },
    userId,
    pharmacyId: user.pharmacyId,
    req,
  })

  return updated
}

export async function updateDuty(pharmacyId, { dutyDays, dutyStart = null, dutyEnd = null }, req) {
  const values = {
    duty_days:  [...new Set(dutyDays)].sort((a, b) => a - b),
    duty_start: dutyStart,
    duty_end:   dutyEnd,
  }
  const [updated] = await db.update(pharmacyTable)
    .set(values)
    .where(eq(pharmacyTable.id, pharmacyId))
    .returning({
      id:         pharmacyTable.id,
      duty_days:  pharmacyTable.duty_days,
      duty_start: pharmacyTable.duty_start,
      duty_end:   pharmacyTable.duty_end,
    })
  if (!updated) throw { statusCode: 404, message: req.t('pharmacy.not_found') }

  await createAuditLog({
    action: 'UPDATE',
    entity: 'pharmacy',
    entity_id: pharmacyId,
    new_values: values,
    userId: req.user.id,
    pharmacyId,
    req,
  })

  return updated
}

export async function getMe(userId) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    ...meQuery,
  })
  return user ?? null
}
