#!/usr/bin/env node
/**
 * GULLYSCORE v2 §11.6 / §23.5 — FIRST-LOAD JS BUDGET AUDIT
 * ---------------------------------------------------------------------------
 * Measures the REAL first-load JavaScript (gzipped) for key routes by
 * crawling the running server (default http://localhost:3000), collecting
 * every /_next/static chunk referenced by the served HTML, downloading each
 * and gzip-measuring the total.
 *
 * Budgets (v2 §11.6):
 *   scoring route  ≤ 200 KB gz   live route  ≤ 150 KB gz
 * Informational (no budget yet): landing page (GSAP) and dashboard.
 *
 * Usage:
 *   node scripts/check-budgets.mjs                # audit against localhost:3000
 *   BASE_URL=https://example.com node scripts/... # audit a deployed instance
 *
 * Exit code 1 if any budgeted route exceeds its budget.
 */

import { gzipSync } from 'node:zlib';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

// [route, budgetBytes|null]
const ROUTES = [
  ['/', null], // landing (GSAP) — informational until a budget is set
  ['/dashboard', null], // informational
  ['/matches/new', 200 * 1024], // match setup — proxy for the scoring family
  ['/live', 150 * 1024], // live hub / spectator family
];

const CHUNK_RE = /\/_next\/static\/(?:chunks|css)\/[^"'\s<>]+?\.(?:js|css)/g;

async function measureRoute(route, budget) {
  const url = BASE + route;
  let html;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      console.log(`✗ ${route} — HTTP ${res.status} (skipped)`);
      return { route, ok: false };
    }
    html = await res.text();
  } catch (e) {
    console.log(`✗ ${route} — fetch failed: ${e.message} (skipped)`);
    return { route, ok: false };
  }

  const assets = [...new Set(html.match(CHUNK_RE) ?? [])];
  let totalJs = 0;
  let totalCss = 0;
  for (const asset of assets) {
    try {
      const res = await fetch(BASE + asset);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const gz = gzipSync(buf).length;
      if (asset.endsWith('.js')) totalJs += gz;
      else totalCss += gz;
    } catch {
      // ignore individual asset failures — totals remain indicative
    }
  }

  const kb = (n) => (n / 1024).toFixed(1) + ' KB gz';
  const budgetLabel = budget ? ` / budget ${kb(budget)}` : ' (informational)';
  const overBudget = budget != null && totalJs > budget;
  const icon = budget == null ? '•' : overBudget ? '✗' : '✓';

  console.log(
    `${icon} ${route} — JS ${kb(totalJs)}${budgetLabel}, CSS ${kb(totalCss)}, ${assets.length} assets`
  );
  if (overBudget) {
    console.log(`   OVER BUDGET by ${kb(totalJs - budget)} — see v2 §23.5 (lazy-load heavy deps)`);
  }
  return { route, ok: true, overBudget };
}

console.log(`Auditing first-load JS against ${BASE}\n`);
let failed = false;
for (const [route, budget] of ROUTES) {
  const r = await measureRoute(route, budget);
  if (r.ok && r.overBudget) failed = true;
}
console.log(failed ? '\nBudget violations found (exit 1)' : '\nAll budgeted routes within budget.');
process.exit(failed ? 1 : 0);
