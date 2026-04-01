'use client'

import { useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'

function token() {
  return typeof window !== 'undefined' ? (localStorage.getItem('access_token') || '') : ''
}

interface Props {
  initialContent: unknown[]
  onChange: (blocks: unknown[]) => void
}

export default function BlockNoteEditor({ initialContent, onChange }: Props) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? (initialContent as any) : undefined,
    uploadFile: async (file: File) => {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch(`${API}/notes/block/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: form,
      })
      if (!res.ok) throw new Error('图片上传失败')
      const data = await res.json()
      return data.url as string
    },
  } as any)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyEditor = editor as any
  return (
    <BlockNoteView
      editor={anyEditor}
      theme="dark"
      onChange={() => onChangeRef.current(editor.document)}
      style={{ minHeight: '100%' }}
    />
  )
}
