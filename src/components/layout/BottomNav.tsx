'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, ClipboardList, Users, Trophy } from 'lucide-react';

const tabs = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/matches', label: 'Matches', icon: ClipboardList, match: (p: string) => p.startsWith('/matches') },
  { href: '/teams', label: 'Teams', icon: Users, match: (p: string) => p.startsWith('/teams') },
  { href: '/tournaments', label: 'Leagues', icon: Trophy, match: (p: string) => p.startsWith('/tournaments') },
];

export function BottomNav() {
  const pathname = usePathname();

  // Hide on scoring screen (full-screen experience) and spectator pages
  if (pathname.match(/\/matches\/[^/]+$/)) return null;
  if (pathname.startsWith('/live/')) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg-app/90 backdrop-blur-xl">
      <div
        className="flex items-center justify-around h-16"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                active ? 'text-accent' : 'text-t3'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
