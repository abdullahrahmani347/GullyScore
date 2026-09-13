/**
 * GULLYSCORE v2 §11.4 — FEATURE FLAGS
 * ---------------------------------------------------------------------------
 * One flags module shared by the server, the API layer and the client.
 *
 * Contract (v2 prompt §11.4):
 *   - `/api/buildinfo` returns `features: {...}` from getFeatures().
 *   - Server gates routes: flag off → the route 404s (see lib/api-flag.ts).
 *   - Client gates UI: see hooks/useFeatures.ts.
 *   - Hardened features default ON; experimental ones (voice, aiReport)
 *     default OFF.
 *   - Env override for local dev: FEATURES="push,-voice,aiReport"
 *     (bare name = force ON, "-name" = force OFF, unknown names are
 *     rejected loudly so typos never silently disable a feature).
 *
 * This module is PURE (no next/* imports) so the client bundle can use it.
 */

export const FEATURE_FLAGS = ['push', 'reactions', 'voice', 'dls', 'embed', 'aiReport'] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type FeatureSet = Record<FeatureFlag, boolean>;

/** v2 defaults — hardened ON, experimental OFF. */
export const DEFAULT_FEATURES: FeatureSet = {
  push: true,
  reactions: true,
  voice: false,
  dls: true,
  embed: true,
  aiReport: false,
};

const VALID = new Set<string>(FEATURE_FLAGS);

/**
 * Parse a FEATURES env-style string over a base set.
 *   "push,-voice,aiReport" → { push: true, voice: false, aiReport: true }
 * Throws on unknown flag names (fail loud, not silent).
 */
export function parseFeaturesEnv(env: string | undefined, base: FeatureSet = DEFAULT_FEATURES): FeatureSet {
  const out: FeatureSet = { ...base };
  if (!env || env.trim() === '') return out;
  for (const raw of env.split(',')) {
    const token = raw.trim();
    if (token === '') continue;
    const off = token.startsWith('-');
    const name = off ? token.slice(1) : token;
    if (!VALID.has(name)) {
      throw new Error(
        `[features] Unknown feature flag "${name}" in FEATURES="${env}". ` +
          `Valid flags: ${FEATURE_FLAGS.join(', ')}`
      );
    }
    out[name as FeatureFlag] = !off;
  }
  return out;
}

/** Server-side: the effective feature set (defaults + FEATURES env). */
export function getFeatures(): FeatureSet {
  // Parse lazily and cache — process.env is stable at runtime, but this
  // also keeps the thrown-on-typo behaviour to a single call per process.
  const parsed = parseFeaturesEnv(process.env.FEATURES);
  getFeaturesCached = parsed;
  return parsed;
}

let getFeaturesCached: FeatureSet | null = null;

/** Server-side: single-flag check. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return (getFeaturesCached ?? getFeatures())[flag];
}
