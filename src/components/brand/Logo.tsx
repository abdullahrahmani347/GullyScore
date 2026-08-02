/**
 * GullyScore Logo + Brand Mark
 *
 * Design rationale:
 *   The mark is a stylized cricket wicket (three stumps + a bail) struck by
 *   a ball trajectory arc. The bail is offset slightly to suggest motion —
 *   a wicket just disturbed — which gives the mark a sense of action and
 *   story rather than a static emblem.
 *
 *   The mark is drawn entirely in the brand mint accent (#00D4AA) so it
 *   works on dark backgrounds (the app's primary surface). On light
 *   backgrounds, the consumer should wrap it in a dark badge or use the
 *   `Lockup` variant which includes a mint badge background.
 *
 * Components exported:
 *   <LogoMark size={24} />              — just the icon (mint strokes)
 *   <LogoBadge size={32} />             — icon on a mint rounded-square badge
 *   <LogoLockup size={32} showWord />   — badge + "GullyScore" wordmark
 *
 * Usage:
 *   - Sidebar / dashboard header: <LogoLockup size={28} />
 *   - Mobile compact:             <LogoBadge size={28} />
 *   - Spectator header:           <LogoLockup size={24} />
 *   - Landing footer:             <LogoMark size={20} /> + wordmark inline
 */

import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
}

/** Just the wicket + ball-arc mark, in currentColor (inherit text color). */
export function LogoMark({ size = 24, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-accent', className)}
      aria-hidden="true"
    >
      {/* Ball trajectory arc — curves in from the right and strikes the stumps */}
      <path
        d="M28 6 Q 18 8, 12 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="0.5 2.2"
        opacity="0.7"
      />
      {/* The ball itself — small filled circle at the end of the arc */}
      <circle cx="11.4" cy="14.4" r="1.7" fill="currentColor" />

      {/* Three stumps — slightly different heights for a hand-drawn, organic feel */}
      <rect x="9" y="13" width="1.6" height="12" rx="0.8" fill="currentColor" />
      <rect x="13" y="11" width="1.6" height="14" rx="0.8" fill="currentColor" />
      <rect x="17" y="12" width="1.6" height="13" rx="0.8" fill="currentColor" />

      {/* Bails — the top one is offset/jittered to suggest a wicket just disturbed */}
      <rect x="8.6" y="10.4" width="3.2" height="1.2" rx="0.6" fill="currentColor" transform="rotate(-3 8.6 10.4)" />
      <rect x="13.4" y="9.8" width="3.2" height="1.2" rx="0.6" fill="currentColor" transform="rotate(-6 13.4 9.8)" />
    </svg>
  );
}

/** Logo mark inside a mint rounded-square badge (for headers/nav). */
export function LogoBadge({ size = 32, className }: LogoProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-[28%] bg-accent text-bg-app shadow-[0_0_18px_rgba(0,212,170,0.35)]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <LogoMark size={size * 0.72} className="text-bg-app" />
    </div>
  );
}

/**
 * Full lockup: badge + wordmark.
 * Use `showWord={false}` to render just the badge (mobile / collapsed nav).
 */
export function LogoLockup({
  size = 28,
  showWord = true,
  className,
}: LogoProps & { showWord?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoBadge size={size} />
      {showWord && (
        <span className="text-t1 font-bold tracking-tight text-lg leading-none">
          Gully<span className="text-accent">Score</span>
        </span>
      )}
    </div>
  );
}
