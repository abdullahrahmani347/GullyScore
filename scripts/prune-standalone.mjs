/**
 * Prune the Next.js standalone build to dramatically shrink the deploy bundle.
 *
 * Next.js's standalone tracer conservatively copies anything reachable from
 * the entry graph. For Prisma this means the entire @prisma/client/runtime
 * folder — which contains WASM blobs for ALL five database engines Prisma
 * supports (sqlite, mysql, sqlserver, cockroachdb, postgresql). At ~58MB,
 * that single folder is the dominant contributor to the deploy tarball.
 *
 * Since GullyScore only uses SQLite, we can safely delete the other engines'
 * WASM blobs after the build.
 */
import { rmSync, statSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const STANDALONE = join(ROOT, '.next', 'standalone')

function logMb(label, bytes) {
  const mb = (bytes / 1024 / 1024).toFixed(1)
  console.log(`  - ${label}: ${mb} MB`)
}

function dirSize(path) {
  let total = 0
  try {
    const st = statSync(path)
    if (st.isFile()) return st.size
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      total += dirSize(join(path, entry.name))
    }
  } catch {}
  return total
}

function tryRmSync(path, label) {
  if (!existsSync(path)) return 0
  try {
    const size = dirSize(path)
    rmSync(path, { recursive: true, force: true })
    console.log(`  ✓ Removed ${label}`)
    return size
  } catch (e) {
    console.warn(`  ! Could not remove ${label}: ${e.message}`)
    return 0
  }
}

function deleteByPattern(pattern, root) {
  let count = 0
  let bytes = 0
  const walk = (dir) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.isFile() && pattern.test(entry.name)) {
          try {
            const sz = statSync(full).size
            rmSync(full, { force: true })
            count++
            bytes += sz
          } catch {}
        }
      }
    } catch {}
  }
  walk(root)
  return { count, bytes }
}

console.log('🧹 Pruning standalone build to reduce deploy size...')

const before = dirSize(STANDALONE)
logMb('Standalone size before pruning', before)

// 1. Remove unused Prisma engine WASM blobs — keep only sqlite
console.log('\n📦 Pruning Prisma engine blobs (keep only sqlite)...')
const prismaRuntime = join(STANDALONE, 'node_modules/@prisma/client/runtime')
if (existsSync(prismaRuntime)) {
  const keep = /sqlite/i
  for (const entry of readdirSync(prismaRuntime, { withFileTypes: true })) {
    if (entry.isFile() && /query_engine_bg\./.test(entry.name) && !keep.test(entry.name)) {
      const full = join(prismaRuntime, entry.name)
      tryRmSync(full, `@prisma/client/runtime/${entry.name}`)
    }
  }
}

// 2. Remove typescript from standalone (devDep, not needed at runtime)
console.log('\n📦 Removing typescript (devDep, not needed at runtime)...')
tryRmSync(join(STANDALONE, 'node_modules/typescript'), 'typescript')

// 2b. KEEP sharp + @img — v2 §15.3 (/api/og/match/[id]) renders share cards
// through sharp at runtime. The "images.unoptimized" rationale no longer
// applies: sharp is a real route dependency now.
console.log('\n📦 Keeping sharp + @img (§15.3 OG share card runtime dependency)...')

// 3. Remove .next/cache if it leaked into standalone
console.log('\n📦 Removing .next/cache if present...')
tryRmSync(join(STANDALONE, '.next/cache'), '.next/cache')

// 4. Strip source maps (large, only for debugging)
console.log('\n📦 Stripping source maps...')
const { count: mapCount, bytes: mapBytes } = deleteByPattern(/\.map$/, STANDALONE)
console.log(`  ✓ Removed ${mapCount} source map files`)
logMb('  Source maps total', mapBytes)

// 5. Sanitize .env in standalone: v2 §15.2 needs VAPID_* keys at runtime
// (loaded by src/instrumentation.ts), but the dev container's .env carries
// an absolute `DATABASE_URL=file:/home/z/...` path that does not exist on
// deploy targets. Strip DATABASE_URL lines, keep everything else. Platform
// env vars always win (the loader never overwrites existing values).
console.log('\n📦 Sanitizing .env in standalone (drop DATABASE_URL, keep VAPID)...')
import { readFileSync, writeFileSync } from 'fs'
for (const target of [
  join(STANDALONE, '.env'),
  join(STANDALONE, '.env.local'),
  join(STANDALONE, '.env.production'),
  join(STANDALONE, '.env.development'),
]) {
  if (!existsSync(target)) continue
  const name = target.split('/').pop()
  try {
    const raw = readFileSync(target, 'utf8')
    const kept = raw
      .split('\n')
      .filter((line) => {
        const t = line.trim()
        return t !== '' && !t.startsWith('#') && !/^DATABASE_URL\s*=/i.test(t)
      })
    if (kept.length === 0) {
      tryRmSync(target, `${name} (nothing to keep)`)
    } else {
      writeFileSync(target, kept.join('\n') + '\n')
      console.log(`  ✓ Sanitized ${name} — kept ${kept.length} key(s)`)
    }
  } catch (e) {
    console.warn(`  ! Could not sanitize ${name}: ${e.message}`)
  }
}

const after = dirSize(STANDALONE)
logMb('Standalone size after pruning', after)
const saved = before - after
logMb('Total saved', saved)
console.log(`\n✅ Pruning complete. Reduced by ${((saved / before) * 100).toFixed(1)}%`)
