/**
 * GullyIcons — custom SVG icon set for GullyScore.
 *
 * Replaces the emoji icons previously used for wicket types, achievements,
 * and landing-page features. All icons share a common visual language:
 *   - 24×24 viewBox, drawn with stroke (not fill) for consistency
 *   - `strokeWidth={1.8}` for crisp rendering at 16–32px
 *   - `strokeLinecap="round"` + `strokeLinejoin="round"` for friendly corners
 *   - Inherit color via `currentColor` (consumer sets text color)
 *   - Accept standard SVG props (className, etc.)
 *
 * Why custom SVGs instead of lucide-react?
 *   - Cricket-specific concepts (wicket types, ball trajectories, bat
 *     shapes) don't exist in generic icon libraries
 *   - A unified house style: every icon tells a tiny cricket story
 *   - Smaller bundle: only the icons we actually use ship to the client
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    ...props,
  };
}

// ─────────────────────────────────────────────────────────────────────
// WICKET TYPE ICONS (7)
// Each depicts the physical action that produces that wicket type.
// ─────────────────────────────────────────────────────────────────────

/** Bowled — ball hits stumps, bail flies off. */
export function WicketBowledIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Stumps */}
      <path d="M8 14v6M12 13v7M16 14v6" />
      {/* Bail (dislodged — tilted, flying) */}
      <path d="M7 13.5l4 -1.5" />
      <path d="M15 13l3 -1.5" />
      {/* Ball trajectory — curved arrow hitting middle stump */}
      <path d="M21 5 Q 17 8 13 12" strokeDasharray="0.5 2" opacity="0.7" />
      <circle cx="13" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Caught — ball in a hand (glove). */
export function WicketCaughtIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Stylized catching hand — open palm with fingers splayed */}
      <path d="M6 14c0 2 1 4 3 5h6c1.5 0 2.5 -1 2.5 -2.5V9" />
      <path d="M11 14V8M14 14V7M17 14V8" />
      <path d="M6 14V10c0 -1 1 -2 2 -2" />
      {/* Small ball above the hand */}
      <circle cx="13" cy="4.5" r="1.5" />
    </svg>
  );
}

/** Run Out — bails broken while batter is running. */
export function WicketRunOutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Stumps with broken bails */}
      <path d="M8 14v6M12 13v7M16 14v6" />
      <path d="M7 13l2 0.5" opacity="0.5" />
      <path d="M15 13l2 0.5" opacity="0.5" />
      {/* Running figure — simplified silhouette */}
      <circle cx="18" cy="6" r="1.5" />
      <path d="M18 8l-1 4l1 3" />
      <path d="M17 9l-3 1M17 12l-3 2" />
    </svg>
  );
}

/** LBW — leg in front of stumps, ball trajectory blocked. */
export function WicketLbwIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Stumps behind */}
      <path d="M3 14v6M6 13v7M9 14v6" opacity="0.4" />
      {/* Large leg/pad in front */}
      <path d="M14 4c-1 0 -2 1 -2 2v4l-2 5c-0.5 1.5 0.5 3 2 3h2c1 0 2 -1 2 -2v-4l1 -5c0 -2 -1 -3 -3 -3z" />
      {/* Ball trajectory arrow stopped at the pad */}
      <path d="M21 5 Q 18 7 16 9" strokeDasharray="0.5 2" opacity="0.7" />
      <circle cx="15.5" cy="9" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Stumped — keeper removes bails while batter is out of crease. */
export function WicketStumpedIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Stumps with dislodged bails */}
      <path d="M5 14v6M9 13v7M13 14v6" />
      <path d="M4 13l3 -1" />
      <path d="M11 13l3 -1" />
      {/* Keeper gloves reaching in */}
      <path d="M16 10l4 -2" />
      <path d="M18 8c1 -1 2 -1 3 0c0 1 -1 2 -2 2" />
      {/* Crease line */}
      <path d="M3 21h10" opacity="0.4" />
      {/* Batter out of crease — small foot icon */}
      <path d="M19 18c0 -1 0 -2 -1 -3" opacity="0.6" />
    </svg>
  );
}

/** Hit Wicket — batter's bat/body hits the stumps. */
export function WicketHitWicketIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Stumps — knocked over (tilted) */}
      <path d="M6 16l3 -2M9 17l3 -2M12 18l3 -2" />
      <path d="M5 18l3 -1" opacity="0.5" />
      <path d="M11 19l3 -1" opacity="0.5" />
      {/* Bat swinging and hitting stumps */}
      <path d="M16 4l4 4" />
      <path d="M15 5l3 -3l2 2l-3 3z" />
      {/* Impact star/burst */}
      <path d="M9 12l1 -2M10 13l2 -1M9 14l2 1M8 13l-2 0" opacity="0.7" />
    </svg>
  );
}

