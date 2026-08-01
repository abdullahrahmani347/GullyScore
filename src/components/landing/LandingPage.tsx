'use client';

/**
 * LandingPage — Main orchestrator for the GullyScore landing page.
 *
 * Structure:
 *   <StadiumBackground />  — persistent CSS/SVG animated background (z:0)
 *   <ScrollProgress />     — top progress bar
 *   <HeroSection />        — pinned, scroll 0–0.14
 *   <LiveScoringSection /> — pinned, scroll 0.14–0.29
 *   <TournamentSection />  — pinned, scroll 0.29–0.43
 *   <SpectatorSection />   — pinned, scroll 0.43–0.57
 *   <ChartsSection />      — pinned, scroll 0.57–0.71
 *   <StatsSection />       — pinned, scroll 0.71–0.86
 *   <CTASection />         — pinned, scroll 0.86–1.0
 *
 * GSAP setup:
 *   - ScrollTrigger.create() with start:0 / end:'max' tracks progress.
 *   - Each .pin-section is pinned for +=35% of viewport with scrub:0.2 for
 *     snappy, fast-scrolling animations.
 *   - Section-internal animations (score updates, chart draws, counter ticks)
 *     are wired to the pin's timeline via gsap.timeline().
 *
 * All content lives above the background (relative z-10) with semi-transparent
 * dark backgrounds so text stays readable.
 */

