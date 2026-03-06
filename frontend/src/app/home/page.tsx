'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const EXPLORE_BUTTON_DELAY = 1200

export default function HomePage() {
  const { loading } = useAuth()
  const router = useRouter()
  const [btnReady, setBtnReady] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setBtnReady(true), EXPLORE_BUTTON_DELAY)
    return () => window.clearTimeout(timer)
  }, [])

  function handleExplore() {
    sessionStorage.setItem('intro_visited', '1')
    router.push('/')
  }

  if (loading) {
    return (
      <div
        style={{
          background: '#000',
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Loader2 className="animate-spin" style={{ color: '#fff' }} size={28} />
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
      <iframe
        src="/intro-anim.html"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        title="UNSW Exam Master"
      />

      <style>{`
        @keyframes btn-fade-in {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .explore-btn {
          position: fixed;
          right: 52px;
          bottom: 48px;
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 4px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.56);
          font-size: 1rem;
          font-weight: 500;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: color 0.25s ease;
          animation: btn-fade-in 0.9s ease forwards;
        }

        .explore-btn:hover {
          color: rgba(255, 255, 255, 1);
        }

        .explore-btn:hover .explore-arrow {
          transform: translateX(3px);
        }

        .explore-arrow {
          transition: transform 0.3s ease;
        }
      `}</style>

      {btnReady ? (
        <button className="explore-btn" onClick={handleExplore}>
          <ArrowRight size={18} className="explore-arrow" />
          <span>开始探索</span>
        </button>
      ) : null}
    </div>
  )
}
