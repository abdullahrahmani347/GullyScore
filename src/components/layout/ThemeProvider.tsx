'use client';

import { useEffect } from 'react';
import { useSettingsStore, type ThemeOption } from '@/store/settingsStore';

/**
 * Applies the data-theme attribute to <html> based on the user's
 * theme preference stored in the settings store.
 *
 * Also updates the meta theme-color for browser chrome.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    // Update meta theme-color for browser chrome
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const colors: Record<ThemeOption, string> = {
        dark: '#070710',
        amoled: '#000000',
        light: '#F5F5FA',
      };
      metaThemeColor.setAttribute('content', colors[theme]);
    }
  }, [theme]);

  return <>{children}</>;
}
