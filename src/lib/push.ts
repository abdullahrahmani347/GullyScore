import webpush from 'web-push';
import { db } from '@/lib/db';
import { isFeatureEnabled } from './features';
import { clampPayload, type PushPayload } from './push-payload';

export type { PushPayload } from './push-payload';
export { clampPayload } from './push-payload';

/**
 * GULLYSCORE v2 §15.2 — WEB PUSH (server-side queue fanout)
 * ---------------------------------------------------------------------------
 * Spectator notifications: wicket, 50/100, result. Payload ≤ 512 B.
 * Fanout runs through an in-process queue drained off the request path —
 * scoring NEVER blocks on push delivery. Flag-gated (`push`).
 *
 * VAPID env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional).
 * Without keys the queue accepts jobs and drops them silently — the app
 * degrades to "no notifications", never to errors.
 */

const TTL_SECONDS = 300; // stale wicket pushes are worthless after 5 min

interface PushJob {
  matchId: string;
  payload: PushPayload;
}

const queue: PushJob[] = [];
let draining = false;
let vapidReady = false;

export function pushEnv(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} {
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:hello@gullyscore.app',
  };
}

export function isPushConfigured(): boolean {
  const { publicKey, privateKey } = pushEnv();
  return publicKey.length > 20 && privateKey.length > 20;
}

function ensureVapid(): boolean {
  if (vapidReady) return true;
  const { publicKey, privateKey, subject } = pushEnv();
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidReady = true;
    return true;
  } catch (err) {
    console.error('[push] VAPID setup failed:', err);
    return false;
  }
}

/**
 * Enqueue a notification for every subscriber of this match (or "all").
 * Fire-and-forget: returns immediately, never throws, never blocks the
 * scoring write path.
 */
export function queuePushNotification(matchId: string, payload: PushPayload): void {
  if (!isFeatureEnabled('push')) return;
  try {
    queue.push({ matchId, payload: clampPayload(payload) });
    if (!draining) {
      draining = true;
      setTimeout(() => {
        void drainQueue().catch((err) => {
          console.error('[push] drain failed:', err);
        });
      }, 0);
    }
  } catch (err) {
    console.error('[push] enqueue failed:', err);
  }
}

async function drainQueue(): Promise<void> {
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      await fanout(job);
    }
  } finally {
    draining = false;
  }
}

async function fanout(job: PushJob): Promise<void> {
  if (!isPushConfigured() || !ensureVapid()) return; // degrade silently

  const subs = await db.subscription.findMany({
    where: {
      OR: [{ matchId: job.matchId }, { matchId: null }],
    },
    take: 500,
  });
  if (subs.length === 0) return;

  const json = JSON.stringify(job.payload);
  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
          { TTL: TTL_SECONDS, urgency: 'normal', topic: job.payload.tag }
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // Dead subscription (unsubscribed / expired) → clean up
        if (status === 404 || status === 410) {
          await db.subscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
        }
        // 429 (rate limit) and transient errors: drop this send — the next
        // event will retry with fresh TTL. Never retry-storm.
      }
    })
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[push] ${failed}/${subs.length} sends failed for match ${job.matchId}`);
  }
}

/** Introspection for tests / diagnostics. */
export function pushQueueDepth(): number {
  return queue.length;
}
