'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Hourglass, Lock, Video, Mail, ImageIcon, Archive, EyeOff, Tag,
  Download, ShieldCheck, ArrowRight, Sparkles, Heart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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

const STEPS = [
  {
    icon: Mail,
    title: 'Write, record or snap',
    body: 'A letter, a video message, a photograph — or all three. Anything you want the future to hold in its hands.',
  },
  {
    icon: Lock,
    title: 'Seal it with a date',
    body: 'Choose the moment it opens: a birthday in 2036, your grandchild\u2019s 18th — or a full millennium from now, in the year 3026. Before then, nobody can peek.',
  },
  {
    icon: Hourglass,
    title: 'The future opens it',
    body: 'When the date arrives, the capsule unseals itself — landing in the public archive or waiting privately for its recipient.',
  },
]

const FEATURES = [
  { icon: EyeOff, title: 'Privacy by design', body: 'Private capsules are visible to you alone. Media is served through an access-checked gateway, never a public URL.' },
  { icon: Lock, title: 'Time locks', body: 'Sealed capsules stay sealed — enforced at the database layer and swept by a release scheduler, so no date can leak early. Lock one for an afternoon or for 1,000 years.' },
  { icon: Tag, title: 'Recipient tags', body: 'Address capsules to your future child, grandchildren, the people of 2078 — or anyone you name.' },
  { icon: Archive, title: 'The Future Archive', body: 'Opt in to a public, searchable archive of humanity\u2019s messages to tomorrow, filterable by year and media type.' },
  { icon: Heart, title: 'Future reactions', body: 'Visitors can leave a quiet signal — touched, inspired, hopeful — without ever hijacking the conversation.' },
  { icon: Download, title: 'Take your voice anywhere', body: 'Export every capsule, note and reaction you have ever recorded as a single JSON archive, any time.' },
]

export function Landing() {
  const navigate = useFV((s) => s.navigate)
  const session = useFV((s) => s.session)
  const openAuth = useFV((s) => s.openAuth)
  const [recent, setRecent] = useState<SerializedPost[]>([])
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    api<{ posts: SerializedPost[]; total: number }>('/api/posts?sort=newest')
      .then((d) => {
        setRecent(d.posts.slice(0, 3))
        setTotal(d.total)
      })
      .catch(() => {})
  }, [])

  function startCTA() {
    if (session) navigate({ name: 'compose' })
    else openAuth('register')
  }

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
              <Button size="lg" onClick={startCTA} className="h-12 px-6 text-base">
                Seal your first capsule <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
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

      {/* ─── How it works ─── */}
      <section className="border-t bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <motion.div {...fadeUp} className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">How a voice travels 50 years</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Three steps stand between today&apos;s feelings and tomorrow&apos;s ears.
            </p>
          </motion.div>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div key={s.title} {...fadeUp} transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative rounded-xl border bg-card p-6 shadow-sm">
                <span className="absolute right-5 top-5 font-display text-4xl font-bold text-primary/15">{i + 1}</span>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <s.icon className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </motion.div>
            ))}
          </div>
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
            <Button size="lg" onClick={startCTA} className="mt-8 h-12 px-8 text-base">
              Start your capsule <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
