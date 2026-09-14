'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, FileText, RefreshCw, Share2, Loader2 } from 'lucide-react';
import { deviceFetch } from '@/lib/device';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ReportSection {
  heading: string;
  body: string;
}

interface MatchReport {
  title: string;
  subtitle: string;
  sections: ReportSection[];
  generator: 'ai' | 'template';
  generatedAt: string;
}

interface ReportResponse {
  report: MatchReport | null;
  generator: 'ai' | 'template';
  note?: string;
  error?: string;
  features?: { aiReport: boolean };
}

/**
 * v2 §13.10 — shareable match-report article page. The cached AI report
 * when present, else the always-available template; the badge labels which
 * generator produced the text. While an AI report is pending (flag on,
 * match completed), the page polls briefly and toasts when it lands.
 */
export default function MatchReportPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;

  const [data, setData] = useState<ReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const toastedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await deviceFetch(`/api/matches/${matchId}/report`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load report');
      }
      const json = (await res.json()) as ReportResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll for the async AI report (completion triggers it fire-and-forget)
  useEffect(() => {
    if (!data || data.generator === 'ai' || !data.features?.aiReport) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const res = await deviceFetch(`/api/matches/${matchId}/report`);
        if (res.ok) {
          const json = (await res.json()) as ReportResponse;
          if (json.generator === 'ai') {
            setData(json);
            if (!toastedRef.current) {
              toastedRef.current = true;
              toast.success('AI match report is ready!');
            }
          }
        }
      } catch {}
      if (tries >= 12) clearInterval(timer); // ~1 minute
    }, 5000);
    return () => clearInterval(timer);
  }, [data, matchId]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await deviceFetch(`/api/matches/${matchId}/report`, { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as ReportResponse;
      if (!res.ok && !json.report) {
        throw new Error(json.error ?? 'Generation failed');
      }
      if (json.report) setData(json);
      toast.success(
        json.generator === 'ai' ? 'AI report regenerated' : 'AI failed — served the template'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setRegenerating(false);
    }
  };

  const handleShare = async () => {
    if (!data?.report) return;
    const text = `${data.report.title}\n${data.report.subtitle}\n\n${data.report.sections
      .map((s) => (s.heading ? `${s.heading}\n` : '') + s.body)
      .join('\n\n')}\n\n— scored with GullyScore`;
    try {
      if (navigator.share) {
        await navigator.share({ title: data.report.title, text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Report copied to clipboard');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        toast.success('Report copied to clipboard');
      } catch {
        toast.error('Failed to share');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data?.report) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center p-4">
        <div className="rounded-2xl border border-border bg-bg-card p-8 text-center max-w-sm w-full">
          <p className="text-sm text-t2 mb-4">{error ?? 'No report available yet'}</p>
          <Link href={`/matches/${matchId}`} className="text-xs text-accent">
            ← Back to the match
          </Link>
        </div>
      </div>
    );
  }

  const { report } = data;
  const isAi = report.generator === 'ai';

  return (
    <div className="min-h-dvh bg-bg-app pb-10">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-t3 hover:text-t1 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-2">
            {data.features?.aiReport && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1 text-[11px] text-t3 hover:text-t1 px-2.5 py-1.5 rounded-lg border border-border transition-colors disabled:opacity-50"
              >
                {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Regenerate
              </button>
            )}
            <button
              onClick={handleShare}
              className="flex items-center gap-1 text-[11px] text-accent px-2.5 py-1.5 rounded-lg border border-accent/30 bg-accent/10 transition-colors"
            >
              <Share2 size={12} /> Share
            </button>
          </div>
        </div>
      </div>

      {/* Article */}
      <article className="px-4 max-w-2xl mx-auto">
        {/* Generator badge (§13.10 — the UI labels the generator) */}
        <div
          className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border mb-3 ${
            isAi
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-bg-elevated border-border text-t3'
          }`}
        >
          {isAi ? <Sparkles size={11} /> : <FileText size={11} />}
          {isAi ? 'AI-generated' : 'Template'}
        </div>

        <h1 className="text-2xl font-bold text-t1 leading-tight">{report.title}</h1>
        {report.subtitle && <p className="text-sm text-t3 mt-1.5">{report.subtitle}</p>}
        <p className="text-[10px] text-t3 mt-1">
          {report.generatedAt
            ? format(new Date(report.generatedAt), 'd MMM yyyy, h:mm a')
            : ''}
        </p>

        <div className="mt-6 space-y-6">
          {report.sections.map((s, i) => (
            <section key={i}>
              {s.heading && (
                <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-2">
                  {s.heading}
                </h2>
              )}
              <div className="text-[13px] text-t2 leading-relaxed whitespace-pre-wrap">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 pt-4 border-t border-border">
          <Link href={`/matches/${matchId}`} className="text-xs text-accent hover:underline">
            View the full scorecard →
          </Link>
        </div>
      </article>
    </div>
  );
}
