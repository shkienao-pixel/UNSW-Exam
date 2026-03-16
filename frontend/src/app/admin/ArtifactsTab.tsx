'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Loader2, CheckCircle, XCircle, ChevronLeft,
  DatabaseZap, Upload, RefreshCw, Search, FileSearch,
} from 'lucide-react'
import { useLang } from '@/lib/i18n'
import {
  Course, Artifact, DocType, AdminUploadItem,
  tx, localeByLang, adminReq, API,
  DOC_TYPE_COLORS, getDocTypeLabel, getDocTypeOptions,
  Spinner, Empty, ErrorBox, DeleteBtn,
  rowStyle, cardStyle,
} from './_shared'

type LectureWeekBucket = 'w1_3' | 'w4_6' | 'w7_9' | 'review'

function getLectureWeekBucket(fileName: string): LectureWeekBucket | null {
  const lower = fileName.toLowerCase()

  if (
    /review|revision|recap|final|exam/.test(lower) ||
    /\u590d\u4e60|\u603b\u590d\u4e60|\u8003\u524d/.test(fileName)
  ) {
    return 'review'
  }

  const weekMatch =
    lower.match(/(?:^|[^a-z0-9])(?:wk|week|w)\s*[-_ ]?(\d{1,2})(?:[^a-z0-9]|$)/) ||
    fileName.match(/(?:\u7b2c)?\s*(\d{1,2})\s*\u5468/)

  if (!weekMatch) return null

  const n = Number(weekMatch[1])
  if (!Number.isFinite(n)) return null
  if (n >= 1 && n <= 3) return 'w1_3'
  if (n >= 4 && n <= 6) return 'w4_6'
  if (n >= 7 && n <= 9) return 'w7_9'
  if (n >= 10) return 'review'
  return null
}

// 闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞?Artifacts tab (闂傚倷绀佸﹢閬嶁€﹂崼銉嬪洭骞庣粵瀣櫔閻庤娲栧ú銊╂儗濞嗘挻鍊甸柨婵嗛閺嬬喐銇勯幘鍐测挃缂? 闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾婚柟鍓х帛閻撳啴鏌涜箛鎿冩Ц濞存粓绠栧娲礃閹绘帒杈呴梺绋款儐閹瑰洭寮诲澶婄濠㈣泛锕ｆ竟鏇㈡⒒娴ｇ鏆遍柛妯荤矒瀹曟垿骞樼紒妯煎帗闂佺绻愰ˇ顖涚妤ｅ啯鈷戦柛鎰絻鐢劑鏌涚€ｎ偅宕岄柡灞界Ч瀹曟寰勬繝浣割棜闂傚倷绀侀崯鍧楀储濠婂牆纾?

