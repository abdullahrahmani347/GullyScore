'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, ClipboardList, Users, Trophy } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';

const tabs = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/matches', label: 'Matches', icon: ClipboardList, match: (p: string) => p.startsWith('/matches') },
  { href: '/teams', label: 'Teams', icon: Users, match: (p: string) => p.startsWith('/teams') },
  { href: '/tournaments', label: 'Leagues', icon: Trophy, match: (p: string) => p.startsWith('/tournaments') },
];

export function SidebarNav() {
  const pathname = usePathname();

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
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active ? 'bg-accent/10 text-accent' : 'text-t3 hover:text-t2 hover:bg-bg-elevated/50'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} className="flex-shrink-0" />
              <span className="hidden lg:block text-sm font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
