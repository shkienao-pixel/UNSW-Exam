'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Key } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import {
  ApiKey, tx, localeByLang, adminReq,
  Spinner, Empty, ErrorBox, ActionBtn, DeleteBtn,
  rowStyle,
} from './_shared'

const PROVIDER_LABELS: Record<string, { name: string; color: string; hint: string }> = {
  openai:   { name: 'OpenAI (GPT)',  color: '#10b981', hint: 'sk-proj-...' },
  gemini:   { name: 'Google Gemini', color: '#4285F4', hint: 'AIza...' },
  deepseek: { name: 'DeepSeek',      color: '#a78bfa', hint: 'sk-...' },
}

// ── API Keys tab ───────────────────────────────────────────────────────────────

export function ApiKeysTab({ secret }: { secret: string }) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
  const locale = localeByLang(lang)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [provider, setProvider] = useState<'openai' | 'gemini' | 'deepseek'>('openai')
  const [apiKey, setApiKey] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setKeys(await adminReq<ApiKey[]>(secret, '/admin/api-keys')) }
    catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [secret])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!apiKey.trim()) return
    setAdding(true)
    try {
      await adminReq(secret, '/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ provider, api_key: apiKey.trim(), label: label.trim() || undefined }),
      })
      setApiKey(''); setLabel(''); await load()
    } catch (e: unknown) { setError(String(e)) }
    finally { setAdding(false) }
  }

  async function activate(id: number) {
    try {
      await adminReq(secret, `/admin/api-keys/${id}/activate`, { method: 'PATCH' })
      await load()
    } catch (e: unknown) { setError(String(e)) }
  }

  async function del(id: number) {
    if (!confirm(tt('确认删除该 API 密钥？', 'Delete this API key?'))) return
    try {
      await adminReq(secret, `/admin/api-keys/${id}`, { method: 'DELETE' })
      await load()
    } catch (e: unknown) { setError(String(e)) }
  }

  // Group keys by provider
  const grouped = (['openai', 'gemini', 'deepseek'] as const).map(p => ({
    provider: p,
    info: PROVIDER_LABELS[p],
    keys: keys.filter(k => k.provider === p),
  }))

  return (
    <div className="space-y-6 fade-in-up">
      {error && <ErrorBox msg={error} />}

      {/* 添加新密钥 */}
      <div className="card-gold p-5 rounded-2xl space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#FFD700' }}>
          <Key size={14} /> {tt('添加 / 更换 API 密钥', 'Add / Replace API Key')}
        </h3>
        <div className="flex gap-2 flex-wrap">
          {(['openai', 'gemini', 'deepseek'] as const).map(p => (
            <button key={p} onClick={() => setProvider(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={{
                background: provider === p ? `${PROVIDER_LABELS[p].color}20` : 'rgba(255,255,255,0.04)',
                color: provider === p ? PROVIDER_LABELS[p].color : '#666',
                border: `1px solid ${provider === p ? `${PROVIDER_LABELS[p].color}50` : 'rgba(255,255,255,0.07)'}`,
              }}>
              {PROVIDER_LABELS[p].name}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <input
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            type="password"
            placeholder={tt(`API Key（${PROVIDER_LABELS[provider].hint}）`, `API Key (${PROVIDER_LABELS[provider].hint})`)}
            className="input-glass px-3 py-2 rounded-lg text-sm font-mono outline-none"
          />
          <div className="flex gap-3">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={tt('备注标签（可选，如：Production Key）', 'Label (optional, e.g. Production Key)')}
              className="input-glass px-3 py-2 rounded-lg text-sm outline-none flex-1"
            />
            <ActionBtn onClick={add} loading={adding} disabled={!apiKey.trim()} icon={<Plus size={14} />}>
              {tt('添加并激活', 'Add and activate')}
            </ActionBtn>
          </div>
        </div>
        <p className="text-xs" style={{ color: '#555' }}>
          {tt(
            '添加后会自动设为该服务商的当前激活密钥，旧密钥保留（可手动切换）。密钥在界面中仅显示脱敏信息。',
            'New key is activated automatically for the provider. Old keys are kept and can be switched manually. Only masked info is shown in UI.',
          )}
        </p>
      </div>

      {/* 已存储密钥列表（按服务商分组） */}
      {loading ? <Spinner /> : (
        <div className="space-y-5">
          {grouped.map(({ provider: p, info, keys: pKeys }) => (
            <div key={p}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{ background: `${info.color}20`, color: info.color, border: `1px solid ${info.color}40` }}>
                  {info.name}
                </span>
                <span className="text-xs" style={{ color: '#444' }}>{pKeys.length} {tt('个密钥', 'keys')}</span>
              </div>
              {pKeys.length === 0 ? (
                <div className="px-4 py-3 rounded-xl text-xs" style={{ ...rowStyle, color: '#555' }}>
                  {tt('未配置 · 将从环境变量读取', 'Not configured · fallback to environment variable')}
                </div>
              ) : (
                <div className="space-y-2">
                  {pKeys.map(k => (
                    <div key={k.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200"
                      style={rowStyle}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.18)'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
                      }}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: k.is_active ? '#4ade80' : '#333', boxShadow: k.is_active ? '0 0 6px rgba(74,222,128,0.5)' : 'none' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{k.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                          {k.is_active ? tt('✓ 当前激活', '✓ Active') : tt('未激活', 'Inactive')} · {tt('更新', 'Updated')}{' '}
                          {new Date(k.updated_at).toLocaleDateString(locale)}
                        </p>
                      </div>
                      {!k.is_active && (
                        <button onClick={() => activate(k.id)}
                          className="text-xs px-3 py-1 rounded-lg flex-shrink-0 transition-all duration-150"
                          style={{ background: `${info.color}18`, color: info.color, border: `1px solid ${info.color}40` }}
                          onMouseEnter={e => (e.currentTarget.style.background = `${info.color}30`)}
                          onMouseLeave={e => (e.currentTarget.style.background = `${info.color}18`)}>
                          {tt('激活', 'Activate')}
                        </button>
                      )}
                      {k.is_active && (
                        <span className="badge-success text-xs px-2.5 py-0.5 rounded-full flex-shrink-0">
                          {tt('激活中', 'Active')}
                        </span>
                      )}
                      <DeleteBtn onClick={() => del(k.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
