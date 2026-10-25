import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { onCloudflare } from '@/lib/env'
import { D1_SCHEMA_STATEMENTS } from '@/lib/d1-schema'

export const dynamic = 'force-dynamic'

/**
 * One-click database initialization.
 *
 * Opens in a browser right after the first deploy:
 *
 *     https://futurevoice.<your-subdomain>.workers.dev/api/setup
 *
 * It runs every CREATE TABLE / CREATE INDEX statement that is still missing
 * (in dependency order) and reports what it did. Safe to open any number of
 * times — existing objects are skipped, existing data is never touched.
 *
 * Works identically on Cloudflare D1 and self-hosted SQLite, so it can also
 * repair a database that was created before a schema update.
 */
export async function GET() {
  try {
    const existing = (await db.$queryRawUnsafe(
      `SELECT name, type FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'`,
    )) as Array<{ name: string; type: string }>
    const known = new Set(existing.map((r) => r.name))

    const created: string[] = []
    const skipped: string[] = []
    const errors: string[] = []

    for (const stmt of D1_SCHEMA_STATEMENTS) {
      const m = stmt.match(/CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX)\s+"?(\w+)"?/i)
      if (!m) {
        errors.push(`Unrecognized statement: ${stmt.slice(0, 80)}`)
        continue
      }
      const kind = m[1].toLowerCase()
      const name = m[2]
      if (known.has(name)) {
        skipped.push(`${kind} ${name}`)
        continue
      }
      try {
        await db.$executeRawUnsafe(stmt)
        created.push(`${kind} ${name}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/already exists/i.test(msg)) skipped.push(`${kind} ${name}`)
        else errors.push(`${kind} ${name}: ${msg}`)
      }
    }

    const ok = errors.length === 0
    const message = !ok
      ? 'Some statements failed — copy this page and share it with the developer.'
      : created.length > 0
        ? `Your database is ready — created ${created.length} object(s). You can close this page and open the site now.`
        : 'Your database is already initialized — everything is in place. You can close this page and open the site now.'

    return NextResponse.json(
      {
        service: 'Future Voices',
        runtime: onCloudflare() ? 'cloudflare-d1' : 'sqlite',
        ok,
        message,
        created,
        skipped,
        errors,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        service: 'Future Voices',
        ok: false,
        message:
          'Could not reach the database. If you just deployed, double-check the D1 database_id in wrangler.jsonc (CLOUDFLARE.md, step 3), then refresh this page.',
        error: msg,
      },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    )
  }
}

export async function POST() {
  return GET()
}
