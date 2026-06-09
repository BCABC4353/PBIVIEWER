import { useCallback, useEffect, useRef, useState } from 'react';

export interface FreshnessSnapshot {
  datasetRefreshTime: string | null;
  dataflowRefreshTime: string | null;
}

/**
 * Polls a "data last refreshed" snapshot so a viewer toolbar can show a live
 * "(N min ago)" age and flag when newer data has landed than what is on screen.
 *
 * Two timers run: a NETWORK poll every 5 minutes (the backing data refreshes
 * ~every 15 min, so polling faster just burns Power BI API calls) and a separate
 * LOCAL tick every 60s that only re-renders so the "(N min ago)" label advances
 * without a network call.
 *
 * @param fetcher returns the dataset + dataflow refresh times, or null. The
 *        closure reads whatever ids it needs and should resolve null until they
 *        are available — the hook keeps polling, so freshness appears once ready.
 * @param loadedAt epoch-ms when the on-screen content last (re)loaded, or null.
 *        Used to (re)baseline newDataAvailable.
 *
 * newDataAvailable compares the polled dataset refresh time against the dataset
 * refresh time captured AT THE LAST LOAD — server timestamp vs server timestamp.
 * It deliberately does NOT compare against the local clock (Date.now()): an
 * un-synced client clock would otherwise report "new data" forever and, on a
 * data-driven auto-refresh report, drive a refresh loop.
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
  const [newDataAvailable, setNewDataAvailable] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // The dataset refresh time the on-screen content reflects, captured at the last
  // (re)load. The newDataAvailable comparison is anchored here (server-vs-server).
  const baselineRef = useRef<string | null>(null);
  // Set true on a (re)load so the NEXT poll re-baselines to the data the freshly
  // loaded screen actually shows, instead of mistaking it for "new" data.
  const needsRebaselineRef = useRef(false);
  // Guards against setState after unmount when an in-flight poll resolves late.
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const r = await fetcherRef.current();
      if (!mountedRef.current || !r) return;
      setSnap(r);
      if (needsRebaselineRef.current) {
        // First poll after a (re)load: the screen reflects this data → baseline it.
        baselineRef.current = r.datasetRefreshTime;
        needsRebaselineRef.current = false;
        setNewDataAvailable(false);
        return;
      }
      const base = baselineRef.current;
      const cur = r.datasetRefreshTime;
      setNewDataAvailable(cur !== null && base !== null && Date.parse(cur) > Date.parse(base));
    } catch {
      /* best-effort: keep the last known snapshot */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void poll();
    const pollId = setInterval(() => void poll(), 5 * 60 * 1000);
    const tickId = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [poll]);

  // After a (re)load, re-baseline to the data the freshly-loaded screen shows and
  // re-poll. Until that poll resolves there is no "new data" relative to the load.
  useEffect(() => {
    if (loadedAt !== null) {
      needsRebaselineRef.current = true;
      setNewDataAvailable(false);
      void poll();
    }
  }, [loadedAt, poll]);

  return { ...snap, newDataAvailable };
}
