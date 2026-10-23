import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionToken,
  destroySession,
  errorResponse,
  SESSION_COOKIE,
} from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const token = await getSessionToken(req)
    if (token) await destroySession(token)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', expires: new Date(0) })
    return res
  } catch (e) {
    return errorResponse(e)
  }
}
