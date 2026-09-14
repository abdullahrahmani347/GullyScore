'use client';

/**
 * GULLYSCORE v2 §15.2 — PUSH BELL (spectator opt-in)
 * ---------------------------------------------------------------------------
 * Bell icon on the live page. Tap → popover with three options:
 * "This match", "All live matches", "Off". Subscribes via the VAPID key
 * from /api/push/public-key; the Subscription row lives server-side
 * (§18 model: matchId null = follow all).
 * Degrades silently when push is unsupported / unconfigured / denied.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, Check } from 'lucide-react';
import { useFeatures } from '@/hooks/useFeatures';

type Mode = 'off' | 'match' | 'all';

const MODE_KEY = 'gullyscore-push-mode';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export default function PushBell({ matchId }: { matchId: string }) {
  const { isEnabled } = useFeatures();
  const [mode, setMode] = useState<Mode>('off');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Restore UI state + capability check
  useEffect(() => {
    const saved = window.localStorage.getItem(MODE_KEY) as Mode | null;
    if (saved === 'match' || saved === 'all') setMode(saved);
    const ok =
      typeof window.Notification !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg?.pushManager) return;
        return reg.pushManager.getSubscription().then((sub) => {
          if (!sub && (saved === 'match' || saved === 'all')) {
            // subscription vanished (browser cleared it) — reset UI state
            setMode('off');
            window.localStorage.removeItem(MODE_KEY);
          }
        });
      })
      .catch(() => {});
  }, []);

  // Close popover on outside tap
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const subscribe = async (target: 'match' | 'all'): Promise<boolean> => {
    const keyRes = await fetch('/api/push/public-key');
    if (!keyRes.ok) {
      setError('Notifications unavailable');
      return false;
    }
    const { publicKey } = await keyRes.json();
    if (!publicKey) {
      setError('Notifications unavailable');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setError('Permission denied');
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    });

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        matchId: target === 'match' ? matchId : null,
      }),
    });
    if (!res.ok) {
      setError('Could not enable notifications');
      return false;
    }
    return true;
  };

  const unsubscribe = async (): Promise<void> => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe().catch(() => {});
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
    }
  };

  const choose = async (next: Mode) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (next === 'off') {
        await unsubscribe();
        setMode('off');
        window.localStorage.removeItem(MODE_KEY);
      } else {
        const okSub = await subscribe(next);
        if (okSub) {
          setMode(next);
          window.localStorage.setItem(MODE_KEY, next);
        }
      }
      setOpen(false);
    } catch (err) {
      console.error('push bell error:', err);
      setError('Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (!isEnabled('push')) return null;
  if (supported === false) return null;

  const active = mode !== 'off';

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={active ? 'Notifications on' : 'Get notified'}
        aria-expanded={open}
        className={`flex items-center justify-center w-9 h-9 rounded-full bg-bg-elevated border transition-colors ${
          active
            ? 'border-accent/40 text-accent'
            : 'border-border text-t3 hover:text-t2 hover:border-border-act'
        }`}
      >
        {active ? <BellRing size={15} /> : <Bell size={15} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-11 z-50 w-56 rounded-xl bg-bg-elevated border border-border shadow-xl overflow-hidden"
          >
            <div className="px-3 pt-2.5 pb-1.5 text-[10px] text-t3 uppercase tracking-wider font-medium">
              Notify me about
            </div>
            {(
              [
                { key: 'match', label: 'This match', hint: 'Wickets · 50/100 · result' },
                { key: 'all', label: 'All live matches', hint: 'Everything, everywhere' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => void choose(opt.key)}
                disabled={busy}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-card text-left disabled:opacity-50"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-t1">{opt.label}</span>
                  <span className="block text-[10px] text-t3">{opt.hint}</span>
                </span>
                {mode === opt.key && <Check size={13} className="text-accent shrink-0" />}
              </button>
            ))}
            {mode !== 'off' && (
              <button
                onClick={() => void choose('off')}
                disabled={busy}
                className="w-full flex items-center px-3 py-2 hover:bg-bg-card text-left border-t border-border text-xs text-t3 disabled:opacity-50"
              >
                Turn off notifications
              </button>
            )}
            {error && (
              <div className="px-3 py-2 text-[10px] text-wicket border-t border-border">{error}</div>
            )}
            <div className="px-3 py-2 text-[9px] text-t3 border-t border-border">
              Wicket · 50/100 · result pushes. ≤ 512 bytes each.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