export function ArtifactsTab({ secret, coursesVersion }: { secret: string; coursesVersion?: number }) {
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
  const [lectureWeekFilter, setLectureWeekFilter] = useState<'all' | LectureWeekBucket>('all')
  const [fileSearch, setFileSearch] = useState('')
  const [extracting, setExtracting] = useState<number | null>(null)

  // 闂傚倷绀侀幉锛勬暜閹烘嚚娲晝閳ь剟鎮?status 闂傚倷绀侀幖顐﹀疮椤愶附鍋夊┑鍌滎焾闂傤垶鏌涘┑鍕姢缁惧墽鍋撻妵鍕籍閸屾艾浠橀梺璇叉唉瀹曠數妲愰幒妤婃晝闁靛鍠栧▓顓㈡⒑閻戔晛澧查柣鐕傜畱椤洦绻濆顒傚€為梺闈涱煭缁犳垼顣?
  useEffect(() => {
    setDocTypeFilter('all')
    setLectureWeekFilter('all')
  }, [statusFilter])

  useEffect(() => {
    if (docTypeFilter !== 'lecture') setLectureWeekFilter('all')
  }, [docTypeFilter])

  const lectureWeekSections = useMemo(
    () => [
      { key: 'w1_3' as const, zh: '1-3\u5468', en: 'Week 1-3' },
      { key: 'w4_6' as const, zh: '4-6\u5468', en: 'Week 4-6' },
      { key: 'w7_9' as const, zh: '7-9\u5468', en: 'Week 7-9' },
      { key: 'review' as const, zh: '\u590d\u4e60\u5468', en: 'Review Week' },
    ],
    [],
  )

  const lectureWeekCounts = useMemo(() => {
    const counts: Record<LectureWeekBucket, number> = {
      w1_3: 0,
      w4_6: 0,
      w7_9: 0,
      review: 0,
    }
    for (const a of artifacts) {
      if (a.doc_type !== 'lecture') continue
      const bucket = getLectureWeekBucket(a.file_name || '')
      if (bucket) counts[bucket] += 1
    }
    return counts
  }, [artifacts])

  // 闂傚倷绀侀幉鈥愁潖缂佹ɑ鍙忛柟顖ｇ亹瑜版帒鐐婇柍鍝勫€搁悵浼存⒑閸涘﹥瀵欓柍褜鍓熷濠氬Χ婢跺鍘遍梺鍦劋閹尖晛鈻撳▎鎾寸厪?
  useEffect(() => {
    adminReq<Course[]>(secret, '/admin/courses')
      .then(setCourses)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoadingCourses(false))
  }, [secret, coursesVersion])

  // 闂傚倷绀侀幉鈥愁潖缂佹ɑ鍙忛柟顖ｇ亹瑜版帒鐐婃い鎺嶈兌閸斿灚绻濋姀锝嗙【闁挎洩绠撳铏鐎涙ê浠梺鎼炲劀閸愶絾瀵栭梻浣哥枃椤曆囧Χ閹间礁绠氶柛鎰靛枛缁€瀣亜閹哄秷鍏岄柍褜鍓﹂崰鏍箒?
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

  async function extractQuestions(id: number) {
    setExtracting(id)
    try {
      await adminReq(secret, `/admin/artifacts/${id}/extract-questions`, { method: 'POST' })
      showToast(tt('题目提取已启动，后台处理中...', 'Extraction started in background'))
    } catch (e: unknown) { setError(String(e)) }
    finally { setExtracting(null) }
  }

  async function extractAllQuestions() {
    if (!selectedCourse) return
    if (!confirm(tt(
      `一键重新提取「${selectedCourse.code}」所有往年真题？\n\n将清空并重新提取所有 past_exam 文件的题目，后台运行需要几分钟。`,
      `Re-extract all past exam questions for "${selectedCourse.code}"?\n\nThis will clear and re-extract all past_exam files in the background.`
    ))) return
    try {
      const res = await adminReq(secret, `/admin/courses/${selectedCourse.id}/extract-all-questions`, { method: 'POST' }) as { count: number }
      showToast(tt(`已启动 ${res.count} 个文件的题目提取`, `Started extraction for ${res.count} files`))
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
      showToast(tt('\u6807\u7b7e\u5df2\u66f4\u65b0', 'Label updated'))
    } catch (e: unknown) {
      // Distinguish network and server errors for clearer toast
      const msg = String(e)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        showToast(tt('\u5206\u7c7b\u66f4\u65b0\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u6216\u670d\u52a1\u72b6\u6001', 'Category update failed. Check network/server status.'))
      } else {
        showToast(tt('\u5206\u7c7b\u66f4\u65b0\u5931\u8d25: ', 'Category update failed: ') + msg.replace(/^Error:\s*/, '').slice(0, 60))
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
        // Use fetch directly 闂?adminReq forces Content-Type: application/json which breaks FormData
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
        `\u8981\u91cd\u65b0\u7d22\u5f15 "${selectedCourse.code}" \u7684\u6240\u6709\u5df2\u6279\u51c6\u6587\u4ef6\u5417\uff1f\n\n\u8fd9\u4f1a\u91cd\u65b0\u6e05\u6d17\u3001\u5206\u5757\u548c\u5411\u91cf\u5316\u6240\u6709\u6587\u4ef6\uff0c\u53ef\u80fd\u9700\u8981\u51e0\u5206\u949f\u3002`,
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
          `\u5b8c\u6210\uff1a\u5904\u7406 ${res.processed} \u4e2a\u6587\u4ef6\uff0c\u751f\u6210 ${res.chunks} \u4e2a chunk\uff0c\u5931\u8d25 ${res.errors} \u4e2a`,
          `Done: processed ${res.processed} files, generated ${res.chunks} chunks, failed ${res.errors}`,
        ),
      )
    } catch (e: unknown) { setError(String(e)) }
    finally { setReindexing(false) }
  }

  async function reject(id: number) {
    const reason = prompt(tt('\u62d2\u7edd\u539f\u56e0\uff08\u53ef\u7559\u7a7a\uff09', 'Reject reason (optional)')) ?? ''
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
        `\u786e\u8ba4\u5220\u9664 "${fileName}" \u5417\uff1f\n\u6b64\u64cd\u4f5c\u4e0d\u53ef\u6062\u590d\uff0c\u76f8\u5173\u5411\u91cf\u7d22\u5f15\u4e5f\u4f1a\u4e00\u5e76\u5220\u9664\u3002`,
        `Delete "${fileName}"?\nThis is irreversible and related vectors will also be removed.`,
      ),
    )) return
    try {
      await adminReq(secret, `/admin/artifacts/${id}?course_id=${selectedCourse.id}`, { method: 'DELETE' })
      setArtifacts(prev => prev.filter(a => a.id !== id))
      showToast(tt('\u6587\u4ef6\u5df2\u5220\u9664', 'File deleted'))
    } catch (e: unknown) { setError(String(e)) }
  }

  const statusColors: Record<string, string> = {
    pending: '#f97316', approved: '#4ade80', rejected: '#ff7070',
  }

  if (loadingCourses) return <Spinner />

  // 闂備浇宕垫慨鏉懨洪妶鍡樻珷濞寸姴顑呴悡婵嗏攽閸屾碍鍟為柣鎺曨嚙椤法鎹勬笟顖氬壈濡炪倕绻堥崕鐢稿箖瀹勬壋鏋庨煫鍥ㄦ濡偛鈹?
  if (!selectedCourse) {
    return (
      <div className="space-y-4 fade-in-up">
        {error && <ErrorBox msg={error} />}
        <p className="text-sm" style={{ color: '#666' }}>{tt('\u9009\u62e9\u8bfe\u7a0b\u540e\u67e5\u770b\u8be5\u8bfe\u7a0b\u7684\u5f85\u5ba1\u6587\u4ef6', 'Select a course to review its pending files')}</p>
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
          {courses.length === 0 && <Empty text={tt('\u6682\u65e0\u8bfe\u7a0b', 'No courses yet')} />}
        </div>
      </div>
    )
  }

  // 闂傚倷绀侀幖顐﹀磹缁嬫５娲晲閸涱亝鐎婚梺闈涚箚閹冲洭宕戦幘璇茬濠㈣泛锕ら埛澶愭⒑缂佹﹩娈旂痪缁㈠弮楠炲骞橀鐓庤€垮┑掳鍊撻懗鍫曘€?
  return (
    <div className="space-y-4 fade-in-up">
      {/* Toast 闂備礁鎼ˇ閬嶅磻閻斿搫鍨濇い鏍ㄧ缚娴滅懓霉閿濆牊顏犻柣?*/}
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

      {/* 闂傚倸鍊搁崐鎼佹偋閸曨垰鍨傞柛锔诲幐閸嬫捇宕归顐ゅ姺婵?+ 缂傚倸鍊烽悞锔剧矙閹烘鍎庢い鏍仜閻?*/}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setSelectedCourse(null); setArtifacts([]) }}
          className="flex items-center gap-1.5 text-sm transition-colors duration-150"
          style={{ color: '#555' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
          <ChevronLeft size={14} /> {tt('\u6240\u6709\u8bfe\u7a0b', 'All Courses')}
        </button>
        <span style={{ color: '#333' }}>/</span>
        <span className="text-sm font-semibold" style={{ color: '#FFD700' }}>
          {selectedCourse.code} - {selectedCourse.name}
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
              {s === 'pending' ? tt('\u5f85\u5ba1\u6838', 'Pending') : s === 'approved' ? tt('\u5df2\u6279\u51c6', 'Approved') : tt('\u5df2\u62d2\u7edd', 'Rejected')}
            </button>
          ))}
          <button onClick={() => loadFiles(selectedCourse.id, statusFilter)}
            className="p-1.5 rounded-lg transition-colors duration-150"
            style={{ color: '#555' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            title={tt('\u5237\u65b0\u5217\u8868', 'Refresh list')}>
            <RefreshCw size={14} />
          </button>
          <button
            onClick={reindex}
            disabled={reindexing}
            title={tt('\u91cd\u65b0\u7d22\u5f15\u8be5\u8bfe\u7a0b\uff08\u6e05\u6d17 + \u5206\u5757 + \u5411\u91cf\u5316\u6240\u6709\u5df2\u6279\u51c6\u6587\u4ef6\uff09', 'Reindex this course (clean + chunk + vectorize all approved files)')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
            style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
            onMouseEnter={e => { if (!reindexing) (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.18)' }}
            onMouseLeave={e => { if (!reindexing) (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.1)' }}>
            {reindexing ? <Loader2 size={12} className="animate-spin" /> : <DatabaseZap size={12} />}
            {reindexing ? tt('\u7d22\u5f15\u4e2d...', 'Reindexing...') : tt('\u91cd\u65b0\u7d22\u5f15', 'Reindex')}
          </button>
          <button
            onClick={extractAllQuestions}
            title={tt('一键重新提取所有往年真题', 'Re-extract all past exam questions')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
            style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.18)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.1)' }}>
            <FileSearch size={12} />
            {tt('更新真题', 'Update Questions')}
          </button>
        </div>
      </div>

      {/* 缂傚倸鍊烽懗鑸靛垔鐎靛憡顫曢柡鍥ュ灩缁犳牕鈹戦悩鍙夋悙鐎瑰憡绻冩穱濠囶敍濮橆剚鍊紓浣鸿檸閸ㄥ爼寮婚悢鐓庣畳闁圭儤鍨垫慨宥囩磽娴ｈ娈旈柛濠傛贡閳ь剟娼ч妶鎼佸箖閳哄懎绠甸柟鐑橆殕椤斿啴姊绘担鐟邦嚋缂佸鍨块幃褔宕卞☉妯哄亶闂侀潧鐗嗗ú鐘诲磻閹捐绀傚璺猴工閳峰姊虹紒姗嗘畷濠电偛锕顐㈩吋閸涱垱娈曢梺閫炲苯澧撮柟顕€娼ч埥澶愬閻樻鏀ㄩ梻浣规た閸ｎ喖危濮濈湕oved闂?*/}
      <div className="p-4 rounded-2xl space-y-3" style={cardStyle}>
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#FFD700' }}>
          <Upload size={12} /> {tt('\u7ba1\u7406\u5458\u76f4\u4f20\uff08\u8df3\u8fc7\u5ba1\u6838\uff0c\u7acb\u5373\u7d22\u5f15\uff09', 'Admin direct upload (skip review, index now)')}
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
            {isUploading ? tt('\u4e0a\u4f20\u4e2d...', 'Uploading...') : tt('\u9009\u62e9\u6587\u4ef6\u4e0a\u4f20\uff08\u53ef\u591a\u9009\uff09', 'Choose files to upload (multi-select)')}
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.py,.txt,.ipynb" multiple className="hidden"
            onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length > 0) startUpload(files); e.target.value = '' }} />
        </div>
        {/* 婵犵數鍋為崹鍫曞箰閹间焦鏅濋柨婵嗘处椤洟鏌涢锝嗙闁抽攱鎹囬弻锝夊棘閸喗些闂佽绻戦悷鈺侇嚕閸洖鐓涢柛灞惧濡插牓鏌?*/}
        {uploadQueue.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#666' }}>
                {tt('\u4e0a\u4f20\u8fdb\u5ea6\uff1a', 'Upload progress:')}
                {uploadQueue.filter(q => q.status === 'done').length}/{uploadQueue.length}
                {' '}
                {tt('\u5b8c\u6210', 'done')}
              </span>
              {uploadQueue.every(q => q.status === 'done' || q.status === 'error') && (
                <button onClick={() => setUploadQueue([])} className="text-xs px-2 py-0.5 rounded"
                  style={{ color: '#555' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                  {tt('\u6e05\u9664\u8bb0\u5f55', 'Clear')}
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

      {/* 闂佽楠稿﹢閬嶁€﹂崼婵愬殨闁煎摜鏁搁悵鍫曟煙閻戞﹩娈旂紒鈧崟顖涚厱闁斥晛鍙愰幋位鍥樄闁哄矉绻濆畷鐔碱敃閳垛晜瀵栭梻?doc_type 濠电姷顣藉Σ鍛村垂閸忚偐顩叉繝濠傜墕缁犳牗绻濇繝鍌涘櫝闁稿鎸搁埥澶娾枎韫囨搩娼欑紓鍌欐祰椤曆囧疮椤愶腹鈧?*/}
      {statusFilter === 'approved' && (
        <div className="flex gap-2 flex-wrap">
          {([{ value: 'all', label: tt('\u5168\u90e8', 'All') }, ...docTypeOptions] as { value: DocType | 'all'; label: string }[]).map(o => {
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

      {statusFilter === 'approved' && docTypeFilter === 'lecture' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: '#89a' }}>
              {tt('\u8bb2\u4e49\u5206\u5468\u7edf\u8ba1', 'Lecture Weekly Buckets')}
            </p>
            <button
              onClick={() => setLectureWeekFilter('all')}
              className="px-2.5 py-0.5 rounded-full text-xs transition-all duration-150"
              style={{
                background: lectureWeekFilter === 'all' ? 'rgba(255,215,0,0.18)' : 'rgba(255,255,255,0.04)',
                color: lectureWeekFilter === 'all' ? '#FFD700' : '#666',
                border: `1px solid ${lectureWeekFilter === 'all' ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {tt('\u5168\u90e8\u8bb2\u4e49', 'All Lecture Files')}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {lectureWeekSections.map(section => {
              const active = lectureWeekFilter === section.key
              return (
                <button
                  key={section.key}
                  onClick={() => setLectureWeekFilter(section.key)}
                  className="rounded-xl px-3 py-2 text-left transition-all duration-150"
                  style={{
                    background: active ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? 'rgba(255,215,0,0.38)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <div className="text-xs" style={{ color: active ? '#FFD700' : '#8aa' }}>
                    {lang === 'zh' ? section.zh : section.en}
                  </div>
                  <div className="mt-1 text-base font-semibold" style={{ color: active ? '#FFD700' : '#d5deff' }}>
                    {lectureWeekCounts[section.key]}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* 文件名搜索框 */}
      {!loadingFiles && artifacts.length > 0 && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            value={fileSearch}
            onChange={e => setFileSearch(e.target.value)}
            placeholder={tt('搜索文件名…', 'Search filename…')}
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#ccc' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,215,0,0.4)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
          />
        </div>
      )}
      {loadingFiles ? <Spinner /> : (() => {
        let displayedArtifacts =
          statusFilter === 'approved' && docTypeFilter !== 'all'
            ? artifacts.filter(a => a.doc_type === docTypeFilter)
            : artifacts

        if (statusFilter === 'approved' && docTypeFilter === 'lecture' && lectureWeekFilter !== 'all') {
          displayedArtifacts = displayedArtifacts.filter(
            a => getLectureWeekBucket(a.file_name || '') === lectureWeekFilter,
          )
        }

        if (fileSearch.trim()) {
          const q = fileSearch.toLowerCase()
          displayedArtifacts = displayedArtifacts.filter(a => (a.file_name || '').toLowerCase().includes(q))
        }

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
              <span className="text-lg">{a.file_type === 'pdf' ? '\uD83D\uDCC4' : '\uD83D\uDD17'}</span>
              <div className="flex-1 min-w-0">
                {/* 闂傚倷绀侀幖顐﹀磹缁嬫５娲晲閸涱亝鐎婚梺闈涚箞閸婃洜鎲撮敂閿亾楠炲灝鍔氱紒缁樺笧缁絽螖閸涱喚鍘?storage_url 闂傚倷绀侀幖顐﹀疮閸愭祴鏋栨繛鎴炲殠娴滅懓顭跨捄渚剳闁崇粯妫冮弻娑樷攽閸℃浠奸柣鐘辩劍閻擄繝寮婚敐澶婄疀妞ゆ棁妫勫▓宀勬⒑閹肩偛鈧倝宕板Δ鍛櫖闁圭増婢樼粈瀣亜閺囩偞鍣虹紓宥呯焸濮婄粯鎷呯粙搴撴寖闂佺顑嗛幐楣冨极?*/}
                {a.storage_url ? (
                  <a
                    href={a.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm truncate block transition-opacity hover:opacity-100"
                    style={{ color: '#60a5fa', opacity: 0.9, textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    title={tt('\u5728\u65b0\u6807\u7b7e\u9875\u9884\u89c8\u6587\u4ef6', 'Preview file in new tab')}>
                    {a.file_name}
                  </a>
                ) : (
                  <p className="text-sm text-white truncate">{a.file_name}</p>
                )}
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                  {new Date(a.created_at).toLocaleString(locale)}
                  {a.reject_reason && <span style={{ color: '#ff8080' }}> - {a.reject_reason}</span>}
                </p>
              </div>
              {/* doc_type 闂傚倷绀侀幉锟犲礉閺囥垹绠犻柟鎯ь嚟椤╃兘鏌涢銈呮灁闁崇粯妫冮幃妤呮晲鎼粹€茬盎濡炪倕瀛╅悷鈺呭蓟閵娿儮妲堟俊顖滃帶椤ｆ椽姊洪崨濠傜厐缂佺粯绻堥悰顔碱吋婢跺浠梺鍝勵槹鐎笛囨偟椤栫偞鈷戦柛婵嗗閺嗐垺绻涙径瀣灱闁靛洦鍔欏畷锝嗗緞鐏炲憡鏁垫俊鐐€栧Λ浣规叏閵堝姹叉い鎾卞灪閻撱儲绻涢幋鐐垫噮闁宠棄顦甸弻娑樷枎閹存繀澹曠紓浣稿€圭敮鈥愁嚕娴犲鏁冮柍璺哄皡缁犳捇寮婚悢纰辨晞闁圭瀵掑Ο鍌滅磽娓氬洤鏋涢梺甯到椤曪絾瀵奸弶鎴狀槶閻熸粌顑嗙粋鎺戔槈閵忥紕鍙?*/}
              {a.status === 'rejected' ? (
                <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                  <span className="badge-danger">{tt('\u5df2\u5931\u6548', 'Invalid')}</span>
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
                  {a.doc_type === 'lecture' && (
                    <select
                      value={a.week ?? ''}
                      onChange={async e => {
                        const val = e.target.value ? Number(e.target.value) : null
                        await adminReq(secret, `/admin/artifacts/${a.id}/week`, {
                          method: 'PATCH',
                          body: JSON.stringify({ week: val }),
                        })
                        setArtifacts(prev => prev.map(x => x.id === a.id ? { ...x, week: val } : x))
                      }}
                      className="text-xs rounded px-1 py-0.5 border"
                      style={{ background: 'rgba(255,255,255,0.04)', color: '#CCC', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <option value="">Week -</option>
                      {[1,2,3,4,5,6,7,8,9,10].map(w => (
                        <option key={w} value={w}>Week {w}</option>
                      ))}
                    </select>
                  )}
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
              {/* 闂傚倷鑳剁划顖炩€﹂崼銉ユ槬闁哄稁鍘奸悞?badge 闂?pill 闂傚倷绀侀幖顐ょ矓閹绢喖搴婇柤纰卞墯椤?*/}
              <span className="text-xs px-2.5 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{
                  background: `${statusColors[a.status]}18`,
                  color: statusColors[a.status],
                  border: `1px solid ${statusColors[a.status]}40`,
                }}>
                {a.status === 'pending' ? tt('\u5f85\u5ba1', 'Pending') : a.status === 'approved' ? tt('\u5df2\u6279\u51c6', 'Approved') : tt('\u5df2\u62d2\u7edd', 'Rejected')}
              </span>
              {statusFilter === 'pending' && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => approve(a.id)}
                    className="p-1.5 rounded-lg transition-colors duration-150"
                    title={tt('\u6279\u51c6', 'Approve')}
                    style={{ color: '#4ade80' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(74,222,128,0.12)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <CheckCircle size={16} />
                  </button>
                  <button onClick={() => reject(a.id)}
                    className="p-1.5 rounded-lg transition-colors duration-150"
                    title={tt('\u62d2\u7edd', 'Reject')}
                    style={{ color: '#ff7070' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,112,112,0.12)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <XCircle size={16} />
                  </button>
                </div>
              )}
              {a.status === 'approved' && a.doc_type === 'past_exam' && (
                <button
                  onClick={() => extractQuestions(a.id)}
                  disabled={extracting === a.id}
                  className="p-1.5 rounded-lg transition-colors duration-150 flex-shrink-0"
                  title={tt('重新提取真题', 'Re-extract questions')}
                  style={{ color: '#f97316' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.12)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {extracting === a.id ? <Loader2 size={16} className="animate-spin" /> : <FileSearch size={16} />}
                </button>
              )}
              <DeleteBtn onClick={() => deleteArtifact(a.id, a.file_name)} />
            </div>
          ))}
          {displayedArtifacts.length === 0 && (
            <Empty text={
              fileSearch.trim()
                ? tt(`未找到匹配「${fileSearch}」的文件`, `No files match "${fileSearch}"`)
                : statusFilter === 'approved' && docTypeFilter === 'lecture' && lectureWeekFilter !== 'all'
                ? tt(
                  `${selectedCourse.code} \u5728\u8be5\u5206\u5468\u6682\u65e0\u8bb2\u4e49`,
                  `${selectedCourse.code} has no lecture files in this week bucket`,
                )
                : statusFilter === 'approved' && docTypeFilter !== 'all'
                ? tt(
                  `${selectedCourse.code} \u6682\u65e0\u201c${getDocTypeLabel(docTypeFilter as DocType, lang)}\u201d\u7c7b\u6587\u4ef6`,
                  `${selectedCourse.code} has no "${getDocTypeLabel(docTypeFilter as DocType, lang)}" files`,
                )
                : tt(
                  `${selectedCourse.code} \u6682\u65e0${statusFilter === 'pending' ? '\u5f85\u5ba1\u6838' : statusFilter === 'approved' ? '\u5df2\u6279\u51c6' : '\u5df2\u62d2\u7edd'}\u6587\u4ef6`,
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

