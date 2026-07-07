import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContentItem, InsightsWorkspaceAccess } from '../../../shared/types';
import { luce, ladder, type WorkspaceGroup } from './insights-luce';
import type { LineageReportInput } from './lineage-diagram';
import type { BlastRadius } from '../../../shared/blast-radius';
import { tabular } from './insights-shared';
import { DamageCounts } from './DamageCounts';
import { LineageDiagram } from './LineageDiagram';
import { RefreshableRow } from './RefreshableRow';
import { SheetLabel } from './SheetLabel';
import { TileFace } from './WorkspaceTile';


export const WorkspaceSheet: React.FC<{
  group: WorkspaceGroup;
  access?: InsightsWorkspaceAccess;
  blast: BlastRadius;
  reports: LineageReportInput[];
  usage: ContentItem[];
  catalog: Array<{ id: string; name: string }>;
  settled: boolean;
  detailMounted?: boolean;
  affectedCount?: number;
  onClose: () => void;
  onToggleMorph?: () => void;
  sheetRef?: React.RefObject<HTMLDivElement | null>;
  sourceContentRef?: React.RefObject<HTMLElement | null>;
  targetContentRef?: React.RefObject<HTMLElement | null>;
  backdropRef?: React.RefObject<HTMLElement | null>;
}> = ({ group, access, blast, reports, usage, catalog, settled, detailMounted = false, affectedCount = 0, onClose, onToggleMorph, sheetRef, sourceContentRef, targetContentRef, backdropRef }) => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = e.target as Node | null;
      if (panel.contains(target)) return;
      if (target instanceof Element && target.closest('[role="dialog"]')) return;
      (closeBtnRef.current ?? panel).focus();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
  const trapTab = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (!panel.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPanelClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, select, textarea, [data-selectable]')) return;
      const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
      if (selection && !selection.isCollapsed) return;
      (onToggleMorph ?? onClose)();
    },
    [onToggleMorph, onClose],
  );

  const dataflows = group.items.filter((i) => i.kind === 'dataflow');
  const datasets = group.items.filter((i) => i.kind === 'dataset');

  const used = [...usage].sort((a, b) => (b.openCount ?? 0) - (a.openCount ?? 0));
  const maxOpens = used.reduce((m, f) => Math.max(m, f.openCount ?? 0), 0);
  const openedIds = new Set(usage.map((f) => f.id));
  const neverOpened = catalog.filter((c) => !openedIds.has(c.id));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ pointerEvents: 'auto' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${group.workspaceName} details`}
      onKeyDown={trapTab}
    >
      {}
      <button
        ref={(node) => {
          if (backdropRef) (backdropRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }}
        aria-label="Close"
        className="luce-scrim absolute inset-0 cursor-pointer border-0"
        onClick={onToggleMorph ?? onClose}
      />
      <div
        ref={(node) => {
          (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (sheetRef) (sheetRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        tabIndex={-1}
        className={`luce-sheet relative flex flex-col${settled ? ' luce-sheet--settled' : ''}`}
        style={{
          width: 'min(880px, 100vw - 96px)',
          maxHeight: 'calc(100vh - 96px)',
        }}
        onClick={onPanelClick}
      >
        {}
        <div
          ref={(node) => {
            if (sourceContentRef) (sourceContentRef as React.MutableRefObject<HTMLElement | null>).current = node;
          }}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', padding: '16px 18px', overflow: 'hidden' }}
        >
          <TileFace group={group} affectedCount={affectedCount} />
        </div>
        {}
        <div
          ref={(node) => {
            if (targetContentRef) (targetContentRef as React.MutableRefObject<HTMLElement | null>).current = node;
          }}
          className="relative z-[1] flex flex-col"
          style={{ opacity: 0, pointerEvents: 'none', flex: 1, minHeight: 0 }}
        >
          {}
          <div
            className="relative flex items-start justify-between gap-4 shrink-0 cursor-pointer"
            style={{ padding: '28px 32px 16px' }}
          >
            <div className="min-w-0">
              <h3
                className="truncate"
                style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 600, color: ladder.hi, letterSpacing: '-0.01em' }}
              >
                {group.workspaceName}
              </h3>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <DamageCounts counts={group.counts} size={13} gap={16} />
              <button
                ref={closeBtnRef}
                className="cursor-pointer border-0 bg-transparent inline-flex items-center justify-center"
                style={{ fontSize: 12, color: ladder.low, minWidth: 32, minHeight: 32, pointerEvents: 'auto' }}
                onClick={onClose}
                aria-label="Close details"
              >
                × Close
              </button>
            </div>
          </div>
          {}
          <div className="relative overflow-y-auto" style={{ padding: '0 32px 28px' }}>
            <div className="space-y-6">
              {detailMounted && (
                <div className="">
                  <LineageDiagram group={group} blast={blast} reports={reports} />
                </div>
              )}
              {dataflows.length > 0 && (
                <div>
                  <SheetLabel>Dataflows — upstream ({dataflows.length})</SheetLabel>
                  <div className="luce-hairline-rows">
                    {dataflows.map((r) => (
                      <div key={`${r.kind}-${r.id}`} className="">
                        <RefreshableRow item={r} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <SheetLabel>Datasets ({datasets.length})</SheetLabel>
                {datasets.length === 0 ? (
                  <p className="text-xs" style={{ color: luce.textTertiary }}>
                    No datasets visible in this workspace.
                  </p>
                ) : (
                  <div className="luce-hairline-rows">
                    {datasets.map((r) => (
                      <div key={`${r.kind}-${r.id}`} className="luce-wave luce-wave--2">
                        <RefreshableRow item={r} stale={blast.suspectDatasetIds.has(r.id)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <SheetLabel>People with access</SheetLabel>
                <div className="luce-wave luce-wave--3">
                  {!access || access.users === null ? (
                    <p className="text-xs" style={{ color: ladder.low, maxWidth: 560, fontSize: 12 }}>
                      The member list is not visible to your account. People reaching this content
                      through a published Power BI App are only listed for tenant admins.
                    </p>
                  ) : access.users.length === 0 ? (
                    <p style={{ fontSize: 12, color: ladder.low }}>No members.</p>
                  ) : (
                    <div
                      className="grid grid-cols-2"
                      style={{ columnGap: 32, rowGap: 8 }}
                    >
                      {access.users.map((u, i) => (
                        <div
                          key={`${u.email || u.name}-${i}`}
                          className="truncate"
                          style={{ fontSize: 13, color: ladder.mid }}
                          title={u.email ? `${u.email} · ${u.role}` : u.role}
                        >
                          {u.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {}
              <div data-testid="sheet-usage">
                <SheetLabel>Usage</SheetLabel>
                <div className="mb-2" style={{ fontSize: 10, color: ladder.faint }}>
                  opens recorded by this app on this computer
                </div>
                <div className="luce-wave luce-wave--3">
                  {used.length === 0 ? (
                    <p style={{ fontSize: 12, color: ladder.faint }}>
                      No opens recorded yet for this client.
                    </p>
                  ) : (
                    <div>
                      {used.map((f) => (
                        <button
                          key={f.id}
                          data-testid="usage-bar-row"
                          className="w-full grid items-center text-left cursor-pointer border-0 bg-transparent rounded-lg transition-colors hover:bg-white/[0.03]"
                          style={{
                            gridTemplateColumns: 'minmax(0, 1fr) minmax(64px, 2fr) 76px',
                            columnGap: 12,
                            padding: '6px 8px',
                          }}
                          title={f.name}
                          onClick={() =>
                            navigate(
                              f.type === 'dashboard'
                                ? `/dashboard/${f.workspaceId}/${f.id}`
                                : `/report/${f.workspaceId}/${f.id}`,
                            )
                          }
                        >
                          <span className="truncate" style={{ fontSize: 13, color: ladder.mid }}>
                            {f.name}
                          </span>
                          {}
                          <span aria-hidden="true" className="block min-w-0">
                            <span
                              data-testid="usage-bar"
                              className="block rounded-full"
                              style={{
                                height: 6,
                                width: `${((f.openCount ?? 0) / Math.max(1, maxOpens)) * 100}%`,
                                background: 'rgba(232,163,61,0.55)',
                              }}
                            />
                          </span>
                          <span
                            className="text-right whitespace-nowrap"
                            style={{ fontSize: 11, color: ladder.low, ...tabular }}
                          >
                            {f.openCount ?? 0} open{(f.openCount ?? 0) === 1 ? '' : 's'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {neverOpened.length > 0 && (
                    <p
                      data-testid="usage-never-opened"
                      className="mt-2"
                      style={{ fontSize: 11, color: ladder.faint }}
                    >
                      Never opened:{' '}
                      {neverOpened.slice(0, 5).map((c) => c.name).join(', ')}
                      {neverOpened.length > 5 ? ` +${neverOpened.length - 5} more` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
