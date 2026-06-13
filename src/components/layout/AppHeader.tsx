'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
  action?: React.ReactNode;
}

export function AppHeader({ title, showBack = false, action }: AppHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b border-border bg-bg-app/90 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 -ml-2 text-t2 hover:text-t1"
            onClick={() => router.back()}
          >
            <ArrowLeft size={20} />
          </Button>
        )}
        <h1 className="text-lg font-semibold text-t1">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}
