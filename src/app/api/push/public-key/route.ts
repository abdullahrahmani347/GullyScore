import { NextResponse } from 'next/server';
import { withFeatureFlag } from '@/lib/api-flag';
import { pushEnv, isPushConfigured } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.2 — GET /api/push/public-key
 * The VAPID public key spectators subscribe with. 503 + { configured: false }
 * when VAPID env is not set (the bell UI hides itself gracefully).
 * Flag-gated: `push` off → 404.
 */
export const GET = withFeatureFlag('push', async () => {
  const { publicKey } = pushEnv();
  if (!isPushConfigured()) {
    return NextResponse.json(
      { configured: false, error: 'VAPID keys not configured' },
      { status: 503 }
    );
  }
  return NextResponse.json({ configured: true, publicKey });
});
