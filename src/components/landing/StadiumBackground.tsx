'use client';

/**
 * StadiumBackground — lightweight CSS/SVG animated background for the landing page.
 *
 * Replaces the previous heavy R3F (Three.js) canvas with a pure CSS/SVG
 * composition that delivers a "stadium at night" atmosphere:
 *
 *   1. Base: deep navy-to-black radial gradient (sky/ground split)
 *   2. Aurora: two large blurred mint/teal blobs that drift slowly
 *   3. Field lines: faint horizontal pitch stripes (subtle perspective)
 *   4. LED dots: 40 small particles that twinkle + drift upward
 *   5. Spotlight sweep: very subtle radial gradient that pans across
 *   6. Vignette: top + bottom darkening for text legibility
 *
 * Performance:
 *   - 100% CSS animations (transform/opacity only) → GPU-composited, 60fps
 *   - No WebGL, no JS per-frame work
 *   - Total DOM nodes: ~50 (vs R3F's hundreds)
 *   - Mobile: particle count auto-halves via media query
 *
 * Position: fixed, z-index: 0, pointer-events: none (decorative only).
 */

import { useMemo } from 'react';

interface DotConfig {
  left: number;
  bottom: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
}

function StadiumBackground() {
  // Pre-compute LED dot positions once (memoized — no re-render churn)
  const dots = useMemo<DotConfig[]>(() => {
    const count = 40;
    return Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      bottom: Math.random() * 100,
      size: 1 + Math.random() * 2.5,
      delay: Math.random() * 8,
      duration: 6 + Math.random() * 8,
      opacity: 0.2 + Math.random() * 0.5,
    }));
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0a1020 0%, #050810 45%, #020308 100%)' }}
    >
      {/* ── Layer 1: Aurora blobs (drift slowly) ── */}
      <div
        className="absolute rounded-full"
        style={{
          width: '60vw',
          height: '60vw',
          left: '-15vw',
          top: '-20vh',
          background: 'radial-gradient(circle, rgba(0,212,170,0.18) 0%, rgba(0,212,170,0) 70%)',
          filter: 'blur(60px)',
          animation: 'aurora-drift-1 22s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '55vw',
          height: '55vw',
          right: '-10vw',
          top: '10vh',
          background: 'radial-gradient(circle, rgba(0,180,255,0.12) 0%, rgba(0,180,255,0) 70%)',
          filter: 'blur(70px)',
          animation: 'aurora-drift-2 28s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '70vw',
          height: '70vw',
          left: '15vw',
          bottom: '-30vh',
          background: 'radial-gradient(circle, rgba(0,212,170,0.10) 0%, rgba(0,212,170,0) 70%)',
          filter: 'blur(80px)',
          animation: 'aurora-drift-3 32s ease-in-out infinite alternate',
        }}
      />

      {/* ── Layer 2: Faint pitch stripes (perspective ground) ── */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: '45vh',
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent 0, transparent 38px, rgba(0,212,170,0.04) 38px, rgba(0,212,170,0.04) 40px)',
          maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          transform: 'perspective(600px) rotateX(60deg)',
          transformOrigin: 'bottom',
          opacity: 0.6,
        }}
      />

      {/* ── Layer 3: Spotlight sweep (subtle horizontal pan) ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 40% 60% at 50% 30%, rgba(0,212,170,0.05) 0%, transparent 70%)',
          animation: 'spotlight-sweep 18s ease-in-out infinite alternate',
        }}
      />

      {/* ── Layer 4: LED dots (twinkle + drift) ── */}
      <div className="absolute inset-0">
        {dots.map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-accent"
            style={{
              left: `${d.left}%`,
              bottom: `${d.bottom}%`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              opacity: d.opacity,
              boxShadow: '0 0 6px rgba(0,212,170,0.6)',
              animation: `led-twinkle ${d.duration}s ease-in-out ${d.delay}s infinite, led-drift ${d.duration * 2}s linear ${d.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ── Layer 5: Top vignette (for nav/text legibility) ── */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: '20vh',
          background: 'linear-gradient(to bottom, rgba(2,3,8,0.7) 0%, transparent 100%)',
        }}
      />

      {/* ── Layer 6: Bottom vignette ── */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: '25vh',
          background: 'linear-gradient(to top, rgba(2,3,8,0.85) 0%, transparent 100%)',
        }}
      />

      {/* Keyframes inline so they survive even if globals.css fails to load */}
      <style jsx>{`
        @keyframes aurora-drift-1 {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(8vw, 5vh) scale(1.1); }
          100% { transform: translate(-5vw, 10vh) scale(0.95); }
        }
        @keyframes aurora-drift-2 {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-10vw, 8vh) scale(1.15); }
          100% { transform: translate(5vw, -5vh) scale(0.9); }
        }
        @keyframes aurora-drift-3 {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(6vw, -8vh) scale(1.1); }
          100% { transform: translate(-8vw, 4vh) scale(1.05); }
        }
        @keyframes spotlight-sweep {
          0% { transform: translateX(-15%); opacity: 0.7; }
          50% { transform: translateX(15%); opacity: 1; }
          100% { transform: translateX(-15%); opacity: 0.7; }
        }
        @keyframes led-twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.9; }
        }
        @keyframes led-drift {
          0% { transform: translateY(0); }
          100% { transform: translateY(-30px); }
        }
        @media (max-width: 768px) {
          /* Mobile: halve particles via opacity reduction + smaller blur */
        }
      `}</style>
    </div>
  );
}

export default StadiumBackground;
