/**
 * GULLYSCORE v2 §13.10 — MATCH REPORT GENERATION (server-only)
 * ---------------------------------------------------------------------------
 * Builds a structured prompt from the folded scorecard + turning points,
 * calls the LLM via z-ai-web-dev-sdk, and caches the result on
 * Match.reportJson. match-story.ts remains the always-available fallback.
 *
 * GUARANTEES (spec):
 *   - Never blocks match completion (fire-and-forget from the complete route).
 *   - Only successful AI reports are cached; failures leave reportJson null
 *     so a retry can happen, while GET /report serves the template fallback.
 *   - The UI labels which generator produced the text.
 */

import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';
import { generateMatchStory } from '@/lib/match-story';
import { hydrateEvents } from '@/lib/scoring-engine';
import { matchMvpTable } from '@/lib/analytics-data';
import {
  buildMatchReportPrompt,
  detectTurningPoints,
  partnershipAnalytics,
  type MatchReportFacts,
  type TurningPoint,
} from '@/lib/intelligence';
import { parseMatchRules, fold } from '@/lib/engine';
import type { MatchData, InningsState, MatchData as MatchType } from '@/types';

/** The cached report shape (Match.reportJson). */
export interface MatchReportJson {
  title: string;
  subtitle: string;
  sections: { heading: string; body: string }[];
  generator: 'ai' | 'template';
  generatedAt: string;
  model?: string;
}

/** Load a match with everything the report needs, as a MatchData-shaped row. */
async function loadMatchForReport(matchId: string): Promise<MatchData | null> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      team1: { include: { players: true } },
      team2: { include: { players: true } },
      innings: {
        include: {
          team: { include: { players: true } },
          batting: { include: { player: true }, orderBy: { battingOrder: 'asc' } },
          bowling: { include: { player: true } },
          balls: { orderBy: { deliveryNumber: 'asc' } },
          partnerships: { include: { batsman1: true, batsman2: true } },
        },
        orderBy: { inningsNumber: 'asc' },
      },
    },
  });
  if (!match) return null;
  // Prisma dates → the API JSON shape the intelligence layer expects
  return JSON.parse(JSON.stringify(match)) as MatchData;
}

/** Folded facts: turning points + per-innings summaries for the prompt. */
function reportFacts(match: MatchData): MatchReportFacts {
  const turningPointsAll: TurningPoint[] = [];
  const inningsFacts: MatchReportFacts['innings'] = [];

  for (const inn of match.innings ?? []) {
    const rules = parseMatchRules(match.rules, {
      maxWickets: match.maxWickets,
      totalOvers: match.totalOvers,
      inningsNumber: inn.inningsNumber,
      target: inn.target ?? null,
    });
    const events = hydrateEvents(inn.balls ?? []);
    const state = fold(events, rules);
    turningPointsAll.push(...detectTurningPoints(events, rules));

    const topScore = [...(inn.batting ?? [])]
      .sort((a, b) => b.runs - a.runs)[0];
    const bestBowling = [...(inn.bowling ?? [])]
      .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
    const bpo = rules.ballsPerOver;

    inningsFacts.push({
      battingTeam: inn.team?.name ?? 'Batting side',
      runs: state.runs,
      wickets: state.wickets,
      overs: `${state.completedOvers}.${state.currentBalls}`,
      topScore: topScore
        ? { name: topScore.player?.name ?? '?', runs: topScore.runs, balls: topScore.balls }
        : null,
      bestBowling: bestBowling && bestBowling.wickets > 0
        ? {
            name: bestBowling.player?.name ?? '?',
            wickets: bestBowling.wickets,
            runs: bestBowling.runs,
            overs: `${bestBowling.completedOvers}.${bestBowling.balls}`,
          }
        : null,
    });
  }

  // MVP + biggest partnership across the whole match
  const mvpTable = matchMvpTable(match);
  const allPartnerships = (match.innings ?? []).flatMap((inn: InningsState) =>
    (inn.partnerships ?? []).map((p) => ({
      batsman1Id: p.batsman1?.id ?? '',
      batsman2Id: p.batsman2?.id ?? '',
      batsman1Name: p.batsman1?.name,
      batsman2Name: p.batsman2?.name,
      runs: p.runs,
      balls: p.balls,
      wicketNumber: p.wicketNumber,
      isOpen: p.isOpen,
    }))
  );
  const pa = partnershipAnalytics(allPartnerships);

  return {
    team1: match.team1?.name ?? 'Team 1',
    team2: match.team2?.name ?? 'Team 2',
    venue: match.venue,
    result: match.result,
    innings: inningsFacts,
    turningPoints: turningPointsAll,
    mvp: mvpTable[0] ? { name: mvpTable[0].name, mvp: mvpTable[0].mvp } : null,
    biggestPartnership: pa.biggest
      ? {
          names: `${pa.biggest.batsman1Name ?? '?'} & ${pa.biggest.batsman2Name ?? '?'}`,
          runs: pa.biggest.runs,
          balls: pa.biggest.balls,
        }
      : null,
  };
}

