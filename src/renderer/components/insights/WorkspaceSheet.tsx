import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContentItem, InsightsWorkspaceAccess } from '../../../shared/types';
import { luce, ladder, type WorkspaceGroup } from './insights-luce';
import type { LineageReportInput } from './lineage-diagram';
import type { BlastRadius } from '../../../shared/blast-radius';
import { tabular } from './insights-shared';
import { DamageCounts } from './DamageCounts';
import { KindKey } from './KindKey';
import { LineageDiagram } from './LineageDiagram';
import { RefreshableRow } from './RefreshableRow';
import { SheetLabel } from './SheetLabel';

// ---------------------------------------------------------------------------
// Blast-radius sheet (DESIGN-CONTRACT §C/§D/§E): the tile literally BECOMES
// the sheet — a native View Transition morph. One view-transition-name
// (`sheet-morph`) is carried by the clicked tile while the sheet is closed
// and by the sheet panel while it is open; the engine's snapshots own the
// whole flight (orchestrated in InsightsPage, durations/aspect handling in
// insights-luce.css). Three waves of fill-in, machined-glass material with
// the blur switched on at the morph's `finished` promise. Inside: dataflows
// (upstream) with their damage cascades, datasets (suspects carry the STALE
// DATA badge), then the people with access.
// ---------------------------------------------------------------------------

export const WorkspaceSheet: React.FC<{
  group: WorkspaceGroup;
  access?: InsightsWorkspaceAccess;
  blast: BlastRadius;
  reports: LineageReportInput[];
  /** This workspace's slice of the locally-recorded opens (usage.getFrequent
   *  filtered by workspaceId at the page level — owner: usage lives in the
   *  same window as the tile, because it's about THIS workspace). */
  usage: ContentItem[];
  /** This workspace's catalog slice (reports + dashboards the user can see),
   *  used to derive the never-opened footnote. */
  catalog: Array<{ id: string; name: string }>;
  /** §E: glass (backdrop blur) on — immediately when no morph ran, or at the
   *  open morph's `finished` promise (InsightsPage decides). */
  settled: boolean;
  onClose: () => void;
}> = ({ group, access, blast, reports, usage, catalog, settled, onClose }) => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Modal discipline (release-gate blocker): keyboard/AT users land INSIDE
  // the dialog and can never wander the dimmed board behind it. A document
  // focus guard is authoritative — it survives the focus eviction that
  // applying `inert` to the board triggers, and it re-captures any stray
  // focus (Tab off the last element, programmatic focus elsewhere). Close
  // unmounts the sheet synchronously (inside the view-transition callback),
  // so this guard is already gone when focus returns to the tile.
  useEffect(() => {
    let active = true;
    const pull = () => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      (closeBtnRef.current ?? panel).focus();
    };
    // Land focus after the open paint + the board's inert eviction settle.
    const t = setTimeout(pull, 0);
    const onFocusIn = () => {
      if (active) pull();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      active = false;
      clearTimeout(t);
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

  // Owner v3 #1: "it opens with a click it should close with a click" — a
  // click anywhere on the sheet that is NOT an interactive element contracts
  // it, same as the backdrop. Buttons/links/inputs keep working; selecting
  // text in the technical-details block ([data-selectable], or any live
  // selection) never closes.
  const onPanelClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, select, textarea, [data-selectable]')) return;
      const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
      if (selection && !selection.isCollapsed) return;
      onClose();
    },
    [onClose],
  );

  const dataflows = group.items.filter((i) => i.kind === 'dataflow');
  const datasets = group.items.filter((i) => i.kind === 'dataset');

  // USAGE group (owner: one flow, no two columns). Each used item draws a
  // horizontal bar scaled to the workspace MAX open count; everything the
  // user can see but has never opened compresses into one footnote line.
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
      {/* The board recedes behind one deep scrim; clicking it contracts. Its
          fade rides the view transition's root cross-fade. */}
      <button
        aria-label="Close"
        className="luce-scrim absolute inset-0 cursor-pointer border-0"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`luce-sheet relative flex flex-col${settled ? ' luce-sheet--settled' : ''}`}
        style={{
          width: 'min(880px, 100vw - 96px)',
          maxHeight: 'calc(100vh - 96px)',
          // While open, ONLY the sheet panel carries the morph name — the
          // engine pairs it with the tile that carried it in the old state.
          viewTransitionName: 'sheet-morph',
        }}
        onClick={onPanelClick}
      >
        {/* Header (sticky over the scrolling body). A second click anywhere
            non-interactive contracts the sheet (owner v3 #1). */}
        <div
          className="relative z-[1] flex items-start justify-between gap-4 shrink-0 cursor-pointer"
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
              style={{ fontSize: 12, color: ladder.low, minWidth: 32, minHeight: 32 }}
              onClick={onClose}
              aria-label="Close details"
            >
              × Close
            </button>
          </div>
        </div>
        {/* Body scrolls under the header. Waves: 1 = the lineage diagram +
            section headers + dataflow rows, 2 = dataset rows + meta, 3 =
            people. The diagram IS the damage cascade now (owner v3 #3). */}
        <div className="relative z-[1] overflow-y-auto" style={{ padding: '0 32px 28px' }}>
          <div className="space-y-6">
            <div className="">
              <LineageDiagram group={group} blast={blast} reports={reports} />
            </div>
            <div className="">
              <KindKey />
            </div>
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
            {/* USAGE (owner): the user's opens for THIS workspace, in the same
                window as the tile — one flow, total usage as a bar graph. */}
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
                        {/* The bar: width ∝ openCount / workspace max. */}
                        <span aria-hidden="true" className="block min-w-0">
                          <span
                            data-testid="usage-bar"
                            className="block rounded-full"
                            style={{
                              height: 6,
                              width: `${((f.openCount ?? 0) / Math.max(1, maxOpens)) * 100}%`,
                              background: 'rgba(232,163,61,0.55)', // luce.accent at modest opacity
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
  );
};
