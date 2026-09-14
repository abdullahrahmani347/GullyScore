import { NextResponse } from 'next/server';
import { withFeatureFlag } from '@/lib/api-flag';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.2 — POST /api/push/unsubscribe
 * Body: { endpoint: string } → deletes the subscription row.
 * Flag-gated: `push` off → 404.
 */
export const POST = withFeatureFlag('push', async (request: Request) => {
  try {
    await ensureDbSchema();
    const body = await request.json().catch(() => null);
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }

    await db.subscription.deleteMany({ where: { endpoint } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
});
