// Stub for prosemirror utils
export function htmlToDoc(_html: string): unknown { return null }
export function docToHtml(_doc: unknown): string { return '' }
export function textToDoc(_text: string): unknown { return { type: 'doc', content: [] } }
export function docToText(_doc: unknown): string { return '' }
export function getTextContent(_doc: unknown): string { return '' }
export interface TextAttrs {
  bold?: boolean; italic?: boolean; underline?: boolean
  strikethrough?: boolean; code?: boolean
  color?: string; highlight?: string
  link?: string; fontSize?: number
  fontFamily?: string; align?: string
}
export const defaultRichTextAttrs: TextAttrs = {}
