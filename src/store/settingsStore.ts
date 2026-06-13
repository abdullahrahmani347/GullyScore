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
      setTheme: (theme) => set({ theme }),
      setConfirmUndoWicket: (v) => set({ confirmUndoWicket: v }),
    }),
    { name: 'gullyscore-settings' }
  )
);
