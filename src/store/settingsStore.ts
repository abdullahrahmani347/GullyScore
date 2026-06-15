import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  theme: 'dark' | 'light';
  confirmUndoWicket: boolean;
  setTheme: (theme: 'dark' | 'light') => void;
  setConfirmUndoWicket: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      confirmUndoWicket: true,
      setTheme: (theme) => {
        set({ theme });
        // Apply theme to document element for CSS custom properties
        if (typeof document !== 'undefined') {
          document.documentElement.classList.remove('dark', 'light');
          document.documentElement.classList.add(theme);
          // Also set data-theme attribute for CSS selectors
          document.documentElement.setAttribute('data-theme', theme);
        }
      },
      setConfirmUndoWicket: (v) => set({ confirmUndoWicket: v }),
    }),
    {
      name: 'gullyscore-settings',
      onRehydrateStorage: () => (state) => {
        // Apply theme on rehydration
        if (state?.theme && typeof document !== 'undefined') {
          document.documentElement.classList.remove('dark', 'light');
          document.documentElement.classList.add(state.theme);
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);
