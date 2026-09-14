import { NextResponse } from 'next/server';
import { getLiveHubFeed } from '@/lib/live-hub-server';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.1 — GET /api/live
 * Public hub feed: { live: LiveHubCard[], completed: CompletedCard[],
 * tournaments: [{id,name}] }. Spectator pages poll this on hub-stream
 * events (or 30 s fallback).
 */
export async function GET() {
  try {
    const feed = await getLiveHubFeed();
    return NextResponse.json(feed, {
      headers: { 'Cache-Control': 'public, max-age=5' },
    });
  } catch (error) {
    console.error('Error building live hub feed:', error);
    return NextResponse.json({ error: 'Failed to build live feed' }, { status: 500 });
  }
}
