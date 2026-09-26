import jwt from 'jsonwebtoken'

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
