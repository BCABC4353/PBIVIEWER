import { useCallback, useEffect, useRef, useState } from 'react';

export interface FreshnessSnapshot {
  datasetRefreshTime: string | null;
  dataflowRefreshTime: string | null;
}

export function useLiveFreshness(
  fetcher: () => Promise<FreshnessSnapshot | null>,
  loadedAt: number | null,
): { datasetRefreshTime: string | null; dataflowRefreshTime: string | null; newDataAvailable: boolean } {
  const [snap, setSnap] = useState<FreshnessSnapshot>({
    datasetRefreshTime: null,
    dataflowRefreshTime: null,
  });
  const [, setTick] = useState(0);
  const [newDataAvailable, setNewDataAvailable] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const baselineRef = useRef<string | null>(null);
  const needsRebaselineRef = useRef(false);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const r = await fetcherRef.current();
      if (!mountedRef.current || !r) return;
      setSnap(r);
      if (needsRebaselineRef.current) {
        baselineRef.current = r.datasetRefreshTime;
        needsRebaselineRef.current = false;
        setNewDataAvailable(false);
        return;
      }
      const base = baselineRef.current;
      const cur = r.datasetRefreshTime;
      setNewDataAvailable(cur !== null && base !== null && Date.parse(cur) > Date.parse(base));
    } catch {
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

  useEffect(() => {
    if (loadedAt !== null) {
      needsRebaselineRef.current = true;
      setNewDataAvailable(false);
      void poll();
    }
  }, [loadedAt, poll]);

  return { ...snap, newDataAvailable };
}
