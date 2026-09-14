/**
 * GULLYSCORE v2 §12.3/§19.4 — ORGANIZER PIN
 * ---------------------------------------------------------------------------
 * Manual target overrides and editing COMPLETED matches require the
 * organizer PIN. Stored as SHA-256 (never returned by any read route).
 * A match with NO PIN set relies on device ownership alone (gully default).
 */

import { createHash, timingSafeEqual } from 'crypto';

export function hashPin(pin: string): string {
  return createHash('sha256').update(pin.trim()).digest('hex');
}

export function verifyPin(pinHash: string | null | undefined, provided: string | undefined | null): boolean {
  if (pinHash == null || pinHash === '') return true; // no PIN configured
  if (provided == null || provided.trim() === '') return false;
  const a = Buffer.from(hashPin(provided), 'hex');
  const b = Buffer.from(pinHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
