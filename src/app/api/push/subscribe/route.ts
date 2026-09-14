import { NextResponse } from 'next/server';
import { withFeatureFlag } from '@/lib/api-flag';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { getDeviceIdFromRequest } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.2 — POST /api/push/subscribe
 * Body: { subscription: { endpoint, keys: { p256dh, auth } }, matchId?: string | null }
 * matchId null = "all matches". Upserts by endpoint (one browser push
 * subscription; re-subscribing to a different match retargets it).
 * Anonymous — a spectator device id is recorded opportunistically for
 * diagnostics only. Flag-gated: `push` off → 404.
 */
export const POST = withFeatureFlag(
  'push',
  async (request: Request) => {
    try {
      await ensureDbSchema();
      const body = await request.json().catch(() => null);

      const endpoint = typeof body?.subscription?.endpoint === 'string' ? body.subscription.endpoint : '';
      const p256dh = typeof body?.subscription?.keys?.p256dh === 'string' ? body.subscription.keys.p256dh : '';
      const auth = typeof body?.subscription?.keys?.auth === 'string' ? body.subscription.keys.auth : '';
      const matchId =
        body?.matchId === null || body?.matchId === undefined || body?.matchId === 'all'
          ? null
          : String(body.matchId);

      if (!endpoint || !p256dh || !auth) {
        return NextResponse.json(
          { error: 'subscription { endpoint, keys: { p256dh, auth } } is required' },
          { status: 400 }
        );
      }

      // Validate the match exists when targeted
      if (matchId) {
        const match = await db.match.findUnique({ where: { id: matchId }, select: { id: true } });
        if (!match) {
          return NextResponse.json({ error: 'Match not found' }, { status: 404 });
        }
      }

      const deviceId = getDeviceIdFromRequest(request) ?? '';
      const saved = await db.subscription.upsert({
        where: { endpoint },
        create: { endpoint, p256dh, auth, matchId, deviceId },
        update: { p256dh, auth, matchId, deviceId },
      });

      return NextResponse.json({ ok: true, id: saved.id, matchId: saved.matchId });
    } catch (error) {
      console.error('Error saving push subscription:', error);
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }
  }
);
