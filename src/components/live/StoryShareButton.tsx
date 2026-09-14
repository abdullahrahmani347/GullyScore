'use client';

/**
 * GULLYSCORE v2 §15.3 — STORY CARD (9:16) EXPORT
 * ---------------------------------------------------------------------------
 * "Share story" renders a 9:16 card (360×640 CSS, exported at 3× →
 * 1080×1920) via html2canvas → PNG download. All colors are inline hex /
 * rgba (html2canvas-safe — no oklch, no var() in gradients), QR generated
 * client-side with the `qrcode` browser build.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import { ImageDown, Loader2 } from 'lucide-react';
import type { MatchData } from '@/types';

export default function StoryShareButton({ match }: { match: MatchData }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const normalizedCode = (match.liveCode ?? '').replace(/^GS-/i, '').toUpperCase();

  useEffect(() => {
    if (!match.liveCode || qrDataUrl) return;
    QRCode.toDataURL(`${window.location.origin}/live/${normalizedCode}`, {
      margin: 0,
      width: 240,
      color: { dark: '#070710', light: '#F0F0F5' },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [match.liveCode, normalizedCode, qrDataUrl]);

  const exportPng = useCallback(async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    setRevealed(true); // must be attached + visible for html2canvas
    try {
      // Two frames so React paints the revealed card
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: '#070710',
        logging: false,
        useCORS: true,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `gullyscore-story-GS-${normalizedCode || match.id.slice(-6)}.png`;
      a.click();
    } catch (err) {
      console.error('Story export failed:', err);
    } finally {
      setRevealed(false);
      setExporting(false);
    }
  }, [exporting, match.id, normalizedCode]);

  const t1 = match.team1;
  const t2 = match.team2;
  const inn1 = match.innings?.find((i) => i.inningsNumber === 1);
  const inn2 = match.innings?.find((i) => i.inningsNumber === 2);
  const isLive = match.status === 'LIVE' || match.status === 'INNINGS_BREAK';

  return (
    <>
      <button
        onClick={() => void exportPng()}
        disabled={exporting}
        aria-label="Download 9:16 story card"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-bg-elevated border border-border hover:border-border-act text-t2 text-xs font-medium transition-colors disabled:opacity-50"
      >
        {exporting ? <Loader2 size={12} className="animate-spin" /> : <ImageDown size={12} />}
        Story
      </button>

      {/* The 9:16 card — offscreen until exporting (html2canvas needs it attached) */}
      <div
        style={{
          position: 'fixed',
          left: revealed ? '50%' : '-9999px',
          top: revealed ? '50%' : '0',
          transform: revealed ? 'translate(-50%, -50%)' : 'none',
          zIndex: revealed ? 100 : -1,
          width: 360,
          height: 640,
          borderRadius: 18,
          overflow: 'hidden',
          background: isLive
            ? `linear-gradient(180deg, ${hexAlpha(t1.color, 0.35)} 0%, #0B0B18 45%, #070710 100%)`
            : '#0B0B18',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          color: '#F0F0F5',
          pointerEvents: 'none',
        }}
        aria-hidden={!revealed}
      >
        {/* Header */}
        <div style={{ padding: '20px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>GullyScore</span>
          {isLive && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                color: '#00D4AA',
                background: 'rgba(0,212,170,0.12)',
                padding: '4px 10px',
                borderRadius: 999,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#00D4AA', display: 'inline-block' }} />
              LIVE
            </span>
          )}
          {match.status === 'COMPLETED' && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>FT</span>
          )}
        </div>

        {/* Teams + scores */}
        <div style={{ padding: '34px 22px 0' }}>
          <TeamRow color={t1.color} name={t1.name} score={inn1 ? `${inn1.runs}/${inn1.wickets}` : '—'} meta={inn1 ? `(${inn1.completedOvers}.${inn1.currentBalls} ov)` : ''} />
          <div style={{ height: 26 }} />
          <TeamRow color={t2.color} name={t2.name} score={inn2 ? `${inn2.runs}/${inn2.wickets}` : '—'} meta={inn2 ? `(${inn2.completedOvers}.${inn2.currentBalls} ov)` : ''} />
        </div>

        {match.result && (
          <div style={{ padding: '18px 22px 0', fontSize: 14, fontWeight: 700, color: '#FFD700' }}>
            {match.result}
          </div>
        )}

        {/* QR + code */}
        <div style={{ position: 'absolute', bottom: 20, left: 22, display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          {qrDataUrl && (
            <img src={qrDataUrl} alt="" width={96} height={96} style={{ borderRadius: 10, background: '#F0F0F5', padding: 4 }} />
          )}
          <div style={{ paddingBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F0F0F5' }}>Scan to follow live</div>
            {normalizedCode && (
              <div style={{ fontSize: 15, fontWeight: 700, color: '#00D4AA', letterSpacing: 2, marginTop: 4 }}>
                GS-{normalizedCode}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function TeamRow({ color, name, score, meta }: { color: string; name: string; score: string; meta: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: hexAlpha(color, 1), display: 'inline-block' }} />
        <span style={{ fontSize: 17, fontWeight: 700, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 44, fontWeight: 700, color: hexAlpha(color, 1), lineHeight: 1.05 }}>{score}</span>
        <span style={{ fontSize: 14, color: '#8888A0' }}>{meta}</span>
      </div>
    </div>
  );
}

/** hex → rgba() with alpha (html2canvas-safe). */
function hexAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return `rgba(0,212,170,${alpha})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
