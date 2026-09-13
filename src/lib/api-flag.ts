/**
 * GULLYSCORE v2 §11.4 — API ROUTE FEATURE GATE
 * ---------------------------------------------------------------------------
 * Server-side route gating: wrap any route handler so it returns 404 when
 * its feature flag is disabled. Usage (v2 §15/§19 routes):
 *
 *   export const POST = withFeatureFlag('push', async (req, ctx) => { ... });
 *
 * Kept separate from lib/features.ts (pure) so this file can import next/
 * server without dragging it into the client bundle.
 */

import { NextResponse } from 'next/server';
import { isFeatureEnabled, type FeatureFlag } from './features';

type RouteContext = { params: Promise<Record<string, string>> } | Record<string, unknown>;

export function withFeatureFlag<Ctx extends RouteContext>(
  flag: FeatureFlag,
  handler: (req: Request, ctx: Ctx) => Promise<Response>
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    if (!isFeatureEnabled(flag)) {
      // Flag off → the route does not exist (§11.4: "flag off → route 404s").
      return new NextResponse(null, { status: 404 });
    }
    return handler(req, ctx);
  };
}
