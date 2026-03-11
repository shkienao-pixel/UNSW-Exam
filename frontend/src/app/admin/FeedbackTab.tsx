'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, CheckCircle, RefreshCw, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useLang } from '@/lib/i18n'
import {
  UiLang, tx, localeByLang, adminReq,
  Spinner, Empty, ErrorBox,
  cardStyle,
} from './_shared'

type FeedbackStatus = 'pending' | 'in_progress' | 'resolved' | 'adopted'
interface FeedbackItem { id: string; user_id: string | null; content: string; page_url: string; status: FeedbackStatus; created_at: string }

const STATUS_LABEL_BY_LANG: Record<UiLang, Record<FeedbackStatus, string>> = {
  zh: { pending: '待处理', in_progress: '处理中', resolved: '已解决', adopted: '已采纳' },
  en: { pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved', adopted: 'Adopted' },
}
const STATUS_COLOR: Record<FeedbackStatus, string> = { pending: '#f97316', in_progress: '#60a5fa', resolved: '#4ade80', adopted: '#FFD700' }
const STATUS_NEXT:  Record<FeedbackStatus, FeedbackStatus | null> = { pending: 'in_progress', in_progress: 'resolved', resolved: null, adopted: null }

interface AiSummaryResult { summary: string; feedback_count: number; analyzed_at: string }

// ── Feedback Tab ───────────────────────────────────────────────────────────────

export function FeedbackTab({ secret }: { secret: string }) {
  const { lang } = useLang()
  const tt = (zh: string, en: string) => tx(lang, zh, en)
  const locale = localeByLang(lang)
  const statusLabel = (status: FeedbackStatus) => STATUS_LABEL_BY_LANG[lang][status]
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [filter, setFilter] = useState<FeedbackStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiSummaryResult | null>(null)
  const [aiError, setAiError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const qs = filter !== 'all' ? `?status=${filter}` : ''
      setItems(await adminReq<FeedbackItem[]>(secret, `/admin/feedback${qs}`))
    } catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [secret, filter])

  useEffect(() => { load() }, [load])

  async function runAiSummary() {
    setAiLoading(true); setAiError(''); setAiResult(null)
    try {
      const res = await adminReq<AiSummaryResult>(secret, '/admin/feedback/ai-summary')
      setAiResult(res)
    } catch (e: unknown) {
      setAiError(String(e))
    } finally {
      setAiLoading(false)
    }
  }

  async function advance(item: FeedbackItem) {
    const next = STATUS_NEXT[item.status]
    if (!next) return
    try {
      await adminReq(secret, `/admin/feedback/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: next }),
      })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i))
    } catch (e: unknown) { setError(String(e)) }
  }

  async function adopt(item: FeedbackItem) {
    try {
      await adminReq(secret, `/admin/feedback/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'adopted' }),
      })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'adopted' } : i))
    } catch (e: unknown) { setError(String(e)) }
  }

  const displayed = filter === 'all' ? items : items.filter(i => i.status === filter)

  return (
    <div className="space-y-4 fade-in-up">
      {error && <ErrorBox msg={error} />}

      {/* AI 洞察按钮 */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={runAiSummary}
          disabled={aiLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.18))',
            border: '1px solid rgba(139,92,246,0.4)',
            color: '#c4b5fd',
          }}
          onMouseEnter={e => { if (!aiLoading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(139,92,246,0.28), rgba(59,130,246,0.28))' }}
          onMouseLeave={e => { if (!aiLoading) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.18))' }}
        >
          {aiLoading
            ? <><Loader2 size={14} className="animate-spin" />{tt('正在分析…', 'Analyzing...')}</>
            : <><Sparkles size={14} />{tt('✨ AI 生成今日洞察 (DeepSeek 分析)', '✨ Generate today insights (DeepSeek)')}</>
          }
        </button>
        {aiResult && (
          <span className="text-xs" style={{ color: '#555' }}>
            {tt('分析了', 'Analyzed')} {aiResult.feedback_count} {tt('条反馈', 'feedbacks')} · {new Date(aiResult.analyzed_at).toLocaleString(locale)}
          </span>
        )}
      </div>

      {/* AI 错误提示 */}
      {aiError && <ErrorBox msg={`${tt('AI 分析失败：', 'AI analysis failed: ')}${aiError}`} />}

      {/* AI 结果卡片 */}
      {aiResult && (
        <div className="p-5 rounded-2xl space-y-1" style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.08))',
          border: '1px solid rgba(139,92,246,0.25)',
        }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#c4b5fd' }}>
              <Sparkles size={14} /> {tt('DeepSeek 今日分析报告', 'DeepSeek Daily Report')}
            </h3>
            <button onClick={() => setAiResult(null)}
              className="text-xs px-2 py-0.5 rounded-lg transition-colors duration-150"
              style={{ color: '#555', background: 'rgba(255,255,255,0.05)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
              {tt('收起', 'Collapse')}
            </button>
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed"
            style={{ color: '#ccc' }}>
            <ReactMarkdown>{aiResult.summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 筛选 + 刷新 */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'in_progress', 'resolved', 'adopted'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
            style={{
              background: filter === s
                ? s === 'all' ? 'rgba(255,215,0,0.15)' : `${STATUS_COLOR[s as FeedbackStatus]}20`
                : 'rgba(255,255,255,0.04)',
              color: filter === s
                ? s === 'all' ? '#FFD700' : STATUS_COLOR[s as FeedbackStatus]
                : '#555',
              border: `1px solid ${filter === s
                ? s === 'all' ? 'rgba(255,215,0,0.3)' : `${STATUS_COLOR[s as FeedbackStatus]}50`
                : 'rgba(255,255,255,0.07)'}`,
            }}>
            {s === 'all' ? `${tt('全部', 'All')} (${items.length})` : `${statusLabel(s as FeedbackStatus)} (${items.filter(i => i.status === s).length})`}
          </button>
        ))}
        <button onClick={load}
          className="ml-auto p-1.5 rounded-lg transition-colors duration-150"
          style={{ color: '#555' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#FFD700')}
          onMouseLeave={e => (e.currentTarget.style.color = '#555')}
          title={tt('刷新', 'Refresh')}>
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-3">
          {displayed.map(item => (
            <div key={item.id} className="p-4 rounded-2xl space-y-2 transition-all duration-200" style={cardStyle}>
              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{
                  background: `${STATUS_COLOR[item.status]}18`,
                  color: STATUS_COLOR[item.status],
                  border: `1px solid ${STATUS_COLOR[item.status]}40`,
                }}>
                  {statusLabel(item.status)}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-lg truncate max-w-xs"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#666', border: '1px solid rgba(255,255,255,0.06)' }}>
                  📍 {item.page_url}
                </span>
                <span className="text-xs ml-auto" style={{ color: '#444' }}>
                  {new Date(item.created_at).toLocaleString(locale)}
                </span>
              </div>

              {/* Content */}
              <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{item.content}</p>

              {/* Action */}
              {(STATUS_NEXT[item.status] || item.status === 'in_progress') && (
                <div className="flex justify-end gap-2">
                  {STATUS_NEXT[item.status] && (
                    <button onClick={() => advance(item)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#aaa' }}>
                      <CheckCircle size={12} />
                      {tt('标记为「', 'Mark as "')}
                      {statusLabel(STATUS_NEXT[item.status]!)}
                      {tt('」', '"')}
                    </button>
                  )}
                  {item.status === 'in_progress' && (
                    <button onClick={() => adopt(item)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150"
                      style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.18)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.1)' }}>
                      {tt('✓ 采纳反馈 (+1 积分)', '✓ Adopt feedback (+1 credit)')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {displayed.length === 0 && (
            <Empty
              text={
                filter === 'all'
                  ? tt('暂无反馈', 'No feedback yet')
                  : tt(`暂无${statusLabel(filter as FeedbackStatus)}反馈`, `No ${statusLabel(filter as FeedbackStatus)} feedback`)
              }
            />
          )}
        </div>
      )}
    </div>
  )
}