/** Retired Hurt — batter walking off, injured. */
export function WicketRetiredHurtIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Person walking with bat, head down */}
      <circle cx="9" cy="5" r="1.8" />
      <path d="M9 7v6" />
      <path d="M9 9l-3 2" />
      {/* Bat in hand */}
      <path d="M6 11l-2 5l1 0.5l2 -5z" />
      {/* Legs walking */}
      <path d="M9 13l-2 5" />
      <path d="M9 13l2 5" />
      {/* Small cross/plus — medical symbol */}
      <path d="M17 8v4M15 10h4" opacity="0.7" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ACHIEVEMENT BADGE ICONS (10)
// Used in AchievementCelebration + player profile chips.
// ─────────────────────────────────────────────────────────────────────

/** Century — 100 runs. Stylized "100" with a laurel. */
export function AchievementCenturyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* "100" formed by three vertical strokes with a horizontal bar */}
      <path d="M5 9v6M9 9v6M5 9h4" />
      <circle cx="16" cy="12" r="3" />
      {/* Laurel — two small leaves flanking */}
      <path d="M3 6c1 1 2 2 2 3M21 6c-1 1 -2 2 -2 3" opacity="0.6" />
      <path d="M2 12c1.5 0 2.5 1 2.5 2.5M22 12c-1.5 0 -2.5 1 -2.5 2.5" opacity="0.6" />
    </svg>
  );
}

/** Half Century — 50 runs. Stylized "50" with a single laurel branch. */
export function AchievementHalfCenturyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 9v6M9 9v6M5 9h4" />
      <circle cx="16" cy="12" r="3" />
      {/* Single laurel branch */}
      <path d="M3 6c1 2 2 4 2 6c0 1 -1 2 -2 2" opacity="0.6" />
    </svg>
  );
}

/** Six Machine — hitter hitting balls over the rope. */
export function AchievementSixMachineIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* "6" digit */}
      <path d="M15 8a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
      <path d="M15 8c-1 -2 -3 -2 -4 0" />
      {/* Bat swinging up */}
      <path d="M3 18l5 -5l1 1l-5 5z" />
      <path d="M7 12l1 -3l1 1l-1 3z" />
      {/* Ball arcs going up — three balls at different heights */}
      <circle cx="11" cy="9" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="13" cy="6" r="0.8" fill="currentColor" stroke="none" opacity="0.7" />
      <circle cx="15" cy="3.5" r="0.8" fill="currentColor" stroke="none" opacity="0.4" />
    </svg>
  );
}

/** Economy King — bowler with miserly figures. A coin/crown hybrid. */
export function AchievementEconomyKingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Crown */}
      <path d="M4 16h12l-1 -8l-3 3l-2 -4l-2 4l-3 -3z" />
      <path d="M4 16v2h12v-2" />
      {/* "E" inside the crown body */}
      <path d="M8 13h2M8 13v3M8 14.5h1.5" />
      {/* Dots on crown points */}
      <circle cx="6" cy="7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="10" cy="5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Five For — 5 wickets. A hand holding 5 fingers/wickets. */
export function AchievementFiveForIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* "5" digit, bold and centered */}
      <path d="M9 6h4l-1 4a3 3 0 1 1 -2 5l-1 -1" />
      {/* Five small wicket marks below — like tally marks */}
      <path d="M5 18v3M7 18v3M9 18v3M11 18v3M13 18v3" opacity="0.6" />
      {/* Diagonal tally strike through 4 of them */}
      <path d="M4 19l9 0" opacity="0.4" />
    </svg>
  );
}

/** Hat Trick — 3 wickets in 3 balls. A top hat. */
export function AchievementHatTrickIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Top hat */}
      <path d="M7 9h10l-1 10h-8z" />
      <path d="M5 19h14" />
      {/* Hat band */}
      <path d="M7.5 12h9" opacity="0.6" />
      {/* Three small balls falling — the three wickets */}
      <circle cx="6" cy="5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="18" cy="5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Captain's Knock — a leading innings. A "C" armband with bat. */
export function AchievementCaptainsKnockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* "C" captain's armband */}
      <path d="M16 8a5 5 0 1 0 0 8" />
      {/* Star on the armband */}
      <path d="M13 11l0.5 1l1 0.5l-1 0.5l-0.5 1l-0.5 -1l-1 -0.5l1 -0.5z" />
      {/* Bat — laid diagonally */}
      <path d="M3 21l8 -8l1.5 1.5l-8 8z" />
      <path d="M10 13l2 -2l1.5 1.5l-2 2z" />
    </svg>
  );
}

