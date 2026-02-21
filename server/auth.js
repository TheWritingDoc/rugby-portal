import jwt from 'jsonwebtoken'

const SECRET = 'ephsru_dev_secret'

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