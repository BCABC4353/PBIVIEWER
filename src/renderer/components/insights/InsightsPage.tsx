import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import { useAuthStore } from '../../stores/auth-store';
import type {
  InsightsSnapshot,
  InsightsRefreshable,
  ContentItem,
  AdminInsights,
} from '../../../shared/types';
import {
  luce,
  statusGlyph,
  statusColor,
  statusLabel,
  downForLabel,
  failureRateCaption,
  dotStripCells,
  groupByWorkspace,
  groupSummaryLabel,
  unlockStageText,
  type WorkspaceGroup,
} from './insights-luce';

/**
 * Insights — the data-health board, in the Luce design language.
 *
 * THIS PAGE ONLY goes dark (owner request): near-black canvas, surfaces
 * lifted by light, one amber accent, red reserved strictly for broken.
 * Status is always shape + color + label; numbers are tabular.
 *
 * Everything here is scoped to the signed-in user's token: each user sees
 * exactly the workspaces, datasets, dataflows, and access lists they are
 * allowed to see, so the page is safe to expose to every client.
 *
 * Sections:
 *   1. Summary tiles — Broken / Overdue / Running / Healthy / Workspaces.
 *   2. Health board — items grouped by workspace (client), worst first,
 *      with down-for durations and 12-run history dot strips.
 *   3. Workspace access — who can see what.
 *   4. Your usage + the admin tier (App audiences, tenant activity).
 */

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeAge(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function triggerLabel(refreshType?: string): string {
  if (!refreshType) return '—';
  if (refreshType === 'ViaApi') return 'Power Automate / API';
  if (refreshType === 'OnDemand') return 'Manual';
  return refreshType; // 'Scheduled' and any future values render as-is
}

const tabular: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };
const hairlineBorder = `1px solid ${luce.hairline}`;

// ---------------------------------------------------------------------------
// Small Luce primitives (scoped to this page)
// ---------------------------------------------------------------------------

const LuceButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'accent' | 'quiet' }
> = ({ tone = 'quiet', style, children, ...rest }) => (
  <button
    {...rest}
    className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40"
    style={{
      border: tone === 'accent' ? `1px solid ${luce.accent}55` : hairlineBorder,
      background: tone === 'accent' ? `${luce.accent}1F` : luce.surface1,
      color: tone === 'accent' ? luce.accent : luce.textSecondary,
      ...style,
    }}
  >
    {children}
  </button>
);

const StatusChip: React.FC<{ status: InsightsRefreshable['lastStatus'] }> = ({ status }) => {
  const color = statusColor[status];
  const tint = status === 'Disabled' ? 'rgba(255,255,255,0.06)' : `${color}24`;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
      style={{ color, background: tint, border: `1px solid ${status === 'Disabled' ? luce.hairline : `${color}33`}` }}
    >
      <span aria-hidden="true">{statusGlyph[status]}</span>
      <span>{statusLabel[status]}</span>
    </span>
  );
};

const OverdueChip: React.FC<{ scheduleSummary?: string }> = ({ scheduleSummary }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
    style={{ color: luce.warn, background: `${luce.warn}24`, border: `1px solid ${luce.warn}33` }}
    title={`Schedule: ${scheduleSummary || 'enabled'} — but no recent successful refresh`}
  >
    <span aria-hidden="true">▲</span>
    <span>Overdue</span>
  </span>
);

/** 12 dots, oldest → newest: green ok / red fail / hollow none. */
const RunDotStrip: React.FC<{ runs?: InsightsRefreshable['recentRuns'] }> = ({ runs }) => {
  const cells = dotStripCells(runs);
  const label = failureRateCaption(runs);
  return (
    <div className="flex flex-col items-start gap-1" data-testid="run-dot-strip">
      <div className="flex items-center gap-[3px]" aria-hidden="true">
        {cells.map((c, i) => (
          <span
            key={i}
            title={c.endTime ? `${c.state === 'ok' ? 'OK' : 'Failed'} · ${formatTime(c.endTime)}` : undefined}
            className="inline-block w-[7px] h-[7px] rounded-full"
            style={
              c.state === 'ok'
                ? { background: luce.ok }
                : c.state === 'fail'
                  ? { background: luce.broken }
                  : { background: 'transparent', border: hairlineBorder }
            }
          />
        ))}
      </div>
      {label ? (
        <span className="text-[11px]" style={{ color: luce.broken, ...tabular }}>
          {label}
        </span>
      ) : (
        <span className="text-[11px]" style={{ color: luce.textTertiary }}>
          last {Math.min(runs?.length ?? 0, 12) || '—'} runs
        </span>
      )}
    </div>
  );
};

