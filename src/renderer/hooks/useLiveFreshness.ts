import { useCallback, useEffect, useRef, useState } from 'react';

export interface FreshnessSnapshot {
  datasetRefreshTime: string | null;
  dataflowRefreshTime: string | null;
}

/**
 * Polls a "data last refreshed" snapshot on a 60s interval so a viewer toolbar
 * can show a live "(N min ago)" age (the tick) and flag when newer data has
 * landed than what is currently on screen (newDataAvailable).
 *
 * @param fetcher returns the dataset + dataflow refresh times, or null. The
 *        closure reads whatever ids it needs and should resolve null until they
 *        are available — the hook keeps polling, so freshness appears once ready.
 * @param loadedAt epoch-ms when the on-screen content last (re)loaded, or null.
 *        Used to decide newDataAvailable: a dataset refresh newer than the load.
 */
export function useLiveFreshness(
  fetcher: () => Promise<FreshnessSnapshot | null>,
  loadedAt: number | null,
): { datasetRefreshTime: string | null; dataflowRefreshTime: string | null; newDataAvailable: boolean } {
  const [snap, setSnap] = useState<FreshnessSnapshot>({
    datasetRefreshTime: null,
    dataflowRefreshTime: null,
  });
  const [, setTick] = useState(0); // re-render so the "(N min ago)" label advances
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const poll = useCallback(async () => {
    try {
      const r = await fetcherRef.current();
      if (r) setSnap(r);
    } catch {
      /* best-effort: keep the last known snapshot */
    }
  }, []);

  useEffect(() => {
    void poll();
    // Network fetch every 5 min — the backing data refreshes ~every 15 min, so
    // polling faster just burns Power BI API calls. The "(N min ago)" label still
    // advances every minute via a separate LOCAL tick (no network call).
    const pollId = setInterval(() => void poll(), 5 * 60 * 1000);
    const tickId = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => {
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [poll]);

  // Re-poll right after a (re)load so the stamp + the comparison reflect the
  // freshly-loaded screen.
  useEffect(() => {
    if (loadedAt !== null) void poll();
  }, [loadedAt, poll]);

  // newDataAvailable: the DATASET refreshed after the screen loaded, so the
  // on-screen visuals are behind (embedded Power BI shows data as of page load).
  const newDataAvailable =
    snap.datasetRefreshTime !== null &&
    loadedAt !== null &&
    new Date(snap.datasetRefreshTime).getTime() > loadedAt;

  return { ...snap, newDataAvailable };
}