/** Finisher — closed out the chase. A checkmark + stumps. */
export function AchievementFinisherIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Stumps — match is over */}
      <path d="M4 14v6M8 13v7M12 14v6" />
      <path d="M3 13l4 0M7 13l5 0" />
      {/* Big checkmark over the stumps */}
      <path d="M14 17l3 3l5 -7" />
    </svg>
  );
}

/** Tournament Winner — trophy. */
export function AchievementTournamentWinnerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Trophy cup */}
      <path d="M7 4h10v4a5 5 0 0 1 -10 0z" />
      {/* Handles */}
      <path d="M7 5c-2 0 -3 1 -3 3s1 2 2 2" />
      <path d="M17 5c2 0 3 1 3 3s-1 2 -2 2" />
      {/* Stem */}
      <path d="M12 13v3" />
      {/* Base */}
      <path d="M9 20h6l-1 -3h-4z" />
      {/* Star on the cup */}
      <path d="M12 6l0.5 1.5l1.5 0l-1.2 1l0.5 1.5l-1.3 -1l-1.3 1l0.5 -1.5l-1.2 -1l1.5 0z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Man of the Series — star player. A star + series arc. */
export function AchievementManOfSeriesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Big star */}
      <path d="M12 3l2.5 5l5.5 0.8l-4 3.8l1 5.4l-5 -2.6l-5 2.6l1 -5.4l-4 -3.8l5.5 -0.8z" />
      {/* Crown / "M" beneath — M = Man */}
      <path d="M9 19l1.5 -2v2M14.5 19v-2l1.5 2M11.5 19v-2M12.5 17v2" opacity="0.7" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LANDING PAGE FEATURE ICONS (6)
// Replaced the P / SR / M / CRR / Wd / • text-chip icons.
// ─────────────────────────────────────────────────────────────────────

/** Partnerships — two batters, joined by a run-rate line. */
export function FeaturePartnershipIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Two figures */}
      <circle cx="6" cy="7" r="2" />
      <path d="M6 9v6" />
      <path d="M6 11l-2 2M6 11l2 2" />
      <circle cx="18" cy="7" r="2" />
      <path d="M18 9v6" />
      <path d="M18 11l-2 2M18 11l2 2" />
      {/* Connecting partnership line */}
      <path d="M9 7h6" strokeDasharray="1 1.5" />
      {/* Partnership value tick marks above */}
      <path d="M10 4v2M14 4v2" opacity="0.6" />
    </svg>
  );
}

/** Strike Rate — a percentage dial. */
export function FeatureStrikeRateIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Circular dial */}
      <circle cx="12" cy="12" r="8" opacity="0.4" />
      {/* Active arc — 75% of the circle */}
      <path d="M12 4a8 8 0 0 1 8 8" />
      <path d="M20 12a8 8 0 0 1 -3 6.2" />
      {/* Center "SR" mark — a small bat */}
      <path d="M10 10l4 4M9 11l4 4l-1 1l-4 -4z" />
      <circle cx="14" cy="14" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Maiden — a bowler figure with a "0" badge. */
export function FeatureMaidenIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Bowler in delivery stride */}
      <circle cx="8" cy="5" r="1.8" />
      <path d="M8 7v5" />
      <path d="M8 8l4 2" />
      <path d="M8 12l-3 4M8 12l3 4" />
      {/* Ball being released */}
      <circle cx="13" cy="9" r="0.8" fill="currentColor" stroke="none" />
      <path d="M14 8l3 -1" strokeDasharray="0.5 1.5" opacity="0.5" />
      {/* "0" badge — maiden over */}
      <circle cx="18" cy="17" r="3.5" />
      <path d="M18 15.5a1.5 1.5 0 0 0 0 3a1.5 1.5 0 0 0 0 -3z" />
    </svg>
  );
}

/** Run Rate — upward trend line with a ball. */
export function FeatureRunRateIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Axes */}
      <path d="M4 4v16h16" opacity="0.4" />
      {/* Trend line — worm going up */}
      <path d="M5 18l4 -3l3 2l4 -5l3 1" />
      {/* Trend dots */}
      <circle cx="5" cy="18" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="19" cy="13" r="0.7" fill="currentColor" stroke="none" />
      {/* Up arrow indicator */}
      <path d="M17 5l3 0M20 5l0 3M20 5l-4 4" opacity="0.6" />
    </svg>
  );
}

