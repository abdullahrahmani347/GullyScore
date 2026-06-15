'use client';

import { useState, useEffect, useRef } from 'react';
import { QrCode, X, Copy, Check, Share2, Radio } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { MatchData } from '@/types';

interface LiveShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: MatchData;
}

export function LiveShareModal({ open, onOpenChange, match }: LiveShareModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const liveCode = match.liveCode;
  const spectatorUrl = typeof window !== 'undefined' && liveCode
    ? `${window.location.origin}/live/${liveCode}`
    : '';

  // Generate QR code
  useEffect(() => {
    if (!open || !spectatorUrl) return;

    let cancelled = false;

    async function generateQR() {
      try {
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(spectatorUrl, {
          width: 280,
          margin: 2,
          color: {
            dark: '#F0F0F5',
            light: '#111120',
          },
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) {
          setQrDataUrl(url);
        }
      } catch (err) {
        console.error('QR generation failed:', err);
      }
    }

    generateQR();
    return () => { cancelled = true; };
  }, [open, spectatorUrl]);

  const handleCopyLink = async () => {
    if (!spectatorUrl) return;
    try {
      await navigator.clipboard.writeText(spectatorUrl);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleShare = async () => {
    if (!spectatorUrl || !navigator.share) return;
    try {
      await navigator.share({
        title: `GullyScore: ${match.team1.name} vs ${match.team2.name}`,
        text: `Watch the live score: ${match.team1.name} vs ${match.team2.name}`,
        url: spectatorUrl,
      });
    } catch {
      // User cancelled share
    }
  };

  if (!liveCode) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-card border-border max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="text-t1 flex items-center gap-2">
            <QrCode size={20} className="text-accent" />
            Live Share
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          {/* QR Code */}
          <div className="rounded-2xl bg-bg-elevated p-4 border border-border mb-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code for live match"
                className="w-[240px] h-[240px]"
              />
            ) : (
              <div className="w-[240px] h-[240px] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Match code */}
          <div className="flex items-center gap-2 mb-3">
            <Radio size={14} className="text-accent" />
            <span className="text-lg font-mono font-bold text-t1 tracking-widest">
              GS-{liveCode}
            </span>
          </div>

          <p className="text-xs text-t3 text-center mb-4">
            Share this code or QR code. Anyone can watch<br />
            the live score at gullyscore.app/live/{liveCode}
          </p>

          {/* Action buttons */}
          <div className="w-full space-y-2">
            {/* Copy link */}
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-bg-app font-semibold text-sm hover:bg-accent/90 transition-colors"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>

            {/* Share (if supported) */}
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-t2 font-medium text-sm hover:bg-bg-elevated transition-colors"
              >
                <Share2 size={16} />
                Share
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
