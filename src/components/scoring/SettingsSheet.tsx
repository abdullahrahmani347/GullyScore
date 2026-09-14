'use client';

import { useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore, type ProModeOption } from '@/store/settingsStore';
import { feedback, stopSpeech } from '@/lib/feedback';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-t1">{title}</p>
        <p className="text-xs text-t3 mt-0.5">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * v2 §14.1 — every feedback channel is individually toggleable. Defaults:
 * basic run-tap haptic ON; rich patterns, sound and TTS OFF.
 * Also hosts the §14.2 Landscape Pro Mode override.
 */
export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const s = useSettingsStore();

  // Turning TTS off should kill any in-flight speech immediately.
  useEffect(() => {
    if (!s.speechCommentary) stopSpeech();
  }, [s.speechCommentary]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-t1">Scoring feel &amp; layout</SheetTitle>
          <SheetDescription className="text-t3 text-xs">
            Haptics, sounds and speech are per-device and saved instantly.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-8 divide-y divide-border">
          {/* Haptics */}
          <Row
            title="Run-tap haptic"
            hint="A light 10 ms buzz on every run button press"
            checked={s.hapticRunTap}
            onChange={(v) => {
              s.setHapticRunTap(v);
              if (v) feedback.run();
            }}
          />
          <Row
            title="Big-moment haptics"
            hint="Distinct patterns: four 20-40-20 · six 30-50-30-50 · wicket 80-60-80 · milestones"
            checked={s.hapticEvents}
            onChange={(v) => {
              s.setHapticEvents(v);
              if (v) feedback.six();
            }}
          />

          {/* Sound */}
          <Row
            title="Sound effects"
            hint="Tiny synthesized blips — no audio files, nothing to download"
            checked={s.soundFx}
            onChange={(v) => {
              s.setSoundFx(v);
              if (v) feedback.four();
            }}
          />

          {/* Speech */}
          <Row
            title="Spoken commentary"
            hint="Reads key moments aloud with your device voice"
            checked={s.speechCommentary}
            onChange={(v) => {
              s.setSpeechCommentary(v);
              if (v) feedback.milestoneSpoken('Commentary voice on');
            }}
          />

          {/* Undo confirm */}
          <Row
            title="Confirm wicket undo"
            hint="Ask before undoing a wicket ball (single-tap undo is instant by default)"
            checked={s.confirmUndoWicket}
            onChange={s.setConfirmUndoWicket}
          />

          {/* §14.2 — Pro mode */}
          <div className="pt-3">
            <p className="text-sm font-medium text-t1">Landscape Pro Mode</p>
            <p className="text-xs text-t3 mt-0.5 mb-2">
              Two-thumb layout: runs under the right thumb, extras &amp; wicket under the left.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['auto', 'on', 'off'] as ProModeOption[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => s.setProMode(opt)}
                  className={`h-10 rounded-xl text-sm font-medium capitalize transition-colors ${
                    s.proMode === opt
                      ? 'bg-accent/20 text-accent border border-accent/40'
                      : 'bg-bg-elevated text-t2'
                  }`}
                >
                  {opt === 'auto' ? 'Auto' : opt === 'on' ? 'Always on' : 'Off'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-t3 mt-2">
              Auto follows your device: landscape + touch turns Pro Mode on.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
