'use client';

/**
 * GULLYSCORE v2 §11.4 — CLIENT FEATURE FLAGS HOOK
 * ---------------------------------------------------------------------------
 * Client-side UI gating. Fetches the flag set from /api/buildinfo (SWR) and
 * exposes `isEnabled(flag)`. UI stays rendered-until-known: while the flags
 * are loading, `isEnabled` returns false for experimental flags so nothing
 * experimental flashes on screen; hardened flags can use `features` directly
 * once loaded.
 *
 * Usage:
 *   const { features, isEnabled, isLoading } = useFeatures();
 *   {isEnabled('push') && <PushBell />}
 */

import useSWR from 'swr';
import type { FeatureFlag, FeatureSet } from '@/lib/features';

interface BuildInfo {
  marker: string;
  features?: FeatureSet;
}

const fetcher = (url: string): Promise<BuildInfo> =>
  fetch(url).then((r) => r.json());

export function useFeatures() {
  const { data, isLoading } = useSWR('/api/buildinfo', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true,
  });

  const features: FeatureSet | null = data?.features ?? null;

  return {
    features,
    isLoading: isLoading && features == null,
    /** False until the flag is confirmed ON (safe default for gating UI). */
    isEnabled: (flag: FeatureFlag) => features?.[flag] === true,
  };
}
