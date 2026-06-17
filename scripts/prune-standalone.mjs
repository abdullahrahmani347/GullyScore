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

// 2b. Remove sharp + @img (we set images.unoptimized = true in next.config)
console.log('\n📦 Removing sharp / @img (image optimization disabled)...')
tryRmSync(join(STANDALONE, 'node_modules/sharp'), 'sharp')
tryRmSync(join(STANDALONE, 'node_modules/@img'), '@img')

// 3. Remove .next/cache if it leaked into standalone
console.log('\n📦 Removing .next/cache if present...')
tryRmSync(join(STANDALONE, '.next/cache'), '.next/cache')

// 4. Strip source maps (large, only for debugging)
console.log('\n📦 Stripping source maps...')
const { count: mapCount, bytes: mapBytes } = deleteByPattern(/\.map$/, STANDALONE)
console.log(`  ✓ Removed ${mapCount} source map files`)
logMb('  Source maps total', mapBytes)

const after = dirSize(STANDALONE)
logMb('Standalone size after pruning', after)
const saved = before - after
logMb('Total saved', saved)
console.log(`\n✅ Pruning complete. Reduced by ${((saved / before) * 100).toFixed(1)}%`)
