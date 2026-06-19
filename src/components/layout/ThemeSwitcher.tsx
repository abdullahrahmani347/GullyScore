'use client';

import { useSettingsStore, type ThemeMode } from '@/store/settingsStore';
import { Sun, Moon, Battery } from 'lucide-react';

const themes: { value: ThemeMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'dark', label: 'Dark', icon: <Moon size={14} />, desc: 'Default' },
  { value: 'amoled', label: 'AMOLED', icon: <Battery size={14} />, desc: 'Battery saver' },
  { value: 'light', label: 'Light', icon: <Sun size={14} />, desc: 'Daylight' },
];

/**
 * Compact theme switcher — 3 buttons for Dark / AMOLED / Light.
 * Responsive: icon-only on very small screens, full labels on medium+.
 */
export function ThemeSwitcher() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 rounded-lg bg-bg-card border border-border p-0.5">
      {themes.map((t) => (
        <button
          key={t.value}
          onClick={() => setTheme(t.value)}
          className={`
            flex items-center justify-center gap-1 rounded-md text-[11px] font-medium transition-all
            px-1.5 py-1.5 sm:px-2 sm:py-1.5 md:px-2.5
            ${theme === t.value
              ? 'bg-accent/15 text-accent border border-accent/25'
              : 'text-t3 hover:text-t2 border border-transparent'
            }
          `}
          title={t.label}
        >
          {t.icon}
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
