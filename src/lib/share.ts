import html2canvas from 'html2canvas';
import type { MatchData } from '@/types';

export async function exportScorecardImage(elementId: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Scorecard element not found');

  const canvas = await html2canvas(element, {
    backgroundColor: '#070710',
    scale: 2,
    useCORS: true,
    allowTaint: false,
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/png');
  });

  const file = new File([blob], 'gullyscore-scorecard.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'GullyScore Scorecard' });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gullyscore-scorecard.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export function generateWhatsAppSummary(match: MatchData): string {
  const inn1 = match.innings?.[0];
  const inn2 = match.innings?.[1];
  if (!inn1) return '';
  
  const date = new Date(match.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  
  const topBat1 = [...inn1.batting].sort((a, b) => b.runs - a.runs)[0];
  const topBowl1 = [...inn1.bowling].sort((a, b) => b.wickets - a.wickets)[0];
  const topBat2 = inn2 ? [...inn2.batting].sort((a, b) => b.runs - a.runs)[0] : null;
  const topBowl2 = inn2 ? [...inn2.bowling].sort((a, b) => b.wickets - a.wickets)[0] : null;

  return `🏏 *GullyScore Match Report*
📅 ${date}${match.venue ? ` | ${match.venue}` : ''}

*${match.team1?.name || 'Team 1'}* vs *${match.team2?.name || 'Team 2'}*

🏏 1st Innings: ${inn1.team?.name || 'N/A'}
Score: *${inn1.runs}/${inn1.wickets}* (${inn1.completedOvers}.${inn1.currentBalls} ov)
${topBat1 ? `Top bat: ${topBat1.player?.name} — ${topBat1.runs}(${topBat1.balls})` : ''}
${topBowl1 ? `Best bowl: ${topBowl1.player?.name} — ${topBowl1.wickets}/${topBowl1.runs}` : ''}

${inn2 ? `🏏 2nd Innings: ${inn2.team?.name || 'N/A'}
Score: *${inn2.runs}/${inn2.wickets}* (${inn2.completedOvers}.${inn2.currentBalls} ov)
${topBat2 ? `Top bat: ${topBat2.player?.name} — ${topBat2.runs}(${topBat2.balls})` : ''}
${topBowl2 ? `Best bowl: ${topBowl2.player?.name} — ${topBowl2.wickets}/${topBowl2.runs}` : ''}

🏆 *Result: ${match.result}*` : ''}

Scored with GullyScore 🏏`.trim();
}
