'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import ExamMasterLogo from './ExamMasterLogo'
import { Shield } from 'lucide-react'

export default function GlassNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <motion.nav
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.06 }}
      className="flex items-center justify-between px-6 py-3.5"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        background: scrolled
          ? 'rgba(6,6,13,0.86)'
          : 'rgba(6,6,13,0.38)',
        borderBottom: `1px solid ${scrolled ? 'var(--accent-border)' : 'rgba(255,212,0,0.06)'}`,
        boxShadow: scrolled
          ? '0 1px 0 rgba(255,255,255,0.03), 0 8px 32px rgba(0,0,0,0.28)'
          : 'none',
        transition: 'background 0.45s ease, border-color 0.45s ease, box-shadow 0.45s ease',
      }}
    >
      <ExamMasterLogo height={26} />

      <div className="flex items-center gap-2.5">
        <Link
          href="/admin"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
          style={{ color: '#44445a', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#77778a'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#44445a'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)' }}
        >
          <Shield size={11} />
          管理后台
        </Link>

        <Link
          href="/login"
          className="px-4 py-1.5 rounded-lg text-sm transition-all duration-200"
          style={{ color: '#66667a', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#99999e'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#66667a'; e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
        >
          登录
        </Link>

        <Link
          href="/register"
          className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200"
          style={{
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,212,0,0.18)'
            e.currentTarget.style.borderColor = 'rgba(255,212,0,0.30)'
            e.currentTarget.style.boxShadow = `0 0 16px var(--accent-glow)`
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--accent-soft)'
            e.currentTarget.style.borderColor = 'var(--accent-border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          注册
        </Link>
      </div>
    </motion.nav>
  )
}
