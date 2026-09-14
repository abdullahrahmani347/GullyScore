'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deviceFetch } from '@/lib/device';
import { toast } from 'sonner';
import type { BallRecord, ExtraType, MatchData, InningsState, WicketType } from '@/types';

interface BallEditorSheetProps {
  open: boolean;
  ball: BallRecord | null;
  match: MatchData;
  currentInnings: InningsState;
  onOpenChange: (open: boolean) => void;
  mutate: () => Promise<unknown>;
}

const extraOptions: { type: ExtraType | null; label: string }[] = [
  { type: null, label: '—' },
  { type: 'WIDE', label: 'Wd' },
  { type: 'NO_BALL', label: 'Nb' },
  { type: 'BYE', label: 'B' },
  { type: 'LEG_BYE', label: 'Lb' },
  { type: 'PENALTY', label: 'Pen' },
];

const wicketOptions: { type: WicketType; label: string }[] = [
  { type: 'BOWLED', label: 'Bowled' },
  { type: 'CAUGHT', label: 'Caught' },
  { type: 'RUN_OUT', label: 'Run Out' },
  { type: 'LBW', label: 'LBW' },
  { type: 'STUMPED', label: 'Stumped' },
  { type: 'HIT_WICKET', label: 'Hit Wkt' },
  { type: 'RETIRED_HURT', label: 'Retired' },
  { type: 'OBSTRUCTING_FIELD', label: 'Obstruct' },
];

/**
 * v2 §12.7 — BALL EDITOR. Long-press any OverStrip chip to open. Saving
 * re-validates the ENTIRE sequence server-side with fold() (an edit that
 * invalidates a downstream event is rejected), bumps Ball.version and
 * writes a MatchEditLog row.
 */
