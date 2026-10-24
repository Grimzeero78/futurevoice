'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Hourglass, Lock, Video, Mail, ImageIcon, Archive, EyeOff, Tag,
  Download, ShieldCheck, ArrowRight, Sparkles, Heart, Gift, Users,
  MailCheck, KeyRound, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PostCard } from '@/components/fv/post-card'
import { api } from '@/lib/fv-client'
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
    img: '/demo/steps/step-1-write.png',
    title: 'Write it, snap it, seal it in',
    body: 'A letter, photographs, a video or a voice note — attach everything you want the future to hold. No size limits, no file limits.',
    caption: 'The real compose form: Grace is writing to her grandchildren with a family photo attached.',
    alt: 'Compose form with a letter to grandchildren and a family photograph attached',
  },
  {
    img: '/demo/steps/step-2-keepers.png',
    title: 'Choose who will see it',
    body: 'Just you? Your children & named keepers? Or everyone? Add the exact emails of the people who should inherit it — plus one family passphrase only you all know.',
    caption: 'Choosing “My children & keepers”: Wanjiku and Kiama are named, and the family passphrase is set.',
    alt: 'Audience chooser with My children and keepers selected, showing keeper emails and a family passphrase',
  },
  {
    img: '/demo/steps/step-3-seal.png',
    title: 'Seal it until the day comes',
    body: 'Pick any date: a birthday in 2056, a graduation in 2078 — or the year 3026, a full millennium away. Until then, not even a whisper escapes.',
    caption: 'The time lock: this capsule stays sealed until Monday, June 12, 2056 — in 29 years.',
    alt: 'Time lock settings showing a seal date of June 12, 2056',
  },
  {
    img: '/demo/steps/step-4-legacy.jpg',
    title: 'On the day, it finds them',
    body: 'When the seal breaks we email every keeper. They sign in, speak the family word — and your voice becomes theirs to keep forever.',
    caption: 'Sealed and counting: 29 years and 7 months to go. One day Wanjiku and Kiama will open this.',
    alt: 'Sealed capsule with a countdown of 29 years and 7 months above the family photograph',
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

const DEMO_LETTER = `My grandchildren,

If you are reading this, fifty years have passed since a woman sat under a jacaranda tree and wrote to people she had never met. I was thirty-four. I had three children, a stone house with a tin roof, and a vegetable stall at the market that paid for all of it.

I sealed this capsule in January 1972. The keeper probably thought I was mad. Maybe I was — but here we are, and you are reading my voice across half a century.

Three things I need you to know.

One. We were happy on very little. The photographs in this capsule show it — look at our faces. Whatever you are chasing out there, do not forget that joy is not bought.

Two. You come from farmers and traders and stubborn women. When the world tells you that you cannot, remember whose blood is in you.

Three. I prayed for you every Sunday of my life — years before your parents met, before your names existed. You were never a stranger to me. You were a hope I carried.

Now tell me: is the jacaranda still purple in October? Do children still run barefoot after the rain?

With all my love across the years,
Your grandmother,
Esther Wanjiku
Nairobi · January 1972`

type DemoPhase = 'closed' | 'sealed' | 'opening' | 'letter'

function DemoModal({ phase, setPhase }: { phase: DemoPhase; setPhase: (p: DemoPhase) => void }) {
  const [year, setYear] = useState(1972)

  useEffect(() => {
    if (phase !== 'opening') return
    const started = Date.now()
    const total = 2400
    const iv = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / total)
      const eased = 1 - Math.pow(1 - t, 3)
      // 1972 → 2022 with an ease-out roll
      setYear(1972 + Math.round(eased * (t === 0 ? 0 : 50)))
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
          aria-label="Sample capsule from 1972"
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
                <h3 className="font-display text-2xl font-bold sm:text-3xl">“For my grandchildren, on the day the seal breaks”</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Sealed in January 1972 by Esther Wanjiku, a market trader from Nairobi — addressed to grandchildren
                  who did not exist yet. It waited fifty years.
                </p>
                <div className="mx-auto mt-8 max-w-xs rounded-xl border border-primary/30 bg-card p-5 shadow-lg">
                  <span className="wax-seal mx-auto flex h-16 w-16 items-center justify-center rounded-full">
                    <Lock className="h-7 w-7 text-primary-foreground" aria-hidden />
                  </span>
                  <p className="mt-4 text-xs font-medium uppercase tracking-widest text-primary">Sealed for 50 years</p>
                  <p className="mt-1 text-xs text-muted-foreground">1972 ——— 2022</p>
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
                  {year < 2022 ? 'the seal is breaking…' : 'the capsule is open'}
                </p>
              </div>
            )}

            {phase === 'letter' && (
              <div className="px-5 py-8 sm:px-10">
                <div className="paper-grain rounded-xl border bg-card p-6 shadow-sm sm:p-8">
                  <p className="text-xs font-medium uppercase tracking-widest text-primary">Sealed 1972 · Opened 2022 · 50 years in waiting</p>
                  <h3 className="mt-2 font-display text-2xl font-bold">For my grandchildren, on the day the seal breaks</h3>
                  <p className="mt-5 whitespace-pre-wrap font-display text-[15px] leading-relaxed">{DEMO_LETTER}</p>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <figure className="overflow-hidden rounded-xl border shadow-sm">
                    <img src="/demo/esther-family.jpg" alt="A family of five in front of a stone house under a jacaranda tree, 1971" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <figcaption className="bg-card px-3 py-2 text-xs text-muted-foreground">Our family outside the house, 1971 — look at our faces.</figcaption>
                  </figure>
                  <figure className="overflow-hidden rounded-xl border shadow-sm">
                    <img src="/demo/esther-market.jpg" alt="Women selling vegetables and baskets at an open-air market, 1968" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <figcaption className="bg-card px-3 py-2 text-xs text-muted-foreground">My stall at the market, 1968 — where every shilling was earned.</figcaption>
                  </figure>
                </div>

                <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
                  <Gift className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden />
                  <h4 className="font-display text-xl font-bold">Now imagine whose name is on yours.</h4>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    This capsule took Esther about ten minutes to write — and it defined a day, fifty years later.
                    Seal yours for 2056, for 3026, or for a grandchild you haven&apos;t met yet.
                  </p>
                  <DemoCTA className="mt-5" label="Seal your own capsule" />
                  <p className="mt-3 text-[11px] text-muted-foreground">A sample capsule shown on this page — yours can wait 50 years, or 1,000.</p>
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
              <Mail className="h-6 w-6 text-primary" />
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
                src="/demo/legacy-hero.jpg"
                alt="A grandfather and his granddaughter opening a wooden box of letters and photographs together"
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="ember-float absolute -bottom-5 left-4 rotate-[-3deg] rounded-lg border bg-card px-4 py-2.5 shadow-lg">
              <p className="text-xs font-medium">“What will they hear from us?”</p>
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="order-1 lg:order-2">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Archive className="h-3.5 w-3.5" aria-hidden /> Try it — right here
            </span>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Open a capsule from the past.</h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
              In 1972, Esther Wanjiku sealed a letter for grandchildren she would never meet.
              It waited fifty years. This is what the day it opened felt like —
              <span className="font-medium text-foreground"> experience it for yourself.</span>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => setDemoPhase('sealed')} className="h-12 px-7 text-base">
                <Lock className="mr-2 h-4 w-4" aria-hidden /> Open Esther&apos;s capsule
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
              <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Real screenshots — no mockups
            </span>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">See exactly how it&apos;s done.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Four steps, about ten minutes — and a message that outlives us all.
              This is the actual form your grandchildren will thank you for filling.
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
              With Future Voices, your grandchildren don&apos;t need you there — they need the
              email you wrote, and one word your family knows.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Users,
                title: '1 · Name your keepers',
                body: 'While sealing the capsule, add the emails of your children, grandchildren or a trusted friend — up to ten people, each with a name you choose.',
              },
              {
                icon: MailCheck,
                title: '2 · The day it opens, they are invited',
                body: 'From the day you seal it, keepers see it waiting in the Legacies tab of their own vault — “something is kept for you, it opens June 12, 2056.” When the date arrives we email them automatically.',
              },
              {
                icon: KeyRound,
                title: '3 · One family word, and it is theirs',
                body: 'Optionally protect it with a passphrase only your family knows. Each keeper signs in with that exact email, speaks the word — and the capsule is theirs to keep forever.',
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
