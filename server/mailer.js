// Outbound email. Configured entirely by environment variables so local dev
// needs nothing (emails become console lines + in-app notifications only):
//
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS   — any SMTP provider
//   MAIL_FROM  — e.g. "EPHSRU Rugby Portal <no-reply@ephsru.co.za>"
//   APP_URL    — public portal URL used in email bodies
//
// Recommended for Vercel: Resend SMTP (host smtp.resend.com, port 465,
// user "resend", pass = your API key) — see DEPLOY-SUPABASE-VERCEL.md.
import nodemailer from 'nodemailer'

const HOST = process.env.SMTP_HOST || ''
const PORT = Number(process.env.SMTP_PORT || 587)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || 'EPHSRU Rugby Portal <no-reply@ephsru.local>'

export const APP_URL = String(process.env.APP_URL || '').replace(/\/$/, '')
export const mailEnabled = Boolean(HOST && USER && PASS)

let transporter = null
if (mailEnabled) {
  transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465,
    auth: { user: USER, pass: PASS },
  })
  console.log(`[mail] outbound email enabled via ${HOST}:${PORT}`)
} else {
  console.log('[mail] SMTP not configured — emails are logged + delivered in-app only')
}

function htmlWrap(subject, bodyText) {
  const safe = String(bodyText || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  const cta = APP_URL
    ? `<p style="margin:24px 0"><a href="${APP_URL}" style="background:#1e3a8a;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600">Open the portal</a></p>`
    : ''
  return `<!doctype html><body style="margin:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#1e3a8a;color:#fff;padding:18px 24px;font-size:16px;font-weight:700">EPHSRU Rugby Portal</div>
    <div style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6">
      <h2 style="margin:0 0 12px;font-size:18px">${subject}</h2>
      <p style="margin:0">${safe}</p>
      ${cta}
    </div>
    <div style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:11px">Eastern Province High Schools Rugby Union — automated message, please do not reply.</div>
  </div></body>`
}

// Fire-and-forget: never throws, never blocks the request path.
export function sendMail(to, subject, text) {
  const recipient = String(to || '').trim()
  if (!recipient) return
  if (!mailEnabled) return
  transporter
    .sendMail({ from: FROM, to: recipient, subject: String(subject || ''), text: String(text || ''), html: htmlWrap(subject, text) })
    .then(() => console.log(`[mail] sent "${subject}" -> ${recipient}`))
    .catch((err) => console.error(`[mail] FAILED "${subject}" -> ${recipient}: ${err?.message || err}`))
}
