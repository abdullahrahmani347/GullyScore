/**
 * GULLYSCORE v2 §15.2 — server-boot env loading.
 * `next dev` loads .env automatically; the standalone production server
 * does NOT. This hook loads .env (when present) at boot so VAPID keys
 * (and any other local env) survive the standalone build. Platform-hosted
 * env vars always win — the parser never overwrites existing values.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.GULLYSCORE_ENV_LOADED) {
    process.env.GULLYSCORE_ENV_LOADED = '1';
    try {
      const { readFile } = await import('node:fs/promises');
      const { resolve } = await import('node:path');
      const candidates = [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '..', '.env'),
      ];
      for (const file of candidates) {
        let raw: string;
        try {
          raw = await readFile(file, 'utf8');
        } catch {
          continue;
        }
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq <= 0) continue;
          const key = trimmed.slice(0, eq).trim();
          const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          if (process.env[key] === undefined) {
            process.env[key] = value;
          }
        }
        break; // first found wins
      }
    } catch {
      // env loading is best-effort
    }
  }
}
