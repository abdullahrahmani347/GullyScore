import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeOption = 'dark' | 'light' | 'amoled';

interface SettingsState {
  theme: ThemeOption;
  confirmUndoWicket: boolean;
  setTheme: (theme: ThemeOption) => void;
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
          document.documentElement.classList.remove('dark', 'light', 'amoled');
          document.documentElement.classList.add(theme);
          // Set data-theme attribute for CSS selectors
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
          document.documentElement.classList.remove('dark', 'light', 'amoled');
          document.documentElement.classList.add(state.theme);
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);
