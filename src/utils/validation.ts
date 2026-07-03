export function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export function isPhoneZA(v: string) {
  const s = v.trim().replace(/[ \-().]/g, '')
  if (/^(?:\+?27|0027)0?[1-9]\d{8}$/.test(s)) return true
  if (/^0[1-9]\d{8}$/.test(s)) return true
  return false
}

// Luhn checksum used by South African (Home Affairs) 13-digit ID numbers.
function luhnValid(digits: string) {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export interface SaIdInfo {
  valid: boolean
  dob?: string // YYYY-MM-DD
  gender?: 'Male' | 'Female'
  citizen?: boolean // true = SA citizen, false = permanent resident
}

// Parse and validate a 13-digit South African ID number: YYMMDD SSSS C A Z.
// Digits 1-6 date of birth, 7-10 gender sequence (>=5000 male), 11 citizenship,
// 13 Luhn check digit. Returns { valid:false } for anything that isn't a
// well-formed SA ID (e.g. a passport) — callers decide whether that's allowed.
export function parseSaId(v: string): SaIdInfo {
  const s = String(v || '').trim()
  if (!/^\d{13}$/.test(s)) return { valid: false }
  const yy = Number(s.slice(0, 2))
  const mm = Number(s.slice(2, 4))
  const dd = Number(s.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { valid: false }
  // Two-digit year -> full year: treat years after the current YY as 1900s.
  const nowYY = new Date().getFullYear() % 100
  const fullYear = yy <= nowYY ? 2000 + yy : 1900 + yy
  const dob = new Date(fullYear, mm - 1, dd)
  if (dob.getMonth() !== mm - 1 || dob.getDate() !== dd) return { valid: false } // rejects e.g. 31 Feb
  if (!luhnValid(s)) return { valid: false }
  const genderSeq = Number(s.slice(6, 10))
  const gender: 'Male' | 'Female' = genderSeq >= 5000 ? 'Male' : 'Female'
  const citizen = s[10] === '0'
  const iso = `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  return { valid: true, dob: iso, gender, citizen }
}

export function isSaIdNumber(v: string) {
  return parseSaId(v).valid
}

// Accept a valid 13-digit SA ID OR a passport-style document number (6-12
// alphanumerics) so foreign/visiting players can still be registered. A
// 13-digit value is held to the full SA ID checksum.
export function isIdNumber(v: string) {
  const s = String(v || '').trim()
  if (/^\d{13}$/.test(s)) return isSaIdNumber(s)
  return /^[A-Za-z0-9]{6,12}$/.test(s)
}