/** Parse the LLM output: JSON first (code-fence tolerant), then markdown. */
function parseReportOutput(raw: string): { title: string; subtitle: string; sections: { heading: string; body: string }[] } | null {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;

  try {
    const parsed = JSON.parse(candidate) as {
      title?: string;
      subtitle?: string;
      sections?: { heading?: string; body?: string }[];
    };
    if (parsed.sections && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return {
        title: parsed.title?.trim() || 'Match Report',
        subtitle: parsed.subtitle?.trim() || '',
        sections: parsed.sections
          .filter((s) => (s.body ?? '').trim().length > 0)
          .map((s) => ({ heading: (s.heading ?? '').trim(), body: (s.body ?? '').trim() })),
      };
    }
  } catch {
    /* fall through to markdown parsing */
  }

  // Markdown-ish: ## headings split sections
  const lines = trimmed.split('\n');
  const sections: { heading: string; body: string }[] = [];
  let heading = '';
  let body: string[] = [];
  const flush = () => {
    if (body.length > 0 || heading) {
      sections.push({ heading, body: body.join('\n').trim() });
    }
    heading = '';
    body = [];
  };
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim();
    } else {
      body.push(line);
    }
  }
  flush();
  if (sections.length === 0) return null;
  return {
    title: sections[0]?.heading || 'Match Report',
    subtitle: '',
    sections: sections.slice(sections[0]?.heading ? 1 : 0),
  };
}

/** Wrap the template story in the report JSON shape (always available). */
export function templateReport(match: MatchData): MatchReportJson {
  const story = generateMatchStory(match);
  return {
    title: `${match.team1?.name ?? 'Team 1'} vs ${match.team2?.name ?? 'Team 2'}`,
    subtitle: match.result ?? 'Match report',
    sections: [
      { heading: 'The Story', body: story },
    ],
    generator: 'template',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate + cache the AI report. Returns the report or null on failure
 * (callers fall back to templateReport). Only successful generations are
 * written to Match.reportJson.
 */
export async function generateAiReport(matchId: string): Promise<MatchReportJson | null> {
  const match = await loadMatchForReport(matchId);
  if (!match) return null;

  const facts = reportFacts(match);
  const prompt = buildMatchReportPrompt(facts);

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You are a gully-cricket match reporter. Write vivid, factual match reports. ' +
            'Respond ONLY with JSON: {"title": string, "subtitle": string, "sections": [{"heading": string, "body": string}]}. ' +
            'Use the section headings "The Setup", "The Turning Point", "The Finish". Plain text in body (no markdown syntax).',
        },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw || raw.trim().length === 0) return null;

    const parsed = parseReportOutput(raw);
    if (!parsed || parsed.sections.length === 0) return null;

    const report: MatchReportJson = {
      title: parsed.title,
      subtitle: parsed.subtitle || match.result || '',
      sections: parsed.sections,
      generator: 'ai',
      generatedAt: new Date().toISOString(),
    };

    await db.match.update({
      where: { id: matchId },
      data: { reportJson: JSON.stringify(report) },
    });
    return report;
  } catch (err) {
    console.error('[report] AI generation failed:', err);
    return null;
  }
}

/** Read the cached AI report (null when not generated). */
export async function cachedReport(matchId: string): Promise<MatchReportJson | null> {
  const row = await db.match.findUnique({ where: { id: matchId }, select: { reportJson: true } });
  if (!row?.reportJson) return null;
  try {
    const parsed = JSON.parse(row.reportJson) as MatchReportJson;
    if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Fire-and-forget hook for the complete route — NEVER blocks completion. */
export function triggerAiReportGeneration(matchId: string): void {
  void generateAiReport(matchId).catch((err) => {
    console.error('[report] async generation crashed:', err);
  });
}
