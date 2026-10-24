'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Hourglass, Archive, Plus, LayoutDashboard, Moon, Sun, Download,
  ShieldCheck, LogOut, UserCircle2, Menu, MailWarning,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthDialog } from '@/components/fv/auth-dialog'
import { Landing } from '@/components/fv/landing'
import { Archive as ArchiveView } from '@/components/fv/archive'
import { Compose } from '@/components/fv/compose'
import { PostDetail } from '@/components/fv/post-detail'
import { Dashboard } from '@/components/fv/dashboard'
import { Profile } from '@/components/fv/profile'
import { Admin } from '@/components/fv/admin'
import { api, initials } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(id)
  }, [])
  if (!mounted) return <Button variant="ghost" size="icon" aria-label="Toggle theme"><Sun className="h-4 w-4" /></Button>
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle light or dark theme"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

export function FVShell() {
  const session = useFV((s) => s.session)
  const view = useFV((s) => s.view)
  const navigate = useFV((s) => s.navigate)
  const syncFromHash = useFV((s) => s.syncFromHash)
  const refreshSession = useFV((s) => s.refreshSession)
  const openAuth = useFV((s) => s.openAuth)
  const setSession = useFV((s) => s.setSession)
  const startPasswordReset = useFV((s) => s.startPasswordReset)

  useEffect(() => {
    syncFromHash()
    const onHash = () => syncFromHash()
    window.addEventListener('hashchange', onHash)
    void refreshSession()

    // Email links land on "/?verify=<token>" or "/?reset=<token>"
    const params = new URLSearchParams(window.location.search)
    const verifyToken = params.get('verify')
    const resetToken = params.get('reset')
    if (verifyToken) {
      api('/api/auth/verify-email', { method: 'POST', json: { token: verifyToken } })
        .then(async () => {
          await refreshSession()
          toast({ title: 'Email verified', description: 'Your voice is fully on record now.' })
        })
        .catch((e) => toast({ title: 'Verification failed', description: e.message, variant: 'destructive' }))
        .finally(() => window.history.replaceState(null, '', window.location.pathname))
    } else if (resetToken) {
      startPasswordReset(resetToken)
      window.history.replaceState(null, '', window.location.pathname)
    } else if (params.get('authError')) {
      // Google sign-in landed back with an error code
      const authError = params.get('authError')
      const messages: Record<string, [string, string]> = {
        google_unconfigured: ['Google sign-in is not active', 'The server owner has not added Google credentials yet — use email sign-in.'],
        google_cancelled: ['Google sign-in cancelled', 'No worries — you can try again any time.'],
        google_state: ['Sign-in expired', 'The sign-in attempt took too long. Please try again.'],
        google_failed: ['Google sign-in failed', 'Something went wrong talking to Google. Please try again.'],
        banned: ['Account banned', 'This account has been banned for violating the community standards.'],
      }
      if (authError === 'google_welcome') {
        void refreshSession()
        toast({ title: 'Signed in with Google', description: 'Welcome — the future was waiting.' })
      } else {
        const m = messages[authError]
        toast({
          title: m?.[0] ?? 'Sign-in issue',
          description: m?.[1] ?? 'Please try again.',
          variant: 'destructive',
        })
      }
      window.history.replaceState(null, '', window.location.pathname)
    }

    return () => window.removeEventListener('hashchange', onHash)
  }, [syncFromHash, refreshSession, startPasswordReset])

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setSession(null)
    navigate({ name: 'home' })
    toast({ title: 'Signed out' })
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <div className="flex min-h-screen flex-col bg-background">
        {/* ─── Header ─── */}
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
            <button
              onClick={() => navigate({ name: 'home' })}
              className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
              aria-label="Future Voices — home"
            >
              <span className="wax-seal flex h-9 w-9 items-center justify-center rounded-full">
                <Hourglass className="h-4.5 w-4.5 text-primary-foreground" aria-hidden />
              </span>
              <span className="font-display text-xl font-bold tracking-tight">
                Future <span className="text-primary">Voices</span>
              </span>
            </button>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              <Button variant="ghost" onClick={() => navigate({ name: 'archive' })}>
                <Archive className="mr-1.5 h-4 w-4" aria-hidden /> Archive
              </Button>
              {session && (
                <Button variant="ghost" onClick={() => navigate({ name: 'dashboard' })}>
                  <LayoutDashboard className="mr-1.5 h-4 w-4" aria-hidden /> My vault
                </Button>
              )}
              <Button onClick={() => (session ? navigate({ name: 'compose' }) : openAuth('register'))}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Seal a capsule
              </Button>
            </nav>

            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              {session === undefined ? null : session ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring"
                      aria-label="Account menu"
                    >
                      {initials(session.displayName)}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <p className="font-medium">{session.displayName}</p>
                      <p className="truncate text-xs font-normal text-muted-foreground">{session.email}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate({ name: 'dashboard' })}>
                      <LayoutDashboard className="mr-2 h-4 w-4" /> My vault
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate({ name: 'profile' })}>
                      <UserCircle2 className="mr-2 h-4 w-4" /> Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open('/api/me/export', '_blank')}>
                      <Download className="mr-2 h-4 w-4" /> Export my data
                    </DropdownMenuItem>
                    {session.role === 'ADMIN' && (
                      <DropdownMenuItem onClick={() => navigate({ name: 'admin' })}>
                        <ShieldCheck className="mr-2 h-4 w-4" /> Moderation desk
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut}>
                      <LogOut className="mr-2 h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => openAuth('login')}>Sign in</Button>
                  <Button className="hidden sm:inline-flex" onClick={() => openAuth('register')}>Join the future</Button>
                </>
              )}
              {/* mobile nav trigger */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 md:hidden">
                  <DropdownMenuItem onClick={() => navigate({ name: 'archive' })}>
                    <Archive className="mr-2 h-4 w-4" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => (session ? navigate({ name: 'dashboard' }) : openAuth('login'))}>
                    <LayoutDashboard className="mr-2 h-4 w-4" /> My vault
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => (session ? navigate({ name: 'compose' }) : openAuth('register'))}>
                    <Plus className="mr-2 h-4 w-4" /> Seal a capsule
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* email verification banner */}
          {session && !session.emailVerified && (
            <div className="border-t bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-400">
              <span className="inline-flex items-center gap-1.5">
                <MailWarning className="h-3.5 w-3.5" aria-hidden />
                Your email is not verified yet — open the profile page to resend the verification link.
              </span>
            </div>
          )}
        </header>

        {/* ─── Main ─── */}
        <main className="flex-1">
          {view.name === 'home' && <Landing />}
          {view.name === 'archive' && <ArchiveView />}
          {view.name === 'compose' && <Compose />}
          {view.name === 'edit' && <Compose editId={view.id} />}
          {view.name === 'post' && <PostDetail id={view.id} />}
          {view.name === 'dashboard' && <Dashboard />}
          {view.name === 'profile' && <Profile />}
          {view.name === 'admin' && <Admin />}
        </main>

        {/* ─── Footer ─── */}
        <footer className="mt-auto border-t bg-secondary/50 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="wax-seal flex h-7 w-7 items-center justify-center rounded-full">
                <Hourglass className="h-3.5 w-3.5 text-primary-foreground" aria-hidden />
              </span>
              <span>
                <span className="font-display font-semibold text-foreground">Future Voices</span> — letters sealed for tomorrow.
              </span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Footer">
              <button className="hover:text-primary" onClick={() => navigate({ name: 'archive' })}>Archive</button>
              <button className="hover:text-primary" onClick={() => navigate({ name: 'compose' })}>Seal a capsule</button>
              {session?.role === 'ADMIN' && (
                <button className="hover:text-primary" onClick={() => navigate({ name: 'admin' })}>Moderation</button>
              )}
            </nav>
          </div>
          <div className="mx-auto max-w-6xl px-4 pb-8 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Crafted for the people of 2078 and beyond by{' '}
              <span className="font-medium text-foreground">Isaac Bridget Njuguna</span> — a child of God with a dream to see a better world.
            </p>
          </div>
        </footer>

        <AuthDialog />
      </div>
    </ThemeProvider>
  )
}
