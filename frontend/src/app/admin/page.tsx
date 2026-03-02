'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, CheckCircle, XCircle, Trash2, Plus, RefreshCw,
  Users, BookOpen, FileText, Ticket, ChevronLeft, Key,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'

async function adminReq<T>(secret: string, path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'X-Admin-Secret': secret,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Course { id: string; code: string; name: string; created_at: string }
interface Artifact {
  id: number; course_id: string; file_name: string; file_type: string
  status: string; created_at: string; reject_reason: string | null; uploaded_by: string | null
}
interface User {
  id: string; email: string; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean
}
interface Invite { id: string; code: string; note: string | null; max_uses: number; used_count: number; created_at: string }
interface ApiKey { id: number; provider: 'openai' | 'gemini' | 'deepseek'; label: string; is_active: boolean; created_at: string; updated_at: string }

type Tab = 'courses' | 'artifacts' | 'users' | 'invites' | 'api-keys'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'courses',   label: '课程管理', icon: <BookOpen size={15} /> },
  { id: 'artifacts', label: '文件审核', icon: <FileText size={15} /> },
  { id: 'users',     label: '用户列表', icon: <Users size={15} /> },
  { id: 'invites',   label: '邀请码',   icon: <Ticket size={15} /> },
  { id: 'api-keys',  label: 'API 密钥', icon: <Key size={15} /> },
]

// ── Courses tab ───────────────────────────────────────────────────────────────

function CoursesTab({ secret }: { secret: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setCourses(await adminReq<Course[]>(secret, '/admin/courses')) }
    catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [secret])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!code.trim() || !name.trim()) return
    setCreating(true)
    try {
      await adminReq(secret, '/admin/courses', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim(), name: name.trim() }),
      })
      setCode(''); setName('')
      await load()
    } catch (e: unknown) { setError(String(e)) }
    finally { setCreating(false) }
  }

  async function del(id: string) {
    if (!confirm('确认删除该课程及所有相关数据？')) return
    try { await adminReq(secret, `/admin/courses/${id}`, { method: 'DELETE' }); await load() }
    catch (e: unknown) { setError(String(e)) }
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBox msg={error} />}
      <div className="p-4 rounded-xl" style={cardStyle}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: '#FFD700' }}>新建课程</h3>
        <div className="flex gap-3 flex-wrap">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="课程代码 (如 COMP9517)"
            className="px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-32" style={inputStyle} />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="课程名称"
            className="px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-40" style={inputStyle} />
          <ActionBtn onClick={create} loading={creating} disabled={!code.trim() || !name.trim()} icon={<Plus size={14} />}>
            创建
          </ActionBtn>
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {courses.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-4 py-3 rounded-xl" style={rowStyle}>
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>{c.code}</span>
              <span className="text-sm text-white flex-1">{c.name}</span>
              <span className="text-xs" style={{ color: '#555' }}>{new Date(c.created_at).toLocaleDateString('zh-CN')}</span>
              <DeleteBtn onClick={() => del(c.id)} />
            </div>
          ))}
          {courses.length === 0 && <Empty text="暂无课程" />}
        </div>
      )}
    </div>
  )
}

// ── Artifacts tab (按课程隔离) ─────────────────────────────────────────────────

