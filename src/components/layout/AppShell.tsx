'use client';

import { usePathname } from 'next/navigation';

/**
 * Wraps page content. Removes the bottom padding (which exists to clear the
 * BottomNav) on routes where the BottomNav is hidden — currently just the
 * landing page at `/`.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  return (
    <main className={isLanding ? 'min-h-dvh' : 'min-h-dvh pb-20'}>
      {children}
    </main>
  );
}
