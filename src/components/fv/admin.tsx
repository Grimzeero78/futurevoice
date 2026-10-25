'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldAlert, ShieldCheck, EyeOff, CheckCircle2, Gavel, Users, Ban as BanIcon, Undo2, Search, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { api, formatDate, initials } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'

type Report = {
  id: string
  reason: string
  details: string | null
  status: string
  createdAt: string
  post: { id: string; title: string; hidden: boolean; hiddenReason: string | null; privacy: string; status: string; content: string | null; author: { displayName: string } }
  reporter: { displayName: string; email: string } | null
}

type Member = {
  id: string
  email: string
  displayName: string
  role: string
  banned: boolean
  banReason: string | null
  bannedAt: string | null
  violations: number
  emailVerified: string | null
  createdAt: string
  _count: { posts: number; reports: number }
}

export function Admin() {
  const session = useFV((s) => s.session)
  const navigate = useFV((s) => s.navigate)

  const [tab, setTab] = useState<'reports' | 'members'>('reports')
  const [reports, setReports] = useState<Report[] | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [members, setMembers] = useState<Member[] | null>(null)
  const [bannedCount, setBannedCount] = useState(0)
  const [memberQuery, setMemberQuery] = useState('')
  const [busyMember, setBusyMember] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    try {
      const d = await api<{ reports: Report[]; open: number }>('/api/admin/reports')
      setReports(d.reports)
      setOpenCount(d.open)
    } catch {
      setReports([])
    }
  }, [])

  const loadMembers = useCallback(async (q = '') => {
    try {
      const d = await api<{ members: Member[]; bannedCount: number }>(
        `/api/admin/users?q=${encodeURIComponent(q)}`,
      )
      setMembers(d.members)
      setBannedCount(d.bannedCount)
    } catch {
      setMembers([])
    }
  }, [])

  useEffect(() => {
     
    if (session?.role === 'ADMIN') void loadReports()
  }, [session, loadReports])

  useEffect(() => {
     
    if (session?.role === 'ADMIN' && tab === 'members') void loadMembers(memberQuery)
  }, [session, tab, loadMembers, memberQuery])

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold">Moderators only</h1>
        <p className="mt-2 text-muted-foreground">Sign in with a moderator account to see the queue.</p>
      </div>
    )
  }

  if (session.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-2xl font-bold">Not your watch</h1>
        <p className="mt-2 text-muted-foreground">
          This panel is reserved for Future Voices moderators.
        </p>
      </div>
    )
  }

  async function act(reportId: string, action: 'HIDE_POST' | 'UNHIDE_POST' | 'RESOLVE' | 'HIDE_AND_STRIKE' | 'BAN_AUTHOR') {
    setBusyId(reportId)
    try {
      const d = await api<{ banned?: boolean }>('/api/admin/reports', { method: 'PATCH', json: { reportId, action } })
      toast({
        title:
          action === 'HIDE_POST' ? 'Capsule hidden from the archive'
          : action === 'HIDE_AND_STRIKE' ? (d.banned ? 'Capsule hidden — author reached the ban threshold and is banned' : 'Capsule hidden — author received a strike')
          : action === 'BAN_AUTHOR' ? 'Author banned'
          : action === 'UNHIDE_POST' ? 'Capsule restored'
          : 'Report resolved',
      })
      await loadReports()
    } catch (e) {
      toast({ title: 'Action failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function memberAction(userId: string, action: 'BAN' | 'UNBAN') {
    setBusyMember(userId)
    try {
      await api('/api/admin/users', { method: 'POST', json: { userId, action } })
      toast({ title: action === 'BAN' ? 'Member banned' : 'Ban lifted', description: action === 'BAN' ? 'Their sessions were closed and public capsules hidden.' : 'They can sign in again.' })
      await loadMembers(memberQuery)
    } catch (e) {
      toast({ title: 'Action failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setBusyMember(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Gavel className="h-8 w-8 text-primary" aria-hidden /> Moderation desk
        </h1>
        <p className="mt-2 text-muted-foreground">
          {openCount} open report{openCount === 1 ? '' : 's'} · {bannedCount} banned member{bannedCount === 1 ? '' : 's'} · three strikes auto-ban.
        </p>
      </header>

      {/* tab switcher */}
      <div className="mb-6 flex gap-2" role="tablist" aria-label="Moderation sections">
        <Button variant={tab === 'reports' ? 'default' : 'outline'} onClick={() => setTab('reports')} aria-selected={tab === 'reports'} role="tab">
          <ShieldCheck className="mr-1.5 h-4 w-4" /> Reports
        </Button>
        <Button variant={tab === 'members' ? 'default' : 'outline'} onClick={() => setTab('members')} aria-selected={tab === 'members'} role="tab">
          <Users className="mr-1.5 h-4 w-4" /> Members
        </Button>
      </div>

      {tab === 'reports' ? (
        reports === null ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-dashed p-14 text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-emerald-600" aria-hidden />
            <p className="font-display text-lg font-semibold">All quiet on the timeline</p>
            <p className="mt-1 text-sm text-muted-foreground">No reports to review. The archive behaves itself.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {reports.map((r) => (
              <li key={r.id} className={`rounded-xl border bg-card p-5 shadow-sm ${r.status === 'OPEN' ? 'border-amber-500/40' : 'opacity-75'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.status === 'OPEN' ? 'destructive' : 'secondary'}>
                        {r.status === 'OPEN' ? 'Open' : 'Resolved'}
                      </Badge>
                      <Badge variant="outline">{r.reason}</Badge>
                      {r.post.hidden && <Badge className="bg-amber-600 text-white">Capsule hidden</Badge>}
                      {r.post.status === 'SEALED' && <Badge variant="secondary">Sealed capsule</Badge>}
                    </div>
                    <button
                      onClick={() => navigate({ name: 'post', id: r.post.id })}
                      className="mt-2 block max-w-full truncate text-left font-display text-lg font-semibold hover:text-primary"
                    >
                      {r.post.title}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      by {r.post.author?.displayName ?? 'Unknown'} · reported by {r.reporter?.displayName ?? 'someone'} · {formatDate(r.createdAt)}
                    </p>
                    {r.details && (
                      <p className="mt-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">“{r.details}”</p>
                    )}
                    {r.post.content && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.post.content}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {r.post.hidden ? (
                      <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void act(r.id, 'UNHIDE_POST')}>
                        <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Restore capsule
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="destructive" disabled={busyId === r.id} onClick={() => void act(r.id, 'HIDE_POST')}>
                          <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide capsule
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void act(r.id, 'HIDE_AND_STRIKE')}>
                          <Zap className="mr-1.5 h-3.5 w-3.5" /> Hide + strike author
                        </Button>
                      </>
                    )}
                    {r.status === 'OPEN' && (
                      <>
                        <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => void act(r.id, 'RESOLVE')}>
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Resolve without action
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={busyId === r.id} onClick={() => void act(r.id, 'BAN_AUTHOR')}>
                          <BanIcon className="mr-1.5 h-3.5 w-3.5" /> Ban author
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        /* ─── Members ─── */
        <div>
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={memberQuery}
                onChange={(e) => {
                  setMemberQuery(e.target.value)
                  void loadMembers(e.target.value)
                }}
                placeholder="Search by name or email…"
                className="pl-9"
                aria-label="Search members"
              />
            </div>
          </div>

          {members === null ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed p-14 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="font-display text-lg font-semibold">No members matched</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different name or email.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {members.map((m) => (
                <li key={m.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm ${m.banned ? 'border-red-500/40' : ''}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary" aria-hidden>
                      {initials(m.displayName)}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{m.displayName}</span>
                        {m.role === 'ADMIN' && <Badge variant="secondary">Admin</Badge>}
                        {m.banned && <Badge variant="destructive">Banned</Badge>}
                        {m.violations > 0 && !m.banned && <Badge className="bg-amber-600 text-white">{m.violations} strike{m.violations === 1 ? '' : 's'}</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email ? `${m.email} · ` : ''}joined {formatDate(m.createdAt)} · {m._count.posts} capsule{m._count.posts === 1 ? '' : 's'}
                        {m.banned && m.banReason ? ` · ${m.banReason}` : ''}
                      </p>
                    </div>
                  </div>
                  {m.role !== 'ADMIN' && (
                    m.banned ? (
                      <Button size="sm" variant="outline" disabled={busyMember === m.id} onClick={() => void memberAction(m.id, 'UNBAN')}>
                        <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Lift ban
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" disabled={busyMember === m.id} onClick={() => void memberAction(m.id, 'BAN')}>
                        <BanIcon className="mr-1.5 h-3.5 w-3.5" /> Ban member
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
