import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/lib/auth-context'
import { LangProvider } from '@/lib/i18n'
import './globals.css'

export const metadata: Metadata = {
  title: 'Exam Master ✦',
  description: 'AI-powered exam preparation platform for university students',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Exam Master',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#FFD700',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',  // enables safe-area-inset on iOS notch devices
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ExamMaster" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body>
        {/* Global grain overlay — 微噪点，仅桌面端，z-index 9999 */}
        <div aria-hidden className="grain-overlay" />
        <AuthProvider>
          <LangProvider>{children}</LangProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
