import { PrismaClient } from '@prisma/client'
import { mkdirSync, existsSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'

/**
 * Resolve the SQLite database path in a deployment-portable way.
 *
 * - In DEV, we honour DATABASE_URL from .env (absolute path is fine here).
 * - In PRODUCTION (standalone build), the .env absolute path is NOT portable
 *   because the standalone server is copied to a different filesystem location
 *   by the deploy pipeline. We instead resolve a relative path next to the
 *   server.js so the database travels with the deployed bundle.
 */
function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL

  if (process.env.NODE_ENV !== 'production') {
    // Dev: trust whatever .env says.
    return envUrl || 'file:./db/custom.db'
  }

  // Production standalone: anchor the DB next to the running process.
  // process.cwd() is set to the standalone dir by server.js, so this
  // resolves to <standalone>/db/custom.db on the deploy target.
  const dbDir = join(process.cwd(), 'db')
  const dbFile = join(dbDir, 'custom.db')

  try {
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
  } catch {
    // mkdir may fail if running in a read-only location; ignore — Prisma
    // will surface a clearer error if it actually can't write.
  }

  // If a bundled seed DB exists next to the server (placed there by the
  // build script), copy it into place on first run.
  const seedDb = join(process.cwd(), 'db', 'custom.db.seed')
  if (existsSync(seedDb) && !existsSync(dbFile)) {
    try {
      mkdirSync(dirname(dbFile), { recursive: true })
      copyFileSync(seedDb, dbFile)
    } catch {
      // ignore — fall through to Prisma's own handling
    }
  }

  return `file:${dbFile}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Ensure DATABASE_URL is set before Prisma client is instantiated.
if (!process.env.DATABASE_URL || process.env.NODE_ENV === 'production') {
  process.env.DATABASE_URL = resolveDatabaseUrl()
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
