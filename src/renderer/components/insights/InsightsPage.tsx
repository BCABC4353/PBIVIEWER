import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, Text, Button, Badge, Tooltip } from '@fluentui/react-components';
import {
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  ClockRegular,
  PeopleRegular,
  DatabaseRegular,
  ChevronDownRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import type { InsightsSnapshot, InsightsRefreshable, ContentItem } from '../../../shared/types';

/**
 * Insights — the data-health one-pager.
 *
 * Everything here is scoped to the signed-in user's token: each user sees
 * exactly the workspaces, datasets, dataflows, and access lists they are
 * allowed to see, so the page is safe to expose to every client.
 *
 * Sections:
 *   1. Summary chips (healthy / broken / never-refreshed counts).
 *   2. Refresh health table — every dataset + dataflow, worst first.
 *   3. Workspace access — who can see what (hidden where not visible).
 *   4. Your usage — most-opened items and items never opened by you.
 */

const statusOrder: Record<InsightsRefreshable['lastStatus'], number> = {
  Failed: 0,
  Cancelled: 1,
  Never: 2,
  InProgress: 3,
  Completed: 4,
  Disabled: 5,
};

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

const StatusBadge: React.FC<{ item: InsightsRefreshable }> = ({ item }) => {
  switch (item.lastStatus) {
    case 'Completed':
      return (
        <Badge appearance="tint" color="success" icon={<CheckmarkCircleRegular />}>
          OK
        </Badge>
      );
    case 'Failed':
      return (
        <Tooltip
          content={item.errorCode ? `Power BI error: ${item.errorCode}` : 'The last refresh failed'}
          relationship="description"
        >
          <Badge appearance="tint" color="danger" icon={<DismissCircleRegular />}>
            Failed
          </Badge>
        </Tooltip>
      );
    case 'InProgress':
      return (
        <Badge appearance="tint" color="brand" icon={<ClockRegular />}>
          Running
        </Badge>
      );
    case 'Cancelled':
      return (
        <Badge appearance="tint" color="warning">
          Cancelled
        </Badge>
      );
    case 'Never':
      return (
        <Tooltip content="No refresh has ever run" relationship="description">
          <Badge appearance="tint" color="warning">
            Never
          </Badge>
        </Tooltip>
      );
    case 'Disabled':
      return (
        <Tooltip
          content="This dataset doesn't use scheduled refresh (e.g. live connection)"
          relationship="description"
        >
          <Badge appearance="tint" color="informative">
            Live
          </Badge>
        </Tooltip>
      );
  }
};

export const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [snapshot, setSnapshot] = useState<InsightsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWs, setExpandedWs] = useState<Set<string>>(new Set());

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

  const sortedRefreshables = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.refreshables].sort((a, b) => {
      const byStatus = statusOrder[a.lastStatus] - statusOrder[b.lastStatus];
      if (byStatus !== 0) return byStatus;
      return a.workspaceName.localeCompare(b.workspaceName) || a.name.localeCompare(b.name);
    });
  }, [snapshot]);

  const counts = useMemo(() => {
    const c = { ok: 0, failed: 0, never: 0, live: 0, running: 0 };
    for (const r of snapshot?.refreshables ?? []) {
      if (r.lastStatus === 'Completed') c.ok++;
      else if (r.lastStatus === 'Failed' || r.lastStatus === 'Cancelled') c.failed++;
      else if (r.lastStatus === 'Never') c.never++;
      else if (r.lastStatus === 'Disabled') c.live++;
      else c.running++;
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

  if (isLoading && !snapshot) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="large" />
          <Text className="mt-4 text-neutral-foreground-2 block">
            Checking every dataset and dataflow you can see…
          </Text>
        </div>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="h-full flex items-center justify-center" role="alert">
        <div className="text-center max-w-md">
          <Text className="text-status-error block mb-4">{error}</Text>
          <Button appearance="primary" onClick={() => void load(true)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-foreground-1">Insights</h1>
            <Text className="text-neutral-foreground-3 text-sm">
              Everything you can see, in one place — refreshes, access, and usage.
              Snapshot from {formatTime(snapshot.generatedAt)}
              {snapshot.fromCache ? ' (cached)' : ''}.
            </Text>
          </div>
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            disabled={isLoading}
            onClick={() => void load(true)}
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {snapshot.partialFailure && (
          <div role="status" className="px-4 py-2 rounded bg-status-warning/10">
            <Text size={200} className="text-status-warning">
              Some workspaces could not be fully read:{' '}
              {snapshot.failedWorkspaces.map((w) => w.name).join(', ')}. Their items may be missing
              below.
            </Text>
          </div>
        )}

        {/* Summary chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Healthy', value: counts.ok, tone: 'text-status-success' },
            { label: 'Broken', value: counts.failed, tone: counts.failed > 0 ? 'text-status-error' : 'text-neutral-foreground-1' },
            { label: 'Never refreshed', value: counts.never, tone: counts.never > 0 ? 'text-status-warning' : 'text-neutral-foreground-1' },
            { label: 'Live / no schedule', value: counts.live, tone: 'text-neutral-foreground-1' },
            { label: 'Workspaces', value: snapshot.workspaceCount, tone: 'text-neutral-foreground-1' },
            { label: 'Reports', value: snapshot.reportCount, tone: 'text-neutral-foreground-1' },
          ].map((chip) => (
            <div
              key={chip.label}
              className="rounded-lg border border-neutral-stroke-2 bg-neutral-background-2 p-3 text-center"
            >
              <div className={`text-2xl font-semibold ${chip.tone}`}>{chip.value}</div>
              <Text size={200} className="text-neutral-foreground-3">
                {chip.label}
              </Text>
            </div>
          ))}
        </div>

        {/* Refresh health */}
        <section aria-labelledby="insights-refresh-heading">
          <div className="flex items-center gap-2 mb-3">
            <DatabaseRegular className="text-accent-primary" />
            <h2 id="insights-refresh-heading" className="text-lg font-semibold text-neutral-foreground-1">
              What's refreshing — and what's broken
            </h2>
          </div>
          {sortedRefreshables.length === 0 ? (
            <Text className="text-neutral-foreground-3">
              No datasets or dataflows are visible to your account.
            </Text>
          ) : (
            <div className="rounded-lg border border-neutral-stroke-2 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-background-2 text-left">
                    <th className="px-3 py-2 font-medium text-neutral-foreground-2">Status</th>
                    <th className="px-3 py-2 font-medium text-neutral-foreground-2">Name</th>
                    <th className="px-3 py-2 font-medium text-neutral-foreground-2">Type</th>
                    <th className="px-3 py-2 font-medium text-neutral-foreground-2">Workspace</th>
                    <th className="px-3 py-2 font-medium text-neutral-foreground-2">Last success</th>
                    <th className="px-3 py-2 font-medium text-neutral-foreground-2">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-stroke-2">
                  {sortedRefreshables.map((r) => (
                    <tr key={`${r.kind}-${r.workspaceId}-${r.id}`} className="bg-neutral-background-1">
                      <td className="px-3 py-2">
                        <StatusBadge item={r} />
                      </td>
                      <td className="px-3 py-2 text-neutral-foreground-1">{r.name}</td>
                      <td className="px-3 py-2 text-neutral-foreground-3 capitalize">{r.kind}</td>
                      <td className="px-3 py-2 text-neutral-foreground-3">{r.workspaceName}</td>
                      <td className="px-3 py-2 text-neutral-foreground-3 whitespace-nowrap">
                        {formatTime(r.lastSuccessTime)}
                        {r.lastSuccessTime && (
                          <span className="text-neutral-foreground-3"> · {relativeAge(r.lastSuccessTime)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-neutral-foreground-3">{r.configuredBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Workspace access */}
        <section aria-labelledby="insights-access-heading">
          <div className="flex items-center gap-2 mb-3">
            <PeopleRegular className="text-accent-primary" />
            <h2 id="insights-access-heading" className="text-lg font-semibold text-neutral-foreground-1">
              Who has access
            </h2>
          </div>
          <Text size={200} className="text-neutral-foreground-3 block mb-3">
            Workspace members only. People who reach your content through a published Power BI
            App (App audiences) are not listed — Microsoft restricts that list to tenant admins.
          </Text>
          <div className="space-y-2">
            {snapshot.access.map((ws) => (
              <div key={ws.workspaceId} className="rounded-lg border border-neutral-stroke-2">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-neutral-background-2"
                  onClick={() => toggleWs(ws.workspaceId)}
                  aria-expanded={expandedWs.has(ws.workspaceId)}
                >
                  <span className="flex items-center gap-2 text-neutral-foreground-1">
                    {expandedWs.has(ws.workspaceId) ? <ChevronDownRegular /> : <ChevronRightRegular />}
                    {ws.workspaceName}
                  </span>
                  <Text size={200} className="text-neutral-foreground-3">
                    {ws.users === null ? 'access list not visible to you' : `${ws.users.length} member(s)`}
                  </Text>
                </button>
                {expandedWs.has(ws.workspaceId) && ws.users !== null && (
                  <div className="px-3 pb-3 divide-y divide-neutral-stroke-2">
                    {ws.users.map((u, i) => (
                      <div key={`${u.email || u.name}-${i}`} className="flex items-center justify-between py-1.5">
                        <div>
                          <Text className="text-neutral-foreground-1 block">{u.name}</Text>
                          {u.email && (
                            <Text size={200} className="text-neutral-foreground-3">
                              {u.email}
                            </Text>
                          )}
                        </div>
                        <Badge appearance="outline" size="small">
                          {u.role}
                        </Badge>
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
          <div className="flex items-center gap-2 mb-3">
            <ClockRegular className="text-accent-primary" />
            <h2 id="insights-usage-heading" className="text-lg font-semibold text-neutral-foreground-1">
              Your usage
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-neutral-stroke-2 p-3">
              <Text weight="semibold" className="text-neutral-foreground-1 block mb-2">
                You open most
              </Text>
              {frequent.length === 0 ? (
                <Text size={200} className="text-neutral-foreground-3">
                  Nothing tracked yet — open a few reports first.
                </Text>
              ) : (
                <div className="space-y-1">
                  {frequent.slice(0, 8).map((f) => (
                    <button
                      key={f.id}
                      className="w-full text-left px-2 py-1 rounded hover:bg-neutral-background-2"
                      onClick={() =>
                        navigate(
                          f.type === 'dashboard'
                            ? `/dashboard/${f.workspaceId}/${f.id}`
                            : `/report/${f.workspaceId}/${f.id}`,
                        )
                      }
                    >
                      <Text className="text-neutral-foreground-1">{f.name}</Text>
                      <Text size={200} className="text-neutral-foreground-3 block">
                        {f.workspaceName}
                      </Text>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-neutral-stroke-2 p-3">
              <Text weight="semibold" className="text-neutral-foreground-1 block mb-2">
                Never opened by you
              </Text>
              {neverOpened.length === 0 ? (
                <Text size={200} className="text-neutral-foreground-3">
                  {catalog.length === 0 ? 'Catalog still loading…' : "You've opened everything you can see."}
                </Text>
              ) : (
                <div className="space-y-1">
                  {neverOpened.map((c) => (
                    <div key={c.id} className="px-2 py-1">
                      <Text className="text-neutral-foreground-1">{c.name}</Text>
                      <Text size={200} className="text-neutral-foreground-3 block">
                        {c.type} · {c.workspaceName}
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Text size={200} className="text-neutral-foreground-3 block mt-2">
            Usage is what this app has recorded for your account on this computer. Tenant-wide
            usage (every user's activity) requires Power BI admin permissions and is deliberately
            not collected here.
          </Text>
        </section>
      </div>
    </div>
  );
};

export default InsightsPage;
