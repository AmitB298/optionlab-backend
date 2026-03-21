import { create } from 'zustand'

interface Author {
  id: number
  name: string
  email: string
  role: string
  bio?: string
  avatar_url?: string
  avatar_color: string
  initials: string
  is_admin: boolean
  articles_count: number
  followers_count: number
}

interface AuthState {
  token: string | null
  user: Author | null
  isAuthenticated: boolean
  setAuth: (token: string, user: Author) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('ol_token'),
  user: (() => {
    try { return JSON.parse(localStorage.getItem('ol_user') || 'null') } catch { return null }
  })(),
  isAuthenticated: !!localStorage.getItem('ol_token'),

  setAuth: (token, user) => {
    localStorage.setItem('ol_token', token)
    localStorage.setItem('ol_user', JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },
  logout: () => {
    localStorage.removeItem('ol_token')
    localStorage.removeItem('ol_user')
    set({ token: null, user: null, isAuthenticated: false })
  },
}))


