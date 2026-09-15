'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Radio, ClipboardList, Users, Shield, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLiveCount } from '@/hooks/useLiveCount';

interface NavTab {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
  liveDot?: boolean;
}

const tabs: NavTab[] = [
  { href: '/dashboard', label: 'Home', icon: Home, match: (p) => p === '/dashboard' },
  { href: '/live', label: 'Live', icon: Radio, match: (p) => p === '/live', liveDot: true },
  { href: '/matches', label: 'Matches', icon: ClipboardList, match: (p) => p.startsWith('/matches') },
  { href: '/players', label: 'Players', icon: Users, match: (p) => p.startsWith('/players') },
  { href: '/teams', label: 'Teams', icon: Shield, match: (p) => p.startsWith('/teams') },
  { href: '/tournaments', label: 'Leagues', icon: Trophy, match: (p) => p.startsWith('/tournaments') },
];

export function BottomNav() {
  const pathname = usePathname();
  const liveCount = useLiveCount();

  // Hide on landing page (full-screen 3D experience), scoring screens, and spectator pages
  if (pathname === '/') return null;
  if (pathname.match(/\/matches\/[^/]+$/)) return null;
  if (pathname.startsWith('/live/')) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg-app/90 backdrop-blur-xl">
      <div
        className="flex items-stretch justify-around h-16"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(({ href, label, icon: Icon, match, liveDot }) => {
          const active = match(pathname);
          const showDot = liveDot && liveCount > 0;
          return (
            <Link
              key={href}
              href={href}
              aria-label={showDot ? `${label} — ${liveCount} live` : label}
              className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 px-1 py-2 transition-colors ${
                active ? 'text-accent' : 'text-t3'
              }`}
            >
              <span className="relative">
                <Icon size={21} strokeWidth={active ? 2.5 : 1.8} />
                {showDot && (
                  <span className="absolute -top-0.5 -right-1.5 flex h-2 w-2 pointer-events-none">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wicket opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-wicket" />
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
