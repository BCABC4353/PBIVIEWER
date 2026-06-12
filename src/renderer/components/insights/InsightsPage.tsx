import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Spinner } from '@fluentui/react-components';
import { useAuthStore } from '../../stores/auth-store';
import type {
  InsightsSnapshot,
  ContentItem,
  AdminInsights,
  InsightsWorkspaceAccess,
} from '../../../shared/types';
import {
  luce,
  isDown,
  isDormant,
  matchesTileFilter,
  groupByWorkspace,
  triageSortGroups,
  workspaceAffectedReportCount,
  unlockStageText,
  type TileFilter,
} from './insights-luce';
import { computeBlastRadius, type BlastRadius } from '../../../shared/blast-radius';
import { prefersReducedMotion, useIgnition, useDocumentHidden } from './luce-motion';
import { formatTime, relativeAge, tabular } from './insights-shared';
import { LuceButton } from './LuceButton';
import { SectionHeading } from './SectionHeading';
import { HeroGauge } from './HeroGauge';
import { HeroTile } from './HeroTile';
import { WorkspaceTile } from './WorkspaceTile';
import { WorkspaceSheet } from './WorkspaceSheet';
import './insights-luce.css';



export const InsightsPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isOwner = (user?.email ?? '').toLowerCase() === 'brendan@bc-abc.com';

  const [snapshot, setSnapshot] = useState<InsightsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<TileFilter | null>(null);
  const [sheet, setSheet] = useState<{
    workspaceId: string;
    el: HTMLElement | null;
  } | null>(null);
  const [morphId, setMorphId] = useState<string | null>(null);
  const [sheetSettled, setSheetSettled] = useState(true);

  const activeVtRef = useRef<{ skipTransition: () => void } | null>(null);
  const sheetIntentRef = useRef<{ workspaceId: string; el: HTMLElement } | null>(null);

  const armVt = useCallback(
    (vt: { skipTransition: () => void; finished: Promise<unknown> }) => {
      activeVtRef.current = vt;
      void vt.finished.finally(() => {
        if (activeVtRef.current === vt) activeVtRef.current = null;
      });
    },
    [],
  );

  const openSheet = useCallback((workspaceId: string, el: HTMLElement) => {
    sheetIntentRef.current = { workspaceId, el };
    if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
      setSheetSettled(true);
      setSheet({ workspaceId, el });
      return;
    }
    document.documentElement.classList.remove('vt-closing');
    flushSync(() => {
      setSheetSettled(false);
      setMorphId(workspaceId);
    });
    activeVtRef.current?.skipTransition();
    const vt = document.startViewTransition(() => {
      flushSync(() => setSheet({ workspaceId, el }));
    });
    armVt(vt);
    void vt.finished.finally(() => setSheetSettled(true));
  }, [armVt]);

  const closeSheet = useCallback(() => {
    const current = sheet ?? sheetIntentRef.current;
    if (!current) return;
    sheetIntentRef.current = null;
    const opener = current.el;
    if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
      flushSync(() => setSheet(null));
      opener?.focus?.();
      return;
    }
    document.documentElement.classList.add('vt-closing');
    activeVtRef.current?.skipTransition();
    const vt = document.startViewTransition(() => {
      flushSync(() => {
        setMorphId(current.workspaceId);
        setSheet(null);
      });
      opener?.focus?.();
    });
    armVt(vt);
    void vt.finished.finally(() => {
      document.documentElement.classList.remove('vt-closing');
      setMorphId((prev) => (prev === current.workspaceId ? null : prev));
    });
  }, [sheet, armVt]);

  const igniting = useIgnition(snapshot !== null);
  const docHidden = useDocumentHidden();

  const [admin, setAdmin] = useState<AdminInsights | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());
  const [unlockElapsedMs, setUnlockElapsedMs] = useState(0);
  const adminGen = useRef(0);

  useEffect(() => {
    if (!adminLoading) return;
    setUnlockElapsedMs(0);
    const startedAt = Date.now();
    const timer = setInterval(() => setUnlockElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [adminLoading]);

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

  const [frequent, setFrequent] = useState<ContentItem[]>([]);
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; workspaceId: string }>>([]);

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

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [freqResp, itemsResp] = await Promise.all([
          window.electronAPI.usage.getFrequent(user?.id),
          window.electronAPI.content.getAllItems(),
        ]);
        if (cancelled) return;
        if (freqResp.success) setFrequent(freqResp.data);
        if (itemsResp.success) {
          setCatalog([
            ...itemsResp.data.reports.map((r) => ({
              id: r.id,
              name: r.name,
              workspaceId: r.workspaceId,
            })),
            ...itemsResp.data.dashboards.map((d) => ({
              id: d.id,
              name: d.name,
              workspaceId: d.workspaceId,
            })),
          ]);
        }
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const blast = useMemo<BlastRadius>(
    () =>
      snapshot
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

  const sheetGroup = sheet ? groups.find((g) => g.workspaceId === sheet.workspaceId) ?? null : null;

  const toggleFilter = (f: TileFilter) => {
    const apply = () => setActiveFilter((prev) => (prev === f ? null : f));
    if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
      apply();
      return;
    }
    document.documentElement.classList.add('vt-filter');
    const vt = document.startViewTransition(() => flushSync(apply));
    armVt(vt);
    void vt.finished.finally(() => document.documentElement.classList.remove('vt-filter'));
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView?.({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  if (isLoading && !snapshot) {
    return (
      <div className="luce-board h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="large" />
          <p className="mt-4 text-sm" style={{ color: luce.textSecondary }}>
            Checking every dataset and dataflow you can see…
          </p>
        </div>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="luce-board h-full flex items-center justify-center" role="alert">
        <div className="text-center max-w-md">
          <p className="block mb-4 text-sm" style={{ color: luce.broken }}>
            {error}
          </p>
          <LuceButton tone="accent" onClick={() => void load(true)}>
            Try again
          </LuceButton>
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  const tiles: Array<{ label: string; value: number; color: string; loud: boolean; filter?: TileFilter }> = [
    { label: 'Broken', value: counts.broken, color: counts.broken > 0 ? luce.broken : luce.textTertiary, loud: counts.broken > 0, filter: 'broken' },
    { label: 'Overdue', value: counts.overdue, color: counts.overdue > 0 ? luce.warn : luce.textTertiary, loud: counts.overdue > 0 && counts.broken === 0, filter: 'overdue' },
    { label: 'Running', value: counts.running, color: counts.running > 0 ? luce.accent : luce.textTertiary, loud: false, filter: 'running' },
    { label: 'Healthy', value: counts.ok, color: luce.textSecondary, loud: counts.broken === 0 && counts.overdue === 0, filter: 'healthy' },
    { label: 'Dormant', value: counts.dormant, color: counts.dormant > 0 ? luce.dormant : luce.textTertiary, loud: false, filter: 'dormant' },
    { label: 'Workspaces', value: snapshot.workspaceCount, color: luce.textSecondary, loud: false },
  ];
  const activeTileLabel = tiles.find((t) => t.filter === activeFilter)?.label;

  return (
    <div
      className={`luce-board h-full overflow-y-auto${igniting ? ' luce-ignite' : ''}${docHidden ? ' luce-asleep' : ''}`}
      style={{ color: luce.textSecondary }}
    >
      {}
      <div
        className="max-w-6xl mx-auto p-6 space-y-8"
        style={sheet ? { pointerEvents: 'none' } : undefined}
      >
        {}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: luce.textPrimary }}>
              Insights
            </h1>
            <p className="text-sm" style={{ color: luce.textTertiary }}>
              Every client workspace, one board — refreshes, access, and usage. Checked{' '}
              {relativeAge(snapshot.generatedAt) || 'just now'}
              {snapshot.fromCache ? ' (cached)' : ''}.
            </p>
          </div>
          <LuceButton tone="primary" disabled={isLoading} onClick={() => void load(true)}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </LuceButton>
        </div>

        {snapshot.partialFailure && (
          <div
            role="status"
            className="luce-panel px-4 py-2 text-xs flex items-center gap-2"
            style={{ color: luce.warn }}
          >
            <span aria-hidden="true">▲</span>
            <span>
              Some workspaces could not be fully read:{' '}
              {snapshot.failedWorkspaces.map((w) => w.name).join(', ')}. Their items may be missing
              below.
            </span>
          </div>
        )}

        {}
        <div className="grid gap-[2px] lg:grid-cols-[minmax(280px,2fr)_3fr]">
          <HeroGauge pct={healthPct} igniting={igniting} />
          <div className="luce-cluster grid-cols-2 sm:grid-cols-3">
            {tiles.map((tile, idx) => {
              const active = tile.filter !== undefined && tile.filter === activeFilter;
              const hot = tile.filter === 'broken' && counts.broken > 0;
              const inner = (
                <>
                  <div
                    className={`${tile.loud ? 'text-4xl' : 'text-3xl'} font-semibold leading-none${
                      hot ? ' luce-lit luce-lit--hot luce-lit--red' : ''
                    }`}
                    style={{ ...(hot ? {} : { color: tile.color }), ...tabular }}
                  >
                    {tile.value}
                  </div>
                  <div className="mt-2 luce-legend">{tile.label}</div>
                </>
              );
              const entrance = { '--luce-i': idx + 1 } as React.CSSProperties;
              return tile.filter ? (
                <button
                  key={tile.label}
                  className={`luce-panel luce-rise p-4 text-left cursor-pointer${active ? ' luce-tile--active' : ''}`}
                  style={entrance}
                  onClick={() => toggleFilter(tile.filter!)}
                  aria-pressed={active}
                  title={active ? `Clear the ${tile.label} filter` : `Show only ${tile.label.toLowerCase()} items`}
                >
                  {inner}
                </button>
              ) : (
                <div key={tile.label} className="luce-panel luce-rise p-4" style={entrance}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>

        {activeFilter && (
          <button
            className="luce-chip luce-press inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold cursor-pointer border-0"
            style={{ color: luce.accent }}
            onClick={() => setActiveFilter(null)}
            title="Clear filter"
          >
            <span>Showing: {activeTileLabel}</span>
            <span aria-hidden="true">✕</span>
          </button>
        )}

        {}
        <nav
          aria-label="Page sections"
          className="luce-nav sticky top-0 z-10 -mx-2 px-2 py-1.5 flex items-center gap-1 rounded-lg"
        >
          {(
            [
              ['Health', 'insights-health'],
              ...(isOwner ? ([['Admin', 'insights-admin']] as const) : []),
            ] as const
          ).map(([label, id]) => (
            <button
              key={id}
              className="px-2.5 py-1 rounded-lg text-xs uppercase tracking-wider cursor-pointer transition-colors hover:bg-white/5"
              style={{ color: luce.textSecondary }}
              onClick={() => scrollToSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {}
        <section
          id="insights-health"
          aria-labelledby="insights-refresh-heading"
          className="luce-rise"
          style={{ scrollMarginTop: 48, '--luce-i': 7 } as React.CSSProperties}
        >
          <SectionHeading id="insights-refresh-heading" eyebrow="Health" title="Client health board" />
          <p className="text-xs mb-3" style={{ color: luce.textTertiary }}>
            Broken workspaces sort first; every section starts folded — the headers carry the
            damage summary. Dots are the last 12 runs, oldest to newest, left to right.
          </p>
          {groups.length === 0 ? (
            <p className="text-sm" style={{ color: luce.textTertiary }}>
              {activeFilter
                ? `Nothing matches the ${activeTileLabel} filter.`
                : 'No datasets or dataflows are visible to your account.'}
            </p>
          ) : groups.length === 1 ? (
            <HeroTile
              group={groups[0]!}
              access={accessByWs.get(groups[0]!.workspaceId)}
              blast={blast}
              morphSource={!sheet && morphId === groups[0]!.workspaceId}
              onOpen={(el) => openSheet(groups[0]!.workspaceId, el)}
            />
          ) : (
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}
            >
              {groups.map((g) => (
                <WorkspaceTile
                  key={g.workspaceId}
                  group={g}
                  access={accessByWs.get(g.workspaceId)}
                  affectedCount={workspaceAffectedReportCount(g, blast)}
                  morphSource={!sheet && morphId === g.workspaceId}
                  onOpen={(el) => openSheet(g.workspaceId, el)}
                />
              ))}
            </div>
          )}
        </section>

        {}
        {isOwner && (
        <section
          id="insights-admin"
          aria-labelledby="insights-admin-heading"
          className="luce-wing-l"
          style={{ scrollMarginTop: 48, '--luce-i': 2 } as React.CSSProperties}
        >
          <div className="mb-3">
            <SectionHeading
              id="insights-admin-heading"
              eyebrow="Admin"
              title="Admin view — everyone's usage and App audiences"
            />
          </div>

          {!admin && (
            <div className="luce-panel luce-card p-4">
              <p className="text-sm mb-3" style={{ color: luce.textSecondary }}>
                For Fabric administrators: see who opened what across ALL users (last 2 days to
                start) and who has access to each published App. The first unlock may show a
                Microsoft permission window — it can open BEHIND this window, so check your
                taskbar if nothing appears. Approve it once (you can tick "consent on behalf of
                your organization") and it never asks again.
              </p>
              {adminError && (
                <p role="alert" className="text-sm mb-3" style={{ color: luce.broken }}>
                  {adminError}
                </p>
              )}
              {adminLoading ? (
                <div className="flex items-center gap-3" role="status">
                  <Spinner size="tiny" />
                  <span className="text-sm" style={{ color: luce.textSecondary }}>
                    {unlockStageText(unlockElapsedMs)}
                  </span>
                  <LuceButton onClick={cancelAdminLoad}>Cancel</LuceButton>
                </div>
              ) : (
                <LuceButton tone="accent" onClick={() => void loadAdmin(false)}>
                  Unlock admin view
                </LuceButton>
              )}
            </div>
          )}

          {admin && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: luce.textTertiary, ...tabular }}>
                  Last {admin.days} days · checked {relativeAge(admin.generatedAt) || 'just now'}
                  {admin.fromCache ? ' (cached)' : ''}
                  {admin.failedDays > 0 ? ` · ${admin.failedDays} day(s) could not be read — counts are partial` : ''}
                  {admin.truncated ? ' · very high activity — showing a partial count' : ''}
                </span>
                <LuceButton disabled={adminLoading} onClick={() => void loadAdmin(true)}>
                  {adminLoading ? 'Refreshing…' : 'Refresh'}
                </LuceButton>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="luce-panel luce-card overflow-hidden">
                  <div className="luce-tablehead px-3 py-2 luce-legend">What's being used</div>
                  {admin.activityByItem.length === 0 ? (
                    <p className="text-xs p-3" style={{ color: luce.textTertiary }}>
                      No report views recorded in this window.
                    </p>
                  ) : (
                    <table className="w-full text-sm" style={tabular}>
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Report</th>
                          <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Views</th>
                          <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>People</th>
                          <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Last viewed</th>
                        </tr>
                      </thead>
                      <tbody className="luce-groove">
                        {admin.activityByItem.slice(0, 15).map((it) => (
                          <tr key={it.name} className="transition-colors hover:bg-white/[0.03]">
                            <td className="px-3 py-1.5" style={{ color: luce.textPrimary }}>{it.name}</td>
                            <td className="px-3 py-1.5" style={{ color: luce.textSecondary }}>{it.views}</td>
                            <td className="px-3 py-1.5" style={{ color: luce.textSecondary }}>{it.uniqueUsers}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: luce.textTertiary }}>
                              {relativeAge(it.lastViewed) || formatTime(it.lastViewed)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="luce-panel luce-card overflow-hidden">
                  <div className="luce-tablehead px-3 py-2 luce-legend">Who's using it</div>
                  {admin.activityByUser.length === 0 ? (
                    <p className="text-xs p-3" style={{ color: luce.textTertiary }}>
                      No user activity recorded in this window.
                    </p>
                  ) : (
                    <table className="w-full text-sm" style={tabular}>
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>User</th>
                          <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Views</th>
                          <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Last active</th>
                        </tr>
                      </thead>
                      <tbody className="luce-groove">
                        {admin.activityByUser.slice(0, 15).map((u) => (
                          <tr key={u.user} className="transition-colors hover:bg-white/[0.03]">
                            <td className="px-3 py-1.5" style={{ color: luce.textPrimary }}>{u.user}</td>
                            <td className="px-3 py-1.5" style={{ color: luce.textSecondary }}>{u.views}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: luce.textTertiary }}>
                              {relativeAge(u.lastActive) || formatTime(u.lastActive)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2" style={{ color: luce.textPrimary }}>
                  App audiences — who can open each published App
                </div>
                <div className="space-y-2">
                  {admin.appAudiences.length === 0 && (
                    <p className="text-xs" style={{ color: luce.textTertiary }}>
                      No published Apps visible to this account.
                    </p>
                  )}
                  {admin.appAudiences.map((app) => (
                    <div key={app.appId} className="luce-panel luce-card overflow-hidden">
                      <button
                        className="luce-press w-full flex items-center justify-between px-4 py-2.5 text-left cursor-pointer hover:bg-white/[0.03]"
                        onClick={() =>
                          setExpandedApps((prev) => {
                            const next = new Set(prev);
                            if (next.has(app.appId)) next.delete(app.appId);
                            else next.add(app.appId);
                            return next;
                          })
                        }
                        aria-expanded={expandedApps.has(app.appId)}
                      >
                        <span className="flex items-center gap-2 text-sm" style={{ color: luce.textPrimary }}>
                          <span
                            aria-hidden="true"
                            className="inline-block text-xs"
                            style={{
                              color: luce.textTertiary,
                              transform: expandedApps.has(app.appId) ? 'rotate(90deg)' : 'none',
                              transition: 'transform 250ms var(--spring-settle)',
                            }}
                          >
                            ▸
                          </span>
                          {app.appName}
                        </span>
                        <span className="text-xs" style={{ color: luce.textTertiary, ...tabular }}>
                          {app.users === null ? 'audience not readable' : `${app.users.length} member(s)`}
                        </span>
                      </button>
                      {expandedApps.has(app.appId) && app.users !== null && (
                        <div className="luce-groove px-4 pb-3" style={{ borderTop: '1px solid rgba(0,0,0,0.45)' }}>
                          {app.users.map((u, i) => (
                            <div key={`${u.email || u.name}-${i}`} className="flex items-center justify-between py-1.5">
                              <div>
                                <div className="text-sm" style={{ color: luce.textPrimary }}>{u.name}</div>
                                {u.email && (
                                  <div className="text-xs" style={{ color: luce.textTertiary }}>
                                    {u.email}
                                  </div>
                                )}
                              </div>
                              <span
                                className="luce-chip px-2 py-0.5 text-[11px]"
                                style={{ color: luce.textSecondary }}
                              >
                                {u.accessRight}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
        )}
      </div>
      {}
      {sheetGroup && (
        <WorkspaceSheet
          group={sheetGroup}
          access={accessByWs.get(sheetGroup.workspaceId)}
          blast={blast}
          reports={snapshot.reports ?? []}
          usage={frequent.filter((f) => f.workspaceId === sheetGroup.workspaceId)}
          catalog={catalog.filter((c) => c.workspaceId === sheetGroup.workspaceId)}
          settled={sheetSettled}
          onClose={closeSheet}
        />
      )}
    </div>
  );
};

export default InsightsPage;