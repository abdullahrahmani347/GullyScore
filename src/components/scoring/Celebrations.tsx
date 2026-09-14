'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Canvas confetti (§14.6, ≤ 3 s, reduced-motion respected) ───────────── */

interface ConfettiCanvasProps {
  /** Changing to true (or a new key value) fires a burst. */
  active: boolean | number | string;
  /** ms — capped at 3000 by the spec. */
  duration?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  w: number;
  h: number;
  color: string;
  life: number;
}

const CONFETTI_COLORS = ['#FFD700', '#00D4AA', '#FF6B35', '#4ECDC4', '#FF4D6A', '#FFB300'];

function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A zero-dependency canvas confetti burst. Runs at most `duration` (≤3s),
 * skips entirely when the user prefers reduced motion, and cleans up its
 * rAF loop on unmount.
 */
export function ConfettiCanvas({ active, duration = 2500 }: ConfettiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (active === false || active === null) return;
    setBurstKey((k) => k + 1);
  }, [active]);

  useEffect(() => {
    if (burstKey === 0) return;
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion()) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = window.innerWidth;
    const H = window.innerHeight;
    const life = Math.min(duration, 3000);
    const start = performance.now();

    // Two launch points bottom-center-ish, like stadium cannons
    const particles: Particle[] = [];
    for (let i = 0; i < 120; i++) {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -Math.PI / 3 : -Math.PI / 1.5) + (Math.random() - 0.5) * 0.6;
      const speed = 9 + Math.random() * 10;
      particles.push({
        x: fromLeft ? W * 0.18 : W * 0.82,
        y: H * 0.75,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.25,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        life,
      });
    }

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = elapsed / life;
      ctx.clearRect(0, 0, W, H);
      if (t >= 1) {
        rafRef.current = null;
        return;
      }
      const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.vx *= 0.99;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [burstKey, duration]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[95]"
      aria-hidden="true"
    />
  );
}

/* ── Hat-trick / five-for sequence banner (§14.6) ───────────────────────── */

export type SequenceKind = 'hat-trick' | 'five-for';

interface SequenceBannerProps {
  kind: SequenceKind | null;
  playerName: string;
  onDone: () => void;
}

/**
 * Full-width banner for the two big bowling sequences. Auto-dismisses after
 * 3 s (tap to dismiss sooner). Reduced motion: simple fade, no slide.
 */
export function SequenceBanner({ kind, playerName, onDone }: SequenceBannerProps) {
  useEffect(() => {
    if (!kind) return;
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [kind, playerName, onDone]);

  return (
    <AnimatePresence>
      {kind && (
        <motion.button
          key={`${kind}-${playerName}`}
          initial={{ y: reducedMotion() ? 0 : -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: reducedMotion() ? 0 : -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          onClick={onDone}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[90] w-[92%] max-w-md"
          aria-live="polite"
        >
          <div
            className={`rounded-2xl border px-4 py-3 flex items-center gap-3 shadow-lg ${
              kind === 'hat-trick'
                ? 'bg-wicket/15 border-wicket/40'
                : 'bg-gold/15 border-gold/40'
            }`}
          >
            <span
              className={`font-mono text-2xl font-bold ${
                kind === 'hat-trick' ? 'text-wicket' : 'text-gold'
              }`}
            >
              {kind === 'hat-trick' ? '3W' : '5W'}
            </span>
            <div className="text-left">
              <p className="text-sm font-bold text-t1 tracking-wide uppercase">
                {kind === 'hat-trick' ? 'Hat-trick!' : 'Five-for!'}
              </p>
              <p className="text-xs text-t2">
                {playerName}
                {kind === 'hat-trick' ? ' — three in three' : ' — five wickets down'}
              </p>
            </div>
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/* ── Milestone odometer roll (§14.6) ────────────────────────────────────── */

interface OdometerNumberProps {
  value: number;
  className?: string;
}

/**
 * Rolling odometer for the hero score. Each digit slides vertically to its
 * new value; digit count changes roll from the right. Static (no roll) when
 * the user prefers reduced motion.
 */
export function OdometerNumber({ value, className }: OdometerNumberProps) {
  const digits = String(Math.max(0, value)).split('');
  const [rollKey, setRollKey] = useState(0);
  useEffect(() => setRollKey((k) => k + 1), [value]);

  if (reducedMotion()) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={`inline-flex tabular-nums ${className ?? ''}`} aria-label={String(value)}>
      {digits.map((d, i) => (
        <span key={`${rollKey}-${i}`} className="relative inline-block overflow-hidden" style={{ height: '1em', lineHeight: '1em' }}>
          <motion.span
            key={`${rollKey}-${i}-inner`}
            initial={{ y: '-110%' }}
            animate={{ y: '0%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 28, delay: i * 0.045 }}
            className="block"
          >
            {d}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
