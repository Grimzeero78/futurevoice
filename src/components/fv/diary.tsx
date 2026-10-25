'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  NotebookPen, Lock, Trash2, Pencil, X, Loader2, CalendarDays, BookHeart, Check, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { api, formatDate, coarseDuration } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'

// ─── Moods ───────────────────────────────────────────────────────

const MOODS: { v: string; label: string; emoji: string }[] = [
  { v: 'SUNNY', label: 'A sunny day', emoji: '☀️' },
  { v: 'CALM', label: 'Calm', emoji: '🌤️' },
  { v: 'GRATEFUL', label: 'Grateful', emoji: '🙏' },
  { v: 'HOPEFUL', label: 'Hopeful', emoji: '🌱' },
  { v: 'PROUD', label: 'Proud', emoji: '🏆' },
  { v: 'STORMY', label: 'Stormy', emoji: '⛈️' },
  { v: 'TIRED', label: 'Tired', emoji: '😴' },
  { v: 'MISSING', label: 'Missing someone', emoji: '💌' },
]

function moodMeta(v: string | null | undefined) {
  if (!v) return null
  return MOODS.find((m) => m.v === v) ?? null
}

// ─── Types (mirror of the API) ───────────────────────────────────

type Entry = {
  id: string
  title: string
  body: string
  mood: string | null
  entryDate: string
  sealedUntil: string | null
  createdAt: string
  updatedAt: string
  locked: boolean
}

type LockedEntry = {
  id: string
  entryDate: string
  sealedUntil: string
  locked: true
}

