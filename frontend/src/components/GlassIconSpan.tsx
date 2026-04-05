'use client'

/**
 * GlassIconSpan — 侧边栏图标容器（纯展示，hover 由父级 HoverLink 控制）
 */
export default function GlassIconSpan({
  children,
  tint,
  bg,
  size = 'md',
  className = '',
}: {
  children: React.ReactNode
  tint: string
  bg: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const dim = size === 'sm' ? { w: 28, h: 28, r: 10 } : { w: 32, h: 32, r: 12 }

  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center ${className}`}
      style={{
        width: dim.w,
        height: dim.h,
        borderRadius: dim.r,
        color: tint,
        background: bg,
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {children}
    </span>
  )
}
