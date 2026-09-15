'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, List, GripVertical, MapPin, Clock, User, AlertTriangle, X } from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { deviceFetch } from '@/lib/device';
import { toast } from 'sonner';
import type { MatchStatus } from '@/types';

/**
 * v2 §17.2 — Schedule editor.
 *
 * - List view (grouped by day) and Calendar view (day buckets); drag a
 *   fixture between day buckets to reslot it (writes scheduledAt).
 * - Venue / time / umpires are inline-editable per fixture.
 * - Double-booking conflicts come back as HTTP 409 from the API with the
 *   conflicting fixtures listed — the editor shows them and only re-sends
 *   with `confirm: true` when the organizer insists.
 */

interface ScheduleMatch {
  id: string;
  team1: { id: string; name: string; shortName: string; color: string };
  team2: { id: string; name: string; shortName: string; color: string };
  status: MatchStatus;
  result?: string | null;
  winnerId?: string | null;
  innings: {
    teamId: string;
    runs: number;
    wickets: number;
    completedOvers: number;
    currentBalls: number;
    isCompleted: boolean;
  }[];
  createdAt: string;
  scheduledAt?: string | null;
  venue?: string | null;
  umpires?: string | null;
  round?: string | null;
  liveCode?: string | null;
}

interface Conflict {
  matchId: string;
  reason: string;
  label: string;
  scheduledAt: string | null;
}

interface PendingSlot {
  matchId: string;
  payload: Record<string, unknown>;
  conflicts: Conflict[];
}