type AnyEntry = Entry | LockedEntry

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function addYearsISO(n: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + n)
  const p = (num: number) => String(num).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function Diary() {
  const session = useFV((s) => s.session)
  const openAuth = useFV((s) => s.openAuth)

  const [entries, setEntries] = useState<AnyEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [sealedCount, setSealedCount] = useState(0)
  const [loading, setLoading] = useState(false)

  // composer state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [mood, setMood] = useState<string>('NONE')
  const [body, setBody] = useState('')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [sealOn, setSealOn] = useState(false)
  const [sealDate, setSealDate] = useState(addYearsISO(5))
  const [saving, setSaving] = useState(false)
  const [composerOpen, setComposerOpen] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<{ entries: AnyEntry[]; total: number; sealedCount: number }>('/api/me/diary')
      setEntries(d.entries)
      setTotal(d.total)
      setSealedCount(d.sealedCount)
    } catch (e) {
      toast({ title: 'Could not load your diary', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [session, load])

  const resetComposer = () => {
    setEditingId(null)
    setTitle('')
    setMood('NONE')
    setBody('')
    setEntryDate(todayISO())
    setSealOn(false)
    setSealDate(addYearsISO(5))
  }

  function startEdit(e: Entry) {
    setEditingId(e.id)
    setTitle(e.title)
    setMood(e.mood ?? 'NONE')
    setBody(e.body)
    setEntryDate(String(e.entryDate).slice(0, 10))
    // a future seal would make the entry locked (uneditable); an expired seal
    // simply shows as off — saving the edit clears the old seal
    setSealOn(false)
    setSealDate(addYearsISO(5))
    setComposerOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sealTooSoon = sealOn && new Date(`${sealDate}T12:00:00`).getTime() < Date.now() + 60_000

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast({ title: 'Give the day a title', variant: 'destructive' })
      return
    }
    if (!body.trim()) {
      toast({ title: 'Write something', description: 'Even two honest lines count.', variant: 'destructive' })
      return
    }
    if (sealTooSoon) {
      toast({ title: 'A seal must sit in the future', description: 'Pick tomorrow or any day after.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        mood: mood === 'NONE' ? '' : mood,
        entryDate: `${entryDate}T12:00:00`,
        ...(sealOn ? { sealedUntil: `${sealDate}T12:00:00` } : editingId ? { sealedUntil: null } : {}),
      }
      if (editingId) {
        await api(`/api/me/diary/${editingId}`, { method: 'PATCH', json: payload })
        toast({ title: sealOn ? 'Entry updated & sealed 🔒' : 'Entry updated' })
      } else {
        await api('/api/me/diary', { method: 'POST', json: payload })
        toast({
          title: sealOn ? 'Entry sealed 🔒' : 'Day recorded',
          description: sealOn
            ? `Not even you can read it until ${formatDate(sealDate)}.`
            : 'The little days become the big story.',
        })
      }
      resetComposer()
      void load()
    } catch (err) {
      toast({ title: 'Could not save the entry', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/me/diary/${id}`, { method: 'DELETE' })
      toast({ title: 'Entry deleted' })
      if (editingId === id) resetComposer()
      void load()
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    }
  }

  // ─── signed-out ───
  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <NotebookPen className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold">Your diary awaits</h1>
        <p className="mt-2 text-muted-foreground">
          Sign in to record the everyday — and seal days away for the future, even from yourself.
        </p>
        <Button className="mt-6" onClick={() => openAuth('login')}>Sign in</Button>
      </div>
    )
  }

  const sealPreview = sealOn ? new Date(`${sealDate}T12:00:00`) : null

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* header */}
      <header className="mb-8">
        <h1 className="flex items-center gap-3 font-display text-3xl font-bold sm:text-4xl">
          <BookHeart className="h-8 w-8 text-primary" aria-hidden /> Daily diary
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The ordinary days are the ones the future will ache to read. Record today as it really was —
          and when a day deserves to rest, seal it: not even you can open it before its time.
        </p>
        {entries !== null && (
          <p className="mt-3 text-sm text-muted-foreground">
            {total} {total === 1 ? 'entry' : 'entries'} written
            {sealedCount > 0 && <> · <Lock className="inline h-3.5 w-3.5 text-primary" aria-hidden /> {sealedCount} sealed</>}
          </p>
        )}
      </header>

      {/* composer */}
      <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="diary-compose-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="diary-compose-heading" className="font-semibold">
            {editingId ? 'Edit this entry' : 'Record today'}
          </h2>
          {!composerOpen && (
            <Button size="sm" onClick={() => { setComposerOpen(true); resetComposer() }}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden /> New entry
            </Button>
          )}
          {editingId && (
            <Button size="sm" variant="ghost" onClick={() => { resetComposer() }}>
              <X className="mr-1.5 h-4 w-4" aria-hidden /> Cancel edit
            </Button>
          )}
        </div>

        {composerOpen && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="d-title">A title for the day</Label>
                <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. The day the rains came back" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-date">The day itself</Label>
                <Input
                  id="d-date"
                  type="date"
                  value={entryDate}
                  max="9999-12-31"
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-44"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mood <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMood('NONE')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${mood === 'NONE' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary/60'}`}
                >
                  No mood
                </button>
                {MOODS.map((m) => (
                  <button
                    key={m.v}
                    type="button"
                    onClick={() => setMood(m.v)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${mood === m.v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary/60'}`}
                  >
                    <span aria-hidden>{m.emoji}</span> {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="d-body">What happened today</Label>
              <Textarea
                id="d-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={20000}
                rows={8}
                placeholder="The small things: the weather, the conversation you didn't expect, what made you laugh, what weighed on you. Write it exactly as you'd want to find it years from now."
                className="font-display text-[15px] leading-relaxed"
              />
              <p className="text-right text-xs text-muted-foreground">{body.length.toLocaleString()}/20,000</p>
            </div>

            {/* seal */}
            <div className="rounded-lg border border-dashed p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Lock className={`h-5 w-5 ${sealOn ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
                  <div>
                    <p className="text-sm font-medium">Seal this entry</p>
                    <p className="text-xs text-muted-foreground">
                      {sealOn && sealPreview
                        ? `Locked until ${formatDate(sealPreview, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — ${coarseDuration(sealPreview)}.`
                        : 'Hide it from everyone — even yourself — until the day you choose.'}
                    </p>
                  </div>
                </div>
                <Switch checked={sealOn} onCheckedChange={setSealOn} aria-label="Seal this diary entry" />
              </div>

              {sealOn && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {[1, 5, 10, 25].map((n) => (
                      <Button key={n} type="button" variant="secondary" size="sm" onClick={() => setSealDate(addYearsISO(n))}>
                        +{n} {n === 1 ? 'year' : 'years'}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="d-seal-date" className="shrink-0 text-xs text-muted-foreground">Sealed until</Label>
                    <Input
                      id="d-seal-date"
                      type="date"
                      value={sealDate}
                      min={todayISO()}
                      max="9999-12-31"
                      onChange={(e) => setSealDate(e.target.value)}
                      className="w-44"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="min-w-40">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : sealOn ? <Lock className="mr-2 h-4 w-4" aria-hidden /> : <Check className="mr-2 h-4 w-4" aria-hidden />}
                {editingId ? 'Save entry' : sealOn ? 'Write & seal' : 'Record this day'}
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* timeline */}
      <section className="mt-10" aria-label="Diary timeline">
        <h2 className="mb-4 font-display text-xl font-semibold">Your days</h2>

        {entries === null || loading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <NotebookPen className="mx-auto mb-3 h-9 w-9 text-muted-foreground" aria-hidden />
            <p className="font-display text-lg font-semibold">No entries yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Start today — future you is already grateful.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {entries.map((e) => {
              const mm = moodMeta(e.locked ? null : (e as Entry).mood)
              if (e.locked) {
                const le = e as LockedEntry
                return (
                  <li key={le.id} className="relative overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <Lock className="h-4.5 w-4.5 text-primary" aria-hidden />
                        </span>
                        <div>
                          <p className="font-display font-semibold">A sealed day</p>
                          <p className="text-xs text-muted-foreground">Written {formatDate(le.entryDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="gap-1 bg-primary/15 text-primary text-[10px]">
                          <Lock className="h-2.5 w-2.5" aria-hidden /> opens {formatDate(le.sealedUntil)} · {coarseDuration(le.sealedUntil)}
                        </Badge>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Delete sealed entry">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-display">Delete this sealed day?</AlertDialogTitle>
                              <AlertDialogDescription>
                                It stays sealed, then it simply ceases to exist. You will never read it — and neither will anyone. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it sealed</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove(le.id)}>
                                Delete forever
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <p className="mt-3 text-xs italic text-muted-foreground">
                      Sealed words are the bravest — you trusted the future with them. Come back on the day.
                    </p>
                  </li>
                )
              }
              const entry = e as Entry
              return (
                <li key={entry.id} className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg font-semibold">{entry.title}</h3>
                        {mm && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <span aria-hidden>{mm.emoji}</span> {mm.label}
                          </Badge>
                        )}
                        {entry.updatedAt > entry.createdAt && (
                          <Badge variant="outline" className="text-[10px]">edited</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" aria-hidden />
                        {formatDate(entry.entryDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(entry)} aria-label={`Edit ${entry.title}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${entry.title}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-display">Delete “{entry.title}”?</AlertDialogTitle>
                            <AlertDialogDescription>The page tears out and is gone forever. This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove(entry.id)}>
                              Delete forever
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap font-display text-[15px] leading-relaxed text-foreground/90">
                    {entry.body}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
