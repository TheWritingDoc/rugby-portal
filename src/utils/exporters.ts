// Offline exports for squads: spreadsheet (Excel-compatible CSV), printable profile
// sheets, and game-day ID cards. Printing uses the browser's print dialog, so users
// can pick "Save as PDF" or a physical printer.
import QRCode from 'qrcode'
import { API_ORIGIN } from './apiBase'
import { schoolNameOf, zoneNameOf } from './labels'
import { seasonYearOf } from './season'

function absUrl(u: any): string {
  const s = String(u || '')
  if (!s) return ''
  return s.startsWith('/uploads') ? `${API_ORIGIN}${s}` : s
}

function esc(v: any): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function rowOf(p: any) {
  const d = p?.data || {}
  return {
    name: d.name || p.name || '',
    surname: d.surname || p.surname || '',
    idNumber: d.idNumber || p.idNumber || '',
    dateOfBirth: d.dob || d.dateOfBirth || p.dateOfBirth || '',
    gender: d.gender || p.gender || '',
    ageGroup: d.ageGroup || p.ageGroup || '',
    team: d.team || d.ageGroup || '',
    position: d.position || '',
    jerseyNumber: d.jerseyNumber || '',
    school: schoolNameOf(d.schoolId || p.schoolId),
    zone: zoneNameOf(d.zoneId || p.zoneId),
    season: seasonYearOf(p),
    status: d.status || 'approved',
    phone: d.phone || d.contactNumber || p.contactNumber || '',
    email: d.email || p.email || '',
    address: d.address || '',
    parentName: `${d.parentName || ''} ${d.parentSurname || ''}`.trim(),
    parentContact: d.parentContact || '',
    parentEmail: d.parentEmail || '',
    emergencyContact: `${d.emergencyContactName || ''} ${d.emergencyContactNumber || ''}`.trim(),
    medicalAid: `${d.medicalAidName || ''} ${d.medicalAidNumber || ''}`.trim(),
    allergies: d.allergies || '',
    chronicConditions: d.chronicConditions || '',
    medicalNotes: d.medicalNotes || '',
    photoUrl: absUrl(d.photoUrl),
  }
}

export function exportPlayersCsv(players: any[], filenameBase = 'players') {
  const rows = (players || []).map(rowOf)
  const headers: [string, keyof ReturnType<typeof rowOf>][] = [
    ['Name', 'name'], ['Surname', 'surname'], ['ID/Passport', 'idNumber'], ['Date of Birth', 'dateOfBirth'],
    ['Gender', 'gender'], ['Age Group', 'ageGroup'], ['Team', 'team'], ['Position', 'position'], ['Jersey', 'jerseyNumber'],
    ['School', 'school'], ['Zone', 'zone'], ['Season', 'season'], ['Status', 'status'],
    ['Mobile', 'phone'], ['Email', 'email'], ['Address', 'address'],
    ['Parent/Guardian', 'parentName'], ['Parent Contact', 'parentContact'], ['Parent Email', 'parentEmail'],
    ['Emergency Contact', 'emergencyContact'], ['Medical Aid', 'medicalAid'], ['Allergies', 'allergies'],
    ['Chronic Conditions', 'chronicConditions'], ['Medical Notes', 'medicalNotes'],
  ]
  const quote = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.map(([h]) => quote(h)).join(',')]
  for (const r of rows) lines.push(headers.map(([, k]) => quote(r[k])).join(','))
  // BOM so Excel opens it as UTF-8
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

type PrintMeta = { schoolName?: string; logoUrl?: string; title?: string }

function openPrintWindow(title: string, bodyHtml: string, css: string) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return false
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`)
  w.document.close()
  // Give images a moment to load before opening the print dialog
  w.onload = () => setTimeout(() => { w.focus(); w.print() }, 400)
  return true
}

const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; }
  @media print { .no-print { display: none !important; } }
`

