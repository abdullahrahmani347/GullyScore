import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const team = await db.team.findUnique({
      where: { id },
      include: { players: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check match history for each player
    const playersWithHistory = await Promise.all(
      team.players.map(async (player) => {
        const hasBattingPerf = await db.batsmanInnings.count({ where: { playerId: player.id } });
        const hasBowlingPerf = await db.bowlerInnings.count({ where: { playerId: player.id } });
        const hasBallRecords = await db.ball.count({ where: { OR: [{ batsmanId: player.id }, { bowlerId: player.id }] } });
        return {
          ...player,
          hasMatchHistory: hasBattingPerf > 0 || hasBowlingPerf > 0 || hasBallRecords > 0,
        };
      })
    );

    // Calculate career stats
    const matchesAsTeam1 = await db.match.findMany({
      where: { team1Id: id, status: 'COMPLETED' },
      include: { innings: true },
    });
    const matchesAsTeam2 = await db.match.findMany({
      where: { team2Id: id, status: 'COMPLETED' },
      include: { innings: true },
    });

    const allMatches = [...matchesAsTeam1, ...matchesAsTeam2];
    const totalMatches = allMatches.length;
    let wins = 0;
    let losses = 0;

    for (const match of allMatches) {
      if (match.winnerId === id) {
        wins++;
      } else if (match.winnerId) {
        losses++;
      }
    }

    return NextResponse.json({
      ...team,
      players: playersWithHistory,
      stats: { totalMatches, wins, losses },
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, shortName, color, emoji, players } = body;

    // Update team metadata
    const team = await db.team.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(shortName !== undefined && { shortName }),
        ...(color !== undefined && { color }),
        ...(emoji !== undefined && { emoji }),
      },
      include: { players: true },
    });

    // Handle player updates if provided
    if (players && Array.isArray(players)) {
      const existingPlayers = team.players;
      const existingIds = new Set(existingPlayers.map(p => p.id));

      // Players with IDs that exist — update them
      for (const p of players) {
        if (p.id && existingIds.has(p.id)) {
          await db.player.update({
            where: { id: p.id },
            data: {
              ...(p.name !== undefined && { name: p.name }),
              ...(p.jerseyNumber !== undefined && { jerseyNumber: p.jerseyNumber }),
            },
          });
        }
      }

      // Players without IDs — create new ones
      const newPlayers = players.filter((p: { id?: string; name: string }) => !p.id && p.name?.trim());
      for (const p of newPlayers) {
        await db.player.create({
          data: {
            name: p.name.trim(),
            teamId: id,
            jerseyNumber: p.jerseyNumber || null,
          },
        });
      }

      // Players that were removed (exist in DB but not in the submitted list)
      const submittedIds = new Set(players.filter((p: { id?: string }) => p.id).map((p: { id: string }) => p.id));
      const removedPlayers = existingPlayers.filter(p => !submittedIds.has(p.id));

      // Check if any removed players are referenced in matches before deleting
      for (const p of removedPlayers) {
        const hasBattingPerf = await db.batsmanInnings.count({ where: { playerId: p.id } });
        const hasBowlingPerf = await db.bowlerInnings.count({ where: { playerId: p.id } });
        const hasBallRecords = await db.ball.count({ where: { OR: [{ batsmanId: p.id }, { bowlerId: p.id }] } });

        if (hasBattingPerf === 0 && hasBowlingPerf === 0 && hasBallRecords === 0) {
          await db.player.delete({ where: { id: p.id } });
        }
        // If player has match history, we don't delete — they remain on the team
      }
    }

    // Fetch updated team with players
    const updatedTeam = await db.team.findUniqueOrThrow({
      where: { id },
      include: { players: true },
    });

    return NextResponse.json(updatedTeam);
  } catch (error) {
    console.error('Error updating team:', error);
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check for active matches
    const activeMatches = await db.match.count({
      where: {
        OR: [{ team1Id: id }, { team2Id: id }],
        status: { in: ['LIVE', 'INNINGS_BREAK', 'TOSS'] },
      },
    });
    if (activeMatches > 0) {
      return NextResponse.json(
        { error: 'Cannot delete team with active matches. Abandon or complete them first.' },
        { status: 400 }
      );
    }

    await db.team.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting team:', error);
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 });
  }
}
