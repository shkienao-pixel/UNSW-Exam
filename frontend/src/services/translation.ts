import { api } from '@/lib/api'

export async function translateTexts(
  courseId: string,
  texts: string[],
  targetLang: 'en' | 'zh' = 'zh',
): Promise<string[]> {
  const res = await api.generate.translate(courseId, texts, targetLang)
  return res.translations
}
