'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Hourglass, Lock, Video, ImageIcon, Archive, EyeOff, Tag,
  Download, ShieldCheck, ArrowRight, Sparkles, Heart, Gift,
  KeyRound, X, CheckCircle2, PenLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PostCard } from '@/components/fv/post-card'
import { api, coarseDuration, recipientLabel } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'
import type { SerializedPost } from '@/lib/fv-core'

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5 },
}

const WALKTHROUGH = [
  {
    img: '/demo/steps/step-1-write.jpg',
    title: 'Write it, snap it, seal it in',
    body: 'A letter, photographs, a video or a voice note — attach everything you want the future to hold. No file limits.',
    caption: 'Every capsule starts the way Rose started in 1944: a pen, a quiet evening, and the people you are writing for.',
    alt: 'A fountain pen resting on a notebook filled with handwriting',
  },
  {
    img: '/demo/steps/step-2-keepers.jpg',
    title: 'Choose who will see it',
    body: 'Just you? Whoever holds your magic key? Or everyone? Leave a single magic key: one secret word, written on paper and handed over — no emails, no accounts, nothing to hack.',
    caption: 'This is who it is for: a grandmother and her granddaughter, turning the pages together. The key is the handover.',
    alt: 'A grandmother and her granddaughter looking through a photo album together',
  },
  {
    img: '/demo/steps/step-3-seal.jpg',
    title: 'Seal it until the day comes',
    body: 'Pick any date: a birthday in 2056, a graduation in 2078 — or the year 3026, a full millennium away. Until then, not even a whisper escapes.',
    caption: 'Sealed like wax on an envelope: nothing opens before the date you chose — not even for you.',
    alt: 'White envelopes closed with red wax seals on a wooden desk',
  },
  {
    img: '/demo/steps/step-4-legacy.jpg',
    title: 'On the day, it finds them',
    body: 'When the seal breaks we email every keeper. They sign in, speak the family word — and your voice becomes theirs to keep forever.',
    caption: 'One day, someone opens the album and finds you there. That is the whole point of this place.',
    alt: 'A woman holding an old photo album filled with vintage family photographs',
  },
]

const FEATURES = [
  { icon: EyeOff, title: 'Privacy by design', body: 'Private capsules are visible to you alone. Media is served through an access-checked gateway, never a public URL.' },
  { icon: Lock, title: 'Time locks', body: 'Sealed capsules stay sealed — enforced at the database layer and swept by a release scheduler, so no date can leak early. Lock one for an afternoon or for 1,000 years.' },
  { icon: Tag, title: 'Recipient tags', body: 'Address capsules to your future child, grandchildren, the people of 2078 — or anyone you name.' },
  { icon: Gift, title: 'Keepers & legacies', body: 'Name the people who should inherit a capsule. On release day they are invited to claim it — with your family passphrase, it reaches exactly them.' },
  { icon: Heart, title: 'Future reactions', body: 'Visitors can leave a quiet signal — touched, inspired, hopeful — without ever hijacking the conversation.' },
  { icon: Download, title: 'Take your voice anywhere', body: 'Export every capsule, note and reaction you have ever recorded as a single JSON archive, any time.' },
]

// ─── The sample capsule that visitors can open right on the landing page ──

const DEMO_LETTER = `My dear great-granddaughter,

If someone kept their promise, you are reading this eighty years after a young seamstress sealed this box and walked away from it. It was June 1944. The world was loud with bad news, and I was twenty-two, sewing wedding dresses in a workshop above a bakery. Every morning the smell of warm bread came up through the floorboards, and that is how I knew the world still meant to go on.

The man who delivered the flour carried it up three flights of stairs. He was thin from the rationing and polite in a way that made me laugh. He stayed for tea. You exist because he stayed for tea, so be kind to quiet people.

Three things, then I let you go.

One. Joy is not bought. Look at the photograph of my sister and me — we owned two good dresses between us, and we laughed until the photographer scolded us for ruining his shot. I have kept that picture longer than I kept the dresses.

Two. Print your photographs. I mean it. Paper survives. The machines you keep your pictures in will be strange, dead objects one day, but paper in a dry box lasts eighty years and more. Hold every photograph to the window when you miss me.

Three. Before you were a name, before your grandmother's mother learned to walk, I hoped for you. You were never a stranger to me. You were a room in the future I kept furnished in my mind.

Now tell me honestly: is the bakery still there? Does the bread still smell like morning?

With all my love across the years,
Rose
June 1944`

