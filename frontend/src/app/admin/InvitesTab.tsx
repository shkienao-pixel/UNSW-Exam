'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Ticket } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import {
  Invite, tx, localeByLang, adminReq,
  Spinner, Empty, ErrorBox, ActionBtn, DeleteBtn,
  rowStyle,
} from './_shared'

// ── Invites tab ────────────────────────────────────────────────────────────────

export function InvitesTab({ secret }: { secret: string }) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
  const locale = localeByLang(lang)
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [maxUses, setMaxUses] = useState('1')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    try { setInvites(await adminReq<Invite[]>(secret, '/admin/invites')) }
    catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [secret])

  useEffect(() => { load() }, [load])

  async function create() {
    setCreating(true)
    try {
      await adminReq(secret, '/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() || undefined, max_uses: Number(maxUses) || 1 }),
      })
      setNote(''); setMaxUses('1'); await load()
    } catch (e: unknown) { setError(String(e)) }
    finally { setCreating(false) }
  }

  async function del(id: string) {
    if (!confirm(tt('确认删除该邀请码？', 'Delete this invite code?'))) return
    try { await adminReq(secret, `/admin/invites/${id}`, { method: 'DELETE' }); await load() }
    catch (e: unknown) { setError(String(e)) }
  }

  function copy(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code); setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6 fade-in-up">
      {error && <ErrorBox msg={error} />}
      <div className="card-gold p-5 rounded-2xl">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#FFD700' }}>
          <Ticket size={14} /> {tt('生成邀请码', 'Create Invite')}
        </h3>
        <div className="flex gap-3 flex-wrap items-center">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={tt('备注（如：学生姓名）', 'Note (e.g. student name)')}
            className="input-glass px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-40" />
          <div className="flex items-center gap-2">
            <span className="text-xs whitespace-nowrap" style={{ color: '#666' }}>{tt('最多使用次数', 'Max uses')}</span>
            <input value={maxUses} onChange={e => setMaxUses(e.target.value)} type="number" min={1} max={100}
              className="input-glass px-3 py-2 rounded-lg text-sm outline-none w-16 text-center" />
          </div>
          <ActionBtn onClick={create} loading={creating} icon={<Plus size={14} />}>{tt('生成', 'Create')}</ActionBtn>
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {invites.map(inv => (
            <div key={inv.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200"
              style={rowStyle}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.18)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
              }}>
              <button onClick={() => copy(inv.code)}
                className="text-sm font-mono font-bold px-3 py-1 rounded-lg transition-all duration-150 flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)', minWidth: 90 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,215,0,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,215,0,0.12)')}
                title={tt('点击复制', 'Click to copy')}>
                {copied === inv.code ? tt('✓ 已复制', '✓ Copied') : inv.code}
              </button>
              <span className="text-sm flex-1 truncate" style={{ color: '#888' }}>{inv.note || tt('—', '—')}</span>
              <span className={`text-xs flex-shrink-0 px-2.5 py-0.5 rounded-full font-medium ${inv.use_count >= inv.max_uses ? 'badge-danger' : 'badge-success'}`}>
                {inv.use_count}/{inv.max_uses} {tt('次', 'uses')}
              </span>
              <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>
                {new Date(inv.created_at).toLocaleDateString(locale)}
              </span>
              <DeleteBtn onClick={() => del(inv.id)} />
            </div>
          ))}
          {invites.length === 0 && <Empty text={tt('暂无邀请码', 'No invites yet')} />}
        </div>
      )}
    </div>
  )
}
