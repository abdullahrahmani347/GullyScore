#!/usr/bin/env node
/**
 * GULLYSCORE v2 §11.1 — ADDITIVE-ONLY DB PUSH GUARD
 * ---------------------------------------------------------------------------
 * Wraps `prisma db push` so the live database can never lose data:
 *
 *   1. BACKS UP the SQLite file to db/backups/<timestamp>.db first
 *      (retention: last 10 backups).
 *   2. Runs `prisma db push` WITHOUT --accept-data-loss. Prisma itself
 *      REFUSES destructive schema changes (dropped columns/tables, type
 *      changes that lose data) unless that flag is passed — so this script
 *      makes "additive-only" (v2 §11.1) mechanically enforced, not just
 *      policy. A change that genuinely requires data loss must be run
 *      deliberately by a human, never via this script.
 *
 * Exit codes: 0 = pushed (or no changes needed), 1 = push refused/failed
 * (the pre-push backup is preserved for recovery).
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const KEEP_BACKUPS = 10;

function resolveDatabasePath() {
  if (process.env.DATABASE_URL?.startsWith('file:')) {
    return resolve(ROOT, process.env.DATABASE_URL.slice('file:'.length));
  }
  for (const envPath of [join(ROOT, '.env'), join(ROOT, 'prisma', '.env')]) {
    if (!existsSync(envPath)) continue;
    const match = readFileSync(envPath, 'utf-8').match(/^DATABASE_URL=file:(.+)$/m);
    if (match) return resolve(dirname(envPath), match[1].trim());
  }
  return null;
}

function backup(dbPath) {
  const backupDir = join(dirname(dbPath), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(backupDir, `${stamp}.db`);
  copyFileSync(dbPath, target);
  console.log(`✓ Backup written: ${target} (${(statSync(target).size / 1024).toFixed(1)} KB)`);

  const backups = readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const old of backups.slice(KEEP_BACKUPS)) {
    unlinkSync(join(backupDir, old.f));
    console.log(`  pruned old backup: ${old.f}`);
  }
  return target;
}

function main() {
  const dbPath = resolveDatabasePath();
  if (dbPath && existsSync(dbPath)) {
    backup(dbPath);
  } else {
    console.log('ℹ No existing database file found — first-time push (nothing to back up).');
  }

  console.log('\n→ prisma db push (additive-only: --accept-data-loss is NEVER passed)\n');
  const res = spawnSync('npx', ['prisma', 'db', 'push'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  if (res.status !== 0) {
    console.error(
      '\n✗ prisma db push FAILED (exit ' + res.status + ').\n' +
        '  If the error mentions data loss / destructive changes: v2 §11.1 forbids\n' +
        '  them. Revisit the schema diff — make changes additive (nullable or\n' +
        '  defaulted), or run the change manually and deliberately.\n' +
        '  Your pre-push backup is preserved in db/backups/.'
    );
    process.exit(1);
  }
  console.log('\n✓ db push complete — schema is additive-safe.');
}

main();
