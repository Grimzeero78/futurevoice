import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, errorResponse } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req)
    if (!user) return NextResponse.json({ user: null })

    const [postCount, sealedCount, reactionsReceived] = await Promise.all([
      db.post.count({ where: { authorId: user.id } }),
      db.post.count({ where: { authorId: user.id, status: 'SEALED' } }),
      db.reaction.count({ where: { post: { authorId: user.id } } }),
    ])

    return NextResponse.json({ user: { ...user, stats: { postCount, sealedCount, reactionsReceived } } })
  } catch (e) {
    return errorResponse(e)
  }
}
