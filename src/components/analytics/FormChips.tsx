'use client';

import { formatFormChip, type FormInning } from '@/lib/intelligence';
import type { TeamFormResult } from '@/lib/intelligence';
import Link from 'next/link';

/* ── §13.7 — last-5 batting form chips ("34, 12*, 0, 78, 9") ── */

interface FormChipsProps {
  innings: FormInning[];
  /** Link chips to the player page. */
  playerId?: string;
  max?: number;
}

const CHIP_TONE = (f: FormInning) => {
  if (f.runs >= 50) return 'bg-gold/15 border-gold/30 text-gold';
  if (f.runs === 0) return 'bg-wicket/10 border-wicket/25 text-wicket';
  if (f.runs >= 30) return 'bg-accent/10 border-accent/25 text-accent';
  return 'bg-bg-elevated border-border text-t2';
};

export function FormChips({ innings, playerId, max = 5 }: FormChipsProps) {
  if (innings.length === 0) return null;
  const chips = innings.slice(-max);
  return (
    <div className="flex items-center gap-1">
      {chips.map((f, i) => {
        const chip = (
          <span
            key={i}
            className={`inline-flex items-center justify-center min-w-[26px] h-[22px] px-1 rounded-md border text-[10px] font-mono font-semibold ${CHIP_TONE(f)}`}
            title={`${f.runs}${f.isOut ? '' : '*'} off ${f.balls} balls${f.opposition ? ` vs ${f.opposition}` : ''}`}
          >
            {formatFormChip(f)}
          </span>
        );
        return playerId ? (
          <Link key={i} href={`/players/${playerId}`} className="shrink-0">
            {chip}
          </Link>
        ) : (
          chip
        );
      })}
    </div>
  );
}

/* ── §13.7 — W/Q team form strip (last 5 results) ── */

const RESULT_STYLE: Record<TeamFormResult, string> = {
  W: 'bg-accent/15 border-accent/35 text-accent',
  L: 'bg-wicket/10 border-wicket/30 text-wicket',
  T: 'bg-gold/10 border-gold/30 text-gold',
  Q: 'bg-bg-elevated border-border text-t3',
};

const RESULT_TITLE: Record<TeamFormResult, string> = {
  W: 'Won',
  L: 'Lost',
  T: 'Tied',
  Q: 'No result',
};

export function TeamFormStrip({ results }: { results: TeamFormResult[] }) {
  if (results.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {results.map((r, i) => (
        <span
          key={i}
          className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-md border text-[10px] font-mono font-bold ${RESULT_STYLE[r]}`}
          title={RESULT_TITLE[r]}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
