#!/usr/bin/env node
/**
 * Regenerates src/lib/d1-schema.ts from migrations/*.sql so the /api/setup
 * route can initialize a fresh Cloudflare D1 database with zero CLI.
 *
 * Run this after generating new migration SQL, e.g.:
 *   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
 *       --script --output migrations/0002_whatever.sql
 *   node scripts/gen-d1-schema.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = new URL('../migrations/', import.meta.url).pathname
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

const statements = []
for (const f of files) {
  const sql = readFileSync(join(dir, f), 'utf8')
  for (const chunk of sql.split(/;\s*\n/)) {
    const stmt = chunk
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .trim()
    if (stmt) statements.push(stmt)
  }
}

const body = statements.map((s) => '  ' + JSON.stringify(s) + ',').join('\n')
const ts = `// AUTO-GENERATED from migrations/*.sql — do not edit by hand.
// Regenerate with: node scripts/gen-d1-schema.mjs
//
// Every CREATE TABLE / CREATE INDEX statement of the Future Voices schema,
// in dependency order. The /api/setup route runs whichever are missing, so a
// brand-new Cloudflare D1 database initializes itself on first visit — no
// command line needed.
export const D1_SCHEMA_STATEMENTS: readonly string[] = [
${body}
]
`

writeFileSync(new URL('../src/lib/d1-schema.ts', import.meta.url), ts)
console.log(`d1-schema.ts regenerated: ${statements.length} statements from ${files.join(', ')}`)
