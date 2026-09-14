import 'server-only';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { liveHubFeed, type HubMatchLike } from './live-hub';

/**
 * GULLYSCORE v2 §15.1 — server-side hub feed builder.
 * Shared by the /live page (server render) and /api/live (client refresh).
 * Public: no device filtering — the hub is a public grid, cards carry
 * summary fields only (no PIN hashes, no device ids).
 */

export async function getLiveHubFeed() {
  await ensureDbSchema();

  const matches = await db.match.findMany({
    where: {
      status: { in: ['LIVE', 'INNINGS_BREAK', 'COMPLETED'] },
    },
    include: {
      team1: true,
      team2: true,
      tournament: true,
      innings: {
        include: {
          team: true,
          balls: { orderBy: { deliveryNumber: 'asc' } },
          batting: { include: { player: true } },
        },
        orderBy: { inningsNumber: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Strip server-only fields before the card stage
  const rows = matches.map((m) => ({
    ...m,
    organizerPinHash: undefined,
  })) as unknown as HubMatchLike[];

  return liveHubFeed(rows);
}
