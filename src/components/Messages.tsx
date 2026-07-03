import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Send, Inbox, ChevronDown, ChevronUp } from 'lucide-react'
import { getJsonPath, postJsonPath } from '../utils/api'
import { notifyError, notifySuccess } from '../utils/notify'

type Recipient = { email: string; name: string; role: string; schoolId?: string; zoneId?: string }
type Message = { id: string; fromEmail: string; fromRole?: string; fromName?: string; toEmail: string; subject?: string; body: string; readAt?: number; createdAt: number }

// Scoped messaging: the recipient list comes from the server, which only
// returns people inside the user's allowed hierarchy (direct superiors and
// direct reports). See /api/messages* in server/index-sqlite.js.
export default function Messages() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [inbox, setInbox] = useState<Message[]>([])
  const [sent, setSent] = useState<Message[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [toEmail, setToEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const myName = typeof window !== 'undefined' ? localStorage.getItem('auth:email') || '' : ''

  async function load() {
    const res = await getJsonPath('messages')
    if (res && Array.isArray((res as any).inbox)) {
      setInbox((res as any).inbox)
      setSent((res as any).sent || [])
    }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!open) return
    ;(async () => {
      const list = await getJsonPath('messages/recipients')
      if (Array.isArray(list)) setRecipients(list)
      // Opening the panel marks the inbox read
      const unread = inbox.some((m) => !m.readAt)
      if (unread) {
        const r = await postJsonPath('messages/read-all', {})
        if (r.ok) setInbox((prev) => prev.map((m) => ({ ...m, readAt: m.readAt || Date.now() })))
      }
    })()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = inbox.filter((m) => !m.readAt).length
  const groups = useMemo(() => {
    const g = new Map<string, Recipient[]>()
    for (const r of recipients) {
      const arr = g.get(r.role) || []
      arr.push(r)
      g.set(r.role, arr)
    }
    return [...g.entries()]
  }, [recipients])

  async function send() {
    if (!toEmail) return notifyError('Choose a recipient')
    if (!body.trim()) return notifyError('Write a message')
    setSending(true)
    try {
      const res = await postJsonPath('messages', { toEmail, subject, body, fromName: myName })
      if (!res.ok) {
        const err = (res.data as any)?.error
        return notifyError(err === 'recipient_out_of_scope' ? 'That person is outside your reporting line.' : String(err || 'Send failed'))
      }
      notifySuccess('Message sent')
      setSubject('')
      setBody('')
      await load()
      setTab('sent')
    } finally {
      setSending(false)
    }
  }

  const rows = tab === 'inbox' ? inbox : sent

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="messages-panel">
      <button
        type="button"
        data-testid="messages-toggle"
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <MessageSquare size={18} className="text-brand" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-900">Messages</span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300">{unreadCount} new</span>
        )}
        <span className="ml-auto text-gray-400">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-4 border-t border-gray-100 p-4 lg:grid-cols-2">
          {/* Compose */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">New message</div>
            <label className="block">
              <span className="text-xs text-gray-500">To (people in your reporting line)</span>
              <select
                aria-label="Message recipient"
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
              >
                <option value="">Select recipient…</option>
                {groups.map(([role, list]) => (
                  <optgroup key={role} label={role}>
                    {list.map((r) => (
                      <option key={r.email} value={r.email}>{r.name} — {r.email}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="mt-2 block">
              <span className="text-xs text-gray-500">Subject</span>
              <input aria-label="Message subject" className="mt-1 w-full rounded-md border p-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label className="mt-2 block">
              <span className="text-xs text-gray-500">Message</span>
              <textarea aria-label="Message body" rows={4} className="mt-1 w-full rounded-md border p-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={sending}
              onClick={send}
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Send size={14} aria-hidden="true" /> {sending ? 'Sending…' : 'Send message'}
            </button>
          </div>
          {/* Inbox / Sent */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'inbox' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
                onClick={() => setTab('inbox')}
              >
                <span className="inline-flex items-center gap-1"><Inbox size={12} /> Inbox ({inbox.length})</span>
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'sent' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
                onClick={() => setTab('sent')}
              >
                Sent ({sent.length})
              </button>
            </div>
            <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {rows.length === 0 && <div className="p-3 text-sm text-gray-400">No messages</div>}
              {rows.map((m) => (
                <div key={m.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2">
                    {tab === 'inbox' && !m.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />}
                    <span className="font-semibold text-gray-900">
                      {tab === 'inbox' ? (m.fromName || m.fromEmail) : m.toEmail}
                    </span>
                    {tab === 'inbox' && m.fromRole && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{m.fromRole}</span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-gray-400">{m.createdAt ? new Date(Number(m.createdAt)).toLocaleString() : ''}</span>
                  </div>
                  {m.subject && <div className="mt-0.5 text-xs font-medium text-gray-700">{m.subject}</div>}
                  <div className="mt-0.5 whitespace-pre-wrap text-gray-600">{m.body}</div>
                  {tab === 'inbox' && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-brand hover:underline"
                      onClick={() => { setToEmail(m.fromEmail); setSubject(m.subject ? `Re: ${m.subject.replace(/^Re: /, '')}` : ''); }}
                    >
                      Reply
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
