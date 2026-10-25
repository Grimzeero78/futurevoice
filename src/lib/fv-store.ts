'use client'

import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────

export type SessionUser = {
  id: string
  name: string | null
  email: string | null // optional recovery email — accounts work on name + password alone
  displayName: string
  bio: string | null
  role: string
  emailVerified: string | Date | null
  createdAt?: string | Date
  stats?: { postCount: number; sealedCount: number; reactionsReceived: number }
}

export type View =
  | { name: 'home' }
  | { name: 'archive' }
  | { name: 'compose' }
  | { name: 'edit'; id: string }
  | { name: 'post'; id: string }
  | { name: 'dashboard' }
  | { name: 'profile' }
  | { name: 'admin' }

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

// ─── Hash router ─────────────────────────────────────────────────

export function parseHash(hash: string): View {
  const clean = hash.replace(/^#\/?/, '')
  const [head, tail] = clean.split('/')
  switch (head) {
    case 'archive':
      return { name: 'archive' }
    case 'compose':
      return { name: 'compose' }
    case 'edit':
      return tail ? { name: 'edit', id: tail } : { name: 'compose' }
    case 'post':
      return tail ? { name: 'post', id: tail } : { name: 'archive' }
    case 'dashboard':
      return { name: 'dashboard' }
    case 'profile':
      return { name: 'profile' }
    case 'admin':
      return { name: 'admin' }
    default:
      return { name: 'home' }
  }
}

export function viewToHash(view: View): string {
  switch (view.name) {
    case 'home':
      return '#/'
    case 'edit':
      return `#/edit/${view.id}`
    case 'post':
      return `#/post/${view.id}`
    default:
      return `#/${view.name}`
  }
}

// ─── Global store ────────────────────────────────────────────────

type FVState = {
  session: SessionUser | null | undefined // undefined = still loading
  view: View
  authOpen: boolean
  authMode: AuthMode
  resetToken: string | null // email-link password-reset token awaiting a new password
  setSession: (u: SessionUser | null) => void
  refreshSession: () => Promise<void>
  navigate: (view: View) => void
  syncFromHash: () => void
  openAuth: (mode?: AuthMode) => void
  closeAuth: () => void
  startPasswordReset: (token: string) => void
}

export const useFV = create<FVState>((set, get) => ({
  session: undefined,
  view: { name: 'home' },
  authOpen: false,
  authMode: 'login',
  resetToken: null,

  setSession: (u) => set({ session: u }),

  refreshSession: async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      const data = await res.json()
      set({ session: data.user ?? null })
    } catch {
      set({ session: null })
    }
  },

  navigate: (view) => {
    if (typeof window !== 'undefined') {
      window.location.hash = viewToHash(view)
    }
    set({ view })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  },

  syncFromHash: () => {
    if (typeof window === 'undefined') return
    set({ view: parseHash(window.location.hash) })
  },

  openAuth: (mode = 'login') => set({ authOpen: true, authMode: mode }),
  closeAuth: () => set({ authOpen: false, authMode: 'login', resetToken: null }),

  startPasswordReset: (token) =>
    set({ authOpen: true, authMode: 'reset', resetToken: token }),
}))