/** Extras — wide + no-ball combined. */
export function FeatureExtrasIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* "Wd" wide — ball going wide of stumps */}
      <path d="M3 14v6M7 13v7M11 14v6" opacity="0.4" />
      <path d="M2 13l3 0M6 13l4 0M10 13l3 0" opacity="0.4" />
      {/* Ball wide arrow */}
      <path d="M14 4l5 8" strokeDasharray="0.5 2" />
      <circle cx="14" cy="4" r="1" fill="currentColor" stroke="none" />
      {/* "Nb" no-ball indicator — small badge */}
      <circle cx="18" cy="17" r="3.5" />
      <path d="M16.5 16v2.5M17.5 16v2.5M16.5 17h2.5" />
    </svg>
  );
}

/** Ball History — a vertical list of ball-by-ball entries. */
export function FeatureBallHistoryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Over list — 6 ball slots */}
      <circle cx="5" cy="5" r="1.5" />
      <circle cx="11" cy="5" r="1.5" />
      <circle cx="17" cy="5" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="11" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="12" r="1.5" />
      {/* Highlighted current ball */}
      <circle cx="11" cy="12" r="2.5" opacity="0.4" />
      {/* Next ball — empty slot */}
      <circle cx="5" cy="19" r="1.5" opacity="0.4" />
      <circle cx="11" cy="19" r="1.5" opacity="0.4" />
      <circle cx="17" cy="19" r="1.5" opacity="0.4" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// GENERAL CRICKET ICONS
// Used in MatchCreateForm, InningsBreakScreen, etc.
// ─────────────────────────────────────────────────────────────────────

/** Bat — a cricket bat icon. */
export function BatIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Bat blade */}
      <path d="M14 3l4 4l-9 9l-4 -1l1 -4z" />
      {/* Handle */}
      <path d="M14 3l3 -1l1 1l-1 3" />
      <path d="M16 5l1 -1" />
      {/* Detail lines on the blade */}
      <path d="M9 14l3 3" opacity="0.4" />
    </svg>
  );
}

/** Ball — a cricket ball with seam. */
export function BallIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      {/* Seam — equator line */}
      <path d="M5 12c2 -1 4 -1 6 0s4 1 6 0" />
      {/* Seam stitching marks */}
      <path d="M7 11l0 2M9 11l0 2M15 11l0 2M17 11l0 2" opacity="0.7" />
    </svg>
  );
}

/** Toss — a coin flip. */
export function TossIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Coin — ellipse to suggest 3D flip */}
      <ellipse cx="12" cy="12" rx="5" ry="8" />
      {/* Motion arc — flipping */}
      <path d="M5 6c-2 2 -2 4 0 6" opacity="0.4" />
      <path d="M19 6c2 2 2 4 0 6" opacity="0.4" />
      {/* "T" on the coin face */}
      <path d="M10 10h4M12 10v4" />
    </svg>
  );
}

/** Field — fielding team icon (grouundsman eye view). */
export function FieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Oval boundary */}
      <ellipse cx="12" cy="12" rx="9" ry="6" />
      {/* Pitch in the middle */}
      <rect x="10" y="9" width="4" height="6" rx="0.5" />
      {/* Fielder positions — small dots around the oval */}
      <circle cx="4" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="20" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="20" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="6" cy="7" r="0.8" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="18" cy="7" r="0.8" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="6" cy="17" r="0.8" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="18" cy="17" r="0.8" fill="currentColor" stroke="none" opacity="0.6" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CONVENIENCE LOOKUP MAPS
// For places that need to map a string key → icon component.
// ─────────────────────────────────────────────────────────────────────

export const WICKET_TYPE_ICONS = {
  bowled: WicketBowledIcon,
  caught: WicketCaughtIcon,
  run_out: WicketRunOutIcon,
  lbw: WicketLbwIcon,
  stumped: WicketStumpedIcon,
  hit_wicket: WicketHitWicketIcon,
  retired_hurt: WicketRetiredHurtIcon,
} as const;

export const ACHIEVEMENT_ICONS = {
  century: AchievementCenturyIcon,
  half_century: AchievementHalfCenturyIcon,
  six_machine: AchievementSixMachineIcon,
  economy_king: AchievementEconomyKingIcon,
  five_for: AchievementFiveForIcon,
  hat_trick: AchievementHatTrickIcon,
  captains_knock: AchievementCaptainsKnockIcon,
  finisher: AchievementFinisherIcon,
  tournament_winner: AchievementTournamentWinnerIcon,
  man_of_series: AchievementManOfSeriesIcon,
} as const;

export const FEATURE_ICONS = {
  partnership: FeaturePartnershipIcon,
  strike_rate: FeatureStrikeRateIcon,
  maiden: FeatureMaidenIcon,
  run_rate: FeatureRunRateIcon,
  extras: FeatureExtrasIcon,
  ball_history: FeatureBallHistoryIcon,
} as const;
