import React, { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Spinner } from '@fluentui/react-components';
import { useAuthStore } from '../../stores/auth-store';
import { luce, workspaceAffectedReportCount, type TileFilter } from './insights-luce';
import { prefersReducedMotion, useIgnition, useDocumentHidden } from './luce-motion';
import { relativeAge, tabular } from './insights-shared';
import { LuceButton } from './LuceButton';
import { SectionHeading } from './SectionHeading';
import { HeroGauge } from './HeroGauge';
import { HeroTile } from './HeroTile';
import { WorkspaceTile } from './WorkspaceTile';
import { WorkspaceSheet } from './WorkspaceSheet';
import { InsightsAdmin } from './InsightsAdmin';
import { useSheetMorph, type SheetState } from './use-sheet-morph';
import { useInsightsData } from './use-insights-data';
import './insights-luce.css';

export const InsightsPage: React.FC<{ timeScale?: number }> = ({ timeScale }) => {
  const user = useAuthStore((s) => s.user);
  const isOwner = (user?.email ?? '').toLowerCase() === 'brendan@bc-abc.com';
  const [activeFilter, setActiveFilter] = useState<TileFilter | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const {
    snapshot, isLoading, error, load,
    blast, groups, counts, healthPct, accessByWs,
    frequent, catalog,
    admin, adminLoading, adminError, unlockElapsedMs, loadAdmin, cancelAdminLoad,
  } = useInsightsData(user?.id, activeFilter);

  const activeVtRef = useRef<{ skipTransition: () => void } | null>(null);
  const armVt = useCallback(
    (vt: { skipTransition: () => void; finished: Promise<unknown> }) => {
      activeVtRef.current = vt;
      void vt.finished.finally(() => { if (activeVtRef.current === vt) activeVtRef.current = null; });
    },
    [],
  );

  const { morphRef, openSheet, closeSheet } = useSheetMorph({ setSheet, timeScale });
  const handleClose = useCallback(() => closeSheet(sheet), [closeSheet, sheet]);

  const igniting = useIgnition(snapshot !== null);
  const docHidden = useDocumentHidden();

  const toggleFilter = (f: TileFilter) => {
    const apply = () => setActiveFilter((prev) => (prev === f ? null : f));
    if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') { apply(); return; }
    document.documentElement.classList.add('vt-filter');
    const vt = document.startViewTransition(() => flushSync(apply));
    armVt(vt);
    void vt.finished.finally(() => document.documentElement.classList.remove('vt-filter'));
  };

  const scrollToSection = (id: string) =>
    document.getElementById(id)?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });

  if (isLoading && !snapshot) {
    return (
      <div className="luce-board h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="large" />
          <p className="mt-4 text-sm" style={{ color: luce.textSecondary }}>Checking every dataset and dataflow you can see…</p>
        </div>
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="luce-board h-full flex items-center justify-center" role="alert">
        <div className="text-center max-w-md">
          <p className="block mb-4 text-sm" style={{ color: luce.broken }}>{error}</p>
          <LuceButton tone="accent" onClick={() => void load(true)}>Try again</LuceButton>
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
  const sheetGroup = sheet ? groups.find((g) => g.workspaceId === sheet.workspaceId) ?? null : null;

  return (
    <div
      className={`luce-board h-full overflow-y-auto${igniting ? ' luce-ignite' : ''}${docHidden ? ' luce-asleep' : ''}`}
      style={{ color: luce.textSecondary }}
    >
      {}
      <div className="max-w-6xl mx-auto p-6 space-y-8" style={sheet ? { pointerEvents: 'none' } : undefined}>
        {}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: luce.textPrimary }}>Insights</h1>
            <p className="text-sm" style={{ color: luce.textTertiary }}>
              Every client workspace, one board — refreshes, access, and usage. Checked{' '}
              {relativeAge(snapshot.generatedAt) || 'just now'}{snapshot.fromCache ? ' (cached)' : ''}.
            </p>
          </div>
          <LuceButton tone="primary" disabled={isLoading} onClick={() => void load(true)}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </LuceButton>
        </div>
        {snapshot.partialFailure && (
          <div role="status" className="luce-panel px-4 py-2 text-xs flex items-center gap-2" style={{ color: luce.warn }}>
            <span aria-hidden="true">▲</span>
            <span>Some workspaces could not be fully read: {snapshot.failedWorkspaces.map((w) => w.name).join(', ')}. Their items may be missing below.</span>
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
                  <div className={`${tile.loud ? 'text-4xl' : 'text-3xl'} font-semibold leading-none${hot ? ' luce-lit luce-lit--hot luce-lit--red' : ''}`} style={{ ...(hot ? {} : { color: tile.color }), ...tabular }}>{tile.value}</div>
                  <div className="mt-2 luce-legend">{tile.label}</div>
                </>
              );
              const entrance = { '--luce-i': idx + 1 } as React.CSSProperties;
              return tile.filter ? (
                <button key={tile.label} className={`luce-panel luce-rise p-4 text-left cursor-pointer${active ? ' luce-tile--active' : ''}`} style={entrance} onClick={() => toggleFilter(tile.filter!)} aria-pressed={active} title={active ? `Clear the ${tile.label} filter` : `Show only ${tile.label.toLowerCase()} items`}>{inner}</button>
              ) : (
                <div key={tile.label} className="luce-panel luce-rise p-4" style={entrance}>{inner}</div>
              );
            })}
          </div>
        </div>
        {activeFilter && (
          <button className="luce-chip luce-press inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold cursor-pointer border-0" style={{ color: luce.accent }} onClick={() => setActiveFilter(null)} title="Clear filter">
            <span>Showing: {activeTileLabel}</span>
            <span aria-hidden="true">✕</span>
          </button>
        )}
        {}
        <nav aria-label="Page sections" className="luce-nav sticky top-0 z-10 -mx-2 px-2 py-1.5 flex items-center gap-1 rounded-lg">
          {([['Health', 'insights-health'], ...(isOwner ? ([['Admin', 'insights-admin']] as const) : [])] as const).map(([label, id]) => (
            <button key={id} className="px-2.5 py-1 rounded-lg text-xs uppercase tracking-wider cursor-pointer transition-colors hover:bg-white/5" style={{ color: luce.textSecondary }} onClick={() => scrollToSection(id)}>{label}</button>
          ))}
        </nav>
        {}
        <section id="insights-health" aria-labelledby="insights-refresh-heading" className="luce-rise" style={{ scrollMarginTop: 48, '--luce-i': 7 } as React.CSSProperties}>
          <SectionHeading id="insights-refresh-heading" eyebrow="Health" title="Client health board" />
          <p className="text-xs mb-3" style={{ color: luce.textTertiary }}>
            Broken workspaces sort first; every section starts folded — the headers carry the damage summary. Dots are the last 12 runs, oldest to newest, left to right.
          </p>
          {groups.length === 0 ? (
            <p className="text-sm" style={{ color: luce.textTertiary }}>{activeFilter ? `Nothing matches the ${activeTileLabel} filter.` : 'No datasets or dataflows are visible to your account.'}</p>
          ) : groups.length === 1 ? (
            <HeroTile group={groups[0]!} access={accessByWs.get(groups[0]!.workspaceId)} blast={blast} onOpen={(el) => openSheet(groups[0]!.workspaceId, el)} />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {groups.map((g) => (
                <WorkspaceTile key={g.workspaceId} group={g} access={accessByWs.get(g.workspaceId)} affectedCount={workspaceAffectedReportCount(g, blast)} onOpen={(el) => openSheet(g.workspaceId, el)} />
              ))}
            </div>
          )}
        </section>
        {isOwner && (
          <InsightsAdmin admin={admin} adminLoading={adminLoading} adminError={adminError} unlockElapsedMs={unlockElapsedMs} loadAdmin={loadAdmin} cancelAdminLoad={cancelAdminLoad} />
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
          settled={true}
          onClose={handleClose}
          sheetRef={morphRef}
        />
      )}
    </div>
  );
};

export default InsightsPage;
