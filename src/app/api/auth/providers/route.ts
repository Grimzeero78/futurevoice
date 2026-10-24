import { NextResponse } from 'next/server'
import { googleConfigured } from '@/lib/oauth'

export const runtime = 'nodejs'

// Tells the UI which sign-in providers are configured on this server.
export async function GET() {
  return NextResponse.json({ google: googleConfigured() })
}
