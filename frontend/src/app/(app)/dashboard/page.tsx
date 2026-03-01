'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Course } from '@/lib/types'
import { BookOpen, Loader2 } from 'lucide-react'

export default function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.courses.list()
      .then(setCourses)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">课程列表</h1>
        <p className="text-sm mt-1" style={{ color: '#666' }}>选择课程，上传资料并生成 AI 复习内容</p>
      </div>

      {/* Course grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={28} />
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen size={48} className="mx-auto mb-4" style={{ color: '#333' }} />
          <p className="text-lg" style={{ color: '#555' }}>暂无课程</p>
          <p className="text-sm mt-1" style={{ color: '#444' }}>课程由管理员统一管理，请联系管理员添加</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(c => (
            <Link key={c.id} href={`/courses/${c.id}`}>
              <div className="glass p-5 cursor-pointer transition-all group"
                style={{ minHeight: '140px' }}>
                <div className="flex items-start justify-between">
                  <span className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>
                    {c.code}
                  </span>
                </div>
                <h3 className="text-white font-semibold mt-3 text-base">{c.name}</h3>
                <p className="text-xs mt-2" style={{ color: '#555' }}>
                  创建于 {new Date(c.created_at).toLocaleDateString('zh-CN')}
                </p>
                <div className="mt-4 flex items-center gap-1 text-xs" style={{ color: '#FFD700' }}>
                  <span>进入课程</span>
                  <span>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
