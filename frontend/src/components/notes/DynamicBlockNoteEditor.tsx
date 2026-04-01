'use client'

// Must be dynamically imported with ssr:false — BlockNote uses browser APIs
import dynamic from 'next/dynamic'

const BlockNoteEditor = dynamic(() => import('./BlockNoteEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full" style={{ color: '#444' }}>
      <span className="text-xs">加载编辑器…</span>
    </div>
  ),
})

export default BlockNoteEditor
