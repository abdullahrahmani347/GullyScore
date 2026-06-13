'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { TeamCard } from '@/components/teams/TeamCard';
import { TeamForm } from '@/components/teams/TeamForm';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import type { Team } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TeamsPage() {
  const { data: teams, isLoading, mutate } = useSWR<Team[]>('/api/teams', fetcher);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const filteredTeams = teams?.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.shortName.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const handleCreateTeam = async (data: {
    name: string;
    shortName: string;
    color: string;
    emoji: string;
    players: { name: string; jerseyNumber?: number }[];
  }) => {
    setIsCreating(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create team');
      }
      toast.success(`${data.name} created!`);
      setShowForm(false);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-t1">Teams</h1>
        <p className="text-sm text-t2 mt-0.5">Manage your cricket teams</p>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams..."
            className="h-10 bg-bg-input border-border text-t1 placeholder:text-t3 pl-9"
          />
        </div>
      </div>

      {/* Team Grid */}
      <div className="px-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl bg-bg-card" />
            ))}
          </div>
        ) : filteredTeams.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <AnimatePresence>
              {filteredTeams.map((team, i) => (
                <TeamCard key={team.id} team={team} index={i} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <p className="text-sm text-t3 mb-1">
              {search ? 'No teams match your search' : 'No teams yet'}
            </p>
            {!search && (
              <p className="text-xs text-t3">Create your first team to get started</p>
            )}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <motion.div
        className="fixed bottom-24 right-4 z-30"
        whileTap={{ scale: 0.9 }}
      >
        <Button
          onClick={() => setShowForm(true)}
          className="h-14 w-14 rounded-full bg-accent text-bg-app shadow-lg hover:bg-accent/90"
          size="icon"
        >
          <Plus size={24} />
        </Button>
      </motion.div>

      {/* Create Team Sheet */}
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent side="bottom" className="bg-bg-app border-border rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-t1">Create Team</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <TeamForm onSubmit={handleCreateTeam} isLoading={isCreating} />
          </div>
        </SheetContent>
      </Sheet>
    </PageWrapper>
  );
}
