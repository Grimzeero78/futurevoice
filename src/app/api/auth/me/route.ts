import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, errorResponse } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req)
    if (!user) return NextResponse.json({ user: null })

    const now = new Date()
    const [postCount, sealedCount, reactionsReceived] = await Promise.all([
      db.post.count({ where: { authorId: user.id } }),
      // date-based: "sealed" means the release date is still in the future
      db.post.count({ where: { authorId: user.id, releaseAt: { gt: now } } }),
      db.reaction.count({ where: { post: { authorId: user.id } } }),
    ])

    return NextResponse.json({ user: { ...user, stats: { postCount, sealedCount, reactionsReceived } } })
  } catch (e) {
    return errorResponse(e)
  }
}