export function ScheduleEditor({ schedule, canEdit, tournamentId }: { schedule: ScheduleMatch[]; canEdit: boolean; tournamentId: string }) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [items, setItems] = useState<ScheduleMatch[]>(schedule);
  const [pending, setPending] = useState<PendingSlot | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ venue: string; time: string; umpires: string }>({ venue: '', time: '', umpires: '' });

  const byDay = useMemo(() => {
    const groups = new Map<string, ScheduleMatch[]>();
    for (const m of items) {
      const key = format(m.scheduledAt ? parseISO(m.scheduledAt) : parseISO(m.createdAt), 'yyyy-MM-dd');
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const openEdit = (m: ScheduleMatch) => {
    setEditingId(m.id);
    setDraft({
      venue: m.venue ?? '',
      time: m.scheduledAt ? format(parseISO(m.scheduledAt), "yyyy-MM-dd'T'HH:mm") : '',
      umpires: m.umpires ?? '',
    });
  };

  /** PATCH the fixture; on 409 show the conflict sheet instead of saving. */
  const patchMatch = async (matchId: string, payload: Record<string, unknown>, tournamentId: string, confirm = false) => {
    try {
      const res = await deviceFetch(`/api/tournaments/${tournamentId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ matchId, ...payload, confirm }),
      });
      if (res.status === 409) {
        const body = await res.json();
        setPending({ matchId, payload, conflicts: body.conflicts ?? [] });
        return;
      }
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to update fixture');
      }
      const body = await res.json();
      setItems((cur) => cur.map((m) => (m.id === matchId ? { ...m, ...body.match } : m)));
      setEditingId(null);
      setPending(null);
      toast.success('Fixture updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update fixture');
    }
  };

  const handleDrop = (dayKey: string) => {
    if (!dragId || !canEdit) return;
    const match = items.find((m) => m.id === dragId);
    if (!match) return;
    const prev = match.scheduledAt ? parseISO(match.scheduledAt) : parseISO(match.createdAt);
    const hh = format(prev, 'HH:mm');
    const scheduledAt = new Date(`${dayKey}T${hh}:00`).toISOString();
    setDragId(null);
    void patchMatch(dragId, { scheduledAt }, tournamentId);
  };

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg bg-bg-card border border-border p-0.5">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md ${view === 'list' ? 'bg-accent text-bg-app' : 'text-t3'}`}
          >
            <List size={12} /> List
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md ${view === 'calendar' ? 'bg-accent text-bg-app' : 'text-t3'}`}
          >
            <CalendarIcon size={12} /> Calendar
          </button>
        </div>
        {canEdit && <p className="text-[10px] text-t3">Drag fixtures between days to reslot</p>}
      </div>

      {/* Conflict sheet (double-booking) */}
      {pending && (
        <div className="rounded-xl border border-wicket/30 bg-wicket/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="text-wicket flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-t1">Double-booking detected</p>
              <ul className="text-[11px] text-t3 mt-1 space-y-0.5">
                {pending.conflicts.map((c) => (
                  <li key={c.matchId}>
                    • {c.reason === 'venue' ? 'Same venue' : 'Same team'}: {c.label}
                    {c.scheduledAt ? ` — ${format(parseISO(c.scheduledAt), 'dd MMM, HH:mm')}` : ''}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  className="h-7 px-3 rounded-lg bg-wicket text-white hover:bg-wicket/90 text-[11px]"
                  onClick={() => pending && patchMatch(pending.matchId, pending.payload, tournamentId, true)}
                >
                  Save anyway
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-3 rounded-lg text-[11px] text-t3" onClick={() => setPending(null)}>
                  <X size={12} className="mr-1" /> Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day buckets */}
      {byDay.map(([dayKey, matches]) => (
        <div
          key={dayKey}
          onDragOver={(e) => {
            if (canEdit && dragId) e.preventDefault();
          }}
          onDrop={() => handleDrop(dayKey)}
          className={`rounded-xl border p-2.5 transition-colors ${
            dragId ? 'border-dashed border-accent/50 bg-accent/5' : 'border-border bg-bg-card'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2 px-1">
            {format(parseISO(dayKey), 'EEE, dd MMM yyyy')}
          </p>
          <div className="space-y-2">
            {matches.map((m) => (
              <motion.div layout key={m.id} className="rounded-lg border border-border/60 p-2.5 bg-bg-app/40">
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <span
                      className="flex-shrink-0 cursor-grab"
                      draggable
                      onDragStart={() => setDragId(m.id)}
                      onDragEnd={() => setDragId(null)}
                      title="Drag to another day"
                    >
                      <GripVertical size={13} className="text-t3" />
                    </span>
                  )}
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.team1.color }} />
                  <span className="text-xs font-semibold text-t1 truncate">
                    {m.team1.shortName} v {m.team2.shortName}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                      m.status === 'LIVE' || m.status === 'INNINGS_BREAK'
                        ? 'text-accent bg-accent/10'
                        : m.status === 'COMPLETED'
                          ? 'text-t3 bg-bg-elevated'
                          : 'text-gold bg-gold/10'
                    }`}
                  >
                    {m.round ?? m.status}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => openEdit(m)}
                      className="ml-auto text-[10px] text-accent hover:underline flex-shrink-0"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {/* meta line */}
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-t3 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={9} />
                    {format(m.scheduledAt ? parseISO(m.scheduledAt) : parseISO(m.createdAt), 'HH:mm')}
                  </span>
                  {m.venue && (
                    <span className="inline-flex items-center gap-1 truncate max-w-[40%]">
                      <MapPin size={9} /> {m.venue}
                    </span>
                  )}
                  {m.umpires && (
                    <span className="inline-flex items-center gap-1 truncate max-w-[30%]">
                      <User size={9} /> {m.umpires}
                    </span>
                  )}
                </div>

                {/* inline edit */}
                {editingId === m.id && canEdit && (
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    <Input
                      value={draft.time}
                      onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                      type="datetime-local"
                      className="h-8 text-xs bg-bg-input border-border text-t1 rounded-lg"
                    />
                    <Input
                      value={draft.venue}
                      onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
                      placeholder="Venue"
                      className="h-8 text-xs bg-bg-input border-border text-t1 rounded-lg"
                    />
                    <Input
                      value={draft.umpires}
                      onChange={(e) => setDraft({ ...draft, umpires: e.target.value })}
                      placeholder="Umpires"
                      className="h-8 text-xs bg-bg-input border-border text-t1 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 px-3 rounded-lg bg-accent text-bg-app text-[11px] font-semibold"
                        onClick={() =>
                          patchMatch(
                            m.id,
                            {
                              scheduledAt: draft.time ? new Date(draft.time).toISOString() : null,
                              venue: draft.venue || null,
                              umpires: draft.umpires || null,
                            },
                            tournamentId,
                          )
                        }
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-3 rounded-lg text-[11px] text-t3" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
