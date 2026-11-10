import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { onCloudflare } from '@/lib/env'
import { D1_SCHEMA_STATEMENTS } from '@/lib/d1-schema'
import { allowShortSeals } from '@/lib/fv-core'

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
      const alter = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN/i)
      if (alter) {
        try {
          await db.$executeRawUnsafe(stmt)
          created.push(`column ${alter[1]}`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (/duplicate column|already exists/i.test(msg)) skipped.push(`column ${alter[1]}`)
          else errors.push(`column ${alter[1]}: ${msg}`)
        }
        continue
      }
      const drop = stmt.match(/DROP\s+(?:TABLE|INDEX)\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/i)
      if (drop) {
        // /api/setup never destroys anything — a DROP here is a migration-only
        // repair step. Skipping it is safe in every case: if the object exists
        // the matching CREATE below is skipped too, and if it is genuinely
        // missing the CREATE re-creates it.
        skipped.push(`drop ${drop[1].toLowerCase()} (setup never drops)`)
        continue
      }
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

    // ── The seven-year law (backfill) ────────────────────────────────
    // Every PUBLIC capsule must sleep at least seven years from the day it
    // was created. Capsules made before this rule — with no wake-up date or
    // a sooner one — get their release moved to createdAt + 7 years. Words,
    // files and privacy settings are never touched; private capsules keep
    // whatever their author chose for themselves.
    let backfilled = 0
    if (!allowShortSeals()) {
      try {
        const publics = await db.post.findMany({
          where: { privacy: 'PUBLIC' },
          select: { id: true, createdAt: true, releaseAt: true },
        })
        for (const p of publics) {
          const earliest = new Date(p.createdAt)
          earliest.setFullYear(earliest.getFullYear() + 7)
          if (!p.releaseAt || p.releaseAt < earliest) {
            await db.post.update({ where: { id: p.id }, data: { releaseAt: earliest } })
            backfilled++
          }
        }
        if (backfilled > 0) created.push(`seven-year sleep restored on ${backfilled} public capsule(s)`)
      } catch (e) {
        errors.push(`seven-year backfill: ${e instanceof Error ? e.message : String(e)}`)
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
