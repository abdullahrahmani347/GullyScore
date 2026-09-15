'use client';

/**
 * v2 §16.3 — IDEMPOTENCY & CONFLICT POLICY
 * ---------------------------------------------------------------------------
 * Invariants:
 *   1. clientEventId (unique index, §12.7) dedupes replays — a queued ball
 *      that already made it to the server never double-counts.
 *   2. The server assigns deliveryNumber. When the client's
 *      expectedDeliveryNumber differs, the ball POST response carries
 *      `divergence` → the client's local log has drifted from server truth
 *      (e.g. another scorer/another tab recorded in between, or an offline
 *      queue synced while this tab was stale).
 *   3. On divergence: the SSE `state` resync reconciles the UI, and the
 *      CONFLICT SHEET lists the divergent server events (fetched from
 *      /api/matches/[id]/events?since=) with "Apply server" as the default
 *      action. Last-write-wins on content remains the documented v2
 *      fallback when the user ignores the sheet.
 *
 * This module keeps the divergent-event registry (in-memory + localStorage
 * mirror) and exposes subscribe/report/resolve used by the scoring screen.
 */

export interface DivergentServerEvent {
  inningsId: string;
  deliveryNumber: number;
  batsmanId: string;
  bowlerId: string;
  runs: number;
  extraRuns: number;
  extraType: string | null;
  isWicket: boolean;
  wicketType: string | null;
  clientEventId: string | null;
  timestamp: string;
  deletedAt: string | null;
}

export interface ConflictState {
  matchId: string;
  clientExpected: number;
  serverDeliveryNumber: number;
  events: DivergentServerEvent[];
  reportedAt: number;
}

const REGISTRY_KEY = 'gullyscore-conflicts';

let current: ConflictState | null = null;
const listeners = new Set<(state: ConflictState | null) => void>();

function loadMirror(): ConflictState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as ConflictState) : null;
  } catch {
    return null;
  }
}

function saveMirror(state: ConflictState | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (state) window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(REGISTRY_KEY);
  } catch {
    // mirror is best-effort
  }
}

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn(current);
    } catch {
      // listener errors must not break scoring
    }
  });
}

/** Restore any unresolved conflict from a previous session (once, lazily). */
function ensureLoaded(): void {
  if (current === null && typeof window !== 'undefined') {
    current = loadMirror();
  }
}

export function subscribeConflicts(listener: (state: ConflictState | null) => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function getConflicts(): ConflictState | null {
  ensureLoaded();
  return current;
}

/** Fetch the server events the client is missing, and report a conflict. */
export async function reportDivergence(
  matchId: string,
  clientExpected: number,
  serverDeliveryNumber: number,
): Promise<void> {
  try {
    const { getDeviceId } = await import('@/lib/device');
    const res = await fetch(
      `/api/matches/${matchId}/events?since=${encodeURIComponent(String(clientExpected))}`,
      { headers: { 'X-Device-Id': getDeviceId() }, cache: 'no-store' },
    );
    if (!res.ok) return;
    const body = (await res.json()) as { events?: DivergentServerEvent[] };
    current = {
      matchId,
      clientExpected,
      serverDeliveryNumber,
      events: body.events ?? [],
      reportedAt: Date.now(),
    };
    saveMirror(current);
    emit();
  } catch {
    // offline — the SSE state resync still reconciles; the sheet can be
    // re-reported on the next divergence.
  }
}

/**
 * "Apply server" (default action): drop the registry — the caller then
 * revalidates the match (SSE state / mutate()), which replaces the local
 * log with server truth.
 */
export function resolveByApplyingServer(): void {
  current = null;
  saveMirror(null);
  emit();
}

/**
 * "Keep mine": drop the registry too — the local optimistic log stands and
 * server numbering wins on the next write (documented last-write-wins).
 */
export function resolveByKeepingLocal(): void {
  current = null;
  saveMirror(null);
  emit();
}
