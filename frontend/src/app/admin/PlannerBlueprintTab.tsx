'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CalendarDays, Save, Trash2, RefreshCw, Search, X } from 'lucide-react'
import { Course, adminReq, Spinner, ErrorBox, ActionBtn, Toast, cardStyle, inputStyle } from './_shared'

interface Blueprint {
  id?: number
  course_id: string
  blueprint: {
    knowledge_points?: { id: string; title: string; topic?: string }[]
    papers?: { id: string; title: string }[]
  }
  updated_at: string | null
}

const PLACEHOLDER = JSON.stringify(
  {
    knowledge_points: [
      { id: 'kp_1', title: '卷积神经网络基础', topic: 'CNN' },
      { id: 'kp_2', title: '反向传播算法', topic: 'Backprop' },
    ],
    papers: [
      { id: 'paper_1', title: '2023 Final Exam' },
      { id: 'paper_2', title: '2022 Final Exam' },
    ],
  },
  null,
  2
)

export function PlannerBlueprintTab({ secret }: { secret: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [loadingBp, setLoadingBp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    adminReq<Course[]>(secret, '/admin/courses')
      .then(data => {
        setCourses(data)
        if (data.length > 0) setSelectedCourseId(data[0].id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingCourses(false))
  }, [secret])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filteredCourses = courses.filter(c => {
    const q = query.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
  })
  const selectedCourseObj = courses.find(c => c.id === selectedCourseId)

  const loadBlueprint = useCallback(async (courseId: string) => {
    if (!courseId) return
    setLoadingBp(true)
    setError(null)
    setJsonError(null)
    try {
      const data = await adminReq<Blueprint>(secret, `/admin/planner/${courseId}`)
      setBlueprint(data)
      setJsonText(JSON.stringify(data.blueprint, null, 2))
    } catch (e: any) {
      if (e.message?.includes('404') || e.message === 'Blueprint not found') {
        setBlueprint(null)
        setJsonText('')
      } else {
        setError(e.message)
      }
    } finally {
      setLoadingBp(false)
    }
  }, [secret])

  useEffect(() => {
    if (selectedCourseId) loadBlueprint(selectedCourseId)
  }, [selectedCourseId, loadBlueprint])

  function validateJson(text: string): { ok: boolean; parsed?: Record<string, unknown> } {
    if (!text.trim()) return { ok: false }
    try {
      const parsed = JSON.parse(text)
      if (!parsed.knowledge_points && !parsed.papers) {
        setJsonError('JSON 必须包含 knowledge_points 或 papers 字段')
        return { ok: false }
      }
      setJsonError(null)
      return { ok: true, parsed }
    } catch (e: any) {
      setJsonError(`JSON 解析错误：${e.message}`)
      return { ok: false }
    }
  }

  async function handleSave() {
    const { ok, parsed } = validateJson(jsonText)
    if (!ok || !parsed) return
    setSaving(true)
    setError(null)
    try {
      await adminReq(secret, `/admin/planner/${selectedCourseId}`, {
        method: 'PUT',
        body: JSON.stringify({ blueprint: parsed }),
      })
      await loadBlueprint(selectedCourseId)
      setToast('保存成功')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!blueprint) return
    if (!confirm('确定删除此课程的考试蓝图？用户进度数据将保留。')) return
    setDeleting(true)
    try {
      await adminReq(secret, `/admin/planner/${selectedCourseId}`, { method: 'DELETE' })
      setBlueprint(null)
      setJsonText('')
      setToast('蓝图已删除')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const selectedCourse = selectedCourseObj
  const kpCount = blueprint?.blueprint?.knowledge_points?.length ?? 0
  const paperCount = blueprint?.blueprint?.papers?.length ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <CalendarDays size={18} style={{ color: '#7DD3C8' }} />
        <h2 className="text-base font-semibold" style={{ color: '#e0e0e0' }}>考试计划蓝图管理</h2>
      </div>

      {loadingCourses ? <Spinner /> : (
        <div className="flex flex-wrap items-center gap-3">
          <div ref={dropRef} className="relative" style={{ minWidth: 280 }}>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#555' }} />
              <input
                type="text"
                value={dropOpen ? query : (selectedCourseObj ? `${selectedCourseObj.code} — ${selectedCourseObj.name}` : '')}
                onChange={e => { setQuery(e.target.value); setDropOpen(true) }}
                onFocus={() => { setQuery(''); setDropOpen(true) }}
                placeholder="搜索课程..."
                className="w-full pl-8 pr-7 py-2 rounded-xl text-sm outline-none"
                style={{
                  ...inputStyle,
                  border: dropOpen ? '1px solid rgba(255,215,0,0.4)' : inputStyle.border,
                }}
              />
              {selectedCourseId && (
                <button onClick={() => { setQuery(''); setDropOpen(true) }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#444' }}>
                  <X size={12} />
                </button>
              )}
            </div>
            {dropOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-xl overflow-hidden shadow-2xl"
                style={{ background: 'rgba(14,16,24,0.98)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: 260, overflowY: 'auto' }}>
                {filteredCourses.length === 0
                  ? <div className="px-4 py-3 text-xs" style={{ color: '#555' }}>无匹配课程</div>
                  : filteredCourses.map(c => (
                    <button key={c.id} onClick={() => { setSelectedCourseId(c.id); setQuery(''); setDropOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                      style={{
                        background: selectedCourseId === c.id ? 'rgba(255,215,0,0.08)' : 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}
                      onMouseEnter={e => { if (selectedCourseId !== c.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (selectedCourseId !== c.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
                        {c.code}
                      </span>
                      <span className="text-sm truncate" style={{ color: selectedCourseId === c.id ? '#FFD700' : '#CCC' }}>{c.name}</span>
                    </button>
                  ))
                }
              </div>
            )}
          </div>
          <button onClick={() => loadBlueprint(selectedCourseId)} disabled={loadingBp}
            className="p-2 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
            <RefreshCw size={14} className={loadingBp ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {error && <ErrorBox msg={error} />}

      {selectedCourse && (
        <div style={{ ...cardStyle, padding: '16px 20px' }}>
          {/* Blueprint status */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              {blueprint ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                    style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
                    已配置
                  </span>
                  <span className="text-xs" style={{ color: '#666' }}>
                    {kpCount} 个知识点 · {paperCount} 套试卷
                  </span>
                  {blueprint.updated_at && (
                    <span className="text-xs" style={{ color: '#555' }}>
                      更新于 {new Date(blueprint.updated_at).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>
                  未配置
                </span>
              )}
            </div>
            {blueprint && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ color: '#ff8080', border: '1px solid rgba(255,80,80,0.2)', background: 'rgba(255,80,80,0.06)' }}>
                <Trash2 size={12} /> {deleting ? '删除中...' : '删除蓝图'}
              </button>
            )}
          </div>

          {/* JSON editor */}
          <div className="space-y-3">
            <p className="text-xs" style={{ color: '#666' }}>
              粘贴或编辑课程蓝图 JSON。必须包含 <code style={{ color: '#87B6FF' }}>knowledge_points</code> 和/或 <code style={{ color: '#F4A261' }}>papers</code> 数组，每个元素需有 <code style={{ color: '#aaa' }}>id</code> 和 <code style={{ color: '#aaa' }}>title</code> 字段。
            </p>
            <textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setJsonError(null) }}
              placeholder={PLACEHOLDER}
              rows={18}
              className="w-full rounded-xl px-4 py-3 text-xs font-mono resize-y"
              style={{
                ...inputStyle,
                lineHeight: 1.6,
                border: jsonError ? '1px solid rgba(255,80,80,0.4)' : inputStyle.border,
              }}
              spellCheck={false}
            />
            {jsonError && (
              <p className="text-xs" style={{ color: '#ff8080' }}>{jsonError}</p>
            )}
            <div className="flex justify-end">
              <ActionBtn onClick={handleSave} loading={saving} icon={<Save size={14} />}>
                {blueprint ? '更新蓝图' : '保存蓝图'}
              </ActionBtn>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}
