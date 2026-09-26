import bcrypt from 'bcryptjs'
import prisma from '../config/database.js'
import { signToken, signRefreshToken } from '../config/jwt.js'
import { createAuditLog } from '../utils/audit.js'

export async function registerPharmacyAndAdmin(data, req) {
  const {
    pharmacyName, pharmacyEmail, pharmacyPhone,
    pharmacyAddress, pharmacyCity, pharmacyCountry,
    pharmacyLicense,
    name, email, password,
  } = data

  // Check license uniqueness
  if (pharmacyLicense) {
    const existing = await prisma.pharmacy.findUnique({ where: { license_number: pharmacyLicense } })
    if (existing) throw { statusCode: 409, message: req.t('pharmacy.license_taken') }
  }

  const hashed = await bcrypt.hash(password, 12)

  // Create pharmacy + admin in a single transaction
  const result = await prisma.$transaction(async (tx) => {
    const pharmacy = await tx.pharmacy.create({
      data: {
        name: pharmacyName,
        email: pharmacyEmail,
        phone: pharmacyPhone,
        address: pharmacyAddress,
        city: pharmacyCity,
        country: pharmacyCountry,
        license_number: pharmacyLicense || null,
      },
    })

    // Check email uniqueness in this pharmacy
    const userExists = await tx.users.findFirst({
      where: { email, pharmacyId: pharmacy.id },
    })
    if (userExists) throw { statusCode: 409, message: req.t('auth.email_taken') }

    const user = await tx.users.create({
      data: {
        name,
        email,
        password: hashed,
        role: 'ADMIN',
        status: 'ACTIVE',
        pharmacyId: pharmacy.id,
      },
    })

    // Seed default categories
    await tx.category.createMany({
      data: [
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
      ],
      skipDuplicates: true,
    })

    return { pharmacy, user }
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

  return { user: safeUser, pharmacy: result.pharmacy, token, refreshToken }
}

export async function loginUser(email, password, req) {
  const user = await prisma.users.findFirst({
    where: { email, deletedAt: null },
    include: { pharmacy: true },
  })

  if (!user) throw { statusCode: 401, message: req.t('auth.invalid_credentials') }
  if (user.status !== 'ACTIVE') throw { statusCode: 403, message: req.t('auth.account_inactive') }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw { statusCode: 401, message: req.t('auth.invalid_credentials') }

  // Update last_login
  await prisma.users.update({
    where: { id: user.id },
    data: { last_login: new Date() },
  })

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
  const user = await prisma.users.findUnique({ where: { id: userId } })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) throw { statusCode: 401, message: req.t('auth.invalid_credentials') }

  const hashed = await bcrypt.hash(newPassword, 12)
  await prisma.users.update({ where: { id: userId }, data: { password: hashed } })

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
  const user = await prisma.users.findUnique({ where: { id: userId } })
  if (!user) throw { statusCode: 404, message: req.t('user.not_found') }

  const { name, phone, address } = data
  const updated = await prisma.users.update({
    where: { id: userId },
    data: { name, phone, address },
    select: {
      id: true, name: true, email: true, role: true, status: true,
      phone: true, address: true, last_login: true, createdAt: true,
      pharmacy: {
        select: { id: true, name: true, email: true, phone: true, city: true, country: true, is_active: true }
      },
    },
  })

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

export async function getMe(userId) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true, status: true,
      phone: true, address: true, last_login: true, createdAt: true,
      pharmacy: {
        select: { id: true, name: true, email: true, phone: true, city: true, country: true, is_active: true }
      },
    },
  })
  return user
}
