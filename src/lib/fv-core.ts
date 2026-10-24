import { db } from '@/lib/db'
import { HttpError } from '@/lib/auth'

// ─── Domain constants (shared by API + client) ───────────────────

export const RECIPIENT_TAGS = {
  NONE: 'Just for the record',
  FUTURE_SELF: 'My future self',
  FUTURE_CHILD: 'My future child',
  GRANDCHILDREN: 'My grandchildren',
  PEOPLE_2078: 'People of 2078',
  FUTURE_GENERATIONS: 'Future generations',
  CUSTOM: 'Someone else…',
} as const

export type RecipientTag = keyof typeof RECIPIENT_TAGS

export const REACTION_TYPES = ['HEART', 'STAR', 'CLOCK', 'SPARKLES'] as const
export type ReactionType = (typeof REACTION_TYPES)[number]

export const REPORT_REASONS = ['SPAM', 'INAPPROPRIATE', 'COPYRIGHT', 'OTHER'] as const

// ─── Serialization helpers ───────────────────────────────────────

export function isSealed(post: { status: string; releaseAt: Date | null }): boolean {
  if (post.releaseAt && post.releaseAt > new Date()) return true
  return post.status === 'SEALED'
}

export function publicPostWhere() {
  const now = new Date()
  return {
    privacy: 'PUBLIC',
    hidden: false,
    appearInArchive: true,
    AND: [
      { OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] },
      { NOT: { status: 'SEALED' } },
    ],
  } as const
}

type PrismaPost = {
  id: string
  title: string
  content: string | null
  privacy: string
  status: string
  releaseAt: Date | null
  recipientTag: string
  customRecipient: string | null
  appearInArchive: boolean
  hidden: boolean
  hiddenReason: string | null
  views: number
  createdAt: Date
  updatedAt: Date
  authorId: string
  author?: { id: string; displayName: string } | null
  media?: { id: string; kind: string; filename: string; mimeType: string; size: number }[]
  reactions?: { type: string }[]
  _count?: { reactions: number; reports?: number }
}

export function serializePost(post: PrismaPost, opts: { sealedOverride?: boolean } = {}) {
  const sealed = opts.sealedOverride ?? isSealed(post)
  const reactionCounts: Record<string, number> = { HEART: 0, STAR: 0, CLOCK: 0, SPARKLES: 0 }
  if (post.reactions) {
    for (const r of post.reactions) {
      if (r.type in reactionCounts) reactionCounts[r.type]++
    }
  }
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    privacy: post.privacy,
    status: sealed ? 'SEALED' : 'PUBLISHED',
    releaseAt: post.releaseAt,
    recipientTag: post.recipientTag,
    customRecipient: post.customRecipient,
    appearInArchive: post.appearInArchive,
    hidden: post.hidden,
    hiddenReason: post.hiddenReason,
    views: post.views,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    authorId: post.authorId,
    author: post.author ? { id: post.author.id, displayName: post.author.displayName } : null,
    media: (post.media ?? []).map((m) => ({
      id: m.id,
      kind: m.kind,
      filename: m.filename,
      mimeType: m.mimeType,
      size: m.size,
      url: `/api/media/${m.id}`,
    })),
    reactionCounts,
    reactionTotal: post._count?.reactions ?? post.reactions?.length ?? 0,
    // ── legacy/keeper fields (filled in per-viewer by the API) ──
    heirNote: null as string | null,
    heirs: [] as { id: string; email: string; name: string | null; claimedAt: Date | null; notifiedAt: Date | null }[],
    hasHeirPassphrase: false as boolean,
    viewerIsKeeper: false as boolean,
  }
}

export type SerializedPost = ReturnType<typeof serializePost>

// ─── Validation helpers ──────────────────────────────────────────

export const MAX_HEIRS = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export type HeirInput = { email: string; name: string | null }

/**
 * Validate the keepers/heirs list sent from the compose form.
 * Accepts an array of strings or { email, name } objects, de-duplicates,
 * and caps the list at MAX_HEIRS.
 */
export function parseHeirs(value: unknown): HeirInput[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new HttpError(400, 'The keepers list must be an array.')
  const out: HeirInput[] = []
  const seen = new Set<string>()
  for (const raw of value.slice(0, MAX_HEIRS)) {
    const email = normalizeEmail(typeof raw === 'string' ? raw : (raw as { email?: unknown })?.email)
    if (!email) continue
    if (!EMAIL_RE.test(email)) {
      throw new HttpError(400, `“${email}” is not a valid email address for a keeper.`)
    }
    if (seen.has(email)) continue
    seen.add(email)
    const rawName = typeof raw === 'object' && raw ? String((raw as { name?: unknown }).name ?? '').trim() : ''
    out.push({ email, name: rawName ? rawName.slice(0, 60) : null })
  }
  return out
}

export function parseRecipientTag(value: unknown): RecipientTag {
  if (typeof value === 'string' && value in RECIPIENT_TAGS) return value as RecipientTag
  return 'NONE'
}

export function parseReleaseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(String(value))
  if (isNaN(d.getTime())) throw new HttpError(400, 'The release date could not be understood.')
  if (d.getFullYear() > 9999) {
    throw new HttpError(400, 'Release dates are supported up to the year 9999 — that is 8,000 years of patience, more than enough.')
  }
  if (d.getTime() < Date.now() - 60_000) {
    // release dates in the past are allowed only within a minute of "now"
    throw new HttpError(400, 'The release date must be in the future to seal a capsule.')
  }
  return d
}

export async function assertMediaOwnership(mediaIds: string[], userId: string) {
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) return []
  const media = await db.media.findMany({
    where: { id: { in: mediaIds }, ownerId: userId },
  })
  if (media.length !== mediaIds.length) {
    throw new HttpError(400, 'One or more attached files could not be found in your library.')
  }
  return media
}
