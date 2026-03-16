'use client'

import { useLang } from '@/lib/i18n'
import { useTranslation } from '@/hooks/useTranslation'
import { Languages, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// ── Per-question translation toggle ──────────────────────────────────────────

interface TranslatablePanelProps {
  texts: string[]   // [question, opt0, opt1, opt2, opt3, explanation?]
  courseId: string
}

export function TranslatablePanel({ texts, courseId }: TranslatablePanelProps) {
  const { lang } = useLang()
  // Bug 6 fix: 题目来自英文课程材料，中文界面应翻译 EN→ZH，而非 ZH→EN
  const targetLang: 'en' | 'zh' = lang === 'zh' ? 'zh' : 'zh'
  const { visible, translated, loading, error, toggle } = useTranslation(courseId, targetLang)

  return (
    <div>
      <button onClick={() => toggle(texts)}
        className="flex items-center gap-1.5 text-xs mt-2 transition-opacity hover:opacity-100"
        style={{ color: '#555', opacity: 0.8 }}>
        <Languages size={12} />
        {visible
          ? (lang === 'zh' ? '隐藏中文翻译' : 'Hide translation')
          : (lang === 'zh' ? '显示中文翻译' : 'Show Chinese translation')
        }
      </button>

      {visible && (
        <div className="mt-2 px-3 py-2.5 rounded-xl text-xs space-y-2"
          style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
          {loading && (
            <span className="flex items-center gap-1.5" style={{ color: '#666' }}>
              <Loader2 size={11} className="animate-spin" />
              {lang === 'zh' ? '翻译中...' : 'Translating...'}
            </span>
          )}
          {error && <span style={{ color: '#FF6666' }}>{lang === 'zh' ? '翻译失败' : 'Translation failed'}</span>}
          {translated && !loading && translated.map((t, i) => (
            <p key={i} style={{ color: '#7EB8F5', lineHeight: '1.5' }}>{t}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Full-content translation panel (for summary / outline) ───────────────────

export function ContentTranslationPanel({ content, courseId }: { content: string; courseId: string }) {
  const { lang } = useLang()
  const { visible: show, translated: translatedLines, loading, error, toggle } = useTranslation(courseId, 'en')
  const translated = translatedLines ? translatedLines.join('\n\n') : null

  function handleToggle() {
    const paragraphs = content.split('\n\n').filter(p => p.trim())
    toggle(paragraphs)
  }

  return (
    <div className="space-y-4">
      <div className="glass p-6 rounded-xl prose prose-invert max-w-none text-sm"
        style={{ color: '#CCC', lineHeight: '1.75' }}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

      <button onClick={handleToggle}
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100"
        style={{ color: '#555', opacity: 0.8 }}>
        <Languages size={13} />
        {show
          ? (lang === 'zh' ? '收起英文翻译' : 'Hide translation')
          : (lang === 'zh' ? '展开英文翻译' : 'Show English translation')
        }
        {loading && <Loader2 size={11} className="animate-spin ml-1" />}
      </button>

      {show && (
        <div className="glass p-6 rounded-xl prose prose-invert max-w-none text-sm"
          style={{ color: '#8BB8D4', lineHeight: '1.75', border: '1px solid rgba(96,165,250,0.12)' }}>
          {loading
            ? <div className="flex items-center gap-2" style={{ color: '#666' }}><Loader2 size={14} className="animate-spin" /> 翻译中...</div>
            : error
            ? <p style={{ color: '#FF6666' }}>翻译失败，请重试</p>
            : translated
            ? <ReactMarkdown>{translated}</ReactMarkdown>
            : null}
        </div>
      )}
    </div>
  )
}