function ArtifactsTab({ secret }: { secret: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [error, setError] = useState('')

  // 加载课程列表
  useEffect(() => {
    adminReq<Course[]>(secret, '/admin/courses')
      .then(setCourses)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoadingCourses(false))
  }, [secret])

  // 加载选定课程的文件
  const loadFiles = useCallback(async (courseId: string, status: string) => {
    setLoadingFiles(true); setError('')
    try {
      setArtifacts(await adminReq<Artifact[]>(secret, `/admin/artifacts?status=${status}&course_id=${courseId}`))
    } catch (e: unknown) { setError(String(e)) }
    finally { setLoadingFiles(false) }
  }, [secret])

  useEffect(() => {
    if (selectedCourse) loadFiles(selectedCourse.id, statusFilter)
  }, [selectedCourse, statusFilter, loadFiles])

  async function approve(id: number) {
    try {
      await adminReq(secret, `/admin/artifacts/${id}/approve`, { method: 'PATCH' })
      if (selectedCourse) await loadFiles(selectedCourse.id, statusFilter)
    } catch (e: unknown) { setError(String(e)) }
  }

  async function reject(id: number) {
    const reason = prompt('拒绝原因（可留空）') ?? ''
    try {
      await adminReq(secret, `/admin/artifacts/${id}/reject`, {
        method: 'PATCH', body: JSON.stringify({ reason }),
      })
      if (selectedCourse) await loadFiles(selectedCourse.id, statusFilter)
    } catch (e: unknown) { setError(String(e)) }
  }

  const statusColors: Record<string, string> = {
    pending: '#FFD700', approved: '#4ade80', rejected: '#ff6b6b',
  }

  if (loadingCourses) return <Spinner />

  // 课程选择视图
  if (!selectedCourse) {
    return (
      <div className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <p className="text-sm" style={{ color: '#777' }}>选择课程后查看该课程的待审文件</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {courses.map(c => (
            <button key={c.id} onClick={() => setSelectedCourse(c)}
              className="flex items-center gap-3 px-4 py-4 rounded-xl text-left transition-all"
              style={{
                ...rowStyle,
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,215,0,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
              <span className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>{c.code}</span>
              <span className="text-sm text-white">{c.name}</span>
            </button>
          ))}
          {courses.length === 0 && <Empty text="暂无课程" />}
        </div>
      </div>
    )
  }

  // 文件审核视图
  return (
    <div className="space-y-4">
      {error && <ErrorBox msg={error} />}

      {/* 面包屑 + 筛选 */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setSelectedCourse(null); setArtifacts([]) }}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: '#666' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
          onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
          <ChevronLeft size={14} /> 所有课程
        </button>
        <span style={{ color: '#444' }}>/</span>
        <span className="text-sm font-semibold" style={{ color: '#FFD700' }}>
          {selectedCourse.code} · {selectedCourse.name}
        </span>
        <div className="ml-auto flex gap-2 items-center">
          {(['pending', 'approved', 'rejected'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: statusFilter === s ? `${statusColors[s]}22` : 'rgba(255,255,255,0.04)',
                color: statusFilter === s ? statusColors[s] : '#555',
                border: `1px solid ${statusFilter === s ? `${statusColors[s]}44` : 'rgba(255,255,255,0.07)'}`,
              }}>
              {s === 'pending' ? '待审核' : s === 'approved' ? '已批准' : '已拒绝'}
            </button>
          ))}
          <button onClick={() => loadFiles(selectedCourse.id, statusFilter)} style={{ color: '#555' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {loadingFiles ? <Spinner /> : (
        <div className="space-y-2">
          {artifacts.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={rowStyle}>
              <span className="text-lg">{a.file_type === 'pdf' ? '📄' : '🔗'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{a.file_name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                  {new Date(a.created_at).toLocaleString('zh-CN')}
                  {a.reject_reason && <span style={{ color: '#ff8080' }}> · {a.reject_reason}</span>}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                style={{ background: `${statusColors[a.status]}22`, color: statusColors[a.status] }}>
                {a.status === 'pending' ? '待审' : a.status === 'approved' ? '已批准' : '已拒绝'}
              </span>
              {statusFilter === 'pending' && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => approve(a.id)} className="p-1.5 rounded-lg" title="批准" style={{ color: '#4ade80' }}>
                    <CheckCircle size={16} />
                  </button>
                  <button onClick={() => reject(a.id)} className="p-1.5 rounded-lg" title="拒绝" style={{ color: '#ff6b6b' }}>
                    <XCircle size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {artifacts.length === 0 && (
            <Empty text={`${selectedCourse.code} 暂无${statusFilter === 'pending' ? '待审核' : statusFilter === 'approved' ? '已批准' : '已拒绝'}文件`} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ secret }: { secret: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminReq<User[]>(secret, '/admin/users')
      .then(setUsers)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [secret])

  return (
    <div className="space-y-4">
      {error && <ErrorBox msg={error} />}
      {loading ? <Spinner /> : (
        <>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-4 px-4 py-3 rounded-xl" style={rowStyle}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', fontSize: 13, fontWeight: 700 }}>
                  {u.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{u.email}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                    注册 {new Date(u.created_at).toLocaleDateString('zh-CN')}
                    {u.last_sign_in_at && ` · 最近登录 ${new Date(u.last_sign_in_at).toLocaleDateString('zh-CN')}`}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                  style={{
                    background: u.email_confirmed ? 'rgba(74,222,128,0.1)' : 'rgba(255,215,0,0.1)',
                    color: u.email_confirmed ? '#4ade80' : '#FFD700',
                  }}>
                  {u.email_confirmed ? '已验证' : '未验证'}
                </span>
              </div>
            ))}
            {users.length === 0 && <Empty text="暂无用户" />}
          </div>
          <p className="text-xs" style={{ color: '#444' }}>共 {users.length} 个用户</p>
        </>
      )}
    </div>
  )
}

// ── Invites tab ───────────────────────────────────────────────────────────────

function InvitesTab({ secret }: { secret: string }) {
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
    if (!confirm('确认删除该邀请码？')) return
    try { await adminReq(secret, `/admin/invites/${id}`, { method: 'DELETE' }); await load() }
    catch (e: unknown) { setError(String(e)) }
  }

  function copy(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code); setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBox msg={error} />}
      <div className="p-4 rounded-xl" style={cardStyle}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: '#FFD700' }}>生成邀请码</h3>
        <div className="flex gap-3 flex-wrap items-center">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="备注（如：学生姓名）"
            className="px-3 py-2 rounded-lg text-sm outline-none flex-1 min-w-40" style={inputStyle} />
          <div className="flex items-center gap-2">
            <span className="text-xs whitespace-nowrap" style={{ color: '#666' }}>最多使用次数</span>
            <input value={maxUses} onChange={e => setMaxUses(e.target.value)} type="number" min={1} max={100}
              className="px-3 py-2 rounded-lg text-sm outline-none w-16 text-center" style={inputStyle} />
          </div>
          <ActionBtn onClick={create} loading={creating} icon={<Plus size={14} />}>生成</ActionBtn>
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {invites.map(inv => (
            <div key={inv.id} className="flex items-center gap-4 px-4 py-3 rounded-xl" style={rowStyle}>
              <button onClick={() => copy(inv.code)}
                className="text-sm font-mono font-bold px-3 py-1 rounded-lg transition-all flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)', minWidth: 90 }}
                title="点击复制">
                {copied === inv.code ? '✓ 已复制' : inv.code}
              </button>
              <span className="text-sm flex-1 truncate" style={{ color: '#888' }}>{inv.note || '—'}</span>
              <span className="text-xs flex-shrink-0" style={{ color: inv.used_count >= inv.max_uses ? '#ff6b6b' : '#4ade80' }}>
                {inv.used_count}/{inv.max_uses} 次
              </span>
              <span className="text-xs flex-shrink-0" style={{ color: '#444' }}>
                {new Date(inv.created_at).toLocaleDateString('zh-CN')}
              </span>
              <DeleteBtn onClick={() => del(inv.id)} />
            </div>
          ))}
          {invites.length === 0 && <Empty text="暂无邀请码" />}
        </div>
      )}
    </div>
  )
}

