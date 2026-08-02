# GullyScore

> Ball-by-ball cricket scoring for gully, tape-ball, school, and local tournament matches — offline-first, mobile-first, installable.

GullyScore is a Progressive Web App (PWA) built for the kind of cricket that doesn't make it to broadcast TV: street matches on weekends, tape-ball tournaments in the neighbourhood, inter-club and corporate fixtures, school sports days. It replaces pen-and-paper scoring with a single-tap ball-by-ball interface that automatically maintains a full digital scorecard, live spectator feed, and tournament bracket — all from a phone, even when the ground-side connection drops out.

---

## Table of Contents

- [What it is](#what-it-is)
- [Why use it](#why-use-it)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [Use cases](#use-cases)
- [How to use](#how-to-use)
- [API overview](#api-overview)
- [Offline & PWA behavior](#offline--pwa-behavior)
- [Limitations & notes](#limitations--notes)
- [License](#license)

---

## What it is

GullyScore is a **mobile-first, offline-capable Progressive Web App** for ball-by-ball cricket scoring. It is designed for informal "gully" (street, backyard, tape-ball, local club) matches where professional broadcast tools are overkill but pencil-and-paper scoring is too error-prone.

The app lets a single scorer tap one button per delivery — wide, no-ball, four, six, wicket, bye — and automatically maintains a live, fully populated scorecard: striker/non-striker rotation, strike rotation at over end, bowler figures, fall-of-wicket graph, partnership tracker, run rate, required run rate, and a ball-by-ball history log.

Beyond individual matches, GullyScore organises players into teams and teams into tournaments, auto-generating round-robin or knockout brackets, points tables, and shared schedules. A unique six-digit **live code** lets friends, family, or spectators open a read-only live view in any browser and watch the match update in real time over Server-Sent Events, without installing anything.

## Why use it

- **Pen-and-paper scoring is error-prone.** Totals get miscounted, strike rotation is forgotten at over end, bowler figures drift. GullyScore automates all of it.
- **Pro scoring tools are overkill.** Broadcast-grade systems cost money, need laptops, and assume a dedicated scorer booth. GullyScore runs on the phone in your pocket.
- **Ground-side connectivity is unreliable.** GullyScore is built offline-first: scoring continues through connection drops, and queued mutations sync automatically when you come back online.
- **Spectators want to follow along.** Instead of texting "score?" every over, share one six-digit code and anyone can follow the match live in their browser — no install required.
- **Tournament organisers need brackets, not spreadsheets.** GullyScore generates round-robin/knockout schedules, points tables, and player stats across multiple grounds automatically.

## Features

### Scoring
- One-tap ball entry: 0–6 runs, wides, no-balls, byes, leg-byes, wickets (with dismissal type)
- Automatic strike rotation at over end
- Automatic striker/non-striker swap on odd runs
- Live bowler figures (overs, maidens, runs, wickets, economy)
- Live batting figures (runs, balls, 4s, 6s, strike rate)
- Partnership tracker with current and fall-of-wicket graph
- Run rate + required run rate + target tracking
- Ball-by-ball history with over-by-over navigation
- Innings break + second innings with chase target
- Match completion with result + winner recording

### Teams & Tournaments
- Team management with players, jersey numbers, colors
- Tournament creation (round-robin, knockout, or hybrid)
- Auto-generated match schedule
- Live points table with NRR
- Top run-getters and wicket-takers leaderboards
- Tournament-wide stats aggregation

### Live spectator view
- 6-digit live code per match (e.g. `A4BX9Q`)
- Read-only public URL `/live/[code]`
- Real-time updates over Server-Sent Events (SSE) — no refresh needed
- QR-code sharing from the scoring screen
- Works on any modern browser, no install required

### Offline & PWA
- Installable to phone home screen (Add to Home Screen / Install App)
- Service worker caches the app shell + static assets
- Offline scoring with IndexedDB mutation queue (Dexie)
- Automatic background sync when connectivity returns
- NetworkFirst strategy for fresh data when online, cached fallback when offline

### UX
- Dark, stadium-inspired theme with subtle animated background
- Mobile-first layout with bottom navigation
- GSAP-powered scroll-driven landing page
- Recharts-powered post-match analytics (run worms, partnership graphs, scoring patterns)
- Sonner toasts for instant feedback
- Error boundaries with recovery screens

## Tech stack

| Layer | Technology |
|------|------------|
| Framework | **Next.js 16** (App Router, Turbopack, standalone output) |
| Language | **TypeScript 5** |
| Runtime | **React 19** |
| Database | **SQLite** via **Prisma ORM 6** |
| Styling | **Tailwind CSS 4** + `tailwindcss-animate`, `tw-animate-css` |
| UI primitives | **shadcn/ui** pattern on top of **Radix UI** |
| Icons | **lucide-react** + custom SVG `GullyIcons` |
| Animation | **GSAP 3** (ScrollTrigger) for landing, **Framer Motion** for UI |
| Charts | **Recharts 2** |
| Forms | **react-hook-form** + **zod** |
| Data fetching | **TanStack React Query 5** + **SWR** |
| State | **Zustand 5** |
- Offline queue: **Dexie 4** (IndexedDB wrapper)
- Live updates: **Server-Sent Events** (native browser API)
- QR codes: `qrcode`
- Notifications: `sonner`
- Package manager: **Bun** (lockfile: `bun.lock`)

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Browser (PWA client)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  React UI    │  │  Zustand     │  │  IndexedDB      │  │
│  │  (Next.js)   │◄─┤  store       │◄─┤  (Dexie queue)  │  │
│  └──────┬───────┘  └──────────────┘  └────────┬────────┘  │
│         │                                       │           │
│         │            ┌──────────────┐           │           │
│         └───────────►│ Service      │◄──────────┘           │
│                      │ Worker (SW)  │                       │
│                      └──────┬───────┘                       │
└─────────────────────────────┼──────────────────────────────┘
                              │ HTTPS
┌─────────────────────────────┼──────────────────────────────┐
│                       Next.js Server                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  API Routes  │  │  SSE Stream  │  │  React Server   │  │
│  │  /api/...    │─►│  /api/.../   │  │  Components     │  │
│  │              │  │   stream     │  │  (SSR/RSC)      │  │
│  └──────┬───────┘  └──────────────┘  └─────────────────┘  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │             Prisma Client → SQLite (file)            │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Data flow**:
1. Scorer taps a ball button → React component dispatches Zustand action
2. Action writes to local IndexedDB queue (instant, offline-safe)
3. Action fires `fetch()` to the matching API route
4. If online: API writes to SQLite via Prisma, returns updated state, UI re-renders
5. If offline: fetch fails silently, queue entry stays in IndexedDB
6. When connectivity returns: SW `online` event triggers `syncAll()` which replays the queue
7. Spectators hit `/api/matches/[id]/stream` SSE endpoint and receive pushed updates

## Project structure

```
GullyScore/
├── prisma/
│   ├── schema.prisma        # Team, Player, Match, Innings, Ball, Tournament models
│   └── seed.ts              # Demo teams + players
├── public/
│   ├── sw.js                # Service worker (caching strategies)
│   ├── manifest.json        # PWA manifest
│   ├── logo.svg
│   └── icons/               # PWA icons (192, 512)
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout (PWA, ThemeProvider, BottomNav, ErrorBoundary)
│   │   ├── page.tsx         # Landing page (GSAP scroll-pinned sections)
│   │   ├── globals.css
│   │   ├── dashboard/       # Authenticated home — recent matches, quick actions
│   │   ├── matches/
│   │   │   ├── page.tsx     # Match list
│   │   │   ├── new/         # Match setup (teams, overs, toss)
│   │   │   └── [id]/        # Match detail + /scorecard sub-route
│   │   ├── teams/
│   │   │   ├── page.tsx
│   │   │   └── [id]/        # Team detail with player roster
│   │   ├── tournaments/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   └── [id]/        # Points table, schedule, stats
│   │   ├── live/[code]/     # Public spectator view (no auth)
│   │   └── api/             # REST + SSE endpoints (see API overview)
│   ├── components/
│   │   ├── brand/           # GullyScore logo + wordmark
│   │   ├── icons/           # Custom SVG GullyIcons
│   │   ├── layout/          # AppShell, BottomNav, ThemeProvider, ErrorBoundary
│   │   ├── landing/         # Hero, LiveScoring, Tournament, Spectator, Charts, Stats, CTA sections
│   │   ├── scoring/         # ScoringScreen — the main ball-entry UI
│   │   ├── scorecard/       # Full scorecard rendering
│   │   ├── matches/         # MatchCreateForm, MatchList, etc.
│   │   ├── teams/           # TeamForm, PlayerForm, TeamList
│   │   ├── tournaments/     # Bracket, PointsTable, Schedule
│   │   ├── dashboard/       # Dashboard widgets
│   │   ├── offline/         # ServiceWorkerRegistration, GlobalOfflineBanner, RecoveryScreen
│   │   └── ui/              # shadcn/ui primitives (Button, Dialog, Tabs, etc.)
│   └── lib/
│       └── offline/
│           ├── sw-register.ts   # SW registration + update lifecycle
│           └── sync-engine.ts   # IndexedDB mutation queue + replay
├── next.config.ts           # standalone output, ignoreBuildErrors, allowedDevOrigins
├── tailwind.config.ts
├── package.json
└── bun.lock
```

## Getting started

### Prerequisites

- **Node.js 18+** (or **Bun 1.1+** — recommended, lockfile is Bun)
- A POSIX system (SQLite writes to local file)

### Install & run

```bash
# 1. Clone the repo
git clone https://github.com/abdullahrahmani347/GullyScore.git
cd GullyScore

# 2. Install dependencies (Bun preferred)
bun install
#   or: npm install

# 3. Create your local env file
echo 'DATABASE_URL=file:/home/z/my-project/db/custom.db' > .env
#   (any path you like — the db file will be created on first push)

# 4. Initialize the database
bunx prisma db push
bunx prisma generate

# 5. (Optional) Seed demo data
bun run seed

# 6. Start the dev server
bun run dev
#   or: npm run dev
```

Open **http://localhost:3000** — you should see the GullyScore landing page.

### Production build

```bash
bun run build         # Next.js build + standalone output assembly
bun run start         # NODE_ENV=production node .next/standalone/server.js
```

The build produces a self-contained `.next/standalone/` directory that can be deployed to any Node-capable host (Vercel, Railway, Fly.io, a VPS, Docker, etc.).

## Available scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start Next.js dev server on port 3000 |
| `bun run build` | Production build (with standalone output + asset copy) |
| `bun run start` | Run the production standalone server |
| `bun run lint` | Run ESLint |
| `bun run db:push` | Push Prisma schema to SQLite (creates/migrates tables) |
| `bun run db:generate` | Regenerate Prisma Client |
| `bun run db:migrate` | Create + apply a migration |
| `bun run db:reset` | Reset database (destructive!) |
| `bun run seed` | Seed demo teams, players, and a sample match |

## Use cases

1. **Neighbourhood tape-ball tournament**
   Multiple teams, single ground, weekend-long. Organiser creates a tournament, adds teams + players, generates a round-robin schedule, and shares the live code per match so friends can follow along. Points table and run-getter leaderboard update automatically.

2. **School or corporate cricket day**
   Multiple matches running in parallel on different grounds. Each ground has one scorer with a phone. All matches feed into a single tournament bracket; the organiser monitors the points table from one screen.

3. **Casual weekend match**
   Two teams, one scorer, no tournament. Scorer creates a quick match, picks teams, and starts scoring. Friends who couldn't make it follow the live code from home. After the match, everyone reviews the scorecard, partnership graphs, and fall-of-wicket chart.

4. **Coaches and captains reviewing performance**
   Post-match, the scorecard provides strike rates, bowling economies, partnership builds, and dismissal patterns. Useful for picking the next opening pair, identifying death-overs weaknesses, or tracking a player's form across matches.

5. **Live local-club streaming without broadcast**
   A small club can't afford a broadcast crew but wants a "live scoreboard" on a TV in the pavilion. Open the spectator URL on a TV browser, leave it on, and the score updates in real time as the scorer taps balls.

6. **Stat tracking across a season**
   Players return match after match under the same team. Cumulative batting and bowling stats accrue automatically across matches, building a season-long record without extra effort.

## How to use

### Quick match (most common flow)

1. **Open GullyScore** on your phone (in a browser, or from the home screen if installed).
2. Tap **"New Match"** from the dashboard.
3. Pick the two teams (create them first if needed — quick form: name, short name, color).
4. Choose the overs format (e.g. 6, 8, 10, 12, 20 overs) and max wickets (default 10).
5. Optionally set venue and tournament.
6. **Set the toss**: who won, bat or field.
7. Set opening strikers (one from each batting team) and the opening bowler.
8. **Start scoring**. After each delivery, tap the matching ball button:
   - **0, 1, 2, 3, 4, 6** — runs scored (strike rotates on odd)
   - **Wide / No Ball / Bye / Leg Bye** — extras (with +1 run + any additional runs)
   - **Wicket** — pick dismissal type (bowled, caught, lbw, run out, stumped, hit wicket) and which batter
9. At over end, strike auto-rotates — pick the next bowler.
10. At innings end, the chase target is set automatically. Repeat for the second innings.
11. At match end, the result + winner are recorded automatically.

### Sharing the live view

1. From the scoring screen, tap the **Share** button.
2. A QR code + 6-digit live code (e.g. `A4BX9Q`) appear.
3. Spectators open `https://your-domain/live/A4BX9Q` in any browser — no install, no login.
4. They see the live score, batter/bowler figures, recent balls, and run rate, updating in real time.

### Running a tournament

1. Tap **Tournaments → New**.
2. Name the tournament, pick format (round-robin / knockout), add participating teams.
3. GullyScore auto-generates the match schedule.
4. Each match is scored normally — results flow into the points table automatically.
5. View **Points Table**, **Schedule**, and **Stats** (top run-getters, wicket-takers) from the tournament detail page.

## API overview

All endpoints are under `/api/` and return JSON unless noted.

### Matches
| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/matches` | List matches (filter by status, team, tournament) |
| `POST` | `/api/matches` | Create a new match |
| `GET` | `/api/matches/[id]` | Get match details |
| `POST` | `/api/matches/[id]/complete` | Mark match completed + record result |
| `GET` | `/api/matches/[id]/scorecard` | Full scorecard (both innings) |
| `GET` | `/api/matches/[id]/stream` | **SSE stream** — real-time match updates |

### Innings & balls
| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/matches/[id]/innings` | Start an innings |
| `GET` | `/api/matches/[id]/innings/[iid]/balls/last` | Get last ball |
| `POST` | `/api/matches/[id]/innings/[iid]/balls` | Record a ball |
| `POST` | `/api/matches/[id]/innings/[iid]/striker` | Swap/set striker |
| `POST` | `/api/matches/[id]/innings/[iid]/bowler` | Set bowler |
| `POST` | `/api/matches/[id]/innings/[iid]/complete` | Complete innings |

### Teams & players
| Method | Route | Purpose |
|--------|-------|---------|
| `GET` / `POST` | `/api/teams` | List / create teams |
| `GET` / `PATCH` | `/api/teams/[id]` | Get / update team |
| `GET` / `POST` | `/api/teams/[id]/players` | List / add players |
| `PATCH` / `DELETE` | `/api/teams/[id]/players/[pid]` | Update / remove player |

### Tournaments
| Method | Route | Purpose |
|--------|-------|---------|
| `GET` / `POST` | `/api/tournaments` | List / create tournaments |
| `GET` | `/api/tournaments/[id]` | Tournament details |
| `GET` | `/api/tournaments/[id]/schedule` | Auto-generated schedule |
| `GET` | `/api/tournaments/[id]/points-table` | Live points table with NRR |

### Live spectator
| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/live/[code]` | Resolve 6-digit code → match ID (for spectator view) |

### Stats
| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/stats` | Aggregated batting/bowling stats across matches |
| `GET` | `/api/buildinfo` | Build version (used by SW for cache busting) |

## Offline & PWA behavior

GullyScore is a **Progressive Web App** — it installs to a phone's home screen and works through connectivity drops.

### Service worker (`public/sw.js`)

| Request type | Strategy |
|--------------|----------|
| Static assets (JS, CSS, fonts, images, SVG) | **CacheFirst** |
| API GET requests | **NetworkFirst** with cache fallback |
| API mutations (POST/PUT/PATCH/DELETE) | **NetworkOnly** — handled by app-layer offline queue, not SW |
| SSE streams (`/api/matches/[id]/stream`, `/api/live/*`) | **NetworkOnly** — never cached |
| Navigation (HTML pages) | **NetworkFirst** — fresh HTML when online, cached app shell when offline |

The SW calls `self.skipWaiting()` on install and `clients.claim()` on activate, so new deploys are picked up silently on the next navigation — **no "update available" popup** interrupts scoring.

### Offline mutation queue (`src/lib/offline/sync-engine.ts`)

When the scorer taps a ball button while offline:
1. The mutation is written to **IndexedDB** (via Dexie) before any network call.
2. The UI updates optimistically from the local write.
3. The `fetch()` to the API silently fails.
4. When the `online` event fires, `syncAll()` replays the queue in order.
5. Conflicts are resolved last-write-wins (each ball carries a monotonic ball number).

### Installing as a PWA

- **Android Chrome / Samsung Internet**: tap the menu → "Install app" / "Add to Home screen".
- **iOS Safari**: tap Share → "Add to Home Screen".
- **Desktop Chrome / Edge**: click the install icon in the address bar.

Once installed, GullyScore runs in its own window with the dark stadium theme, no browser chrome.

## Limitations & notes

- **Single scorer per match.** Concurrent scoring from two devices on the same match is not supported — the last write wins, which can cause drift. Use one phone per match.
- **SQLite backend.** Fine for a single-instance deployment (one ground, one tournament at a time). For multi-region or high-concurrency, swap Prisma's datasource to Postgres.
- **No authentication.** Anyone with the URL can create/edit matches. Suitable for trusted local use; add NextAuth (already a dependency) for multi-tenant deployments.
- **No video or scorecasting.** GullyScore is text/numbers only — no video streaming, no commentary feed.
- **Build skips TypeScript errors.** `next.config.ts` sets `ignoreBuildErrors: true` because several restored files have non-runtime type errors. The IDE still does real-time type checking during development; fix types as you touch files.
- **Live SSE has no auth.** Anyone with the 6-digit code can subscribe. Treat the code as a "soft secret" — it's shareable but not guessable.

## License

This project is currently unlicensed (private). If you intend to fork, distribute, or deploy publicly, add a `LICENSE` file (MIT recommended).

---

**Built with Next.js 16, Prisma, Tailwind CSS 4, and a love for gully cricket.**
