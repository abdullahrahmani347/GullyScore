'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { parseVoiceCommand, type VoiceEvent } from '@/lib/scoring-ux';
import { feedback } from '@/lib/feedback';
import type { ExtraType, WicketType } from '@/types';

/* Minimal Web Speech typings (not in TS DOM lib).
 * NOTE: per the real API, `isFinal` lives on each RESULT item — the
 * alternatives array hangs off it — so the local mirror matches that shape. */
interface SpeechRecognitionAlt { transcript: string; confidence: number }
interface SpeechRecognitionResultItem { isFinal: boolean; length: number; [i: number]: SpeechRecognitionAlt }
interface SpeechRecognitionRes { length: number; [i: number]: SpeechRecognitionResultItem }
interface SpeechRecognitionEvent { resultIndex: number; results: SpeechRecognitionRes }
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecCtor = new () => SpeechRec;

function getRecognitionCtor(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface VoiceScoringProps {
  /** §14.11 — gated by the `voice` feature flag (default OFF). */
  enabled: boolean;
  onRuns: (runs: number) => void;
  onExtra: (extraType: ExtraType, extraRuns: number) => void;
  onWicket: (wicketType: WicketType) => void;
  onUndo: () => void;
}

const CONFIRM_MS = 1500;

/**
 * v2 §14.11 — voice scoring (flag `voice`, default OFF). A ~20-phrase
 * grammar drives the same commit path as the buttons. Recognized events
 * show a 1.5 s confirm toast ("tap to override") before committing.
 */
export function VoiceScoring({ enabled, onRuns, onExtra, onWicket, onUndo }: VoiceScoringProps) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<{ text: string; label: string } | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const supported = typeof window !== 'undefined' && getRecognitionCtor() != null;

  // Refs keep the recognition callbacks fresh; the sync itself runs in an
  // effect (never during render).
  const handlers = useRef({ onRuns, onExtra, onWicket, onUndo });
  useEffect(() => {
    handlers.current = { onRuns, onExtra, onWicket, onUndo };
  });

  const commit = useCallback((ev: VoiceEvent) => {
    const h = handlers.current;
    switch (ev.kind) {
      case 'runs':
        h.onRuns(ev.runs);
        break;
      case 'extra':
        h.onExtra(ev.extraType, ev.extraRuns);
        break;
      case 'wicket':
        h.onWicket(ev.wicketType);
        break;
      case 'undo':
        h.onUndo();
        break;
    }
  }, []);

  const offerEvent = useCallback(
    (ev: VoiceEvent, raw: string) => {
      // 1.5 s confirm toast — tapping "Change" cancels the commit
      setHeard({ text: raw, label: ev.label });
      feedback.light();
      const t = setTimeout(() => {
        setHeard(null);
        commit(ev);
      }, CONFIRM_MS);
      toast(`Heard: ${ev.label}`, {
        description: 'Tap Change to override — committing in 1.5s',
        action: {
          label: 'Change',
          onClick: () => {
            clearTimeout(t);
            setHeard(null);
            toast.info('Cancelled — say it again or tap the buttons');
          },
        },
        duration: CONFIRM_MS,
      });
    },
    [commit]
  );

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      toast.error('Voice input is not supported in this browser');
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-IN'; // gully cricket default — English, Indian accents
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const transcript = e.results[i][0]?.transcript?.trim();
        if (!transcript) continue;
        const ev = parseVoiceCommand(transcript);
        if (ev) offerEvent(ev, transcript);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error('Microphone permission denied');
        setListening(false);
        // Detach BEFORE stopping so the onend restart guard sees a dead ref.
        if (recRef.current === rec) recRef.current = null;
        try { rec.stop(); } catch { /* noop */ }
      }
      // 'no-speech' is normal in continuous mode — keep listening
    };
    rec.onend = () => {
      // Chrome ends the session periodically; restart while "listening".
      // recRef.current === rec is the intent signal — every stop path
      // (button, permission error, unmount) nulls the ref FIRST, so a
      // stopped-on-purpose session never restarts.
      if (recRef.current === rec) {
        try { rec.start(); } catch { setListening(false); }
      }
    };

    recRef.current?.abort();
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      toast.success('Listening — try "four", "wide", "wicket caught", "dot ball"', { duration: 3000 });
    } catch {
      toast.error('Could not start the microphone');
    }
  }, [offerEvent]);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, []);

  // Unmount: abort any live recognition session (its onend restart guard
  // reads a nulled ref, so nothing restarts after teardown)
  useEffect(() => () => {
    recRef.current?.abort();
    recRef.current = null;
  }, []);

  if (!enabled || !supported) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Live "heard" pill */}
      <AnimatePresence>
        {heard && (
          <motion.span
            key={heard.text}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-full bg-accent/15 text-accent border border-accent/30 max-w-[180px]"
          >
            <Volume2 size={11} />
            <span className="truncate">{heard.label}</span>
          </motion.span>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => (listening ? stopListening() : startListening())}
        title={listening ? 'Stop voice scoring' : 'Start voice scoring'}
        aria-pressed={listening}
        className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
          listening
            ? 'bg-wicket/20 border-wicket/50 text-wicket animate-pulse'
            : 'bg-bg-card border-border text-t2 hover:text-t1'
        }`}
      >
        {listening ? <MicOff size={18} /> : <Mic size={18} />}
      </motion.button>
    </div>
  );
}
