import jwt from 'jsonwebtoken'

// In production, refuse to start with a missing or weak secret: the dev fallbacks below are
// public (they are in the repo), so anyone could forge a valid token with them.
if (process.env.NODE_ENV === 'production') {
  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if ((process.env[name] || '').length < 32) {
      throw new Error(`${name} manquant ou trop court (32 caractères minimum). Générez-le avec : node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
    }
  }
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET et JWT_REFRESH_SECRET doivent être différents.')
  }
}

const JWT_SECRET         = process.env.JWT_SECRET         || 'change_me_in_production'
const JWT_EXPIRES_IN     = process.env.JWT_EXPIRES_IN     || '7d'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_change_me'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN })
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET)
}

// Reset tokens are signed with the user's current password hash: once the password
// changes, every previously issued link becomes invalid (single use).
const JWT_RESET_EXPIRES_IN = process.env.JWT_RESET_EXPIRES_IN || '1h'

export function signResetToken(userId, passwordHash, purpose = 'reset') {
  return jwt.sign({ id: userId, purpose }, JWT_SECRET + passwordHash, { expiresIn: JWT_RESET_EXPIRES_IN })
}

export function decodeResetToken(token) {
  return jwt.decode(token)
}

export function verifyResetToken(token, passwordHash) {
  return jwt.verify(token, JWT_SECRET + passwordHash)
}
