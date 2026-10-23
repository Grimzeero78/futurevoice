'use client'

import { useEffect, useState } from 'react'
import { Lock, Hourglass } from 'lucide-react'
import { formatDate } from '@/lib/fv-client'

function split(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  }
}

/**
 * Time-lock countdown. For very long horizons (decades) it renders a
 * calm "opens in N years" strip; under 2 years it ticks every second.
 */
export function Countdown({ target, compact = false }: { target: string | Date; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = new Date(target).getTime() - Date.now()
    if (t > 1000 * 60 * 60 * 24 * 365 * 2) return // decades: no ticking needed
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])

  const remaining = new Date(target).getTime() - now
  const years = Math.floor(remaining / (1000 * 60 * 60 * 24 * 365.25))
  const months = Math.floor((remaining / (1000 * 60 * 60 * 24 * 30.44)) % 12)
  const t = split(remaining)

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
        <Lock className="h-3 w-3" aria-hidden />
        Opens {formatDate(target)}
      </span>
    )
  }

  if (years >= 2) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2" role="timer" aria-label="Time until this capsule opens">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-bold text-primary tabular-nums">{years}</span>
          <span className="text-sm uppercase tracking-widest text-muted-foreground">years</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-bold text-primary tabular-nums">{months}</span>
          <span className="text-sm uppercase tracking-widest text-muted-foreground">months</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Hourglass className="h-4 w-4 ember-float" aria-hidden />
          Unseals {formatDate(target, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>
    )
  }

  const cells = [
    { v: t.days, label: 'days' },
    { v: t.hours, label: 'hours' },
    { v: t.minutes, label: 'min' },
    { v: t.seconds, label: 'sec' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-3" role="timer" aria-label="Time until this capsule opens">
      {cells.map((c) => (
        <div
          key={c.label}
          className="min-w-[64px] rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-center"
        >
          <div className="font-display text-2xl font-bold tabular-nums text-primary">
            {String(c.v).padStart(2, '0')}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</div>
        </div>
      ))}
      <span className="text-sm text-muted-foreground">until it opens · {formatDate(target)}</span>
    </div>
  )
}
