'use client'

import { useState, useCallback } from 'react'
import { translateTexts } from '@/services/translation'

export function useTranslation(courseId: string, targetLang: 'en' | 'zh' = 'zh') {
  const [visible, setVisible]       = useState(false)
  const [translated, setTranslated] = useState<string[] | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(false)

  const toggle = useCallback(async (texts: string[]) => {
    if (visible) { setVisible(false); return }
    setVisible(true)
    if (translated) return   // 已翻译过，直接复用缓存
    setLoading(true)
    setError(false)
    try {
      setTranslated(await translateTexts(courseId, texts, targetLang))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [courseId, targetLang, visible, translated])

  return { visible, translated, loading, error, toggle }
}
