'use client';

/**
 * v2 §16.4 — STORAGE HYGIENE
 * ---------------------------------------------------------------------------
 * Cached match data is capped and garbage-collected so the PWA never
 * balloons on a long-lived device:
 *
 *   - Hard cap: 50 cached matches (oldest-touched evicted first — LRU).
 *   - LRU eviction additionally drops COMPLETED matches untouched for
 *     more than 90 days, even under the cap.
 *   - Quota meter (navigator.storage.estimate()) powers the queue
 *     inspector UI (§14.9).
 *   - navigator.storage.persist() is requested once, after the first
 *     scored match, so offline data survives browser pressure.
 *
 * The cache registry lives in localStorage (`gullyscore-cached-matches`):
 * it is a small index (id → { touchedAt, status }) — match payloads
 * themselves stay wherever the caller keeps them (SW cache / IndexedDB),
 * this module only decides what is WORTH keeping.
 */

const REGISTRY_KEY = 'gullyscore-cached-matches';
const PERSIST_FLAG_KEY = 'gullyscore-storage-persist-asked';
const MATCH_CAP = 50;
const COMPLETED_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface CachedMatchEntry {
  id: string;
  /** last time the match was read/written locally */
  touchedAt: number;
  /** 'LIVE' | 'COMPLETED' | ... — COMPLETED entries are TTL-evictable */
  status: string;
  /** rough payload size, for the quota meter breakdown */
  bytes?: number;
}

function readRegistry(): CachedMatchEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRegistry(entries: CachedMatchEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full — storage hygiene has bigger problems; drop silently
  }
}

/**
 * Touch (upsert) a cached match. Runs the full hygiene pass on every call:
 * TTL-evict stale completed matches, then LRU-evict beyond the cap.
 *
 * @returns the list of evicted match ids (callers may delete payloads).
 */
export function touchCachedMatch(id: string, status: string, bytes?: number): string[] {
  const entries = readRegistry();
  const now = Date.now();

  const existing = entries.findIndex((e) => e.id === id);
  const entry: CachedMatchEntry = { id, touchedAt: now, status, bytes };
  if (existing >= 0) entries[existing] = entry;
  else entries.push(entry);

  // 1. TTL eviction — completed matches untouched for 90 days
  const survivors: CachedMatchEntry[] = [];
  const evicted: string[] = [];
  for (const e of entries) {
    const staleCompleted =
      e.status === 'COMPLETED' && now - e.touchedAt > COMPLETED_TTL_MS;
    if (staleCompleted && e.id !== id) {
      evicted.push(e.id);
    } else {
      survivors.push(e);
    }
  }

  // 2. Hard cap — evict least-recently-touched beyond 50
  if (survivors.length > MATCH_CAP) {
    survivors.sort((a, b) => a.touchedAt - b.touchedAt);
    while (survivors.length > MATCH_CAP) {
      const victim = survivors.shift();
      if (victim) evicted.push(victim.id);
    }
  }

  writeRegistry(survivors);
  return evicted;
}

/** Remove a match from the registry explicitly (e.g. deleted on server). */
export function forgetCachedMatch(id: string): void {
  writeRegistry(readRegistry().filter((e) => e.id !== id));
}

/** Registry snapshot for the queue inspector (§14.9 / §16.4). */
export function getCachedMatchEntries(): CachedMatchEntry[] {
  return readRegistry().sort((a, b) => b.touchedAt - a.touchedAt);
}

export const STORAGE_CAP = MATCH_CAP;

// ─── Quota meter ─────────────────────────────────────────────────────────

export interface StorageQuotaInfo {
  usage: number;
  quota: number;
  percent: number;
  persisted: boolean;
  supported: boolean;
}

/** navigator.storage.estimate() for the §16.4 quota meter. */
export async function getStorageQuota(): Promise<StorageQuotaInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, percent: 0, persisted: false, supported: false };
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    let persisted = false;
    try {
      persisted = (await navigator.storage.persisted?.()) ?? false;
    } catch {
      // persisted() unsupported
    }
    return {
      usage,
      quota,
      percent: quota > 0 ? Math.min(100, (usage / quota) * 100) : 0,
      persisted,
      supported: true,
    };
  } catch {
    return { usage: 0, quota: 0, percent: 0, persisted: false, supported: false };
  }
}

// ─── Persistent storage request ──────────────────────────────────────────

/**
 * §16.4 — request navigator.storage.persist() after the first scored match.
 * Asked at most once per browser profile; safe everywhere (guarded).
 */
export async function requestPersistentStorageOnce(): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (window.localStorage.getItem(PERSIST_FLAG_KEY) === '1') return false;
    window.localStorage.setItem(PERSIST_FLAG_KEY, '1');
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
