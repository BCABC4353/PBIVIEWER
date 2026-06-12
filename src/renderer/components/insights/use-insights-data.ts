import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  InsightsSnapshot,
  ContentItem,
  AdminInsights,
  InsightsWorkspaceAccess,
} from '../../../shared/types';
import { isDown, isDormant, matchesTileFilter, groupByWorkspace, triageSortGroups, type TileFilter } from './insights-luce';
import { computeBlastRadius, type BlastRadius } from '../../../shared/blast-radius';

export interface InsightsData {
  snapshot: InsightsSnapshot | null;
  isLoading: boolean;
  error: string | null;
  load: (force: boolean) => Promise<void>;
  blast: BlastRadius;
  groups: ReturnType<typeof triageSortGroups>;
  counts: { ok: number; broken: number; overdue: number; running: number; dormant: number };
  healthPct: number | null;
  accessByWs: Map<string, InsightsWorkspaceAccess>;
  frequent: ContentItem[];
  catalog: Array<{ id: string; name: string; workspaceId: string }>;
  admin: AdminInsights | null;
  adminLoading: boolean;
  adminError: string | null;
  unlockElapsedMs: number;
  loadAdmin: (force: boolean) => Promise<void>;
  cancelAdminLoad: () => void;
}

export function useInsightsData(userId: string | undefined, activeFilter: TileFilter | null): InsightsData {
  const [snapshot, setSnapshot] = useState<InsightsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [frequent, setFrequent] = useState<ContentItem[]>([]);
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; workspaceId: string }>>([]);
  const [admin, setAdmin] = useState<AdminInsights | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [unlockElapsedMs, setUnlockElapsedMs] = useState(0);
  const adminGen = useRef(0);

  useEffect(() => {
    if (!adminLoading) return;
    setUnlockElapsedMs(0);
    const startedAt = Date.now();
    const timer = setInterval(() => setUnlockElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [adminLoading]);

  const load = useCallback(async (force: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await window.electronAPI.content.getInsights(force);
      if (!resp.success) {
        setError(resp.error.userMessage || resp.error.message || 'Could not load insights');
        return;
      }
      setSnapshot(resp.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load insights');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [freqResp, itemsResp] = await Promise.all([
          window.electronAPI.usage.getFrequent(userId),
          window.electronAPI.content.getAllItems(),
        ]);
        if (cancelled) return;
        if (freqResp.success) setFrequent(freqResp.data);
        if (itemsResp.success) {
          setCatalog([
            ...itemsResp.data.reports.map((r) => ({ id: r.id, name: r.name, workspaceId: r.workspaceId })),
            ...itemsResp.data.dashboards.map((d) => ({ id: d.id, name: d.name, workspaceId: d.workspaceId })),
          ]);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const loadAdmin = useCallback(async (force: boolean) => {
    const gen = ++adminGen.current;
    setAdminLoading(true);
    setAdminError(null);
    try {
      const resp = await window.electronAPI.content.getAdminInsights(2, force);
      if (gen !== adminGen.current) return;
      if (!resp.success) {
        setAdminError(
          resp.error.code === 'ADMIN_REQUIRED'
            ? 'Power BI says this account is not a Fabric administrator, so the tenant-wide view is unavailable.'
            : resp.error.userMessage || resp.error.message || 'Could not load the admin view',
        );
        return;
      }
      setAdmin(resp.data);
    } catch (err) {
      if (gen !== adminGen.current) return;
      setAdminError(err instanceof Error ? err.message : 'Could not load the admin view');
    } finally {
      if (gen === adminGen.current) setAdminLoading(false);
    }
  }, []);

  const cancelAdminLoad = useCallback(() => {
    adminGen.current++;
    setAdminLoading(false);
  }, []);

  const blast = useMemo<BlastRadius>(
    () => snapshot
      ? computeBlastRadius(snapshot)
      : { suspectsByDataflow: new Map(), reportsByDataset: new Map(), suspectDatasetIds: new Set() },
    [snapshot],
  );

  const groups = useMemo(() => {
    const all = snapshot?.refreshables ?? [];
    const full = triageSortGroups(groupByWorkspace(all), blast.suspectDatasetIds);
    if (!activeFilter) return full;
    return full.filter((g) => g.items.some((r) => matchesTileFilter(r, activeFilter)));
  }, [snapshot, activeFilter, blast]);

  const counts = useMemo(() => {
    const c = { ok: 0, broken: 0, overdue: 0, running: 0, dormant: 0 };
    for (const r of snapshot?.refreshables ?? []) {
      if (r.lastStatus === 'Failed' || r.lastStatus === 'Cancelled') c.broken++;
      else if (r.lastStatus === 'InProgress') c.running++;
      else if (r.lastStatus === 'Completed') c.ok++;
      if (r.scheduleOverdue) c.overdue++;
      if (isDormant(r)) c.dormant++;
    }
    return c;
  }, [snapshot]);

  const healthPct = useMemo(() => {
    const all = snapshot?.refreshables ?? [];
    if (all.length === 0) return null;
    const up = all.filter((r) => !isDown(r)).length;
    return Math.round((up / all.length) * 100);
  }, [snapshot]);

  const accessByWs = useMemo(() => {
    const m = new Map<string, InsightsWorkspaceAccess>();
    for (const a of snapshot?.access ?? []) m.set(a.workspaceId, a);
    return m;
  }, [snapshot]);

  return {
    snapshot, isLoading, error, load,
    blast, groups, counts, healthPct, accessByWs,
    frequent, catalog,
    admin, adminLoading, adminError, unlockElapsedMs, loadAdmin, cancelAdminLoad,
  };
}