type DemoPhase = 'closed' | 'sealed' | 'opening' | 'letter'

function DemoModal({ phase, setPhase }: { phase: DemoPhase; setPhase: (p: DemoPhase) => void }) {
  const [year, setYear] = useState(1944)

  useEffect(() => {
    if (phase !== 'opening') return
    const started = Date.now()
    const total = 2400
    const iv = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / total)
      const eased = 1 - Math.pow(1 - t, 3)
      // 1944 → 2024 with an ease-out roll
      setYear(1944 + Math.round(eased * (t === 0 ? 0 : 80)))
      if (t >= 1) {
        clearInterval(iv)
        setTimeout(() => setPhase('letter'), 350)
      }
    }, 40)
    return () => clearInterval(iv)
  }, [phase])

  return (
    <AnimatePresence>
      {phase !== 'closed' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => phase !== 'opening' && setPhase('closed')}
          role="dialog"
          aria-modal="true"
          aria-label="Sample capsule from 1944"
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="fv-scroll relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {phase !== 'opening' && (
              <button
                onClick={() => setPhase('closed')}
                className="absolute right-3 top-3 z-10 rounded-full bg-background/80 p-2 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                aria-label="Close the sample capsule"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {phase === 'sealed' && (
              <div className="paper-grain px-6 py-12 text-center sm:px-12">
                <Badge className="mb-5 gap-1 bg-accent text-accent-foreground">
                  <Archive className="h-3 w-3" aria-hidden /> Found in the archive · a real story
                </Badge>
                <h3 className="font-display text-2xl font-bold sm:text-3xl">“For the family I will never meet, on the day the seal breaks”</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Sealed in June 1944 by Rose, a twenty-two-year-old seamstress — addressed to a
                  great-granddaughter who did not exist yet. It waited eighty years.
                </p>
                <div className="mx-auto mt-8 max-w-xs rounded-xl border border-primary/30 bg-card p-5 shadow-lg">
                  <span className="wax-seal mx-auto flex h-16 w-16 items-center justify-center rounded-full">
                    <Lock className="h-7 w-7 text-primary-foreground" aria-hidden />
                  </span>
                  <p className="mt-4 text-xs font-medium uppercase tracking-widest text-primary">Sealed for 80 years</p>
                  <p className="mt-1 text-xs text-muted-foreground">1944 ——— 2024</p>
                </div>
                <Button size="lg" className="mt-8 h-12 px-8 text-base" onClick={() => setPhase('opening')}>
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden /> Break the seal
                </Button>
              </div>
            )}

            {phase === 'opening' && (
              <div className="flex min-h-[380px] flex-col items-center justify-center px-6 py-16 text-center">
                <motion.div
                  animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                  className="wax-seal flex h-20 w-20 items-center justify-center rounded-full"
                >
                  <Hourglass className="h-9 w-9 text-primary-foreground" aria-hidden />
                </motion.div>
                <p className="mt-8 font-display text-6xl font-bold tabular-nums text-primary sm:text-7xl">{year}</p>
                <p className="mt-4 text-sm uppercase tracking-[0.3em] text-muted-foreground">
                  {year < 2024 ? 'the seal is breaking…' : 'the capsule is open'}
                </p>
              </div>
            )}

            {phase === 'letter' && (
              <div className="px-5 py-8 sm:px-10">
                <div className="paper-grain rounded-xl border bg-card p-6 shadow-sm sm:p-8">
                  <p className="text-xs font-medium uppercase tracking-widest text-primary">Sealed 1944 · Opened 2024 · 80 years in waiting</p>
                  <h3 className="mt-2 font-display text-2xl font-bold">For the family I will never meet, on the day the seal breaks</h3>
                  <p className="mt-5 whitespace-pre-wrap font-display text-[15px] leading-relaxed">{DEMO_LETTER}</p>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <figure className="overflow-hidden rounded-xl border shadow-sm">
                    <img src="/demo/rose-letters.jpg" alt="Vintage handwritten letters and postcards with old postmarks, kept together in a bundle" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <figcaption className="bg-card px-3 py-2 text-xs text-muted-foreground">Some of the letters I could never throw away.</figcaption>
                  </figure>
                  <figure className="overflow-hidden rounded-xl border shadow-sm">
                    <img src="/demo/rose-hands.jpg" alt="A younger hand and an older hand passing a bundle of vintage photographs over a tin box" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <figcaption className="bg-card px-3 py-2 text-xs text-muted-foreground">The photographs are the inheritance — hand them on.</figcaption>
                  </figure>
                </div>

                <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
                  <Gift className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden />
                  <h4 className="font-display text-xl font-bold">Now imagine whose name is on yours.</h4>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    This capsule took Rose about ten minutes to write — and it defined a day, eighty years later.
                    Seal yours for 2056, for 3026, or for a grandchild you haven&apos;t met yet.
                  </p>
                  <DemoCTA className="mt-5" label="Seal your own capsule" />
                  <p className="mt-3 text-[11px] text-muted-foreground">A sample capsule shown on this page — yours can wait 80 years, or 1,000.</p>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Landing CTA: signed-in visitors go to compose, others to registration. */
function DemoCTA({ label, className }: { label: string; className?: string }) {
  const navigate = useFV((s) => s.navigate)
  const session = useFV((s) => s.session)
  const openAuth = useFV((s) => s.openAuth)
  return (
    <Button size="lg" className={className} onClick={() => (session ? navigate({ name: 'compose' }) : openAuth('register'))}>
      {label} <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
    </Button>
  )
}

// ─── “Has something been left for me?” — the magic key door ────

type MagicSealed = {
  sealed: true
  releaseAt: string | null
  authorName: string
  recipientTag: string
  customRecipient: string | null
  hint: string | null
  mediaCount: number
}

type MagicOpen = {
  sealed: false
  title: string
  content: string | null
  authorName: string
  recipientTag: string
  customRecipient: string | null
  heirNote: string | null
  releaseAt: string | null
  createdAt: string
  media: { id: string; kind: string; filename: string; mimeType: string; size: number; url: string }[]
}

type MagicResult = MagicSealed | MagicOpen

function isMagicOpen(r: MagicResult): r is MagicOpen {
  return r.sealed === false
}

function MagicOpenView({ r }: { r: MagicOpen }) {
  const images = r.media.filter((m) => m.kind === 'IMAGE')
  const videos = r.media.filter((m) => m.kind === 'VIDEO')
  const audio = r.media.filter((m) => m.kind === 'AUDIO')
  const others = r.media.filter((m) => !['IMAGE', 'VIDEO', 'AUDIO'].includes(m.kind))
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.04]">
      {/* letter head */}
      <div className="border-b border-primary/20 bg-card px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> This has been waiting for you.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          From <span className="font-medium text-foreground">{r.authorName}</span>
          {r.releaseAt ? <> · sealed until {new Date(r.releaseAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</> : null}
          {' · '}{recipientLabel(r.recipientTag, r.customRecipient)}
        </p>
      </div>

      {/* the letter itself */}
      <div className="paper-grain px-5 py-6 sm:px-8">
        <h4 className="font-display text-xl font-bold sm:text-2xl">{r.title}</h4>
        {r.content && (
          <p className="mt-4 whitespace-pre-wrap font-display text-[15px] leading-relaxed text-foreground">
            {r.content}
          </p>
      )}
      {r.heirNote && (
        <div className="mt-6 rounded-lg border border-dashed bg-card/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <PenLine className="h-3.5 w-3.5 text-primary" aria-hidden /> A note that traveled with it
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm italic leading-relaxed">{r.heirNote}</p>
        </div>
      )}
      </div>

      {/* media */}
      {(images.length > 0 || videos.length > 0 || audio.length > 0 || others.length > 0) && (
        <div className="border-t border-primary/20 bg-card px-5 py-4">
          {images.length > 0 && (
            <div className={`grid gap-2 ${images.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {images.map((m) => (
                <img key={m.id} src={m.url} alt={m.filename} className="max-h-96 w-full rounded-lg border object-contain" loading="lazy" />
              ))}
            </div>
          )}
          {videos.map((m) => (
            <video key={m.id} src={m.url} controls className="mt-2 w-full rounded-lg border" preload="metadata" />
          ))}
          {audio.map((m) => (
            <audio key={m.id} src={m.url} controls className="mt-2 w-full" />
          ))}
          {others.map((m) => (
            <a key={m.id} href={m.url} download className="mt-2 block text-sm text-primary underline">
              Download {m.filename}
            </a>
          ))}
        </div>
      )}

      <div className="border-t border-primary/20 bg-secondary/50 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          This message is yours now — no account needed today. Keep the key safe, and pass the story on one day.
        </p>
      </div>
    </div>
  )
}

function LegacyLookup() {
  const [keyInput, setKeyInput] = useState('')
  const [keyChecking, setKeyChecking] = useState(false)
  const [keyResults, setKeyResults] = useState<MagicResult[] | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)

  async function checkKey(e: React.FormEvent) {
    e.preventDefault()
    setKeyError(null)
    setKeyResults(null)
    setKeyChecking(true)
    try {
      const r = await api<{ found: boolean; results: MagicResult[] }>('/api/legacy/magic-claim', {
        method: 'POST',
        json: { key: keyInput },
      })
      setKeyResults(r.found ? r.results : [])
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Something went wrong — try again.')
    } finally {
      setKeyChecking(false)
    }
  }

  const keyInputId = 'legacy-lookup-key'

  return (
    <motion.div {...fadeUp} className="mx-auto mt-12 max-w-2xl rounded-2xl border border-primary/25 bg-card p-6 shadow-lg sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden />
        </span>
        <div className="flex-1">
          <h3 className="font-display text-xl font-bold">Has something been left for you?</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Someone may have sealed a capsule with your name on it — speak the magic key they handed you, and it opens right here. No account, no email, nothing else.
          </p>
        </div>
      </div>

      <form onSubmit={checkKey} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label htmlFor={keyInputId} className="sr-only">Your magic key</label>
            <input
              id={keyInputId}
              type="text"
              required
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Speak the word they handed you…"
              autoComplete="off"
              className="h-11 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-primary focus:ring-2"
            />
            <Button type="submit" disabled={keyChecking} className="h-11">
              {keyChecking ? <Hourglass className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="mr-2 h-4 w-4" aria-hidden />}
              {keyChecking ? 'Turning the key…' : 'Open with my key'}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            The key is the word, number or phrase written on the paper they left you. No account needed.
          </p>

          {keyError && <p className="mt-3 text-sm text-destructive">{keyError}</p>}

          {keyResults && keyResults.length === 0 && (
            <div className="mt-5 rounded-xl border border-dashed p-5 text-center">
              <p className="text-sm font-medium">This key doesn&apos;t open anything — yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check the spelling with whoever left it for you. If it is right, patience may be the missing word — sealed keys only turn on the day written on the paper.
              </p>
            </div>
          )}

          {keyResults && keyResults.map((r, i) =>
            isMagicOpen(r) ? (
              <MagicOpenView key={i} r={r} />
            ) : (
              <div key={i} className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-5">
                <p className="flex items-start gap-2 text-sm font-medium">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    A sealed message from <span className="text-primary">{r.authorName}</span> is waiting behind this key
                    {r.releaseAt ? (
                      <> — it opens <span className="text-primary">{new Date(r.releaseAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span> ({coarseDuration(r.releaseAt)})</>
                    ) : null}.
                  </span>
                </p>
                {r.hint && (
                  <p className="mt-3 rounded-lg border border-dashed bg-card/70 px-4 py-3 text-sm italic">
                    <span className="font-medium not-italic">The hint they left: </span>“{r.hint}”
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  The key worked — you are verified. Come back on the day written on the paper, speak the same word, and the message opens. Keep the paper safe.
                </p>
              </div>
            ),
          )}
    </motion.div>
  )
}

export function Landing() {
  const navigate = useFV((s) => s.navigate)
  const [recent, setRecent] = useState<SerializedPost[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('closed')
  const [wStep, setWStep] = useState(0)

  useEffect(() => {
    api<{ posts: SerializedPost[]; total: number }>('/api/posts?sort=newest')
      .then((d) => {
        setRecent(d.posts.slice(0, 3))
        setTotal(d.total)
      })
      .catch(() => {})
  }, [])

  return (
    <div>
      {/* ─── Hero ─── */}
      <section className="paper-grain relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-accent/60 blur-3xl" aria-hidden />

        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2 lg:gap-14">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> A digital time capsule · est. 2026
            </span>
            <h1 className="font-display text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-6xl">
              Speak to the <span className="text-primary">centuries.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Record video messages, photographs and letters addressed to your future children,
              your grandchildren — and the people of 2078. Seal them with a date. Future Voices
              keeps them safe until the world is ready to listen.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <DemoCTA label="Seal your first capsule" className="h-12 px-6 text-base" />
              <Button size="lg" variant="outline" onClick={() => navigate({ name: 'archive' })} className="h-12 px-6 text-base">
                Explore the archive
              </Button>
            </div>
            <dl className="mt-10 flex gap-8 text-sm">
              <div>
                <dt className="text-muted-foreground">Capsules entrusted</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{total ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Farthest destination</dt>
                <dd className="font-display text-2xl font-bold">Year 9999</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lost to prying eyes</dt>
                <dd className="font-display text-2xl font-bold">0</dd>
              </div>
            </dl>
          </motion.div>

          {/* decorative capsule stack */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative mx-auto hidden w-full max-w-md lg:block"
            aria-hidden
          >
            <div className="relative rounded-2xl border border-primary/25 bg-card p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">To: my future child</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Lock className="h-3.5 w-3.5" /> Sealed · 2054
                </span>
              </div>
              <p className="font-display text-lg leading-relaxed text-foreground">
                &ldquo;By the time you read this, you&apos;ll be taller than me. Here is what I
                learned at your age…&rdquo;
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="wax-seal flex h-9 w-9 items-center justify-center rounded-full">
                  <Hourglass className="h-4 w-4 text-primary-foreground" />
                </span>
                <span>Opens March 12, 2054 · countdown running</span>
              </div>
            </div>

            <div className="ember-float absolute -left-10 -top-8 rotate-[-8deg] rounded-xl border bg-card p-3 shadow-lg">
              <Video className="h-6 w-6 text-primary" />
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider">Video · 03:12</p>
            </div>
            <div className="ember-float absolute -right-6 top-1/3 rotate-[6deg] rounded-xl border bg-card p-3 shadow-lg" style={{ animationDelay: '1.2s' }}>
              <ImageIcon className="h-6 w-6 text-primary" />
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider">Photo · 2 files</p>
            </div>
            <div className="ember-float absolute -bottom-8 left-1/4 rotate-[-4deg] rounded-xl border bg-card p-3 shadow-lg" style={{ animationDelay: '2.1s' }}>
              <PenLine className="h-6 w-6 text-primary" />
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider">Letter · 480 words</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Open a capsule from the past (interactive demo) ─── */}
      <section className="border-t bg-secondary/40">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:gap-14">
          <motion.div {...fadeUp} className="relative order-2 lg:order-1">
            <div className="overflow-hidden rounded-2xl border shadow-xl">
              { }
              <img
                src="/demo/rose-sisters.jpg"
                alt="Two young women laughing together in a 1940s black-and-white photograph, real film grain"
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="ember-float absolute -bottom-5 left-4 rotate-[-3deg] rounded-lg border bg-card px-4 py-2.5 shadow-lg">
              <p className="text-xs font-medium">“Rose and her sister · 1944”</p>
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="order-1 lg:order-2">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Archive className="h-3.5 w-3.5" aria-hidden /> Try it — right here
            </span>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Open a capsule from the past.</h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
              In June 1944, Rose — a twenty-two-year-old seamstress — sealed a letter for a
              great-granddaughter who did not exist yet. It waited eighty years. This is what
              the day it opened felt like —
              <span className="font-medium text-foreground"> experience it for yourself.</span>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => setDemoPhase('sealed')} className="h-12 px-7 text-base">
                <Lock className="mr-2 h-4 w-4" aria-hidden /> Open Rose&apos;s capsule
              </Button>
              <span className="text-sm text-muted-foreground">Takes 60 seconds. Tissues optional.</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── See exactly how it's done (photo walkthrough) ─── */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <motion.div {...fadeUp} className="mb-10 text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Real photographs — every step
            </span>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">See exactly how it&apos;s done.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Four steps, about ten minutes — and a message that outlives us all.
              The same steps your grandchildren will thank you for taking.
            </p>
          </motion.div>

          <motion.div {...fadeUp} className="grid items-start gap-6 lg:grid-cols-[1fr_1.55fr]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1" role="tablist" aria-label="Walkthrough steps">
              {WALKTHROUGH.map((w, i) => (
                <button
                  key={w.title}
                  role="tab"
                  aria-selected={wStep === i}
                  onClick={() => setWStep(i)}
                  className={`rounded-xl border p-4 text-left transition-all ${wStep === i ? 'border-primary bg-primary/5 shadow-sm' : 'bg-card hover:bg-secondary/50'}`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${wStep === i ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                      {i + 1}
                    </span>
                    <span className="font-display font-semibold">{w.title}</span>
                  </span>
                  <span className={`mt-1.5 block text-sm leading-relaxed text-muted-foreground ${wStep === i ? '' : 'hidden sm:block'}`}>
                    {w.body}
                  </span>
                </button>
              ))}
            </div>

            <div>
              <div className="overflow-hidden rounded-2xl border shadow-xl">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={WALKTHROUGH[wStep].img}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    src={WALKTHROUGH[wStep].img}
                    alt={WALKTHROUGH[wStep].alt}
                    className="w-full"
                    loading="lazy"
                  />
                </AnimatePresence>
              </div>
              <p className="mt-3 text-center text-sm text-muted-foreground">{WALKTHROUGH[wStep].caption}</p>
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="mt-10 text-center">
            <DemoCTA label="Start yours now — it takes ten minutes" />
          </motion.div>
        </div>
      </section>

      {/* ─── Keepers & legacies: the grandparent promise ─── */}
      <section className="border-t bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <motion.div {...fadeUp} className="mx-auto mb-12 max-w-3xl text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Gift className="h-3.5 w-3.5" aria-hidden /> For parents &amp; grandparents
            </span>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Sealed for children you may never meet</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Lock a capsule for 30 years and one honest question appears: who hands it over?
              With Future Voices, your grandchildren don&apos;t need you there — they need one
              word your family knows: a single{' '}
              <span className="font-medium text-foreground">magic key</span> — a secret word on paper.
              One day they type it here and your message opens. No inbox, no account, nothing to hack:
              they can check for their legacy on this very page, any year, any decade.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: KeyRound,
                title: '1 · Choose a magic key',
                body: 'While sealing the capsule, pick a secret word, number or phrase only your people would ever guess. The site stores it as an unreadable fingerprint — even we can never see it.',
              },
              {
                icon: PenLine,
                title: '2 · Write it on paper and hand it over',
                body: 'An envelope, a will, the family book — a physical key that never expires, never lands in a spam folder, and cannot be intercepted online.',
              },
              {
                icon: Sparkles,
                title: '3 · One day, they speak the word',
                body: 'They open this page, type the word, and if the time has come your message opens right here — no account, no email. Yours to keep forever.',
              },
            ].map((s, i) => (
              <motion.div key={s.title} {...fadeUp} transition={{ duration: 0.5, delay: i * 0.1 }}
                className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <s.icon className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </motion.div>
            ))}
          </div>

          <LegacyLookup />

          <motion.div {...fadeUp} className="mt-10 rounded-2xl border border-primary/25 bg-card p-6 shadow-lg sm:p-8">
            <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
              <span className="wax-seal flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
                <Hourglass className="h-6 w-6 text-primary-foreground" aria-hidden />
              </span>
              <div className="flex-1">
                <p className="font-display text-lg font-semibold leading-snug">
                  “I am a father. I seal it this year. In 2056 my grandchildren open it — even if I am not there to see it.”
                </p>
                <p className="mt-1 text-sm text-muted-foreground">The promise every capsule with keepers makes.</p>
              </div>
              <DemoCTA label="Make that promise" className="shrink-0" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <motion.div {...fadeUp} className="mb-10">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Built to be trusted with tomorrow</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              A promise half a century long needs engineering to match.
            </p>
          </motion.div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} {...fadeUp} transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
                className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <f.icon className="mb-3 h-6 w-6 text-primary" aria-hidden />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
          <motion.p {...fadeUp} className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Private capsules are never exposed — every file request re-checks the lock at read time.
          </motion.p>
        </div>
      </section>

      {/* ─── Recent public capsules ─── */}
      <section className="border-t bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <motion.div {...fadeUp} className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Voices already traveling</h2>
              <p className="mt-2 text-muted-foreground">Recently entrusted to the public Future Archive.</p>
            </div>
            <Button variant="ghost" onClick={() => navigate({ name: 'archive' })}>
              View all <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Button>
          </motion.div>
          {recent.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((p, i) => (
                <PostCard key={p.id} post={p} index={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              The archive is quiet… for now. Be the first voice.
            </div>
          )}
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="border-t">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <motion.div {...fadeUp}>
            <Hourglass className="ember-float mx-auto mb-5 h-10 w-10 text-primary" aria-hidden />
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Someone in 2078 is waiting to hear from you.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              It takes five minutes to seal a message that could define someone&apos;s whole year —
              or their whole life.
            </p>
            <DemoCTA label="Start your capsule" className="mt-8 h-12 px-8 text-base" />
          </motion.div>
        </div>
      </section>

      <DemoModal phase={demoPhase} setPhase={setDemoPhase} />
    </div>
  )
}