// ── API Keys tab ──────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, { name: string; color: string; hint: string }> = {
  openai:   { name: 'OpenAI (GPT)',  color: '#10b981', hint: 'sk-proj-...' },
  gemini:   { name: 'Google Gemini', color: '#4285F4', hint: 'AIza...' },
  deepseek: { name: 'DeepSeek',      color: '#a78bfa', hint: 'sk-...' },
}

function ApiKeysTab({ secret }: { secret: string }) {
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
    if (!confirm('确认删除该 API 密钥？')) return
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
    <div className="space-y-6">
      {error && <ErrorBox msg={error} />}

      {/* 添加新密钥 */}
      <div className="p-5 rounded-xl space-y-4" style={cardStyle}>
        <h3 className="text-sm font-semibold" style={{ color: '#FFD700' }}>添加 / 更换 API 密钥</h3>
        <div className="flex gap-2 flex-wrap">
          {(['openai', 'gemini', 'deepseek'] as const).map(p => (
            <button key={p} onClick={() => setProvider(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: provider === p ? `${PROVIDER_LABELS[p].color}22` : 'rgba(255,255,255,0.04)',
                color: provider === p ? PROVIDER_LABELS[p].color : '#666',
                border: `1px solid ${provider === p ? `${PROVIDER_LABELS[p].color}44` : 'rgba(255,255,255,0.07)'}`,
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
            placeholder={`API Key（${PROVIDER_LABELS[provider].hint}）`}
            className="px-3 py-2 rounded-lg text-sm font-mono outline-none"
            style={inputStyle}
          />
          <div className="flex gap-3">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="备注标签（可选，如：Production Key）"
              className="px-3 py-2 rounded-lg text-sm outline-none flex-1"
              style={inputStyle}
            />
            <ActionBtn onClick={add} loading={adding} disabled={!apiKey.trim()} icon={<Plus size={14} />}>
              添加并激活
            </ActionBtn>
          </div>
        </div>
        <p className="text-xs" style={{ color: '#555' }}>
          添加后会自动设为该服务商的当前激活密钥，旧密钥保留（可手动切换）。密钥在界面中仅显示脱敏信息。
        </p>
      </div>

      {/* 已存储密钥列表（按服务商分组） */}
      {loading ? <Spinner /> : (
        <div className="space-y-5">
          {grouped.map(({ provider: p, info, keys: pKeys }) => (
            <div key={p}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{ background: `${info.color}22`, color: info.color }}>
                  {info.name}
                </span>
                <span className="text-xs" style={{ color: '#444' }}>{pKeys.length} 个密钥</span>
              </div>
              {pKeys.length === 0 ? (
                <div className="px-4 py-3 rounded-xl text-xs" style={{ ...rowStyle, color: '#555' }}>
                  未配置 · 将从环境变量读取
                </div>
              ) : (
                <div className="space-y-2">
                  {pKeys.map(k => (
                    <div key={k.id} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={rowStyle}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: k.is_active ? '#4ade80' : '#444' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{k.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                          {k.is_active ? '✓ 当前激活' : '未激活'} · 更新 {new Date(k.updated_at).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                      {!k.is_active && (
                        <button onClick={() => activate(k.id)}
                          className="text-xs px-3 py-1 rounded-lg flex-shrink-0"
                          style={{ background: `${info.color}22`, color: info.color, border: `1px solid ${info.color}44` }}>
                          激活
                        </button>
                      )}
                      {k.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                          style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
                          激活中
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

// ── Shared styles & micro-components ─────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e0e0e0',
}

const rowStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
}

function Spinner() {
  return <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} /></div>
}

function Empty({ text }: { text: string }) {
  return <p className="text-center py-8 text-sm" style={{ color: '#444' }}>{text}</p>
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(255,80,80,0.1)', color: '#ff8080', border: '1px solid rgba(255,80,80,0.2)' }}>
      {msg}
    </div>
  )
}

function ActionBtn({ onClick, loading = false, disabled = false, icon, children }: {
  onClick: () => void; loading?: boolean; disabled?: boolean; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
      style={{
        background: 'rgba(255,215,0,0.15)', color: '#FFD700',
        border: '1px solid rgba(255,215,0,0.3)',
        opacity: loading || disabled ? 0.5 : 1,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
      }}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} className="p-1.5 rounded-lg flex-shrink-0"
      style={{ color: hov ? '#ff6b6b' : '#555' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <Trash2 size={14} />
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('courses')
  const [secretInput, setSecretInput] = useState('')
  const [secret, setSecret] = useState('')

  if (!secret) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-sm p-8 rounded-2xl space-y-6"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,215,0,0.12)' }}>
          <div>
            <div className="text-2xl font-bold mb-1" style={{ color: '#FFD700' }}>🛡 管理后台</div>
            <p className="text-sm" style={{ color: '#555' }}>请输入管理员密钥进入</p>
            <p className="text-xs mt-1 font-mono" style={{ color: '#444' }}>API: {API}</p>
          </div>
          <input
            type="password"
            value={secretInput}
            onChange={e => setSecretInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setSecret(secretInput.trim())}
            placeholder="Admin Secret"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e0e0e0' }}
          />
          <button onClick={() => setSecret(secretInput.trim())}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
            进入管理后台
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#FFD700' }}>🛡 管理后台</h1>
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>课程 · 文件审核 · 用户 · 邀请码 · API密钥</p>
        </div>
        <button onClick={() => setSecret('')}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}>
          退出
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t.id ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.04)',
              color: tab === t.id ? '#FFD700' : '#666',
              border: `1px solid ${tab === t.id ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.07)'}`,
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'courses'   && <CoursesTab   secret={secret} />}
      {tab === 'artifacts' && <ArtifactsTab secret={secret} />}
      {tab === 'users'     && <UsersTab     secret={secret} />}
      {tab === 'invites'   && <InvitesTab   secret={secret} />}
      {tab === 'api-keys'  && <ApiKeysTab   secret={secret} />}
    </div>
  )
}
