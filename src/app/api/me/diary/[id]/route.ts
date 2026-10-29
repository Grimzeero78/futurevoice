import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse, HttpError } from '@/lib/auth'
import { parseDiarySeal } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Edit or delete one of my diary entries.
 * A SEALED entry is frozen: it cannot be read, edited or deleted until its
 * seal date arrives — that was the whole point of sealing it.
 */

const MAX_BODY = 20000
const MAX_TITLE = 120
const MAX_MOOD = 24

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser(req)

    const existing = await db.diaryEntry.findUnique({ where: { id } })
    if (!existing || existing.authorId !== user.id) {
      return NextResponse.json({ error: 'Diary entry not found.' }, { status: 404 })
    }
    if (existing.sealedUntil && existing.sealedUntil > new Date()) {
      throw new HttpError(
        403,
        `This entry is sealed until ${existing.sealedUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} — that was the point. Not even you can open it early.`,
      )
    }

    const body = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}

    if (body.title !== undefined) {
      const title = String(body.title).trim()
      if (!title || title.length > MAX_TITLE) throw new HttpError(400, 'Titles must be 1–120 characters.')
      data.title = title
    }
    if (body.body !== undefined) {
      const text = String(body.body ?? '').trim()
      if (!text || text.length > MAX_BODY) throw new HttpError(400, 'Entries need 1–20,000 characters of writing.')
      data.body = text
    }
    if (body.mood !== undefined) {
      data.mood = String(body.mood ?? '').trim().slice(0, MAX_MOOD) || null
    }
    if (body.entryDate !== undefined) {
      const d = new Date(String(body.entryDate))
      if (isNaN(d.getTime())) throw new HttpError(400, 'That date could not be understood.')
      data.entryDate = d
    }
    if (body.sealedUntil !== undefined) {
      data.sealedUntil = parseDiarySeal(body.sealedUntil)
    }

    const entry = await db.diaryEntry.update({ where: { id }, data })
    return NextResponse.json({ entry: { ...entry, locked: false } })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser(req)

    const existing = await db.diaryEntry.findUnique({ where: { id } })
    if (!existing || existing.authorId !== user.id) {
      return NextResponse.json({ error: 'Diary entry not found.' }, { status: 404 })
    }
    if (existing.sealedUntil && existing.sealedUntil > new Date()) {
      throw new HttpError(
        403,
        `This entry is sealed until ${existing.sealedUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} — sealed days cannot be deleted either. That was the point.`,
      )
    }

    await db.diaryEntry.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