import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import StadiumBackground from './StadiumBackground';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// ─────────────────────────────────────────────────────────────────────
// Scroll progress bar (top of page)
// ─────────────────────────────────────────────────────────────────────
function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        if (barRef.current) {
          barRef.current.style.transform = `scaleX(${self.progress})`;
        }
      },
    });
    return () => st.kill();
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] z-50 bg-bg-card/40">
      <div
        ref={barRef}
        className="h-full bg-accent origin-left"
        style={{ transform: 'scaleX(0)', boxShadow: '0 0 12px rgba(0,212,170,0.6)' }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section wrapper — applies the pinned-section class + min height
// ─────────────────────────────────────────────────────────────────────
function Section({
  id,
  children,
  className = '',
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`pin-section relative min-h-dvh flex items-center justify-center overflow-hidden ${className}`}
    >
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reusable: section eyebrow + headline + subhead
// ─────────────────────────────────────────────────────────────────────
function SectionHeading({
  eyebrow,
  headline,
  subhead,
  align = 'center',
}: {
  eyebrow: string;
  headline: React.ReactNode;
  subhead?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'text-center max-w-3xl mx-auto' : 'max-w-2xl'}>
      <div
        className={`inline-block px-3 py-1 rounded-full bg-accent-dim text-accent text-xs font-mono uppercase tracking-[0.2em] mb-5 ${
          align === 'center' ? 'mx-auto' : ''
        }`}
      >
        {eyebrow}
      </div>
      <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-t1 leading-[1.05] tracking-tight">
        {headline}
      </h2>
      {subhead && (
        <p className="mt-5 text-base sm:text-lg text-t2 leading-relaxed">{subhead}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 1. HERO SECTION
// ─────────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <Section id="hero" className="bg-gradient-to-b from-bg-app/40 via-bg-app/20 to-bg-app/60">
      {/* Radial scrim behind text for readability over 3D scoreboard */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(7,7,16,0.85) 0%, rgba(7,7,16,0.5) 50%, transparent 100%)',
        }}
      />
      <div className="relative z-10 px-6 text-center max-w-5xl mx-auto hero-content">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-bg-card/60 border border-border backdrop-blur-md mb-8 hero-badge"
        >
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-[0.25em] text-t2">
            Cricket scoring, reimagined
          </span>
        </div>
        <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold text-t1 leading-none tracking-tight hero-title">
          Gully
          <span className="text-accent">Score</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl md:text-2xl text-t2 max-w-2xl mx-auto hero-tagline">
          Ball-by-ball scoring for gully matches and local tournaments.
          <br className="hidden sm:block" />
          No signup. No setup. Just cricket.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 hero-cta">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-accent text-bg-app font-semibold text-base hover:scale-[1.03] transition-transform shadow-[0_0_32px_rgba(0,212,170,0.4)]"
          >
            Start Scoring
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="group-hover:translate-x-1 transition-transform">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <a
            href="#live-scoring"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-bg-card/60 border border-border text-t1 font-medium text-base hover:border-accent/40 backdrop-blur-md transition-colors"
          >
            Watch how it works
          </a>
        </div>
      </div>
      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hero-scroll-indicator">
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-[0.3em] text-t3">Scroll</span>
          <div className="w-[1px] h-12 bg-gradient-to-b from-t3 to-transparent" />
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2. LIVE SCORING SECTION — animated ball-by-ball demo
// ─────────────────────────────────────────────────────────────────────
function LiveScoringSection() {
  // 8-ball sequence: 4, 1, 2, 6, W, 1, 4, 0
  const balls = [
    { runs: 4, type: 'four' as const },
    { runs: 1, type: 'single' as const },
    { runs: 2, type: 'single' as const },
    { runs: 6, type: 'six' as const },
    { runs: 0, type: 'wicket' as const },
    { runs: 1, type: 'single' as const },
    { runs: 4, type: 'four' as const },
    { runs: 0, type: 'dot' as const },
  ];
  // Cumulative scores after each ball: 4, 5, 7, 13, 13, 14, 18, 18
  const scores = [4, 5, 7, 13, 13, 14, 18, 18];
  const wickets = [0, 0, 0, 0, 1, 1, 1, 1];

  const features = [
    { icon: '🤝', title: 'Partnership tracking', desc: 'Every batsman pair, every ball, every run.' },
    { icon: '🏏', title: 'Batsman innings', desc: 'Runs, balls, 4s, 6s, strike rate — all live.' },
    { icon: '🎯', title: 'Bowler spells', desc: 'Overs, maidens, wickets, economy — automatic.' },
    { icon: '⚡', title: 'Live run-rate', desc: 'Current rate + required rate, computed every ball.' },
    { icon: '✨', title: 'All extras', desc: 'Wides, no-balls, byes, leg-byes — fully tracked.' },
    { icon: '📜', title: 'Ball-level history', desc: 'Every delivery, rewindable. Every innings, complete.' },
  ];

  return (
    <Section id="live-scoring" className="bg-gradient-to-b from-bg-app/60 via-bg-app/80 to-bg-app/70">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-16">
        <SectionHeading
          eyebrow="Ball-by-ball engine"
          headline={
            <>
              Every ball. Every run.
              <br />
              <span className="text-accent">Every wicket.</span>
            </>
          }
          subhead="A scoring engine deep enough for proper cricket — partnerships, batsman/bowler innings, ball-level history — wrapped in a UI that loads in 2 taps on any phone."
        />

        <div className="mt-16 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: animated phone mockup */}
          <div className="live-phone-wrap order-2 lg:order-1">
            <div className="relative mx-auto w-full max-w-[320px] aspect-[9/19] rounded-[2.5rem] bg-bg-card border border-border p-3 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
              {/* Notch */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-bg-app rounded-b-2xl z-10" />
              {/* Screen */}
              <div className="relative w-full h-full rounded-[2rem] bg-bg-app overflow-hidden">
                {/* Status bar */}
                <div className="px-5 pt-10 pb-3 flex items-center justify-between">
                  <span className="text-xs font-mono text-t3">MATCH 18.3/20</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-wicket animate-pulse" />
                    <span className="text-xs font-mono text-wicket">LIVE</span>
                  </div>
                </div>
                {/* Score block */}
                <div className="px-5 py-4 live-score-block">
                  <div className="text-xs text-t3 mb-1">Mumbai Indians</div>
                  <div className="flex items-end gap-2">
                    <span
                      className="text-5xl font-bold font-mono text-t1 tabular-nums live-score"
                      data-final={`${scores[scores.length - 1]}/${wickets[wickets.length - 1]}`}
                    >
                      0/0
                    </span>
                  </div>
                  <div className="text-sm text-t2 mt-1 live-run-rate">CRR 0.00 · Need 0 from 0</div>
                </div>
                {/* Recent balls */}
                <div className="px-5 py-3">
                  <div className="text-xs text-t3 uppercase tracking-wider mb-2">This over</div>
                  <div className="flex gap-1.5 live-balls">
                    {balls.map((b, i) => {
                      const color =
                        b.type === 'four' ? 'bg-run-4 text-bg-app' :
                        b.type === 'six' ? 'bg-run-6 text-bg-app' :
                        b.type === 'wicket' ? 'bg-wicket text-bg-app' :
                        b.type === 'dot' ? 'bg-bg-elevated text-t2' :
                        'bg-bg-elevated text-t1';
                      return (
                        <span
                          key={i}
                          className={`live-ball-${i} w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono ${color}`}
                          data-label={b.type === 'dot' ? '•' : b.type === 'wicket' ? 'W' : String(b.runs)}
                        >
                          {b.type === 'dot' ? '•' : b.type === 'wicket' ? 'W' : b.runs}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {/* Batsmen strip */}
                <div className="px-5 py-3 border-t border-border">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-xs">
                    <div className="text-t2 font-medium">Batsman</div>
                    <div className="text-t3">R</div>
                    <div className="text-t3">B</div>
                    <div className="text-t3">4/6</div>
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm font-mono live-batsmen">
                    <div className="text-t1">Rohit Sharma *</div>
                    <div className="text-t1 tabular-nums">28</div>
                    <div className="text-t2 tabular-nums">19</div>
                    <div className="text-t2 tabular-nums">3/1</div>
                  </div>
                  <div className="mt-1 grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm font-mono">
                    <div className="text-t1">SKY</div>
                    <div className="text-t1 tabular-nums">12</div>
                    <div className="text-t2 tabular-nums">8</div>
                    <div className="text-t2 tabular-nums">1/0</div>
                  </div>
                </div>
                {/* Bowler strip */}
                <div className="px-5 py-3 border-t border-border">
                  <div className="text-xs text-t3">Bowler: Bumrah</div>
                  <div className="text-sm font-mono text-t2 mt-1">3.3-0-21-1</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: feature grid */}
          <div className="order-1 lg:order-2 live-features">
            <div className="grid sm:grid-cols-2 gap-4">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="live-feature-card p-5 rounded-2xl bg-bg-card/60 border border-border backdrop-blur-md hover:border-accent/30 transition-colors"
                >
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <div className="text-t1 font-semibold text-base mb-1">{f.title}</div>
                  <div className="text-t3 text-sm leading-relaxed">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 3. TOURNAMENT SECTION — round-robin auto-schedule + points table
// ─────────────────────────────────────────────────────────────────────
function TournamentSection() {
  // 6-team round-robin visualization
  const teams = ['MI', 'CSK', 'RCB', 'KKR', 'SRH', 'DC'];
  const pointsTable = [
    { team: 'MI', p: 5, w: 4, l: 1, nrr: '+1.234', pts: 8 },
    { team: 'CSK', p: 5, w: 3, l: 2, nrr: '+0.567', pts: 6 },
    { team: 'RCB', p: 5, w: 3, l: 2, nrr: '-0.123', pts: 6 },
    { team: 'KKR', p: 5, w: 2, l: 3, nrr: '+0.045', pts: 4 },
    { team: 'SRH', p: 5, w: 1, l: 4, nrr: '-0.789', pts: 2 },
    { team: 'DC', p: 5, w: 1, l: 4, nrr: '-0.934', pts: 2 },
  ];

  return (
    <Section id="tournament" className="bg-gradient-to-b from-bg-app/70 via-bg-app/85 to-bg-app/70">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-16">
        <SectionHeading
          eyebrow="Tournament mode"
          headline={
            <>
              Auto-scheduled tournaments.
              <br />
              <span className="text-accent">Live points table.</span>
            </>
          }
          subhead="Add teams, pick round-robin or knockout, get a full schedule in one tap. Points table updates live with NRR — no spreadsheet, no calculator."
        />

        <div className="mt-14 grid lg:grid-cols-2 gap-10 items-center">
          {/* Left: round-robin visualization */}
          <div className="tournament-graph order-2 lg:order-1">
            <div className="relative aspect-square max-w-md mx-auto">
              <svg viewBox="0 0 400 400" className="w-full h-full">
                {/* Connection lines (round-robin pairings) */}
                <g stroke="rgba(0,212,170,0.15)" strokeWidth="1" className="tournament-lines">
                  {teams.map((_, i) =>
                    teams.map((_, j) =>
                      i < j ? (
                        <line
                          key={`${i}-${j}`}
                          x1={200 + 150 * Math.cos((i / teams.length) * Math.PI * 2 - Math.PI / 2)}
                          y1={200 + 150 * Math.sin((i / teams.length) * Math.PI * 2 - Math.PI / 2)}
                          x2={200 + 150 * Math.cos((j / teams.length) * Math.PI * 2 - Math.PI / 2)}
                          y2={200 + 150 * Math.sin((j / teams.length) * Math.PI * 2 - Math.PI / 2)}
                        />
                      ) : null
                    )
                  )}
                </g>
                {/* Team nodes */}
                {teams.map((team, i) => {
                  const x = 200 + 150 * Math.cos((i / teams.length) * Math.PI * 2 - Math.PI / 2);
                  const y = 200 + 150 * Math.sin((i / teams.length) * Math.PI * 2 - Math.PI / 2);
                  return (
                    <g key={team} className={`tournament-node tournament-node-${i}`}>
                      <circle cx={x} cy={y} r="34" fill="#111120" stroke="#00D4AA" strokeWidth="2" />
                      <text
                        x={x}
                        y={y + 5}
                        textAnchor="middle"
                        fontSize="18"
                        fontWeight="700"
                        fill="#F0F0F5"
                        fontFamily="var(--font-mono), monospace"
                      >
                        {team}
                      </text>
                    </g>
                  );
                })}
                {/* Center label */}
                <text
                  x="200"
                  y="195"
                  textAnchor="middle"
                  fontSize="12"
                  fill="#9090A8"
                  fontFamily="var(--font-mono), monospace"
                  letterSpacing="2"
                >
                  ROUND
                </text>
                <text
                  x="200"
                  y="215"
                  textAnchor="middle"
                  fontSize="32"
                  fontWeight="700"
                  fill="#00D4AA"
                  fontFamily="var(--font-mono), monospace"
                >
                  ROBIN
                </text>
              </svg>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="px-3 py-1 rounded-full bg-accent-dim text-accent text-xs font-mono">
                15 matches auto-generated
              </span>
              <span className="px-3 py-1 rounded-full bg-bg-card/60 border border-border text-t2 text-xs font-mono">
                Knockout supported
              </span>
            </div>
          </div>

          {/* Right: animated points table */}
          <div className="order-1 lg:order-2 tournament-table">
            <div className="rounded-2xl bg-bg-card/60 border border-border backdrop-blur-md overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <div className="text-t1 font-semibold">Points Table</div>
                <div className="text-t3 text-xs mt-0.5">Live NRR · auto-updating</div>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1fr] gap-2 px-3 py-2 text-xs font-mono uppercase tracking-wider text-t3">
                  <div>Team</div>
                  <div className="text-center">P</div>
                  <div className="text-center">W</div>
                  <div className="text-center">L</div>
                  <div className="text-center">NRR</div>
                  <div className="text-center">Pts</div>
                </div>
                {pointsTable.map((row, i) => (
                  <div
                    key={row.team}
                    className={`tournament-row tournament-row-${i} grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1fr] gap-2 px-3 py-3 rounded-xl text-sm font-mono items-center ${
                      i === 0 ? 'bg-accent-dim' : i === pointsTable.length - 1 ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="text-t1 font-semibold flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-accent' : 'bg-t3'}`} />
                      {row.team}
                    </div>
                    <div className="text-center text-t2">{row.p}</div>
                    <div className="text-center text-t2">{row.w}</div>
                    <div className="text-center text-t2">{row.l}</div>
                    <div className={`text-center ${row.nrr.startsWith('+') ? 'text-accent' : 'text-wicket'}`}>
                      {row.nrr}
                    </div>
                    <div className="text-center text-t1 font-bold">{row.pts}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 4. SPECTATOR SECTION — shareable code + SSE stream
// ─────────────────────────────────────────────────────────────────────
function SpectatorSection() {
  return (
    <Section id="spectator" className="bg-gradient-to-b from-bg-app/70 via-bg-app/85 to-bg-app/70">
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-16">
        <SectionHeading
          eyebrow="Live spectator mode"
          headline={
            <>
              Share a code.
              <br />
              <span className="text-accent">Anyone watches live.</span>
            </>
          }
          subhead="Spectators don't need the app. Send them a 5-character code, they open a URL, and they see ball-by-ball action streamed via Server-Sent Events. Zero install, zero friction."
        />

        <div className="mt-16 grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center">
          {/* Scorer phone */}
          <div className="spectator-scorer flex flex-col items-center">
            <div className="text-xs font-mono uppercase tracking-[0.25em] text-t3 mb-4">SCORER</div>
            <div className="relative w-full max-w-[260px] aspect-[9/19] rounded-[2rem] bg-bg-card border border-border p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <div className="relative w-full h-full rounded-[1.5rem] bg-bg-app overflow-hidden flex flex-col items-center justify-center gap-4">
                <div className="text-xs text-t3 uppercase tracking-wider">Share code</div>
                <div className="px-6 py-3 rounded-2xl bg-accent-dim border border-accent/30">
                  <div className="text-3xl font-bold font-mono text-accent tracking-[0.3em]">
                    GS-X7KP2
                  </div>
                </div>
                <div className="text-xs text-t2 mt-2">gullyscore.app/live/X7KP2</div>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-mono text-accent">STREAMING</span>
                </div>
              </div>
            </div>
          </div>

          {/* Center: animated data flow */}
          <div className="spectator-flow flex md:flex-col items-center justify-center gap-3 py-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`spectator-particle spectator-particle-${i} w-2 h-2 rounded-full bg-accent`}
                style={{ opacity: 0.4 }}
              />
            ))}
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-t3 hidden md:block">
              SSE
            </div>
          </div>

          {/* Spectator phone */}
          <div className="spectator-viewer flex flex-col items-center">
            <div className="text-xs font-mono uppercase tracking-[0.25em] text-t3 mb-4">SPECTATOR</div>
            <div className="relative w-full max-w-[260px] aspect-[9/19] rounded-[2rem] bg-bg-card border border-border p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <div className="relative w-full h-full rounded-[1.5rem] bg-bg-app overflow-hidden">
                <div className="px-5 pt-6 pb-3 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-t3">LIVE</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-wicket animate-pulse" />
                </div>
                <div className="px-5">
                  <div className="text-[10px] text-t3">Mumbai Indians</div>
                  <div className="text-3xl font-bold font-mono text-t1">247/4</div>
                  <div className="text-xs text-t2 mt-1">18.3 overs · CRR 13.36</div>
                </div>
                <div className="px-5 py-3 mt-3">
                  <div className="text-[10px] text-t3 uppercase mb-1.5">This over</div>
                  <div className="flex gap-1">
                    {[
                      { l: '4', c: 'bg-run-4 text-bg-app' },
                      { l: '1', c: 'bg-bg-elevated text-t1' },
                      { l: '2', c: 'bg-bg-elevated text-t1' },
                      { l: '6', c: 'bg-run-6 text-bg-app' },
                      { l: 'W', c: 'bg-wicket text-bg-app' },
                    ].map((b, i) => (
                      <span
                        key={i}
                        className={`spectator-ball-${i} w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono ${b.c}`}
                      >
                        {b.l}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-border mt-3">
                  <div className="text-[10px] text-t3 uppercase mb-1">Last wicket</div>
                  <div className="text-xs text-t2">SKY c Dhoni b Bumrah 47 (28)</div>
                </div>
                <div className="px-5 py-2 mt-2 text-center text-[10px] font-mono text-t3">
                  Updates every ball · No refresh
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <span className="px-4 py-2 rounded-full bg-accent-dim border border-accent/30 text-accent text-sm font-mono">
            Zero install for spectators
          </span>
          <span className="px-4 py-2 rounded-full bg-bg-card/60 border border-border text-t2 text-sm font-mono">
            Server-Sent Events
          </span>
          <span className="px-4 py-2 rounded-full bg-bg-card/60 border border-border text-t2 text-sm font-mono">
            Works in any browser
          </span>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 5. CHARTS SECTION — run-rate worm + milestone alerts
// ─────────────────────────────────────────────────────────────────────
function ChartsSection() {
  // Generate worm path points
  const wormPoints = Array.from({ length: 30 }, (_, i) => {
    const x = (i / 29) * 100;
    const t = i / 29;
    const y = 50 + Math.sin(t * Math.PI * 3) * 15 + t * 10;
    return `${x},${y}`;
  }).join(' ');

  const milestones = [
    { text: '50!', sub: 'Rohit Sharma', color: 'text-accent', border: 'border-accent/40', bg: 'bg-accent-dim' },
    { text: '100', sub: 'Team partnership', color: 'text-gold', border: 'border-gold/40', bg: 'bg-gold-dim' },
    { text: 'WICKET', sub: 'Bowled · Bumrah', color: 'text-wicket', border: 'border-wicket/40', bg: 'bg-wicket-bg' },
    { text: '150', sub: 'Team total', color: 'text-accent', border: 'border-accent/40', bg: 'bg-accent-dim' },
    { text: '6!', sub: 'SKY · maximum', color: 'text-run-6', border: 'border-run-6/40', bg: 'bg-run-6-bg' },
  ];

  return (
    <Section id="charts" className="bg-gradient-to-b from-bg-app/70 via-bg-app/85 to-bg-app/70">
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-16">
        <SectionHeading
          eyebrow="Charts & milestones"
          headline={
            <>
              Worms that worm.
              <br />
              <span className="text-accent">Milestones that pop.</span>
            </>
          }
          subhead="Run-rate charts that draw themselves. Milestone alerts for 50s, 100s, wickets, partnerships — the moments that matter, surfaced the moment they happen."
        />

        {/* Worm chart */}
        <div className="mt-14 charts-worm-wrap rounded-3xl bg-bg-card/60 border border-border backdrop-blur-md p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-t1 font-semibold text-lg">Run Rate Worm</div>
              <div className="text-t3 text-sm">Mumbai Indians vs Chennai Super Kings</div>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] bg-accent" />
                <span className="text-t2">MI</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] bg-run-6" />
                <span className="text-t2">Req</span>
              </div>
            </div>
          </div>
          <svg viewBox="0 0 100 60" className="w-full h-48 charts-worm-svg" preserveAspectRatio="none">
            {/* Grid lines */}
            {[15, 30, 45].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.2" />
            ))}
            {/* Required rate line */}
            <line x1="0" y1="35" x2="100" y2="20" stroke="#FF6B35" strokeWidth="0.4" strokeDasharray="2,1" />
            {/* MI worm */}
            <polyline
              points={wormPoints}
              fill="none"
              stroke="#00D4AA"
              strokeWidth="0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="charts-worm-line"
            />
            {/* End dot */}
            <circle cx="100" cy="60" r="1.2" fill="#00D4AA" className="charts-worm-dot" />
          </svg>
          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-t3 text-xs uppercase tracking-wider">Current</div>
              <div className="text-t1 text-2xl font-bold font-mono mt-1">13.36</div>
            </div>
            <div>
              <div className="text-t3 text-xs uppercase tracking-wider">Required</div>
              <div className="text-run-6 text-2xl font-bold font-mono mt-1">12.00</div>
            </div>
            <div>
              <div className="text-t3 text-xs uppercase tracking-wider">Projected</div>
              <div className="text-accent text-2xl font-bold font-mono mt-1">267</div>
            </div>
          </div>
        </div>

        {/* Milestone alerts */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {milestones.map((m, i) => (
            <div
              key={i}
              className={`milestone-alert milestone-alert-${i} rounded-2xl ${m.bg} border ${m.border} p-4 text-center`}
            >
              <div className={`text-2xl font-bold font-mono ${m.color}`}>{m.text}</div>
              <div className="text-t2 text-xs mt-1">{m.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 6. STATS SECTION — animated counters + differentiator badges
// ─────────────────────────────────────────────────────────────────────
function StatsSection() {
  const stats = [
    { value: 12847, label: 'balls tracked', suffix: '' },
    { value: 3420, label: 'partnerships computed', suffix: '' },
    { value: 847, label: 'matches scored', suffix: '' },
    { value: 0, label: 'signups required', suffix: '' },
  ];

  const differentiators = [
    'Partnership Engine',
    'SSE Spectator Mode',
    'Auto-Schedule Tournaments',
    'Zero-Signup',
    'Offline-First PWA',
    'Device-Scoped',
  ];

  return (
    <Section id="stats" className="bg-gradient-to-b from-bg-app/70 via-bg-app/90 to-bg-app/80">
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-16">
        <SectionHeading
          eyebrow="Built for gully cricket"
          headline={
            <>
              Made for the long tail
              <br />
              <span className="text-accent">of local matches.</span>
            </>
          }
          subhead="Every gully, every mohalla, every Sunday morning tape-ball league. GullyScore scales from a 5-over friendly to a 16-team tournament without breaking a sweat."
        />

        {/* Counters */}
        <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((s, i) => (
            <div
              key={i}
              className={`stat-counter stat-counter-${i} rounded-2xl bg-bg-card/60 border border-border backdrop-blur-md p-6 text-center`}
            >
              <div
                className="text-4xl sm:text-5xl lg:text-6xl font-bold font-mono text-t1 tabular-nums stat-value"
                data-target={s.value}
                data-suffix={s.suffix}
              >
                0
              </div>
              <div className="mt-2 text-t3 text-xs sm:text-sm uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Differentiator badges */}
        <div className="mt-14 stats-badges flex flex-wrap justify-center gap-3">
          {differentiators.map((d, i) => (
            <div
              key={d}
              className={`stats-badge stats-badge-${i} inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bg-card/60 border border-border backdrop-blur-md hover:border-accent/40 transition-colors`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-t1 text-sm font-medium">{d}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 7. CTA + FOOTER SECTION
// ─────────────────────────────────────────────────────────────────────
function CTASection() {
  return (
    <Section id="cta" className="bg-gradient-to-b from-bg-app/80 via-bg-app to-bg-app">
      <div className="relative z-10 w-full max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="cta-content">
          <div className="inline-block px-3 py-1 rounded-full bg-accent-dim text-accent text-xs font-mono uppercase tracking-[0.25em] mb-6 cta-badge">
            Ready when you are
          </div>
          <h2 className="text-5xl sm:text-6xl md:text-7xl font-bold text-t1 leading-[1.05] tracking-tight cta-title">
            Start scoring
            <br />
            in <span className="text-accent">2 taps.</span>
          </h2>
          <p className="mt-6 text-lg sm:text-xl text-t2 max-w-xl mx-auto cta-subtitle">
            No account. No email. No setup. Just open the app, pick your teams, and bowl the first ball.
          </p>
          <div className="mt-10 cta-button-wrap">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 px-10 py-5 rounded-2xl bg-accent text-bg-app font-bold text-lg hover:scale-[1.03] transition-transform shadow-[0_0_48px_rgba(0,212,170,0.5)]"
            >
              Open GullyScore
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="group-hover:translate-x-1 transition-transform">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-4 cta-features">
            <span className="inline-flex items-center gap-1.5 text-t3 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Works offline
            </span>
            <span className="inline-flex items-center gap-1.5 text-t3 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> No account
            </span>
            <span className="inline-flex items-center gap-1.5 text-t3 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Just cricket
            </span>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-border cta-footer">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-t3 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-accent text-base font-bold">⚡ GullyScore</span>
              <span>· Cricket scoring, simplified</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="hover:text-accent transition-colors">Dashboard</Link>
              <Link href="/matches" className="hover:text-accent transition-colors">Matches</Link>
              <Link href="/teams" className="hover:text-accent transition-colors">Teams</Link>
              <Link href="/tournaments" className="hover:text-accent transition-colors">Leagues</Link>
            </div>
            <div>© 2026 GullyScore</div>
          </div>
          <div className="mt-4 text-center text-t3 text-[10px] font-mono uppercase tracking-[0.2em]">
            Built with Next.js · React Three Fiber · GSAP · Prisma
          </div>
        </footer>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MAIN EXPORT — LandingPage
// ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;

    const ctx = gsap.context(() => {
      // ── Hero section: entrance plays on mount (NOT scrubbed), exit is scrubbed ──
      // Use .fromTo() with explicit end state (opacity: 1) so that even if GSAP
      // is interrupted or fails to complete, the end state is well-defined.
      // Also wrap in try/catch — if GSAP throws, the CSS fallback (opacity: 1
      // by default on .hero-* classes, set in globals.css) keeps content visible.
      try {
        gsap.timeline({ delay: 0.15 })
          .fromTo('.hero-badge', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' })
          .fromTo('.hero-title', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, '-=0.3')
          .fromTo('.hero-tagline', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, '-=0.35')
          .fromTo('.hero-cta', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, '-=0.3')
          .fromTo('.hero-scroll-indicator', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, '-=0.2');
      } catch (e) {
        // If GSAP fails, force all hero elements visible immediately
        document.querySelectorAll<HTMLElement>('.hero-badge, .hero-title, .hero-tagline, .hero-cta, .hero-scroll-indicator, .hero-content').forEach((el) => {
          el.style.opacity = '1';
          el.style.transform = 'none';
          el.style.visibility = 'visible';
        });
      }

      // Hard failsafe: if for any reason hero elements are still at opacity:0
      // after 2.5s (e.g. GSAP chunk failed to load on slow networks), force
      // them visible. This guarantees the hero is NEVER stuck blank.
      setTimeout(() => {
        document.querySelectorAll<HTMLElement>('.hero-badge, .hero-title, .hero-tagline, .hero-cta, .hero-scroll-indicator').forEach((el) => {
          const op = getComputedStyle(el).opacity;
          if (op === '0') {
            el.style.opacity = '1';
            el.style.transform = 'none';
          }
        });
      }, 2500);

      // Hero scroll exit (scrubbed + pinned)
      gsap.timeline({
        scrollTrigger: {
          trigger: '#hero',
          start: 'top top',
          end: '+=35%',
          pin: true,
          scrub: 0.2,
        },
      }).to('.hero-content', { opacity: 0, y: -80, duration: 0.6, ease: 'none' });

      // ── Live scoring: phone score ticks up, balls animate in ──
      const liveTl = gsap.timeline({
        scrollTrigger: {
          trigger: '#live-scoring',
          start: 'top top',
          end: '+=35%',
          pin: true,
          scrub: 0.2,
        },
      });
      // Animate feature cards in
      liveTl.from('.live-feature-card', {
        y: 40,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
      });
      // Animate phone in
      liveTl.from('.live-phone-wrap', { x: -40, opacity: 0, duration: 0.6 }, '-=0.6');
      // Animate score counting up
      const scores = [4, 5, 7, 13, 13, 14, 18, 18];
      const wickets = [0, 0, 0, 0, 1, 1, 1, 1];
      const liveScoreEl = document.querySelector('.live-score');
      const liveRunRateEl = document.querySelector('.live-run-rate');
      for (let i = 0; i < scores.length; i++) {
        liveTl.to({}, {
          duration: 0.3,
          onStart: () => {
            if (liveScoreEl) {
              liveScoreEl.textContent = `${scores[i]}/${wickets[i]}`;
              liveScoreEl.classList.remove('score-pulse');
              // force reflow to restart animation
              void (liveScoreEl as HTMLElement).offsetWidth;
              liveScoreEl.classList.add('score-pulse');
            }
            if (liveRunRateEl) {
              const overs = 0.1 * (i + 1);
              const crr = (scores[i] / overs).toFixed(2);
              liveRunRateEl.textContent = `CRR ${crr} · ${18 + scores[i]} needed`;
            }
          },
        });
      }
      // Animate balls appearance
      for (let i = 0; i < 8; i++) {
        liveTl
          .from(`.live-ball-${i}`, { scale: 0, opacity: 0, duration: 0.2 }, '-=0.1')
          .to(`.live-ball-${i}`, {
            boxShadow: '0 0 16px rgba(0,212,170,0.5)',
            duration: 0.3,
          }, '-=0.05');
      }

      // ── Tournament: lines draw, rows appear ──
      const tourTl = gsap.timeline({
        scrollTrigger: {
          trigger: '#tournament',
          start: 'top top',
          end: '+=35%',
          pin: true,
          scrub: 0.2,
        },
      });
      tourTl
        .from('.tournament-graph', { x: -40, opacity: 0, duration: 0.6 })
        .from('.tournament-table', { x: 40, opacity: 0, duration: 0.6 }, '-=0.8')
        .from('.tournament-node', {
          scale: 0,
          opacity: 0,
          duration: 0.4,
          stagger: 0.1,
        }, '-=0.5')
        .from('.tournament-lines line', {
          opacity: 0,
          duration: 0.4,
          stagger: 0.015,
        }, '-=0.4')
        .from('.tournament-row', {
          x: 30,
          opacity: 0,
          duration: 0.4,
          stagger: 0.1,
        }, '-=0.5');

      // ── Spectator: phones appear, particles flow ──
      const specTl = gsap.timeline({
        scrollTrigger: {
          trigger: '#spectator',
          start: 'top top',
          end: '+=35%',
          pin: true,
          scrub: 0.2,
        },
      });
      specTl
        .from('.spectator-scorer', { x: -40, opacity: 0, duration: 0.6 })
        .from('.spectator-viewer', { x: 40, opacity: 0, duration: 0.6 }, '-=0.8')
        .from('.spectator-flow', { opacity: 0, duration: 0.5 }, '-=0.6');
      // Loop particle pulse
      for (let i = 0; i < 5; i++) {
        specTl.to(`.spectator-particle-${i}`, {
          opacity: 1,
          scale: 1.4,
          duration: 0.4,
          yoyo: true,
          repeat: 1,
        }, i * 0.2);
      }
      // Balls appear in spectator phone
      for (let i = 0; i < 5; i++) {
        specTl.from(`.spectator-ball-${i}`, { scale: 0, opacity: 0, duration: 0.2 }, '-=0.1');
      }

      // ── Charts: worm draws in, milestones pop ──
      const chartTl = gsap.timeline({
        scrollTrigger: {
          trigger: '#charts',
          start: 'top top',
          end: '+=35%',
          pin: true,
          scrub: 0.2,
        },
      });
      chartTl
        .from('.charts-worm-wrap', { y: 40, opacity: 0, duration: 0.6 })
        .from('.charts-worm-line', {
          strokeDasharray: 300,
          strokeDashoffset: 300,
          duration: 0.6,
        }, '-=0.4')
        .from('.charts-worm-dot', { scale: 0, duration: 0.3 })
        .from('.milestone-alert', {
          y: 30,
          opacity: 0,
          scale: 0.8,
          duration: 0.5,
          stagger: 0.15,
        }, '-=0.8');

      // ── Stats: counters tick up ──
      const statTl = gsap.timeline({
        scrollTrigger: {
          trigger: '#stats',
          start: 'top top',
          end: '+=35%',
          pin: true,
          scrub: 0.2,
        },
      });
      statTl
        .from('.stat-counter', {
          y: 40,
          opacity: 0,
          duration: 0.5,
          stagger: 0.1,
        })
        .from('.stats-badge', {
          y: 20,
          opacity: 0,
          duration: 0.4,
          stagger: 0.05,
        }, '-=0.4');
      // Counter tick-up
      document.querySelectorAll<HTMLElement>('.stat-value').forEach((el) => {
        const target = parseInt(el.dataset.target || '0', 10);
        const suffix = el.dataset.suffix || '';
        const obj = { val: 0 };
        statTl.to(obj, {
          val: target,
          duration: 0.6,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Math.round(obj.val).toLocaleString() + suffix;
          },
        }, '-=1.2');
      });

      // ── CTA: fade in ──
      const ctaTl = gsap.timeline({
        scrollTrigger: {
          trigger: '#cta',
          start: 'top top',
          end: '+=35%',
          pin: true,
          scrub: 0.2,
        },
      });
      ctaTl
        .from('.cta-badge', { y: 20, opacity: 0, duration: 0.5 })
        .from('.cta-title', { y: 30, opacity: 0, duration: 0.6 }, '-=0.5')
        .from('.cta-subtitle', { y: 20, opacity: 0, duration: 0.5 }, '-=0.6')
        .from('.cta-button-wrap', { y: 20, opacity: 0, scale: 0.9, duration: 0.5 }, '-=0.5')
        .from('.cta-features > *', { y: 10, opacity: 0, duration: 0.4, stagger: 0.1 }, '-=0.4')
        .from('.cta-footer > *', { y: 10, opacity: 0, duration: 0.5, stagger: 0.1 }, '-=0.3');
    }, containerRef);

    return () => {
      ctx.revert();
      // Thoroughly kill any ScrollTriggers and clear residual inline styles
      // that pinning may have left on body/html (prevents dashboard glitches).
      ScrollTrigger.getAll().forEach((st) => st.kill());
      if (typeof document !== 'undefined') {
        document.body.style.cssText = document.body.style.cssText
          .replace(/overflow[^;]*;?/gi, '')
          .replace(/padding[^;]*;?/gi, '');
        document.documentElement.style.cssText = document.documentElement.style.cssText
          .replace(/overflow[^;]*;?/gi, '')
          .replace(/padding[^;]*;?/gi, '');
        window.scrollTo(0, 0);
      }
    };
  }, [mounted]);

  return (
    <div ref={containerRef} className="relative">
      {/* Persistent animated background behind everything */}
      {mounted && <StadiumBackground />}

      {/* Top progress bar */}
      <ScrollProgress />

      {/* HTML content above canvas */}
      <div className="relative z-10">
        <HeroSection />
        <LiveScoringSection />
        <TournamentSection />
        <SpectatorSection />
        <ChartsSection />
        <StatsSection />
        <CTASection />
      </div>
    </div>
  );
}
