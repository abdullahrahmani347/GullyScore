/**
 * GULLYSCORE v2 §15.2 — push payload type + ≤ 512 B clamp (PURE).
 * Split from lib/push.ts so the clamp is unit-testable without the
 * web-push/db server deps.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Notification tag — collapses duplicates in the OS tray. */
  tag?: string;
  /** Normalized live code (no GS- prefix) for the deep link. */
  code?: string | null;
}

export const MAX_PAYLOAD_BYTES = 512;

/** Clamp the serialized payload to ≤ 512 B by truncating the body. */
export function clampPayload(payload: PushPayload): PushPayload {
  let candidate: PushPayload = { ...payload };
  for (let guard = 0; guard < 8; guard++) {
    const size = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
    if (size <= MAX_PAYLOAD_BYTES) return candidate;
    const over = size - MAX_PAYLOAD_BYTES;
    const body = candidate.body ?? '';
    candidate = {
      ...candidate,
      body: body.slice(0, Math.max(0, body.length - over - 1)) + '…',
    };
    if ((candidate.body ?? '').length <= 1) {
      return { ...candidate, body: '' };
    }
  }
  return candidate;
}
