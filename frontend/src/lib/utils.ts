import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { SummarySchemaV1 } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Bilingual helpers ─────────────────────────────────────────────────────────

export type BiMode = 'full' | 'zh' | 'en'

export function biText(text: string, mode: BiMode): string {
  if (mode === 'full') return text
  const parts = text.split(' / ')
  if (parts.length < 2) return text
  return mode === 'zh' ? parts[0].trim() : parts.slice(1).join(' / ').trim()
}

// ── TOC extraction ────────────────────────────────────────────────────────────

export type TocItem = { id: string; title: string; level: number }

/** 从 Markdown 文本提取 TOC */
export function extractToc(markdown: string): TocItem[] {
  const toc: TocItem[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) {
      const level = m[1].length
      const title = m[2].trim()
      const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
      toc.push({ id, title, level })
    }
  }
  return toc
}

/** 从 HTML 文本提取 TOC */
export function extractTocFromHtml(html: string): TocItem[] {
  const toc: TocItem[] = []
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h[1-3]>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const level = parseInt(m[1], 10)
    const title = m[2].replace(/<[^>]+>/g, '').trim()
    const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
    toc.push({ id, title, level })
  }
  return toc
}

// ── Content JSON parsing ──────────────────────────────────────────────────────

export type ContentFormat = 'markdown' | 'html' | 'json' | 'summary_v1'

export interface ParsedContent {
  format: ContentFormat
  content: string
  schema: SummarySchemaV1 | null
  rawJson: unknown
}

/** 解析 content_json，返回统一的 { format, content, schema, rawJson } */
export function parseContentJson(json: Record<string, unknown>): ParsedContent {
  if (json.format === 'summary_v1') {
    return { format: 'summary_v1', content: '', schema: json as unknown as SummarySchemaV1, rawJson: null }
  }
  if (json.format && json.content) {
    const fmt = json.format as ContentFormat
    if (fmt === 'json') {
      let parsed: unknown = null
      try { parsed = JSON.parse(json.content as string) } catch {}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { format: 'json', content: json.content as string, schema: null, rawJson: parsed }
      }
    }
    return { format: fmt, content: json.content as string, schema: null, rawJson: null }
  }
  if (json.markdown) return { format: 'markdown', content: json.markdown as string, schema: null, rawJson: null }
  if (json.weeks || json.sections || json.chapters || json.modules || json.topics) {
    return { format: 'json', content: '', schema: null, rawJson: json }
  }
  return { format: 'markdown', content: '', schema: null, rawJson: null }
}
