'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck, EyeOff, CheckCircle2, Gavel } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export function Admin() {
  const session = useFV((s) => s.session)
  const navigate = useFV((s) => s.navigate)
  const [reports, setReports] = useState<Report[] | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<{ reports: Report[]; open: number }>('/api/admin/reports')
      setReports(d.reports)
      setOpenCount(d.open)
    } catch {
      setReports([])
    }
  }, [])

  useEffect(() => {
    if (session?.role === 'ADMIN') void load()
  }, [session, load])

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

  async function act(reportId: string, action: 'HIDE_POST' | 'UNHIDE_POST' | 'RESOLVE') {
    setBusyId(reportId)
    try {
      await api('/api/admin/reports', { method: 'PATCH', json: { reportId, action } })
      toast({
        title:
          action === 'HIDE_POST' ? 'Capsule hidden from the archive'
          : action === 'UNHIDE_POST' ? 'Capsule restored'
          : 'Report resolved',
      })
      await load()
    } catch (e) {
      toast({ title: 'Action failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Gavel className="h-8 w-8 text-primary" aria-hidden /> Moderation desk
        </h1>
        <p className="mt-2 text-muted-foreground">
          {openCount} open report{openCount === 1 ? '' : 's'} awaiting a decision.
        </p>
      </header>

      {reports === null ? (
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
                    <Button size="sm" variant="destructive" disabled={busyId === r.id} onClick={() => void act(r.id, 'HIDE_POST')}>
                      <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide capsule
                    </Button>
                  )}
                  {r.status === 'OPEN' && (
                    <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => void act(r.id, 'RESOLVE')}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Resolve without action
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
