'use client';

import useSWR from 'swr';
import { safeDeviceFetcher } from '@/lib/device';

/**
 * Lightweight live-match count for nav indicators.
 *
 * Polls the public hub feed (v2 §15.1) every 30 s. Returns 0 on any
 * failure so the nav badge simply stays hidden — never blocks rendering.
 */
export function useLiveCount(): number {
  const { data } = useSWR<{ live?: unknown[] }>('/api/live', safeDeviceFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    dedupingInterval: 15000,
    errorRetryCount: 2,
  });
  return data?.live?.length ?? 0;
}
