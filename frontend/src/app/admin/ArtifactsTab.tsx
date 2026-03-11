'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Loader2, CheckCircle, XCircle, ChevronLeft,
  DatabaseZap, Upload, RefreshCw,
} from 'lucide-react'
import { useLang } from '@/lib/i18n'
import {
  Course, Artifact, DocType, AdminUploadItem,
  tx, localeByLang, adminReq, API,
  DOC_TYPE_COLORS, getDocTypeLabel, getDocTypeOptions,
  Spinner, Empty, ErrorBox, DeleteBtn,
  rowStyle, cardStyle,
} from './_shared'

// ── Artifacts tab (按课程隔离) ─────────────────────────────────────────────────

export function ArtifactsTab({ secret }: { secret: string }) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
  const locale = localeByLang(lang)
  const docTypeOptions = getDocTypeOptions(lang)
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [reindexResult, setReindexResult] = useState<string>('')
  const [uploadDocType, setUploadDocType] = useState<DocType>('lecture')
  const [uploadQueue, setUploadQueue] = useState<AdminUploadItem[]>([])
  const uploadIdRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isUploading = uploadQueue.some(q => q.status === 'uploading')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [updatingDocType, setUpdatingDocType] = useState<number | null>(null)
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | 'all'>('all')

  // 切换 status 时重置分类子过滤
  useEffect(() => { setDocTypeFilter('all') }, [statusFilter])

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

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function updateDocType(artifactId: number, newDocType: DocType) {
    setUpdatingDocType(artifactId)
    try {
      await adminReq(secret, `/admin/artifacts/${artifactId}/doc-type`, {
        method: 'PATCH',
        body: JSON.stringify({ doc_type: newDocType }),
      })
      setArtifacts(prev => prev.map(a => a.id === artifactId ? { ...a, doc_type: newDocType } : a))
      showToast(tt('✓ 标签已更新', '✓ Label updated'))
    } catch (e: unknown) {
      // Distinguish network and server errors for clearer toast
      const msg = String(e)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        showToast(tt('⚠️ 分类更新失败，请检查网络或服务端状态', '⚠️ Category update failed. Check network/server status.'))
      } else {
        showToast(tt('⚠️ 分类更新失败：', '⚠️ Category update failed: ') + msg.replace(/^Error:\s*/, '').slice(0, 60))
      }
    } finally {
      setUpdatingDocType(null)
    }
  }

  async function startUpload(files: File[]) {
    if (!selectedCourse || files.length === 0) return
    const newItems: AdminUploadItem[] = files.map(f => ({
      id: ++uploadIdRef.current, file: f, status: 'pending' as const,
    }))
    setUploadQueue(prev => [...prev, ...newItems])
    setError('')
    for (const item of newItems) {
      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading' as const } : q))
      try {
        const fd = new FormData()
        fd.append('file', item.file)
        fd.append('doc_type', uploadDocType)
        // Use fetch directly — adminReq forces Content-Type: application/json which breaks FormData
        const res = await fetch(`${API}/admin/courses/${selectedCourse.id}/artifacts`, {
          method: 'POST',
          headers: { 'X-Admin-Secret': secret },
          body: fd,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(err.detail || `HTTP ${res.status}`)
        }
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done' as const } : q))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error' as const, error: msg } : q))
      }
    }
    await loadFiles(selectedCourse.id, statusFilter)
  }

  async function reindex() {
    if (!selectedCourse) return
    if (!confirm(
      tt(
        `重新索引「${selectedCourse.code}」的所有已批准文件？\n\n这将重新清洗、分块和向量化全部文件，可能需要几分钟。`,
        `Reindex all approved files in "${selectedCourse.code}"?\n\nThis will re-clean, chunk, and vectorize all files and may take several minutes.`,
      ),
    )) return
    setReindexing(true); setReindexResult(''); setError('')
    try {
      const res = await adminReq<{ ok: boolean; processed: number; chunks: number; errors: number }>(
        secret, `/admin/courses/${selectedCourse.id}/reindex`, { method: 'POST' }
      )
      setReindexResult(
        tt(
          `完成：处理 ${res.processed} 个文件，生成 ${res.chunks} 个 chunk，失败 ${res.errors} 个`,
          `Done: processed ${res.processed} files, generated ${res.chunks} chunks, failed ${res.errors}`,
        ),
      )
    } catch (e: unknown) { setError(String(e)) }
    finally { setReindexing(false) }
  }

  async function reject(id: number) {
    const reason = prompt(tt('拒绝原因（可留空）', 'Reject reason (optional)')) ?? ''
    try {
      await adminReq(secret, `/admin/artifacts/${id}/reject`, {
        method: 'PATCH', body: JSON.stringify({ reason }),
      })
      if (selectedCourse) await loadFiles(selectedCourse.id, statusFilter)
    } catch (e: unknown) { setError(String(e)) }
  }

  async function deleteArtifact(id: number, fileName: string) {
    if (!selectedCourse) return
    if (!confirm(
      tt(
        `确认删除「${fileName}」？\n此操作不可恢复，相关向量索引也会一并清除。`,
        `Delete "${fileName}"?\nThis is irreversible and related vectors will also be removed.`,
      ),
    )) return
    try {
      await adminReq(secret, `/admin/artifacts/${id}?course_id=${selectedCourse.id}`, { method: 'DELETE' })
      setArtifacts(prev => prev.filter(a => a.id !== id))
      showToast(tt('🗑️ 文件已删除', '🗑️ File deleted'))
    } catch (e: unknown) { setError(String(e)) }
  }

  const statusColors: Record<string, string> = {
    pending: '#f97316', approved: '#4ade80', rejected: '#ff7070',
  }

  if (loadingCourses) return <Spinner />

  // 课程选择视图
  if (!selectedCourse) {
    return (
      <div className="space-y-4 fade-in-up">
        {error && <ErrorBox msg={error} />}
        <p className="text-sm" style={{ color: '#666' }}>{tt('选择课程后查看该课程的待审文件', 'Select a course to review its pending files')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {courses.map(c => (
            <button key={c.id} onClick={() => setSelectedCourse(c)}
              className="flex items-center gap-3 px-4 py-4 rounded-2xl text-left transition-all duration-200"
              style={{ ...rowStyle, cursor: 'pointer' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.25)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
              }}>
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>{c.code}</span>
              <span className="text-sm text-white">{c.name}</span>
            </button>
          ))}
          {courses.length === 0 && <Empty text={tt('暂无课程', 'No courses yet')} />}
        </div>
      </div>
    )
  }

  // 文件审核视图
  return (
    <div className="space-y-4 fade-in-up">
      {/* Toast 轻提示 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-lg"
          style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', backdropFilter: 'blur(8px)' }}>
          {toast}
        </div>
      )}

      {error && <ErrorBox msg={error} />}
      {reindexResult && (
        <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2" style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
          <CheckCircle size={14} /> {reindexResult}
        </div>
      )}

      {/* 面包屑 + 筛选 */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setSelectedCourse(null); setArtifacts([]) }}
          className="flex items-center gap-1.5 text-sm transition-colors duration-150"
          style={{ color: '#555' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
          <ChevronLeft size={14} /> {tt('所有课程', 'All Courses')}
        </button>
        <span style={{ color: '#333' }}>/</span>
        <span className="text-sm font-semibold" style={{ color: '#FFD700' }}>
          {selectedCourse.code} · {selectedCourse.name}
        </span>
        <div className="ml-auto flex gap-2 items-center">
          {(['pending', 'approved', 'rejected'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
              style={{
                background: statusFilter === s ? `${statusColors[s]}20` : 'rgba(255,255,255,0.04)',
                color: statusFilter === s ? statusColors[s] : '#555',
                border: `1px solid ${statusFilter === s ? `${statusColors[s]}50` : 'rgba(255,255,255,0.07)'}`,
              }}>
              {s === 'pending' ? tt('待审核', 'Pending') : s === 'approved' ? tt('已批准', 'Approved') : tt('已拒绝', 'Rejected')}
            </button>
          ))}
          <button onClick={() => loadFiles(selectedCourse.id, statusFilter)}
            className="p-1.5 rounded-lg transition-colors duration-150"
            style={{ color: '#555' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            title={tt('刷新列表', 'Refresh list')}>
            <RefreshCw size={14} />
          </button>
          <button
            onClick={reindex}
            disabled={reindexing}
            title={tt('重新索引该课程（清洗+分块+向量化所有已批准文件）', 'Reindex this course (clean + chunk + vectorize all approved files)')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
            onMouseEnter={e => { if (!reindexing) (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.18)' }}
            onMouseLeave={e => { if (!reindexing) (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.1)' }}>
            {reindexing ? <Loader2 size={12} className="animate-spin" /> : <DatabaseZap size={12} />}
            {reindexing ? tt('索引中…', 'Reindexing...') : tt('重新索引', 'Reindex')}
          </button>
        </div>
      </div>

      {/* 管理员直接上传区（免审核，立即approved） */}
      <div className="p-4 rounded-2xl space-y-3" style={cardStyle}>
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#FFD700' }}>
          <Upload size={12} /> {tt('管理员直传（跳过审核，立即索引）', 'Admin direct upload (skip review, index now)')}
        </p>
        <div className="flex gap-3 items-center flex-wrap">
          <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value as DocType)}
            className="text-sm rounded-lg px-3 py-1.5 outline-none flex-1 min-w-40 transition-all duration-150"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,215,0,0.2)', color: DOC_TYPE_COLORS[uploadDocType] }}>
            {docTypeOptions.map(o => (
              <option key={o.value} value={o.value} style={{ background: '#0d0d1a', color: '#fff' }}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.08))', color: '#FFD700', border: '1px solid rgba(255,215,0,0.35)' }}
            onMouseEnter={e => { if (!isUploading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,215,0,0.12))' }}
            onMouseLeave={e => { if (!isUploading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.08))' }}>
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {isUploading ? tt('上传中…', 'Uploading...') : tt('选择文件上传（可多选）', 'Choose files to upload (multi-select)')}
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.py,.txt,.ipynb" multiple className="hidden"
            onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length > 0) startUpload(files); e.target.value = '' }} />
        </div>
        {/* 上传队列进度 */}
        {uploadQueue.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#666' }}>
                {tt('上传进度：', 'Upload progress:')}
                {uploadQueue.filter(q => q.status === 'done').length}/{uploadQueue.length}
                {' '}
                {tt('完成', 'done')}
              </span>
              {uploadQueue.every(q => q.status === 'done' || q.status === 'error') && (
                <button onClick={() => setUploadQueue([])} className="text-xs px-2 py-0.5 rounded"
                  style={{ color: '#555' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                  {tt('清除记录', 'Clear')}
                </button>
              )}
            </div>
            {uploadQueue.map(item => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {item.status === 'pending'   && <div className="w-3 h-3 rounded-full border border-dashed flex-shrink-0" style={{ borderColor: '#444' }} />}
                {item.status === 'uploading' && <Loader2 size={12} className="animate-spin flex-shrink-0" style={{ color: '#FFD700' }} />}
                {item.status === 'done'      && <CheckCircle size={12} className="flex-shrink-0" style={{ color: '#4ade80' }} />}
                {item.status === 'error'     && <XCircle size={12} className="flex-shrink-0" style={{ color: '#EF4444' }} />}
                <span className="flex-1 truncate"
                  style={{ color: item.status === 'error' ? '#EF4444' : item.status === 'done' ? '#555' : '#aaa' }}>
                  {item.file.name}
                </span>
                {item.status === 'error' && item.error && (
                  <span className="flex-shrink-0 ml-2 max-w-[150px] truncate" style={{ color: '#ef9999' }} title={item.error}>
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 已批准时显示 doc_type 横向子过滤 */}
      {statusFilter === 'approved' && (
        <div className="flex gap-2 flex-wrap">
          {([{ value: 'all', label: tt('全部', 'All') }, ...docTypeOptions] as { value: DocType | 'all'; label: string }[]).map(o => {
            const isActive = docTypeFilter === o.value
            const color = o.value === 'all' ? '#FFD700' : DOC_TYPE_COLORS[o.value as DocType]
            return (
              <button key={o.value} onClick={() => setDocTypeFilter(o.value)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150"
                style={{
                  background: isActive ? `${color}20` : 'rgba(255,255,255,0.04)',
                  color: isActive ? color : '#555',
                  border: `1px solid ${isActive ? `${color}50` : 'rgba(255,255,255,0.08)'}`,
                }}>
                {o.label}
              </button>
            )
          })}
        </div>
      )}

      {loadingFiles ? <Spinner /> : (() => {
        const displayedArtifacts = statusFilter === 'approved' && docTypeFilter !== 'all'
          ? artifacts.filter(a => a.doc_type === docTypeFilter)
          : artifacts
        return (
        <div className="space-y-2">
          {displayedArtifacts.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200"
              style={rowStyle}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.03)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,0.18)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
              }}>
              <span className="text-lg">{a.file_type === 'pdf' ? '📄' : '🔗'}</span>
              <div className="flex-1 min-w-0">
                {/* 文件名：有 storage_url 时变为可点击预览链接 */}
                {a.storage_url ? (
                  <a
                    href={a.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm truncate block transition-opacity hover:opacity-100"
                    style={{ color: '#60a5fa', opacity: 0.9, textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    title={tt('在新标签页预览文件', 'Preview file in new tab')}>
                    {a.file_name}
                  </a>
                ) : (
                  <p className="text-sm text-white truncate">{a.file_name}</p>
                )}
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                  {new Date(a.created_at).toLocaleString(locale)}
                  {a.reject_reason && <span style={{ color: '#ff8080' }}> · {a.reject_reason}</span>}
                </p>
              </div>
              {/* doc_type 内联下拉（已批准时可修改；其他状态仅显示） */}
              {a.status === 'rejected' ? (
                <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                  <span className="badge-danger">{tt('已失效', 'Invalid')}</span>
                  {a.reject_reason && (
                    <span className="text-xs max-w-32 truncate" style={{ color: '#ff8080' }}
                      title={a.reject_reason}>
                      {a.reject_reason}
                    </span>
                  )}
                </div>
              ) : a.status === 'approved' ? (
                <div className="relative flex-shrink-0">
                  {updatingDocType === a.id && (
                    <Loader2 size={10} className="animate-spin absolute -top-1 -right-1 z-10" style={{ color: '#FFD700' }} />
                  )}
                  <select
                    disabled={updatingDocType === a.id}
                    value={a.doc_type ?? 'lecture'}
                    onChange={e => updateDocType(a.id, e.target.value as DocType)}
                    className="text-xs rounded-lg px-2 py-0.5 border outline-none cursor-pointer transition-opacity"
                    style={{
                      background: `${DOC_TYPE_COLORS[a.doc_type ?? 'lecture']}18`,
                      color: DOC_TYPE_COLORS[a.doc_type ?? 'lecture'],
                      border: `1px solid ${DOC_TYPE_COLORS[a.doc_type ?? 'lecture']}40`,
                      opacity: updatingDocType === a.id ? 0.5 : 1,
                    }}>
                    {docTypeOptions.map(o => (
                      <option key={o.value} value={o.value}
                        style={{ background: '#1a1a1a', color: '#ccc' }}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : a.doc_type ? (
                <span className="text-xs px-2 py-0.5 rounded-lg flex-shrink-0" style={{
                  background: `${DOC_TYPE_COLORS[a.doc_type]}18`,
                  color: DOC_TYPE_COLORS[a.doc_type],
                  border: `1px solid ${DOC_TYPE_COLORS[a.doc_type]}40`,
                }}>
                  {getDocTypeLabel(a.doc_type, lang)}
                </span>
              ) : null}
              {/* 状态 badge — pill 样式 */}
              <span className="text-xs px-2.5 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{
                  background: `${statusColors[a.status]}18`,
                  color: statusColors[a.status],
                  border: `1px solid ${statusColors[a.status]}40`,
                }}>
                {a.status === 'pending' ? tt('待审', 'Pending') : a.status === 'approved' ? tt('已批准', 'Approved') : tt('已拒绝', 'Rejected')}
              </span>
              {statusFilter === 'pending' && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => approve(a.id)}
                    className="p-1.5 rounded-lg transition-colors duration-150"
                    title={tt('批准', 'Approve')}
                    style={{ color: '#4ade80' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(74,222,128,0.12)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <CheckCircle size={16} />
                  </button>
                  <button onClick={() => reject(a.id)}
                    className="p-1.5 rounded-lg transition-colors duration-150"
                    title={tt('拒绝', 'Reject')}
                    style={{ color: '#ff7070' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,112,112,0.12)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <XCircle size={16} />
                  </button>
                </div>
              )}
              <DeleteBtn onClick={() => deleteArtifact(a.id, a.file_name)} />
            </div>
          ))}
          {displayedArtifacts.length === 0 && (
            <Empty text={
              statusFilter === 'approved' && docTypeFilter !== 'all'
                ? tt(
                  `${selectedCourse.code} 暂无「${getDocTypeLabel(docTypeFilter as DocType, lang)}」类文件`,
                  `${selectedCourse.code} has no "${getDocTypeLabel(docTypeFilter as DocType, lang)}" files`,
                )
                : tt(
                  `${selectedCourse.code} 暂无${statusFilter === 'pending' ? '待审核' : statusFilter === 'approved' ? '已批准' : '已拒绝'}文件`,
                  `${selectedCourse.code} has no ${statusFilter} files`,
                )
            } />
          )}
        </div>
        )
      })()}
    </div>
  )
}
