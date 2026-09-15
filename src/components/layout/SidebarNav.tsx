'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Radio, ClipboardList, Users, Shield, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { useLiveCount } from '@/hooks/useLiveCount';

interface NavTab {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
  liveDot?: boolean;
}

const tabs: NavTab[] = [
  { href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  { href: '/live', label: 'Live', icon: Radio, match: (p) => p === '/live', liveDot: true },
  { href: '/matches', label: 'Matches', icon: ClipboardList, match: (p) => p.startsWith('/matches') },
  { href: '/players', label: 'Players', icon: Users, match: (p) => p.startsWith('/players') },
  { href: '/teams', label: 'Teams', icon: Shield, match: (p) => p.startsWith('/teams') },
  { href: '/tournaments', label: 'Leagues', icon: Trophy, match: (p) => p.startsWith('/tournaments') },
];

export function SidebarNav() {
  const pathname = usePathname();
  const liveCount = useLiveCount();

  // Hide on scoring screen and spectator pages
  if (pathname.match(/\/matches\/[^/]+$/)) return null;
  if (pathname.startsWith('/live/')) return null;

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 flex-col border-r border-border bg-bg-app/90 backdrop-blur-xl w-16 lg:w-52">
      {/* Logo */}
      <div className="flex items-center gap-2.5 h-14 px-3 border-b border-border">
        <LogoMark size={24} className="flex-shrink-0" />
        <span className="hidden lg:block text-lg font-bold text-t1 leading-none">
          Gully<span className="text-accent">Score</span>
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1 p-2 mt-2">
        {tabs.map(({ href, label, icon: Icon, match, liveDot }) => {
          const active = match(pathname);
          const showDot = liveDot && liveCount > 0;
          return (
            <Link
              key={href}
              href={href}
              aria-label={showDot ? `${label} — ${liveCount} live` : label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active ? 'bg-accent/10 text-accent' : 'text-t3 hover:text-t2 hover:bg-bg-elevated/50'
              }`}
            >
              <span className="relative flex-shrink-0">
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                {showDot && (
                  <span className="absolute -top-0.5 -right-1 flex h-2 w-2 pointer-events-none">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wicket opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-wicket" />
                  </span>
                )}
              </span>
              <span className="hidden lg:block text-sm font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
