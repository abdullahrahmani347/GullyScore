import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeOption = 'dark' | 'light' | 'amoled';

/** v2 §14.2 — Landscape Pro Mode orientation override. */
export type ProModeOption = 'auto' | 'on' | 'off';

interface SettingsState {
  theme: ThemeOption;
  confirmUndoWicket: boolean;
  // ── v2 §14.1 Feedback layer (all individually toggleable) ──
  /** Basic run-tap haptic — the only feedback ON by default. */
  hapticRunTap: boolean;
  /** Rich haptic patterns (four/six/wicket/milestone). */
  hapticEvents: boolean;
  /** WebAudio synth blips. */
  soundFx: boolean;
  /** TTS commentary via speechSynthesis. */
  speechCommentary: boolean;
  // ── v2 §14.2 Landscape Pro Mode ──
  proMode: ProModeOption;
  setTheme: (theme: ThemeOption) => void;
  setConfirmUndoWicket: (v: boolean) => void;
  setHapticRunTap: (v: boolean) => void;
  setHapticEvents: (v: boolean) => void;
  setSoundFx: (v: boolean) => void;
  setSpeechCommentary: (v: boolean) => void;
  setProMode: (v: ProModeOption) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      // v2 §14.10 — "No confirmation dialog for single undo (speed first)".
      // The v1 default was true; persisted users keep their stored value.
      confirmUndoWicket: false,
      hapticRunTap: true,
      hapticEvents: false,
      soundFx: false,
      speechCommentary: false,
      proMode: 'auto',
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
      setHapticRunTap: (v) => set({ hapticRunTap: v }),
      setHapticEvents: (v) => set({ hapticEvents: v }),
      setSoundFx: (v) => set({ soundFx: v }),
      setSpeechCommentary: (v) => set({ speechCommentary: v }),
      setProMode: (v) => set({ proMode: v }),
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
