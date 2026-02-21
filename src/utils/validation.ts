export function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export function isPhoneZA(v: string) {
  const s = v.trim().replace(/[ \-().]/g, '')
  if (/^(?:\+?27|0027)0?[1-9]\d{8}$/.test(s)) return true
  if (/^0[1-9]\d{8}$/.test(s)) return true
  return false
}

export function isIdNumber(v: string) {
  return /^\d{6,13}$/.test(v)
}