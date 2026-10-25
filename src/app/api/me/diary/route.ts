import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse, HttpError } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The everyday diary — small, ordinary days, recorded for later.
 * Entries are private to their author, forever. A sealed entry is hidden
 * from EVERYONE — including the author — until its seal date arrives;
 * the server simply never sends its content before then.
 */

const MAX_BODY = 20000
const MAX_TITLE = 120
const MAX_MOOD = 24

function serializeEntry(
  e: {
    id: string
    title: string
    body: string
    mood: string | null
    entryDate: Date
    sealedUntil: Date | null
    createdAt: Date
    updatedAt: Date
  },
  locked: boolean,
) {
  if (locked) {
    // sealed content never leaves the server — not even the title
    return {
      id: e.id,
      entryDate: e.entryDate,
      sealedUntil: e.sealedUntil,
      locked: true,
    }
  }
  return {
    id: e.id,
    title: e.title,
    body: e.body,
    mood: e.mood,
    entryDate: e.entryDate,
    sealedUntil: e.sealedUntil,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    locked: false,
  }
}

export function parseDiarySeal(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(String(value))
  if (isNaN(d.getTime())) throw new HttpError(400, 'The seal date could not be understood.')
  if (d.getFullYear() > 9999) throw new HttpError(400, 'Seals are supported up to the year 9999.')
  if (d.getTime() < Date.now() + 60_000) {
    throw new HttpError(400, 'A seal must sit in the future — otherwise just leave the entry open.')
  }
  return d
}

// ─── List my diary ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const entries = await db.diaryEntry.findMany({
      where: { authorId: user.id },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    })
    const now = new Date()
    return NextResponse.json({
      entries: entries.map((e) => serializeEntry(e, !!e.sealedUntil && e.sealedUntil > now)),
      total: entries.length,
      sealedCount: entries.filter((e) => e.sealedUntil && e.sealedUntil > now).length,
    })
  } catch (e) {
    return errorResponse(e)
  }
}

// ─── Write an entry ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))

    const title = String(body.title ?? '').trim()
    const text = String(body.body ?? '').trim()
    const mood = String(body.mood ?? '').trim().slice(0, MAX_MOOD) || null
    if (!title) throw new HttpError(400, 'Give the day a title.')
    if (!text) throw new HttpError(400, 'Write something — even two honest lines count.')
    if (title.length > MAX_TITLE) throw new HttpError(400, 'Titles are limited to 120 characters.')
    if (text.length > MAX_BODY) throw new HttpError(400, 'Entries are limited to 20,000 characters.')

    let entryDate = new Date()
    if (body.entryDate) {
      const d = new Date(String(body.entryDate))
      if (isNaN(d.getTime())) throw new HttpError(400, 'That date could not be understood.')
      entryDate = d
    }
    const sealedUntil = parseDiarySeal(body.sealedUntil)

    const entry = await db.diaryEntry.create({
      data: { authorId: user.id, title, body: text, mood, entryDate, sealedUntil },
    })
    return NextResponse.json({ entry: serializeEntry(entry, false) }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
