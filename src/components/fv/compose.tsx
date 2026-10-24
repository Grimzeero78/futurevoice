'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2, UploadCloud, X, Lock, Unlock, Globe, EyeOff, CalendarClock, Trash2, Send, Infinity as InfinityIcon,
  Users, KeyRound, MailPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { api, uploadFile, RECIPIENT_OPTIONS, RECIPIENT_LABELS, formatBytes, formatDate, coarseDuration } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'

type MediaItem = {
  id: string
  kind: string
  filename: string
  size: number
  url: string
}

type HeirEntry = { email: string; name: string | null }

type Uploading = { name: string; pct: number }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function addYears(n: number): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() + n)
  return d
}

/** Build a Date from year/month/day, defensively. Returns null when invalid. */
function buildDate(year: number, monthIdx: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(monthIdx) || !Number.isInteger(day)) return null
  if (year < 1 || year > 9999) return null
  if (monthIdx < 0 || monthIdx > 11) return null
  const d = new Date(year, monthIdx, day, 12, 0, 0) // noon local — immune to DST edges
  if (d.getFullYear() !== year || d.getMonth() !== monthIdx || d.getDate() !== day) return null
  return d
}

export function Compose({ editId }: { editId?: string }) {
  const session = useFV((s) => s.session)
  const navigate = useFV((s) => s.navigate)
  const openAuth = useFV((s) => s.openAuth)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [recipientTag, setRecipientTag] = useState<string>('NONE')
  const [customRecipient, setCustomRecipient] = useState('')
  const [privacy, setPrivacy] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE')
  const [appearInArchive, setAppearInArchive] = useState(true)
  const [releaseDate, setReleaseDate] = useState<Date | undefined>(undefined)
  // custom date builder state
  const now = new Date()
  const [cyYear, setCyYear] = useState<string>(String(now.getFullYear() + 10))
  const [cyMonth, setCyMonth] = useState<string>(String(now.getMonth()))
  const [cyDay, setCyDay] = useState<string>(String(now.getDate()))
  const [media, setMedia] = useState<MediaItem[]>([])
  const [uploading, setUploading] = useState<Uploading[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingPost, setLoadingPost] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const isEdit = !!editId

  // ── legacy keepers state ──
  const [heirs, setHeirs] = useState<HeirEntry[]>([])
  const [heirName, setHeirName] = useState('')
  const [heirEmail, setHeirEmail] = useState('')
  const [heirPassphrase, setHeirPassphrase] = useState('')
  const [hasHeirPass, setHasHeirPass] = useState(false) // edit mode: a passphrase is already set
  const [heirNote, setHeirNote] = useState('')

  const maxDay = useMemo(() => {
    const y = parseInt(cyYear, 10)
    const m = parseInt(cyMonth, 10)
    if (isNaN(y) || isNaN(m)) return 31
    return new Date(y, m + 1, 0).getDate()
  }, [cyYear, cyMonth])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (parseInt(cyDay, 10) > maxDay) setCyDay(String(maxDay))
  }, [maxDay, cyDay])

  useEffect(() => {
    if (!session) return
    if (!isEdit) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPost(true)
    api<{ post: { title: string; content: string | null; privacy: string; recipientTag: string; customRecipient: string | null; appearInArchive: boolean; releaseAt: string | null; media: MediaItem[]; heirs?: HeirEntry[]; heirNote?: string | null; hasHeirPassphrase?: boolean } }>(`/api/posts/${editId}`)
      .then((d) => {
        setTitle(d.post.title)
        setContent(d.post.content ?? '')
        setPrivacy(d.post.privacy === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE')
        setRecipientTag(d.post.recipientTag)
        setCustomRecipient(d.post.customRecipient ?? '')
        setAppearInArchive(d.post.appearInArchive)
        setReleaseDate(d.post.releaseAt ? new Date(d.post.releaseAt) : undefined)
        setMedia(d.post.media)
        if (d.post.heirs) setHeirs(d.post.heirs)
        if (d.post.heirNote) setHeirNote(d.post.heirNote)
        setHasHeirPass(!!d.post.hasHeirPassphrase)
      })
      .catch((e) => toast({ title: 'Could not load capsule', description: e.message, variant: 'destructive' }))
      .finally(() => setLoadingPost(false))
  }, [editId, session])

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <CalendarClock className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold">Sign in to seal a capsule</h1>
        <p className="mt-2 text-muted-foreground">Your messages deserve a keeper with keys.</p>
        <Button className="mt-6" onClick={() => openAuth('register')}>Create an account</Button>
      </div>
    )
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      setUploading((u) => [...u, { name: file.name, pct: 0 }])
      try {
        const uploaded = await uploadFile(file, (pct) =>
          setUploading((u) => u.map((x) => (x.name === file.name ? { ...x, pct } : x))),
        )
        setMedia((m) => [...m, uploaded])
      } catch (e) {
        toast({ title: `Could not upload ${file.name}`, description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
      } finally {
        setUploading((u) => u.filter((x) => x.name !== file.name))
      }
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  function addHeir() {
    const email = heirEmail.trim().toLowerCase()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'That email does not look right', description: 'Keepers are reached by email, so it must be valid.', variant: 'destructive' })
      return
    }
    if (heirs.some((h) => h.email === email)) {
      toast({ title: 'That keeper is already on the list' })
      return
    }
    if (heirs.length >= 10) {
      toast({ title: 'Ten keepers is the limit', description: 'A quiet circle is harder to lose.', variant: 'destructive' })
      return
    }
    setHeirs((h) => [...h, { email, name: heirName.trim() || null }])
    setHeirEmail('')
    setHeirName('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast({ title: 'A capsule needs a title', variant: 'destructive' })
      return
    }
    if (!content.trim() && media.length === 0) {
      toast({ title: 'Add a note or a file', description: 'An empty capsule would be a mystery even to the future.', variant: 'destructive' })
      return
    }
    if (recipientTag === 'CUSTOM' && !customRecipient.trim()) {
      toast({ title: 'Name the custom recipient', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        privacy,
        recipientTag,
        customRecipient: recipientTag === 'CUSTOM' ? customRecipient.trim() : '',
        appearInArchive,
        releaseAt: releaseDate ? releaseDate.toISOString() : null,
        mediaIds: media.map((m) => m.id),
        heirs,
        heirNote: heirNote.trim(),
        ...(heirPassphrase.trim() ? { heirPassphrase: heirPassphrase.trim() } : {}),
      }
      if (isEdit) {
        await api(`/api/posts/${editId}`, { method: 'PATCH', json: payload })
        toast({ title: 'Capsule updated', description: 'Your changes are sealed in.' })
        navigate({ name: 'post', id: editId! })
      } else {
        const d = await api<{ post: { id: string; status: string } }>('/api/posts', { method: 'POST', json: payload })
        toast({
          title: d.post.status === 'SEALED' ? 'Capsule sealed 🔒' : 'Capsule launched',
          description: d.post.status === 'SEALED'
            ? `It will open on ${formatDate(releaseDate)}. Until then, not even a whisper escapes.`
            : 'Your message is now traveling to the future.',
        })
        navigate({ name: 'dashboard' })
      }
    } catch (err) {
      toast({ title: 'Could not save capsule', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loadingPost) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16" aria-busy="true">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  const applyCustomDate = () => {
    const d = buildDate(parseInt(cyYear, 10), parseInt(cyMonth, 10), parseInt(cyDay, 10))
    if (!d) {
      toast({ title: 'That date does not exist', description: 'Check the year (1–9999), month and day.', variant: 'destructive' })
      return
    }
    if (d.getTime() < Date.now() - 60_000) {
      toast({ title: 'The past is behind us', description: 'Pick today or any moment in the future — as far away as the year 9999.', variant: 'destructive' })
      return
    }
    setReleaseDate(d)
  }

  const previewValid = !!buildDate(parseInt(cyYear, 10), parseInt(cyMonth, 10), parseInt(cyDay, 10))

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          {isEdit ? 'Refine your capsule' : 'Compose a capsule'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isEdit
            ? 'Adjust the words, the seal, or the destination — the past is yours to edit.'
            : 'Write it, record it, seal it. Nobody sees a sealed capsule before its time — not even us.'}
        </p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        {/* ─── Media ─── */}
        <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="media-heading">
          <h2 id="media-heading" className="mb-1 font-semibold">
            Attach media <span className="text-sm font-normal text-muted-foreground">(optional)</span>
          </h2>
          <p className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <InfinityIcon className="h-3.5 w-3.5 text-primary" aria-hidden />
            No file-size limit — images, video &amp; audio are streamed straight to your vault. As many files as you like.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {media.map((m) => (
              <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-secondary">
                {m.kind === 'IMAGE' ? (
                  <img src={m.url} alt={m.filename} className="h-full w-full object-cover" />
                ) : (
                  <video src={m.url} className="h-full w-full object-cover" muted preload="metadata" />
                )}
                <span className="absolute bottom-1 left-1 max-w-[85%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  {formatBytes(m.size)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${m.filename}`}
                  onClick={() => setMedia((arr) => arr.filter((x) => x.id !== m.id))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {uploading.map((u) => (
              <div key={u.name} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-secondary/50 p-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
                <Progress value={u.pct} className="h-1.5 w-full" aria-label={`Uploading ${u.name}`} />
                <span className="w-full truncate text-center text-[10px] text-muted-foreground">{u.name}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              aria-label="Add images, videos or audio"
            >
              <UploadCloud className="h-6 w-6" aria-hidden />
              <span className="text-xs font-medium">Add files</span>
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            className="sr-only"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </section>

        {/* ─── The letter ─── */}
        <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="letter-heading">
          <h2 id="letter-heading" className="mb-4 font-semibold">The letter</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. For the day you turn eighteen" />
              <p className="text-right text-xs text-muted-foreground">{title.length}/120</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Your words to the future</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={20000}
                rows={9}
                placeholder="Dear future…&#10;&#10;Tell them what today felt like. What you hope for. What you promise. What you'd want them to know even if everything else is lost."
                className="font-display text-[15px] leading-relaxed"
              />
              <p className="text-right text-xs text-muted-foreground">{content.length.toLocaleString()}/20,000</p>
            </div>
          </div>
        </section>

        {/* ─── Recipient ─── */}
        <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="recipient-heading">
          <h2 id="recipient-heading" className="mb-4 font-semibold">Address it to…</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient</Label>
              <Select value={recipientTag} onValueChange={setRecipientTag}>
                <SelectTrigger id="recipient" aria-label="Choose a recipient">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECIPIENT_OPTIONS.map((k) => (
                    <SelectItem key={k} value={k}>{RECIPIENT_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {recipientTag === 'CUSTOM' && (
              <div className="space-y-2">
                <Label htmlFor="customRecipient">Who is it for?</Label>
                <Input id="customRecipient" value={customRecipient} onChange={(e) => setCustomRecipient(e.target.value)} maxLength={60} placeholder="e.g. my daughter Ada, born 2041" />
              </div>
            )}
          </div>
        </section>

        {/* ─── Privacy & seal ─── */}
        <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="mb-4 font-semibold">Privacy &amp; the seal</h2>
          <RadioGroup value={privacy} onValueChange={(v) => setPrivacy(v as 'PRIVATE' | 'PUBLIC')} className="grid gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${privacy === 'PRIVATE' ? 'border-primary bg-primary/5' : 'hover:bg-secondary/50'}`}
            >
              <RadioGroupItem value="PRIVATE" id="priv-private" className="mt-0.5" />
              <div>
                <span className="flex items-center gap-1.5 font-medium"><EyeOff className="h-4 w-4" aria-hidden /> Private</span>
                <span className="mt-1 block text-xs text-muted-foreground">Only you can ever open this. Perfect for notes to your future self.</span>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${privacy === 'PUBLIC' ? 'border-primary bg-primary/5' : 'hover:bg-secondary/50'}`}
            >
              <RadioGroupItem value="PUBLIC" id="priv-public" className="mt-0.5" />
              <div>
                <span className="flex items-center gap-1.5 font-medium"><Globe className="h-4 w-4" aria-hidden /> Public</span>
                <span className="mt-1 block text-xs text-muted-foreground">Visible to everyone (once unsealed) — optionally listed in the public archive.</span>
              </div>
            </label>
          </RadioGroup>

          {privacy === 'PUBLIC' && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed p-3">
              <div>
                <p className="text-sm font-medium">Appear in the Future Archive</p>
                <p className="text-xs text-muted-foreground">Public capsules can also be unlisted — reachable only by direct link.</p>
              </div>
              <Switch checked={appearInArchive} onCheckedChange={setAppearInArchive} aria-label="Appear in public archive" />
            </div>
          )}

          <div className="mt-4 rounded-lg border border-dashed p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {releaseDate ? (
                  <Lock className="h-5 w-5 text-primary" aria-hidden />
                ) : (
                  <Unlock className="h-5 w-5 text-muted-foreground" aria-hidden />
                )}
                <div>
                  <p className="text-sm font-medium">Time lock</p>
                  <p className="text-xs text-muted-foreground">
                    {releaseDate
                      ? `Sealed until ${formatDate(releaseDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — ${coarseDuration(releaseDate)}.`
                      : 'No lock — the capsule is open as soon as it is saved.'}
                  </p>
                </div>
              </div>
              {releaseDate && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setReleaseDate(undefined)}>
                  Remove lock
                </Button>
              )}
            </div>

            {/* quick presets */}
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 10, 25, 50, 100, 1000].map((n) => (
                <Button key={n} type="button" variant="secondary" size="sm" onClick={() => setReleaseDate(addYears(n))}>
                  +{n} {n === 1 ? 'year' : 'years'}
                </Button>
              ))}
            </div>

            {/* exact custom date: any year up to 9999 */}
            <div className="mt-4 rounded-md bg-secondary/40 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Or choose an exact date — any year up to 9999
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="cy-year" className="text-xs text-muted-foreground">Year</Label>
                  <Input
                    id="cy-year"
                    inputMode="numeric"
                    value={cyYear}
                    onChange={(e) => setCyYear(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                    className="w-24 font-display text-lg font-bold tabular-nums"
                    placeholder="3026"
                    aria-describedby="cy-hint"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cy-month" className="text-xs text-muted-foreground">Month</Label>
                  <Select value={cyMonth} onValueChange={setCyMonth}>
                    <SelectTrigger id="cy-month" className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cy-day" className="text-xs text-muted-foreground">Day</Label>
                  <Select value={cyDay} onValueChange={setCyDay}>
                    <SelectTrigger id="cy-day" className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={applyCustomDate} disabled={!previewValid}>
                  <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden /> Set date
                </Button>
              </div>
              <p id="cy-hint" className="mt-2 text-xs text-muted-foreground">
                Tip: set the year to 3026 to send a message a full millennium forward.
              </p>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              A scheduler checks every minute and unseals capsules exactly when their moment arrives — not a second before.
            </p>
          </div>
        </section>

        {/* ─── Keepers & legacy ─── */}
        <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="keepers-heading">
          <div className="mb-1 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" aria-hidden />
            <h2 id="keepers-heading" className="font-semibold">Keepers of this capsule</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Seal it for 30 years and let your grandchildren open it. Name the people who should
            receive this capsule when its time comes — even if you are no longer here to hand it over.
          </p>

          {heirs.length > 0 && (
            <ul className="mb-4 space-y-2" aria-label="Named keepers">
              {heirs.map((h) => (
                <li key={h.email} className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h.name || h.email}</p>
                    {h.name && <p className="truncate text-xs text-muted-foreground">{h.email}</p>}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove keeper ${h.email}`}
                    onClick={() => setHeirs((arr) => arr.filter((x) => x.email !== h.email))}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <Input
              aria-label="Keeper's name (optional)"
              value={heirName}
              onChange={(e) => setHeirName(e.target.value)}
              maxLength={60}
              placeholder="Name (optional)"
            />
            <Input
              aria-label="Keeper's email"
              type="email"
              value={heirEmail}
              onChange={(e) => setHeirEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addHeir()
                }
              }}
              maxLength={120}
              placeholder="Their exact email address"
            />
            <Button type="button" variant="secondary" onClick={addHeir} disabled={!heirEmail.trim()}>
              <MailPlus className="mr-1.5 h-4 w-4" aria-hidden /> Add keeper
            </Button>
          </div>
          {heirs.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              On the release day, each keeper signs in (or signs up) with that exact email and claims the capsule
              from the <span className="font-medium">Legacies</span> tab of their vault. We email them the moment it unlocks.
            </p>
          )}

          {heirs.length > 0 && (
            <div className="mt-4 space-y-3 rounded-lg border border-dashed p-4">
              <div className="space-y-1.5">
                <Label htmlFor="heir-pass" className="flex items-center gap-1.5 text-sm">
                  <KeyRound className="h-3.5 w-3.5 text-primary" aria-hidden /> Family passphrase <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="heir-pass"
                  value={heirPassphrase}
                  onChange={(e) => setHeirPassphrase(e.target.value)}
                  maxLength={200}
                  placeholder={hasHeirPass ? 'Already set — type a new word to replace it' : 'A word only your family knows, e.g. the name of our ancestral home'}
                  autoComplete="off"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Keepers must type this once, when they open the capsule — so a stranger with the email alone still gets nothing.
                  </p>
                  {isEdit && hasHeirPass && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={async () => {
                        try {
                          await api(`/api/posts/${editId}`, { method: 'PATCH', json: { clearHeirPassphrase: true } })
                          setHasHeirPass(false)
                          setHeirPassphrase('')
                          toast({ title: 'Family passphrase removed' })
                        } catch (err) {
                          toast({ title: 'Could not remove passphrase', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
                        }
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="heir-note" className="text-sm">A note the keepers will see when they open it <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="heir-note"
                  value={heirNote}
                  onChange={(e) => setHeirNote(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. My sweets, I sealed this the year you were born. Read it slowly, and pass it on one day."
                />
                <p className="text-right text-xs text-muted-foreground">{heirNote.length}/2,000</p>
              </div>
            </div>
          )}
        </section>

        {/* ─── Actions ─── */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {isEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Delete capsule
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display">Delete this capsule forever?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The letter, the files, everything. The future cannot recover what was never sent. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={async () => {
                      try {
                        await api(`/api/posts/${editId}`, { method: 'DELETE' })
                        toast({ title: 'Capsule deleted' })
                        navigate({ name: 'dashboard' })
                      } catch (e) {
                        toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
                      }
                    }}
                  >
                    Delete forever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button type="button" variant="outline" onClick={() => navigate({ name: 'dashboard' })}>Cancel</Button>
          <Button type="submit" disabled={saving || uploading.length > 0} className="min-w-44">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
            {isEdit ? 'Save changes' : releaseDate ? 'Seal & schedule' : 'Launch capsule'}
          </Button>
        </div>
      </form>
    </div>
  )
}
