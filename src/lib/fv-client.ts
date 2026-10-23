'use client'

// ─── API helper ──────────────────────────────────────────────────

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = options
  const res = await fetch(path, {
    ...rest,
    headers: json ? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  }
  return data as T
}

// XHR upload with progress reporting
export function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ id: string; kind: string; filename: string; mimeType: string; size: number; url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data.media)
        else reject(new Error(data.error || 'Upload failed'))
      } catch {
        reject(new Error('Upload failed'))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

// ─── Shared constants (mirror of server) ─────────────────────────

export const RECIPIENT_LABELS: Record<string, string> = {
  NONE: 'For the record',
  FUTURE_SELF: 'My future self',
  FUTURE_CHILD: 'My future child',
  GRANDCHILDREN: 'My grandchildren',
  PEOPLE_2078: 'People of 2078',
  FUTURE_GENERATIONS: 'Future generations',
  CUSTOM: 'Someone else',
}

export const RECIPIENT_OPTIONS = [
  'NONE',
  'FUTURE_SELF',
  'FUTURE_CHILD',
  'GRANDCHILDREN',
  'PEOPLE_2078',
  'FUTURE_GENERATIONS',
  'CUSTOM',
] as const

export const REACTION_META: { type: string; label: string }[] = [
  { type: 'HEART', label: 'Touched' },
  { type: 'STAR', label: 'Inspiring' },
  { type: 'CLOCK', label: 'See you then' },
  { type: 'SPARKLES', label: 'Hopeful' },
]

export const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam or scam' },
  { value: 'INAPPROPRIATE', label: 'Inappropriate content' },
  { value: 'COPYRIGHT', label: 'Copyright violation' },
  { value: 'OTHER', label: 'Something else' },
]

// ─── Formatting helpers ──────────────────────────────────────────

export function formatDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
  })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n < 1024 * 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
  return `${(n / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`
}

export function recipientLabel(tag: string, custom?: string | null): string {
  if (tag === 'CUSTOM') return custom ? `To ${custom}` : 'Someone else'
  return RECIPIENT_LABELS[tag] ?? 'For the record'
}

/** "in 52 years" / "in 3 days" / "in 2 hours" — coarse human phrasing */
export function coarseDuration(target: string | Date): string {
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const mins = ms / 60000
  if (mins < 60) return `in ${Math.max(1, Math.floor(mins))} min`
  const hours = mins / 60
  if (hours < 24) return `in ${Math.floor(hours)} hour${Math.floor(hours) === 1 ? '' : 's'}`
  const days = hours / 24
  if (days < 60) return `in ${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`
  const months = days / 30.44
  if (months < 24) return `in ${Math.floor(months)} month${Math.floor(months) === 1 ? '' : 's'}`
  const years = days / 365.25
  return `in ${Math.floor(years)} years`
}

export function excerpt(text: string | null | undefined, len = 140): string {
  if (!text) return ''
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > len ? t.slice(0, len).trimEnd() + '…' : t
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
