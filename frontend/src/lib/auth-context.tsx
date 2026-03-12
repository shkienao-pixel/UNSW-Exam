'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { api } from './api'
import type { User } from './types'

type Role = 'user' | 'guest'

interface AuthState {
  user: User | null
  role: Role
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, inviteCode: string) => Promise<void>
  guestLogin: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>('user')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setLoading(false)
      return
    }
    const savedRole = localStorage.getItem('user_role') as Role | null
    if (savedRole === 'guest') setRole('guest')
    api.auth.me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const resp = await api.auth.login(email, password)
    localStorage.setItem('access_token', resp.access_token)
    localStorage.setItem('refresh_token', resp.refresh_token)
    localStorage.removeItem('user_role')
    const me = await api.auth.me()
    setRole('user')
    setUser(me)
  }, [])

  const register = useCallback(async (email: string, password: string, inviteCode: string) => {
    const resp = await api.auth.register(email, password, inviteCode)
    // otp_sent: no token yet, caller handles the OTP step
    if (resp.status === 'otp_sent') return
    if (resp.access_token) {
      localStorage.setItem('access_token', resp.access_token)
      localStorage.setItem('refresh_token', resp.refresh_token!)
    }
    localStorage.removeItem('user_role')
    const me = await api.auth.me()
    setRole('user')
    setUser(me)
  }, [])

  const guestLogin = useCallback(async () => {
    const email = process.env.NEXT_PUBLIC_GUEST_EMAIL!
    const password = process.env.NEXT_PUBLIC_GUEST_PASSWORD!
    const resp = await api.auth.login(email, password)
    localStorage.setItem('access_token', resp.access_token)
    localStorage.setItem('refresh_token', resp.refresh_token)
    localStorage.setItem('user_role', 'guest')
    const me = await api.auth.me()
    setRole('guest')
    setUser(me)
  }, [])

  const logout = useCallback(() => {
    api.auth.logout().catch(() => {})
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
    setUser(null)
    setRole('user')
    window.location.href = '/'
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, loading, login, register, guestLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