export function BallEditorSheet({ open, ball, match, currentInnings, onOpenChange, mutate }: BallEditorSheetProps) {
  const [runs, setRuns] = useState(0);
  const [extraRuns, setExtraRuns] = useState(0);
  const [extraType, setExtraType] = useState<ExtraType | null>(null);
  const [isWicket, setIsWicket] = useState(false);
  const [wicketType, setWicketType] = useState<WicketType | null>(null);
  const [dismissedPlayerId, setDismissedPlayerId] = useState<string | null>(null);
  const [fielderPlayerId, setFielderPlayerId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadedBallId, setLoadedBallId] = useState<string | null>(null);

  // Load ball state when a new ball is opened
  if (ball && ball.id !== loadedBallId) {
    setLoadedBallId(ball.id);
    setRuns(ball.runs);
    setExtraRuns(ball.extraRuns);
    setExtraType(ball.extraType ?? null);
    setIsWicket(ball.isWicket);
    setWicketType(ball.wicketType ?? null);
    setDismissedPlayerId(ball.dismissedPlayerId ?? null);
    setFielderPlayerId(ball.fielderPlayerId ?? null);
    setReason('');
  }
  if (!ball && loadedBallId) {
    setLoadedBallId(null);
  }

  const fieldingTeamId = match.team1Id === currentInnings.teamId ? match.team2Id : match.team1Id;
  const fieldingTeam = fieldingTeamId === match.team1Id ? match.team1 : match.team2;

  const dismissedOptions = useMemo(() => {
    const striker = currentInnings.batting.find((b) => b.playerId === ball?.batsmanId);
    return [
      { id: ball?.batsmanId ?? '', name: striker?.player.name ?? 'Striker' },
      ...(ball?.nonStrikerIdBefore
        ? [
            {
              id: ball.nonStrikerIdBefore,
              name: currentInnings.batting.find((b) => b.playerId === ball?.nonStrikerIdBefore)?.player.name ?? 'Non-striker',
            },
          ]
        : []),
    ];
  }, [ball, currentInnings.batting]);

  const close = (isOpen: boolean) => {
    if (!isOpen) setLoadedBallId(null);
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    if (!ball) return;
    setBusy(true);
    try {
      const res = await deviceFetch(
        `/api/matches/${match.id}/innings/${currentInnings.id}/balls/${ball.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            runs: extraType === 'WIDE' || extraType === 'PENALTY' ? 0 : runs,
            extraRuns,
            extraType,
            isWicket,
            wicketType: isWicket ? wicketType : null,
            dismissedPlayerId: isWicket ? dismissedPlayerId : null,
            fielderPlayerId: isWicket ? fielderPlayerId : null,
            reason: reason.trim() || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Edit rejected');
        return;
      }
      await mutate();
      toast.success('Ball updated — scorecard rebuilt');
      close(false);
    } catch {
      toast.error('Could not save the edit');
    } finally {
      setBusy(false);
    }
  };

  if (!ball) return null;

  const freeHitBall = ball.isFreeHit === true;

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="bg-bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-t1 flex items-center gap-2">
            Edit ball {ball.deliveryNumber}
            {freeHitBall && (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                FH
              </span>
            )}
            {ball.version != null && ball.version > 1 && (
              <span className="text-[9px] text-t3 font-mono">v{ball.version}</span>
            )}
          </SheetTitle>
          <SheetDescription className="text-t3 text-xs">
            Over {ball.overNumber + 1} · saving re-validates the whole innings — edits that break a later ball are rejected.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          {/* Runs off the bat */}
          <div>
            <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">Runs off the bat</p>
            <div className="grid grid-cols-7 gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                <button
                  key={r}
                  onClick={() => setRuns(r)}
                  disabled={extraType === 'WIDE' || extraType === 'PENALTY'}
                  className={`h-10 rounded-lg font-mono font-bold transition-colors disabled:opacity-40 ${
                    runs === r ? 'bg-accent/25 text-accent border border-accent/40' : 'bg-bg-elevated text-t1'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Extras */}
          <div>
            <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">Extra</p>
            <div className="grid grid-cols-6 gap-1.5">
              {extraOptions.map((e) => (
                <button
                  key={e.label}
                  onClick={() => {
                    setExtraType(e.type);
                    if (e.type === null) setExtraRuns(0);
                    if (e.type === 'WIDE' || e.type === 'NO_BALL') setExtraRuns(1);
                    if (e.type === 'PENALTY') setExtraRuns(5);
                    if (e.type === 'BYE' || e.type === 'LEG_BYE') setExtraRuns(1);
                  }}
                  className={`h-10 rounded-lg font-mono text-sm font-bold transition-colors ${
                    extraType === e.type ? 'bg-accent/25 text-accent border border-accent/40' : 'bg-bg-elevated text-t2'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Extra runs */}
          {extraType != null && extraType !== 'PENALTY' && (
            <div>
              <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">
                {extraType === 'WIDE' ? 'Additional runs (+1 penalty included)' : extraType === 'NO_BALL' ? 'Penalty (always 1)' : 'Runs taken'}
              </p>
              <div className="grid grid-cols-6 gap-1.5">
                {[0, 1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setExtraRuns(r)}
                    disabled={extraType === 'NO_BALL' && r !== 1}
                    className={`h-10 rounded-lg font-mono font-bold transition-colors disabled:opacity-40 ${
                      extraRuns === r ? 'bg-accent/25 text-accent border border-accent/40' : 'bg-bg-elevated text-t1'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Wicket */}
          <div>
            <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">Wicket</p>
            <div className="grid grid-cols-4 gap-1.5">
              {wicketOptions.map((w) => (
                <button
                  key={w.type}
                  onClick={() => {
                    setIsWicket(wicketType !== w.type);
                    setWicketType(wicketType === w.type ? null : w.type);
                    if (wicketType !== w.type) setDismissedPlayerId(ball.batsmanId);
                  }}
                  className={`h-9 rounded-lg text-xs font-medium transition-colors ${
                    isWicket && wicketType === w.type ? 'bg-wicket/25 text-wicket border border-wicket/40' : 'bg-bg-elevated text-t2'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dismissed player (RUN_OUT) */}
          {isWicket && (wicketType === 'RUN_OUT' || wicketType === 'RETIRED_HURT') && (
            <div>
              <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">Who left the field</p>
              <div className="grid grid-cols-2 gap-2">
                {dismissedOptions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setDismissedPlayerId(p.id)}
                    className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                      dismissedPlayerId === p.id ? 'bg-wicket/25 text-wicket border border-wicket/40' : 'bg-bg-elevated text-t2'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fielder */}
          {isWicket && (wicketType === 'CAUGHT' || wicketType === 'RUN_OUT' || wicketType === 'STUMPED') && (
            <div>
              <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">
                {wicketType === 'STUMPED' ? 'Wicket keeper' : 'Fielder'}
              </p>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {fieldingTeam.players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setFielderPlayerId(p.id)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      fielderPlayerId === p.id ? 'bg-accent/20 text-accent border border-accent/30' : 'bg-bg-elevated text-t2'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Input
            placeholder="Reason (logged in the edit history)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={80}
          />

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => close(false)}
              className="flex-1 h-12 rounded-xl border border-border text-t2 hover:text-t1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={busy || (isWicket && !wicketType)}
              className="flex-1 h-12 rounded-xl bg-accent text-black hover:bg-accent/85 font-semibold"
            >
              {busy ? 'Re-validating…' : 'Save edit'}
            </Button>
          </div>

          <p className="text-[10px] text-t3">
            Editing a completed match requires the organizer PIN and reopens it as LIVE under an "edited" banner.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
