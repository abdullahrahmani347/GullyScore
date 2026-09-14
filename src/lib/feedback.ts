/**
 * GULLYSCORE v2 §14.1 — FEEDBACK LAYER
 * ---------------------------------------------------------------------------
 * haptics.ts extended into a full feel layer. Three channels, each gated by
 * its own persisted setting (see settingsStore):
 *
 *   • Haptics  — navigator.vibrate patterns
 *       run 10ms · four 20-40-20 · six 30-50-30-50 · wicket 80-60-80 ·
 *       milestone 20-20-20-80
 *   • Sound    — WebAudio synth blips (zero audio assets: oscillators only)
 *   • Speech   — optional TTS commentary via speechSynthesis
 *
 * Defaults: everything OFF except the basic run-tap haptic. All toggles live
 * in Settings (SettingsSheet on the scoring screen).
 */

import { useSettingsStore } from '@/store/settingsStore';

type FeedbackSettings = {
  hapticRunTap: boolean;
  hapticEvents: boolean;
  soundFx: boolean;
  speechCommentary: boolean;
};

function currentSettings(): FeedbackSettings {
  const s = useSettingsStore.getState();
  return {
    hapticRunTap: s.hapticRunTap,
    hapticEvents: s.hapticEvents,
    soundFx: s.soundFx,
    speechCommentary: s.speechCommentary,
  };
}

// ─── Haptics ──────────────────────────────────────────────────────────────

/** v2 §14.1 patterns (replacing the v1 ad-hoc numbers). */
const VIBRATION: {
  run: number;
  four: number[];
  six: number[];
  wicket: number[];
  milestone: number[];
  light: number;
} = {
  run: 10,
  four: [20, 40, 20],
  six: [30, 50, 30, 50],
  wicket: [80, 60, 80],
  milestone: [20, 20, 20, 80],
  light: 10,
};

function vibrate(pattern: number | number[], rich: boolean): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const s = currentSettings();
  // The basic run tap is the only haptic ON by default; rich patterns
  // (four/six/wicket/milestone) are opt-in via `hapticEvents`.
  if (rich ? !s.hapticEvents : !s.hapticRunTap) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // vibrate() can throw on invalid patterns — never break scoring for a buzz
  }
}

// ─── Sound — WebAudio synth (zero assets) ─────────────────────────────────

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  // Browsers suspend the context until a user gesture; every feedback call
  // here follows a tap, so resume is safe.
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

interface Blip {
  freq: number;
  start: number; // seconds from now
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

function playBlips(blips: Blip[]): void {
  const s = currentSettings();
  if (!s.soundFx) return;
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  for (const b of blips) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = b.type ?? 'sine';
    osc.frequency.value = b.freq;
    const peak = b.gain ?? 0.08;
    const t0 = now + b.start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + b.dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + b.dur + 0.02);
  }
}

// ─── Speech — TTS commentary ──────────────────────────────────────────────

/**
 * Speak one line of commentary. Queued utterances are capped at 2 so a burst
 * of wickets can't stack a wall of speech.
 */
export function speakCommentary(text: string): void {
  const s = currentSettings();
  if (!s.speechCommentary) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    const pending = synth.pending || synth.speaking;
    if (pending) {
      // best-effort cap; `queue` is a non-standard platform extra
      const q = (synth as unknown as { queue?: SpeechSynthesisUtterance[] }).queue;
      if (q && q.length >= 2) return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1;
    synth.speak(u);
  } catch {
    // speechSynthesis is best-effort — never break scoring
  }
}

/** Stop any in-flight speech (e.g. settings toggled off mid-match). */
export function stopSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}

// ─── The Feedback facade ──────────────────────────────────────────────────

export const feedback = {
  /** Basic run tap — the one haptic ON by default. */
  run(): void {
    vibrate(VIBRATION.run, false);
    playBlips([{ freq: 660, start: 0, dur: 0.06 }]);
  },

  four(): void {
    vibrate(VIBRATION.four, true);
    playBlips([
      { freq: 523.25, start: 0, dur: 0.08 },
      { freq: 783.99, start: 0.09, dur: 0.12 },
    ]);
  },

  six(): void {
    vibrate(VIBRATION.six, true);
    playBlips([
      { freq: 523.25, start: 0, dur: 0.07 },
      { freq: 659.25, start: 0.07, dur: 0.07 },
      { freq: 783.99, start: 0.14, dur: 0.07 },
      { freq: 1046.5, start: 0.21, dur: 0.16 },
    ]);
  },

  wicket(): void {
    vibrate(VIBRATION.wicket, true);
    playBlips([
      { freq: 196, start: 0, dur: 0.16, type: 'sawtooth', gain: 0.06 },
      { freq: 147, start: 0.14, dur: 0.22, type: 'sawtooth', gain: 0.07 },
    ]);
  },

  /** 50 / 100 / wicket-haul milestones. */
  milestone(): void {
    vibrate(VIBRATION.milestone, true);
    playBlips([
      { freq: 659.25, start: 0, dur: 0.08 },
      { freq: 880, start: 0.1, dur: 0.08 },
      { freq: 1318.5, start: 0.2, dur: 0.22 },
    ]);
  },

  /** Undo / extras / misc light confirmation. */
  light(): void {
    vibrate(VIBRATION.light, false);
  },

  /** The score number just rolled over a team milestone — speak + feel it. */
  milestoneSpoken(text: string): void {
    feedback.milestone();
    speakCommentary(text);
  },
};

// v1 compatibility re-exports (haptics.ts callers keep working)
export { hapticRun, hapticWicket, hapticSix, hapticFour, hapticLight, hapticAchievement } from './haptics';
