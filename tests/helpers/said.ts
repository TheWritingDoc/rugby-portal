// Generates a valid 13-digit South African ID number for tests (matches the
// Luhn checksum + embedded DOB/gender that src/utils/validation.ts enforces).
// `uniq` varies the gender-sequence digits so each call is unique.
export function validSaId(uniq: number = Date.now(), dob = '2010-01-01', gender: 'Male' | 'Female' = 'Male'): string {
  const [y, m, d] = dob.split('-')
  const yymmdd = `${y.slice(2)}${m}${d}`
  const seqNum = (gender === 'Male' ? 5000 : 0) + (Math.abs(uniq) % 4999)
  const base = `${yymmdd}${String(seqNum).padStart(4, '0')}08` // citizenship 0, A-digit 8
  let sum = 0
  let alt = true
  for (let i = base.length - 1; i >= 0; i--) {
    let n = Number(base[i])
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    alt = !alt
  }
  const check = (10 - (sum % 10)) % 10
  return `${base}${check}`
}
