// PrecisionCode PTY LTD — platform owner accounts. The business dashboard
// (Platform tab + /api/platform/overview) is theirs alone; ordinary union
// admins run the rugby side without seeing company-level numbers.
// The server enforces this independently (PLATFORM_OWNERS env, same default),
// so this list only controls what the UI offers.
export const PLATFORM_OWNER_EMAILS = ['precisioncode.sa@gmail.com']

export function isPlatformOwner(email?: string | null): boolean {
  const e = String(email ?? localStorage.getItem('auth:email') ?? '').trim().toLowerCase()
  return !!e && PLATFORM_OWNER_EMAILS.includes(e)
}