const RefreshableRow: React.FC<{ item: InsightsRefreshable }> = ({ item }) => {
  const down = downForLabel(item);
  return (
    <div
      role="row"
      className="grid items-center gap-3 px-4 py-3"
      style={{ gridTemplateColumns: 'minmax(220px, 2fr) minmax(120px, 1fr) minmax(150px, 1fr) minmax(160px, 1fr)' }}
    >
      {/* Name + status */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={item.lastStatus} />
          {item.scheduleOverdue && <OverdueChip scheduleSummary={item.scheduleSummary} />}
          <span className="truncate text-sm font-medium" style={{ color: luce.textPrimary }}>
            {item.name}
          </span>
          <span
            className="px-1.5 py-px rounded text-[10px] uppercase tracking-wider"
            style={{ color: luce.textTertiary, border: hairlineBorder }}
          >
            {item.kind}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[12px]" style={{ color: luce.textTertiary }}>
          {down && (
            <span className="font-semibold" style={{ color: luce.broken, ...tabular }}>
              {down}
            </span>
          )}
          {item.errorCode && (
            <span title={`Power BI error: ${item.errorCode}`} className="truncate" style={{ color: luce.textTertiary }}>
              {item.errorCode}
            </span>
          )}
        </div>
      </div>

      {/* Run history */}
      <RunDotStrip runs={item.recentRuns} />

      {/* Last success */}
      <div className="text-xs whitespace-nowrap" style={{ color: luce.textSecondary, ...tabular }}>
        {formatTime(item.lastSuccessTime)}
        {item.lastSuccessTime && (
          <span style={{ color: luce.textTertiary }}> · {relativeAge(item.lastSuccessTime)}</span>
        )}
        <div style={{ color: luce.textTertiary }}>last success</div>
      </div>

      {/* Trigger + owner */}
      <div className="text-xs min-w-0" style={{ color: luce.textTertiary }}>
        <div className="truncate" style={{ color: luce.textSecondary }}>
          {item.kind === 'dataset' ? triggerLabel(item.lastRefreshType) : '—'}
        </div>
        <div className="truncate">{item.configuredBy || '—'}</div>
      </div>
    </div>
  );
};

const WorkspaceSection: React.FC<{
  group: WorkspaceGroup;
  expanded: boolean;
  onToggle: () => void;
}> = ({ group, expanded, onToggle }) => (
  <div className="rounded-xl overflow-hidden" style={{ background: luce.surface1, border: hairlineBorder }}>
    <button
      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      onClick={onToggle}
      aria-expanded={expanded}
      style={{ background: expanded ? luce.surface2 : 'transparent' }}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span aria-hidden="true" className="text-sm" style={{ color: statusColor[group.worst] }}>
          {statusGlyph[group.worst]}
        </span>
        <span className="truncate text-sm font-semibold" style={{ color: luce.textPrimary }}>
          {group.workspaceName}
        </span>
      </span>
      <span className="flex items-center gap-3 shrink-0">
        <span className="text-xs" style={{ color: group.counts.broken > 0 ? luce.broken : luce.textTertiary, ...tabular }}>
          {groupSummaryLabel(group)}
        </span>
        <span aria-hidden="true" className="text-xs" style={{ color: luce.textTertiary }}>
          {expanded ? '▾' : '▸'}
        </span>
      </span>
    </button>
    {expanded && (
      <div role="rowgroup" className="divide-y divide-[rgba(255,255,255,0.08)]" style={{ borderTop: hairlineBorder }}>
        {group.items.map((r) => (
          <RefreshableRow key={`${r.kind}-${r.id}`} item={r} />
        ))}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [snapshot, setSnapshot] = useState<InsightsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWs, setExpandedWs] = useState<Set<string>>(new Set());
  // Group expansion: null until the user touches a section, so the
  // broken-first defaults apply when a fresh snapshot lands.
  const [groupOverrides, setGroupOverrides] = useState<Map<string, boolean>>(new Map());

  // Admin tier — loaded only on explicit request so the incremental-consent
  // window can never appear unprompted.
  const [admin, setAdmin] = useState<AdminInsights | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());
  // Staged honest loading copy (local timer only — no IPC changes).
  const [unlockElapsedMs, setUnlockElapsedMs] = useState(0);
  // Generation counter: Cancel bumps it, so a stale in-flight result is
  // discarded client-side (the main-process call simply finishes unobserved).
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
      if (gen !== adminGen.current) return; // cancelled — discard the result
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

  // Usage cross-reference: most-opened (frequent) + the full catalog so we can
  // derive "items you have access to but have never opened".
  const [frequent, setFrequent] = useState<ContentItem[]>([]);
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; workspaceName: string; type: string }>>([]);

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
          const wsName = new Map(itemsResp.data.workspaces.map((w) => [w.id, w.name]));
          setCatalog([
            ...itemsResp.data.reports.map((r) => ({
              id: r.id,
              name: r.name,
              workspaceName: wsName.get(r.workspaceId) || '',
              type: 'Report',
            })),
            ...itemsResp.data.dashboards.map((d) => ({
              id: d.id,
              name: d.name,
              workspaceName: wsName.get(d.workspaceId) || '',
              type: 'Dashboard',
            })),
          ]);
        }
      } catch {
        /* usage cross-reference is best-effort; the health board still renders */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const groups = useMemo(
    () => groupByWorkspace(snapshot?.refreshables ?? []),
    [snapshot],
  );

  const counts = useMemo(() => {
    const c = { ok: 0, broken: 0, overdue: 0, running: 0 };
    for (const r of snapshot?.refreshables ?? []) {
      if (r.lastStatus === 'Failed' || r.lastStatus === 'Cancelled') c.broken++;
      else if (r.lastStatus === 'InProgress') c.running++;
      else if (r.lastStatus === 'Completed') c.ok++;
      if (r.scheduleOverdue) c.overdue++;
    }
    return c;
  }, [snapshot]);

  const neverOpened = useMemo(() => {
    if (catalog.length === 0) return [];
    const openedIds = new Set(frequent.map((f) => f.id));
    return catalog.filter((c) => !openedIds.has(c.id)).slice(0, 15);
  }, [catalog, frequent]);

  const toggleWs = (id: string) => {
    setExpandedWs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isGroupExpanded = (g: WorkspaceGroup) => groupOverrides.get(g.workspaceId) ?? g.defaultExpanded;
  const toggleGroup = (g: WorkspaceGroup) => {
    setGroupOverrides((prev) => {
      const next = new Map(prev);
      next.set(g.workspaceId, !isGroupExpanded(g));
      return next;
    });
  };

  if (isLoading && !snapshot) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: luce.canvas }}>
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
      <div className="h-full flex items-center justify-center" role="alert" style={{ background: luce.canvas }}>
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

  const tiles: Array<{ label: string; value: number; color: string; loud: boolean }> = [
    { label: 'Broken', value: counts.broken, color: counts.broken > 0 ? luce.broken : luce.textTertiary, loud: counts.broken > 0 },
    { label: 'Overdue', value: counts.overdue, color: counts.overdue > 0 ? luce.warn : luce.textTertiary, loud: counts.overdue > 0 && counts.broken === 0 },
    { label: 'Running', value: counts.running, color: counts.running > 0 ? luce.accent : luce.textTertiary, loud: false },
    { label: 'Healthy', value: counts.ok, color: luce.ok, loud: counts.broken === 0 && counts.overdue === 0 },
    { label: 'Workspaces', value: snapshot.workspaceCount, color: luce.textPrimary, loud: false },
  ];

  return (
    <div className="h-full overflow-y-auto" style={{ background: luce.canvas, color: luce.textSecondary }}>
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: luce.textPrimary }}>
              Insights
            </h1>
            <p className="text-sm" style={{ color: luce.textTertiary }}>
              Every client workspace, one board — refreshes, access, and usage. Snapshot from{' '}
              {formatTime(snapshot.generatedAt)}
              {snapshot.fromCache ? ' (cached)' : ''}.
            </p>
          </div>
          <LuceButton disabled={isLoading} onClick={() => void load(true)}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </LuceButton>
        </div>

        {snapshot.partialFailure && (
          <div
            role="status"
            className="px-4 py-2 rounded-lg text-xs"
            style={{ background: `${luce.warn}1A`, border: `1px solid ${luce.warn}33`, color: luce.warn }}
          >
            Some workspaces could not be fully read:{' '}
            {snapshot.failedWorkspaces.map((w) => w.name).join(', ')}. Their items may be missing
            below.
          </div>
        )}

        {/* Summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl p-4"
              style={{
                background: tile.loud ? luce.surface2 : luce.surface1,
                border: tile.loud ? `1px solid ${tile.color}40` : hairlineBorder,
              }}
            >
              <div
                className={tile.loud ? 'text-4xl font-semibold' : 'text-3xl font-semibold'}
                style={{ color: tile.color, ...tabular }}
              >
                {tile.value}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>
                {tile.label}
              </div>
            </div>
          ))}
        </div>

        {/* Health board, grouped by workspace (client) */}
        <section aria-labelledby="insights-refresh-heading">
          <h2 id="insights-refresh-heading" className="text-lg font-semibold mb-1" style={{ color: luce.textPrimary }}>
            Client health board
          </h2>
          <p className="text-xs mb-3" style={{ color: luce.textTertiary }}>
            Broken workspaces first and opened for you; quiet ones stay folded. Dots are the last
            12 runs, oldest to newest.
          </p>
          {groups.length === 0 ? (
            <p className="text-sm" style={{ color: luce.textTertiary }}>
              No datasets or dataflows are visible to your account.
            </p>
          ) : (
            <div className="space-y-2.5">
              {groups.map((g) => (
                <WorkspaceSection
                  key={g.workspaceId}
                  group={g}
                  expanded={isGroupExpanded(g)}
                  onToggle={() => toggleGroup(g)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Workspace access */}
        <section aria-labelledby="insights-access-heading">
          <h2 id="insights-access-heading" className="text-lg font-semibold mb-1" style={{ color: luce.textPrimary }}>
            Who has access
          </h2>
          <p className="text-xs mb-3" style={{ color: luce.textTertiary }}>
            Workspace members only. People who reach your content through a published Power BI
            App (App audiences) are not listed — Microsoft restricts that list to tenant admins.
          </p>
          <div className="space-y-2">
            {snapshot.access.map((ws) => (
              <div key={ws.workspaceId} className="rounded-xl overflow-hidden" style={{ background: luce.surface1, border: hairlineBorder }}>
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                  onClick={() => toggleWs(ws.workspaceId)}
                  aria-expanded={expandedWs.has(ws.workspaceId)}
                >
                  <span className="flex items-center gap-2 text-sm" style={{ color: luce.textPrimary }}>
                    <span aria-hidden="true" className="text-xs" style={{ color: luce.textTertiary }}>
                      {expandedWs.has(ws.workspaceId) ? '▾' : '▸'}
                    </span>
                    {ws.workspaceName}
                  </span>
                  <span className="text-xs" style={{ color: luce.textTertiary, ...tabular }}>
                    {ws.users === null ? 'access list not visible to you' : `${ws.users.length} member(s)`}
                  </span>
                </button>
                {expandedWs.has(ws.workspaceId) && ws.users !== null && (
                  <div className="px-4 pb-3 divide-y divide-[rgba(255,255,255,0.08)]">
                    {ws.users.map((u, i) => (
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
                          className="px-2 py-0.5 rounded-full text-[11px]"
                          style={{ color: luce.textSecondary, border: hairlineBorder }}
                        >
                          {u.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Your usage */}
        <section aria-labelledby="insights-usage-heading">
          <h2 id="insights-usage-heading" className="text-lg font-semibold mb-3" style={{ color: luce.textPrimary }}>
            Your usage
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl p-3" style={{ background: luce.surface1, border: hairlineBorder }}>
              <div className="text-sm font-semibold mb-2" style={{ color: luce.textPrimary }}>
                You open most
              </div>
              {frequent.length === 0 ? (
                <p className="text-xs" style={{ color: luce.textTertiary }}>
                  Nothing tracked yet — open a few reports first.
                </p>
              ) : (
                <div className="space-y-1">
                  {frequent.slice(0, 8).map((f) => (
                    <button
                      key={f.id}
                      className="w-full text-left px-2 py-1 rounded-lg hover:bg-white/5"
                      onClick={() =>
                        navigate(
                          f.type === 'dashboard'
                            ? `/dashboard/${f.workspaceId}/${f.id}`
                            : `/report/${f.workspaceId}/${f.id}`,
                        )
                      }
                    >
                      <div className="text-sm" style={{ color: luce.textPrimary }}>{f.name}</div>
                      <div className="text-xs" style={{ color: luce.textTertiary }}>
                        {f.workspaceName}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl p-3" style={{ background: luce.surface1, border: hairlineBorder }}>
              <div className="text-sm font-semibold mb-2" style={{ color: luce.textPrimary }}>
                Never opened by you
              </div>
              {neverOpened.length === 0 ? (
                <p className="text-xs" style={{ color: luce.textTertiary }}>
                  {catalog.length === 0 ? 'Catalog still loading…' : "You've opened everything you can see."}
                </p>
              ) : (
                <div className="space-y-1">
                  {neverOpened.map((c) => (
                    <div key={c.id} className="px-2 py-1">
                      <div className="text-sm" style={{ color: luce.textPrimary }}>{c.name}</div>
                      <div className="text-xs" style={{ color: luce.textTertiary }}>
                        {c.type} · {c.workspaceName}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: luce.textTertiary }}>
            Usage above is what this app has recorded for your account on this computer. The
            admin view below adds tenant-wide activity for Fabric administrators.
          </p>
        </section>

        {/* Admin tier — App audiences + tenant activity (Fabric admin only) */}
        <section aria-labelledby="insights-admin-heading">
          <h2 id="insights-admin-heading" className="text-lg font-semibold mb-3" style={{ color: luce.textPrimary }}>
            Admin view — everyone's usage and App audiences
          </h2>

          {!admin && (
            <div className="rounded-xl p-4" style={{ background: luce.surface1, border: hairlineBorder }}>
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
                  Last {admin.days} days · snapshot {formatTime(admin.generatedAt)}
                  {admin.fromCache ? ' (cached)' : ''}
                  {admin.failedDays > 0 ? ` · ${admin.failedDays} day(s) could not be read — counts are partial` : ''}
                  {admin.truncated ? ' · very high activity — showing a partial count' : ''}
                </span>
                <LuceButton disabled={adminLoading} onClick={() => void loadAdmin(true)}>
                  {adminLoading ? 'Refreshing…' : 'Refresh'}
                </LuceButton>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl overflow-hidden" style={{ background: luce.surface1, border: hairlineBorder }}>
                  <div className="px-3 py-2 text-sm font-semibold" style={{ background: luce.surface2, color: luce.textPrimary }}>
                    What's being used
                  </div>
                  {admin.activityByItem.length === 0 ? (
                    <p className="text-xs p-3" style={{ color: luce.textTertiary }}>
                      No report views recorded in this window.
                    </p>
                  ) : (
                    <table className="w-full text-sm" style={tabular}>
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-1.5 font-medium text-xs" style={{ color: luce.textTertiary }}>Report</th>
                          <th className="px-3 py-1.5 font-medium text-xs" style={{ color: luce.textTertiary }}>Views</th>
                          <th className="px-3 py-1.5 font-medium text-xs" style={{ color: luce.textTertiary }}>People</th>
                          <th className="px-3 py-1.5 font-medium text-xs" style={{ color: luce.textTertiary }}>Last viewed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
                        {admin.activityByItem.slice(0, 15).map((it) => (
                          <tr key={it.name}>
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

                <div className="rounded-xl overflow-hidden" style={{ background: luce.surface1, border: hairlineBorder }}>
                  <div className="px-3 py-2 text-sm font-semibold" style={{ background: luce.surface2, color: luce.textPrimary }}>
                    Who's using it
                  </div>
                  {admin.activityByUser.length === 0 ? (
                    <p className="text-xs p-3" style={{ color: luce.textTertiary }}>
                      No user activity recorded in this window.
                    </p>
                  ) : (
                    <table className="w-full text-sm" style={tabular}>
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-1.5 font-medium text-xs" style={{ color: luce.textTertiary }}>User</th>
                          <th className="px-3 py-1.5 font-medium text-xs" style={{ color: luce.textTertiary }}>Views</th>
                          <th className="px-3 py-1.5 font-medium text-xs" style={{ color: luce.textTertiary }}>Last active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
                        {admin.activityByUser.slice(0, 15).map((u) => (
                          <tr key={u.user}>
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
                    <div key={app.appId} className="rounded-xl overflow-hidden" style={{ background: luce.surface1, border: hairlineBorder }}>
                      <button
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
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
                          <span aria-hidden="true" className="text-xs" style={{ color: luce.textTertiary }}>
                            {expandedApps.has(app.appId) ? '▾' : '▸'}
                          </span>
                          {app.appName}
                        </span>
                        <span className="text-xs" style={{ color: luce.textTertiary, ...tabular }}>
                          {app.users === null ? 'audience not readable' : `${app.users.length} member(s)`}
                        </span>
                      </button>
                      {expandedApps.has(app.appId) && app.users !== null && (
                        <div className="px-4 pb-3 divide-y divide-[rgba(255,255,255,0.08)]">
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
                                className="px-2 py-0.5 rounded-full text-[11px]"
                                style={{ color: luce.textSecondary, border: hairlineBorder }}
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
      </div>
    </div>
  );
};

export default InsightsPage;