export function printPlayerProfiles(players: any[], meta: PrintMeta = {}) {
  const season = new Date().getFullYear()
  const logo = absUrl(meta.logoUrl)
  const sheets = (players || []).map((p) => {
    const r = rowOf(p)
    const field = (label: string, value: any) => `
      <div class="f"><span class="fl">${esc(label)}</span><span class="fv">${esc(value) || '—'}</span></div>`
    return `
    <section class="sheet">
      <header class="head">
        ${logo ? `<img class="logo" src="${esc(logo)}" alt="" />` : ''}
        <div>
          <div class="school">${esc(meta.schoolName || r.school || 'EPHSRU')}</div>
          <div class="sub">Player Profile • Season ${season}</div>
        </div>
        ${r.photoUrl ? `<img class="photo" src="${esc(r.photoUrl)}" alt="" />` : '<div class="photo placeholder"></div>'}
      </header>
      <h1>${esc(r.name)} ${esc(r.surname)}</h1>
      <div class="badges">
        ${r.ageGroup ? `<span class="badge">${esc(r.ageGroup)}</span>` : ''}
        ${r.position ? `<span class="badge">${esc(r.position)}</span>` : ''}
        ${r.jerseyNumber ? `<span class="badge">#${esc(r.jerseyNumber)}</span>` : ''}
        <span class="badge status">${esc(r.status)}</span>
      </div>
      <h2>Personal</h2>
      <div class="grid">
        ${field('ID/Passport', r.idNumber)}${field('Date of Birth', r.dateOfBirth)}
        ${field('Gender', r.gender)}${field('School', r.school)}
        ${field('Zone', r.zone)}${field('Mobile', r.phone)}
        ${field('Email', r.email)}${field('Address', r.address)}
      </div>
      <h2>Guardian & Emergency</h2>
      <div class="grid">
        ${field('Parent/Guardian', r.parentName)}${field('Parent Contact', r.parentContact)}
        ${field('Parent Email', r.parentEmail)}${field('Emergency Contact', r.emergencyContact)}
      </div>
      <h2>Medical</h2>
      <div class="grid">
        ${field('Medical Aid', r.medicalAid)}${field('Allergies', r.allergies)}
        ${field('Chronic Conditions', r.chronicConditions)}${field('Notes', r.medicalNotes)}
      </div>
      <footer class="foot">Eastern Province High Schools Rugby Union • Generated ${new Date().toLocaleDateString()}</footer>
    </section>`
  }).join('')

  const css = SHARED_CSS + `
    .sheet { page-break-after: always; padding: 14mm 16mm; max-width: 210mm; margin: 0 auto; }
    .head { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; }
    .logo { height: 56px; width: 56px; object-fit: contain; }
    .school { font-size: 18px; font-weight: 700; color: #1e3a8a; }
    .sub { font-size: 12px; color: #6b7280; }
    .photo { height: 84px; width: 84px; object-fit: cover; border-radius: 8px; margin-left: auto; border: 1px solid #d1d5db; }
    .photo.placeholder { background: #f3f4f6; }
    h1 { font-size: 24px; margin: 12px 0 6px; }
    .badges { margin-bottom: 10px; }
    .badge { display: inline-block; background: #eff6ff; color: #1e3a8a; border: 1px solid #bfdbfe; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 600; margin-right: 6px; text-transform: capitalize; }
    .badge.status { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #1e3a8a; border-bottom: 1px solid #e5e7eb; margin: 14px 0 8px; padding-bottom: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .f { display: flex; gap: 8px; font-size: 12px; padding: 3px 0; border-bottom: 1px dotted #e5e7eb; }
    .fl { color: #6b7280; min-width: 110px; }
    .fv { font-weight: 600; }
    .foot { margin-top: 18px; font-size: 10px; color: #9ca3af; text-align: center; }
  `
  return openPrintWindow(meta.title || 'Player profiles', sheets, css)
}

export async function printPlayerCards(players: any[], meta: PrintMeta = {}) {
  // Open the print window synchronously (inside the click gesture) so pop-up
  // blockers don't kill it while we generate QR codes asynchronously.
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return false
  w.document.write('<!doctype html><meta charset="utf-8"><title>Preparing cards…</title><body style="font-family:sans-serif;padding:2rem;color:#334155">Preparing match-day cards…</body>')

  const season = new Date().getFullYear()
  const logo = absUrl(meta.logoUrl)
  const list = players || []

  // Each QR encodes the player's identity so a match-day official can scan and
  // verify who the card belongs to (works offline — the data is self-contained).
  const qrs = await Promise.all(
    list.map((p) => {
      const r = rowOf(p)
      const refId = p?.id || p?.serverId || p?.data?.serverId || ''
      const payload = [
        'EPHSRU RUGBY — Player ID',
        `${r.name} ${r.surname}`.trim(),
        r.idNumber ? `ID: ${r.idNumber}` : '',
        `${r.ageGroup || r.team || ''}${r.position ? ' · ' + r.position : ''}${r.jerseyNumber ? ' #' + r.jerseyNumber : ''}`.trim(),
        r.school || '',
        `Season ${season}`,
        refId ? `Ref: ${refId}` : '',
      ].filter(Boolean).join('\n')
      return QRCode.toDataURL(payload, { margin: 0, width: 160, errorCorrectionLevel: 'M' }).catch(() => '')
    })
  )

  const cards = list.map((p, i) => {
    const r = rowOf(p)
    const initials = ((r.name.charAt(0) + r.surname.charAt(0)).toUpperCase()) || 'P'
    return `
    <div class="card">
      <div class="bar">
        ${logo ? `<img class="blogo" src="${esc(logo)}" alt="" />` : ''}
        <span class="bschool">${esc(meta.schoolName || r.school || 'EPHSRU')}</span>
        <span class="bseason">${season}</span>
      </div>
      <div class="body">
        ${r.photoUrl ? `<img class="cphoto" src="${esc(r.photoUrl)}" alt="" />` : `<div class="cphoto initials">${esc(initials)}</div>`}
        <div class="info">
          <div class="cname">${esc(r.name)} ${esc(r.surname)}</div>
          <div class="crow"><span>ID</span><b>${esc(r.idNumber) || '—'}</b></div>
          <div class="crow"><span>Born</span><b>${esc(r.dateOfBirth) || '—'}</b></div>
          <div class="crow"><span>Team</span><b>${esc(r.ageGroup || r.team) || '—'}</b></div>
          <div class="crow"><span>Position</span><b>${esc(r.position) || '—'}${r.jerseyNumber ? ` · #${esc(r.jerseyNumber)}` : ''}</b></div>
        </div>
        ${qrs[i] ? `<div class="qrbox"><img class="qr" src="${qrs[i]}" alt="Scan to verify" /><span class="qrlabel">SCAN</span></div>` : ''}
      </div>
      <div class="strip">EPHSRU PLAYER IDENTIFICATION • SEASON ${season}</div>
    </div>`
  }).join('')

  const css = SHARED_CSS + `
    body { padding: 8mm; }
    .card { width: 88mm; height: 56mm; border: 1px solid #94a3b8; border-radius: 3mm; overflow: hidden; display: inline-flex; flex-direction: column; margin: 2.5mm; vertical-align: top; page-break-inside: avoid; background: #fff; }
    .bar { display: flex; align-items: center; gap: 2mm; background: #1e3a8a; color: #fff; padding: 1.5mm 3mm; }
    .blogo { height: 6mm; width: 6mm; object-fit: contain; background: #fff; border-radius: 1mm; }
    .bschool { font-size: 8.5pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bseason { margin-left: auto; font-size: 8pt; font-weight: 700; background: rgba(255,255,255,.18); border-radius: 2mm; padding: 0 2mm; }
    .body { display: flex; gap: 2.5mm; padding: 2.5mm 3mm; flex: 1; align-items: stretch; }
    .cphoto { width: 20mm; height: 26mm; object-fit: cover; border-radius: 1.5mm; border: 1px solid #cbd5e1; }
    .cphoto.initials { display: flex; align-items: center; justify-content: center; background: #e2e8f0; color: #475569; font-size: 15pt; font-weight: 800; }
    .info { flex: 1; min-width: 0; }
    .cname { font-size: 10.5pt; font-weight: 800; color: #0f172a; margin-bottom: 1.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .crow { display: flex; justify-content: space-between; gap: 1mm; font-size: 7pt; border-bottom: 1px dotted #e2e8f0; padding: 0.6mm 0; }
    .crow span { color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
    .crow b { color: #0f172a; text-align: right; }
    .qrbox { display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .qr { width: 15mm; height: 15mm; }
    .qrlabel { font-size: 5.5pt; font-weight: 700; letter-spacing: .12em; color: #64748b; margin-top: 0.5mm; }
    .strip { background: #15803d; color: #fff; text-align: center; font-size: 6.5pt; font-weight: 700; letter-spacing: .08em; padding: 1mm 0; }
  `

  const title = meta.title || 'Player ID cards'
  w.document.open()
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${cards}</body></html>`)
  w.document.close()
  w.onload = () => setTimeout(() => { w.focus(); w.print() }, 400)
  return true
}
