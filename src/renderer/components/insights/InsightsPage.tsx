import React, { useCallback, useState } from 'react';
import { Spinner } from '@fluentui/react-components';
import { useAuthStore } from '../../stores/auth-store';
import { luce, workspaceAffectedReportCount } from './insights-luce';
import { prefersReducedMotion, useIgnition, useDocumentHidden } from './luce-motion';
import { relativeAge } from './insights-shared';
import { LuceButton } from './LuceButton';
import { SectionHeading } from './SectionHeading';
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
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const {
    snapshot, isLoading, error, load,
    blast, groups, accessByWs,
    frequent, catalog,
    admin, adminLoading, adminError, unlockElapsedMs, loadAdmin, cancelAdminLoad,
  } = useInsightsData(user?.id, null);

  const { morphRef, sourceContentRef, targetContentRef, backdropRef, detailMounted, openSheet, closeSheet, toggleSheet } = useSheetMorph({ setSheet, timeScale: timeScale ?? 0.65 });
  const handleClose = useCallback(() => closeSheet(sheet), [closeSheet, sheet]);
  const handleToggleMorph = useCallback(() => toggleSheet(sheet), [toggleSheet, sheet]);

  const igniting = useIgnition(snapshot !== null);
  const docHidden = useDocumentHidden();

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
        {error && (
          <div role="alert" className="luce-panel px-4 py-2 text-xs flex items-center gap-2" style={{ color: luce.broken }}>
            <span aria-hidden="true">▲</span>
            <span>Refresh failed — showing the last loaded data. {error}</span>
          </div>
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
            <p className="text-sm" style={{ color: luce.textTertiary }}>No datasets or dataflows are visible to your account.</p>
          ) : groups.length === 1 ? (
            <HeroTile group={groups[0]!} access={accessByWs.get(groups[0]!.workspaceId)} blast={blast} onOpen={(el) => openSheet(groups[0]!.workspaceId, el)} />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {groups.map((g) => (
                <WorkspaceTile key={g.workspaceId} group={g} access={accessByWs.get(g.workspaceId)} affectedCount={workspaceAffectedReportCount(g, blast)} isOpen={sheet?.workspaceId === g.workspaceId} onOpen={(el) => openSheet(g.workspaceId, el)} />
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
          detailMounted={detailMounted}
          affectedCount={workspaceAffectedReportCount(sheetGroup, blast)}
          onClose={handleClose}
          onToggleMorph={handleToggleMorph}
          sheetRef={morphRef}
          sourceContentRef={sourceContentRef}
          targetContentRef={targetContentRef}
          backdropRef={backdropRef}
        />
      )}
    </div>
  );
};

export default InsightsPage;
