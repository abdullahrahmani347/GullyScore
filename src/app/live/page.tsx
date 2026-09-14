import { getLiveHubFeed } from '@/lib/live-hub-server';
import LiveHubClient from '@/components/live/LiveHubClient';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.1 — LIVE HUB (/live)
 * Server-rendered public grid of LIVE matches (mini cards: teams, score,
 * overs, striker, RRR, last-6 chips, PP badge) + tournament filter +
 * "recently completed" rail. Streamed updates land in LiveHubClient via
 * the /api/live/stream SSE hub.
 */
export default async function LiveHubPage() {
  const initial = await getLiveHubFeed();
  return <LiveHubClient initial={initial} />;
}
