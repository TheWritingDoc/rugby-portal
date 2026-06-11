import jwt from 'jsonwebtoken'

const env = process.env.NODE_ENV || 'development'
const SECRET = process.env.JWT_SECRET || (env === 'production' ? '' : 'ephsru_dev_secret')

if (!SECRET) {
  // Refuse to boot a production server with a guessable signing key
  throw new Error('JWT_SECRET environment variable is required in production')
}

export function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '12h' })
}

export function verifyToken(req, res, next) {
  const h = req.headers['authorization'] || ''
  const t = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!t) return next()
  try {
    req.user = jwt.verify(t, SECRET)
  } catch {}
  next()
}
