import { PrismaClient } from '@prisma/client'
import { env, onCloudflare } from '@/lib/env'

/**
 * One Prisma client for two runtimes:
 *
 *  - Cloudflare Workers → D1 database through the official Prisma driver
 *    adapter (`@prisma/adapter-d1`). OpenNext patches the generated client
 *    during `cf:build` so it runs inside workerd.
 *  - Self-hosted Node (Windows / Linux / Docker) → the SQLite file behind
 *    DATABASE_URL through better-sqlite3, exactly as Future Voices has
 *    always done.
 *
 * The rest of the codebase imports `db` and never needs to know which
 * runtime it is on.
 */

type Client = PrismaClient

const globalForPrisma = globalThis as unknown as {
  prisma: Client | undefined
}

function createClient(): Client {
  if (onCloudflare()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaD1 } = require('@prisma/adapter-d1') as typeof import('@prisma/adapter-d1')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env: { DB: unknown } }
    }
    // D1 binding type is taken from the adapter itself (no workers-types needed)
    const adapter = new PrismaD1(getCloudflareContext().env.DB as ConstructorParameters<typeof PrismaD1>[0])
    return new PrismaClient({ adapter, log: ['error'] })
  }
  // Self-host: SQLite file through better-sqlite3 (sync, fast, prebuilt for
  // Windows/Linux/macOS). The file is created/synced by `prisma db push`,
  // which runs automatically before `dev`/`start` via the pre* scripts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSQLite3 } = require('@prisma/adapter-better-sqlite3') as typeof import('@prisma/adapter-better-sqlite3')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path')
  const url = env('DATABASE_URL') ?? 'file:./db/custom.db'
  const filePath = url.replace(/^file:/, '')
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  const adapter = new PrismaBetterSQLite3({ url: `file:${absolute}` })
  return new PrismaClient({ adapter, log: ['error'] })
}

export const db: Client = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
