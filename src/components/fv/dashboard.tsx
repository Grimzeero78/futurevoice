'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Download, Eye, Heart, Lock, Globe, EyeOff, Pencil, Trash2, MoreHorizontal,
  Vault, Hourglass, KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { Countdown } from '@/components/fv/countdown'
import { api, recipientLabel, formatDate, initials } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'
import type { SerializedPost } from '@/lib/fv-core'

type Summary = { total: number; public: number; private: number; sealed: number; totalViews: number; totalReactions: number; dueForRelease: number }

export function Dashboard() {
  const session = useFV((s) => s.session)
  const navigate = useFV((s) => s.navigate)
  const openAuth = useFV((s) => s.openAuth)
  const [posts, setPosts] = useState<SerializedPost[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [tab, setTab] = useState('all')

  const load = useCallback(async () => {
    try {
      const d = await api<{ posts: SerializedPost[]; summary: Summary }>('/api/me/posts')
      setPosts(d.posts)
      setSummary(d.summary)
    } catch (e) {
      toast({ title: 'Could not load your vault', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
      setPosts([])
    }
  }, [])
  useEffect(() => {
    if (!session) return
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [session, load])

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <Vault className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold">Your vault awaits</h1>
        <p className="mt-2 text-muted-foreground">Sign in to manage the capsules you have entrusted to the future.</p>
        <Button className="mt-6" onClick={() => openAuth('login')}>Sign in</Button>
      </div>
    )
  }

  async function togglePrivacy(p: SerializedPost) {
    try {
      await api(`/api/posts/${p.id}`, { method: 'PATCH', json: { privacy: p.privacy === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC' } })
      toast({ title: p.privacy === 'PUBLIC' ? 'Capsule is now private' : 'Capsule is now public' })
      void load()
    } catch (e) {
      toast({ title: 'Update failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/posts/${id}`, { method: 'DELETE' })
      toast({ title: 'Capsule deleted' })
      void load()
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    }
  }

  const filtered = (posts ?? []).filter((p) =>
    tab === 'all' ? true : tab === 'sealed' ? p.status === 'SEALED' : p.privacy.toLowerCase() === tab,
  )

  const stats = [
    { label: 'Capsules', value: summary?.total ?? 0, icon: Vault },
    { label: 'Sealed', value: summary?.sealed ?? 0, icon: Lock },
    { label: 'Signals', value: summary?.totalReactions ?? 0, icon: Heart },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Your vault</h1>
          <p className="mt-2 text-muted-foreground">
            {summary?.dueForRelease
              ? `${summary.dueForRelease} sealed capsule${summary.dueForRelease === 1 ? ' has' : 's have'} reached their release date and will unseal within a minute.`
              : 'Every message you have dared to send the future, in one place.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open('/api/me/export', '_blank')}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden /> Export my data
          </Button>
          <Button onClick={() => navigate({ name: 'compose' })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden /> New capsule
          </Button>
        </div>
      </header>

      {/* stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <s.icon className="mb-2 h-4 w-4 text-primary" aria-hidden />
            <div className="font-display text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All ({summary?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="public">Public ({summary?.public ?? 0})</TabsTrigger>
          <TabsTrigger value="private">Private ({summary?.private ?? 0})</TabsTrigger>
          <TabsTrigger value="sealed">Sealed ({summary?.sealed ?? 0})</TabsTrigger>
        </TabsList>
      </Tabs>

      <>

      {/* list */}
      {posts === null ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-14 text-center">
          <Hourglass className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="font-display text-lg font-semibold">
            {tab === 'all' ? 'No capsules yet' : `No ${tab} capsules`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Your first message to tomorrow is one click away.</p>
          <Button className="mt-5" onClick={() => navigate({ name: 'compose' })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Compose a capsule
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => (
            <li key={p.id} className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center gap-4">
                {/* thumb */}
                <button
                  onClick={() => navigate({ name: 'post', id: p.id })}
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary"
                  aria-label={`Open ${p.title}`}
                >
                  {p.media.find((m) => m.kind === 'IMAGE') ? (
                    <img src={p.media.find((m) => m.kind === 'IMAGE')!.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-lg font-bold text-primary">{initials(p.title)}</span>
                  )}
                </button>

                {/* main */}
                <div className="min-w-0 flex-1">
                  <button onClick={() => navigate({ name: 'post', id: p.id })} className="text-left">
                    <h3 className="truncate font-display font-semibold hover:text-primary">{p.title}</h3>
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">{recipientLabel(p.recipientTag, p.customRecipient)}</Badge>
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      {p.privacy === 'PUBLIC' ? <Globe className="h-2.5 w-2.5" aria-hidden /> : <EyeOff className="h-2.5 w-2.5" aria-hidden />}
                      {p.privacy.toLowerCase()}
                    </Badge>
                    {p.status === 'SEALED' && (
                      <Badge className="gap-1 bg-primary/15 text-primary text-[10px]">
                        <Lock className="h-2.5 w-2.5" aria-hidden /> sealed
                      </Badge>
                    )}
                    {p.hasMagicKey && (
                      <Badge className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px]">
                        <KeyRound className="h-2.5 w-2.5" aria-hidden /> magic key
                      </Badge>
                    )}
                    {p.magicKeyOpenedAt && (
                      <Badge variant="outline" className="text-[10px]">opened by key</Badge>
                    )}
                    <span>· {formatDate(p.createdAt)} · {p.views} views · {p.reactionTotal} signals</span>
                  </div>
                  {p.status === 'SEALED' && p.releaseAt && (
                    <div className="mt-2">
                      <Countdown target={p.releaseAt} compact />
                    </div>
                  )}
                </div>

                {/* actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${p.title}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {p.status === 'SEALED' ? (
                      // sealed = a locked box: even the author cannot look inside.
                      // The only action left is deleting it UNREAD.
                      <>
                        <DropdownMenuItem disabled className="text-muted-foreground">
                          <Lock className="mr-2 h-4 w-4" />
                          Sealed{p.releaseAt ? ` until ${formatDate(p.releaseAt)}` : ''} — no peeking
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete without reading…
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-display">Destroy “{p.title}” unread?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The seal holds until{p.releaseAt ? ` ${formatDate(p.releaseAt)}` : ' its day'} — you cannot read the letter or see the files first, not even now. Deleting destroys everything inside, unread, forever.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it sealed</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove(p.id)}>
                                Destroy it unread
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => navigate({ name: 'post', id: p.id })}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ name: 'edit', id: p.id })}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit metadata
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void togglePrivacy(p)}>
                          {p.privacy === 'PUBLIC' ? <EyeOff className="mr-2 h-4 w-4" /> : <Globe className="mr-2 h-4 w-4" />}
                          Make {p.privacy === 'PUBLIC' ? 'private' : 'public'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete…
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-display">Delete “{p.title}”?</AlertDialogTitle>
                              <AlertDialogDescription>The letter, files and reactions disappear forever. This cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove(p.id)}>
                                Delete forever
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}
      </>
    </div>
  )
}
