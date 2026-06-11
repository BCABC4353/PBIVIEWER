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

/**
 * Insights — the data-health board, in the Luce design language
 * (docs/design/FERRARI-DASHBOARD-RND.md, D1–D12).
 *
 * THIS PAGE ONLY goes dark (owner request): near-black canvas, stacked panels
 * separated by seams (never outlines), one virtual light source, one amber
 * accent, red reserved strictly for broken. Motion runs on two linear()
 * springs; the board plays a ≤1400ms ignition ceremony once per session and
 * keeps exactly three sub-perceptual idle movers between refreshes.
 *
 * Everything here is scoped to the signed-in user's token: each user sees
 * exactly the workspaces, datasets, dataflows, and access lists they are
 * allowed to see, so the page is safe to expose to every client.
 *
 * Sections:
 *   1. Hero gauge (D11) + summary tiles — ONE dominant data-health figure;
 *      the status tiles are clickable filters (Matt #2).
 *   2. Health board — one TILE per workspace (client), triaged damage-first
 *      (DESIGN-CONTRACT §B); a solo client gets the hero tile (§A). A tile
 *      expands (FLIP, §D) into the blast-radius sheet (§C): the lineage
 *      process diagram (owner v3 #3) on top, then chipless dataflow/dataset
 *      rows, the people with access, and the user's USAGE for that workspace
 *      (owner: usage belongs in the same window as its tile) — total opens as
 *      a bar graph, never-opened items as one footnote line.
 *   3. The admin tier (owner-only; App audiences, activity).
 */

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const InsightsPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  // The Administration entry is for the owner alone (owner directive).
  const isOwner = (user?.email ?? '').toLowerCase() === 'brendan@bc-abc.com';

  const [snapshot, setSnapshot] = useState<InsightsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Active summary-tile filter (Matt #2), null = show everything.
  const [activeFilter, setActiveFilter] = useState<TileFilter | null>(null);
  // Blast-radius sheet: the open workspace + the originating tile ELEMENT,
  // kept solely so focus can return to it on contraction (§D).
  const [sheet, setSheet] = useState<{
    workspaceId: string;
    el: HTMLElement | null;
  } | null>(null);
  // The workspace whose TILE carries the `sheet-morph` view-transition name
  // while the sheet is closed (set just before the open morph captures its
  // old snapshot; the name moves to the sheet panel the moment it renders).
  const [morphId, setMorphId] = useState<string | null>(null);
  // §E: the sheet's glass (backdrop blur) switches on at the open morph's
  // `finished` promise; with no morph (reduced motion / no engine) it is on
  // from the first frame.
  const [sheetSettled, setSheetSettled] = useState(true);

  /**
   * §D expansion — a native View Transition morph: the clicked tile IS the
   * sheet. The tile already carries `sheet-morph` when the engine captures
   * the old snapshot; ALL sheet state changes run inside the callback
   * (flushSync) so the new snapshot pairs the name onto the sheet panel.
   * Fallback (reduced motion, or no startViewTransition — e.g. jsdom): the
   * sheet simply appears at final geometry.
   */
  // The active view transition — a new interaction SKIPS it (instant settle)
  // and starts the next morph from the real current layout: reversible at
  // any time, never wait for completion (owner ruling).
  const activeVtRef = useRef<{ skipTransition: () => void } | null>(null);
  // True only while a transition is actually animating. The press router
  // below keys off this — it must never hijack at-rest clicks.
  const vtLiveRef = useRef(false);
  // Synchronous truth for the press router: which workspace the sheet is
  // (or is about to be) showing. React state lags one VT update callback
  // behind (probe-measured ~300ms), so the router can never trust `sheet`.
  const sheetIntentRef = useRef<{ workspaceId: string; el: HTMLElement } | null>(null);

  const armVt = useCallback(
    (vt: { skipTransition: () => void; finished: Promise<unknown> }) => {
      activeVtRef.current = vt;
      vtLiveRef.current = true;
      void vt.finished.finally(() => {
        if (activeVtRef.current === vt) vtLiveRef.current = false;
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
    // A re-open during an interrupted close must not inherit the close speed.
    document.documentElement.classList.remove('vt-closing');
    flushSync(() => {
      setSheetSettled(false);
      setMorphId(workspaceId);
    });
    activeVtRef.current?.skipTransition(); // interrupt any running morph (owner: never wait)
    const vt = document.startViewTransition(() => {
      // Inside the callback the tile loses the name and the sheet renders
      // with it (snapshots break if this state change escapes the callback).
      flushSync(() => setSheet({ workspaceId, el }));
    });
    armVt(vt);
    void vt.finished.finally(() => setSheetSettled(true));
  }, [armVt]);

  /** §D contraction — the same morph in reverse, at the close observation
   *  speed (a `:root`-level class scopes the shorter duration rule). Focus
   *  returns to the originating tile; the tile itself was never hidden, so a
   *  grid hole is impossible by construction. */
  const closeSheet = useCallback(() => {
    // The intent ref covers the race where the opening VT's update callback
    // (which commits `sheet`) hasn't run yet but the user already reversed.
    const current = sheet ?? sheetIntentRef.current;
    if (!current) return;
    sheetIntentRef.current = null;
    const opener = current.el;
    if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
      // Unmount synchronously so the sheet's focus guard is gone before
      // focus returns to the tile (it would otherwise pull focus back).
      flushSync(() => setSheet(null));
      opener?.focus?.();
      return;
    }
    document.documentElement.classList.add('vt-closing');
    activeVtRef.current?.skipTransition(); // reverse instantly mid-flight
    const vt = document.startViewTransition(() => {
      // The name returns to the tile in the same flush that unmounts the
      // sheet — the engine morphs the panel back into the tile.
      flushSync(() => {
        setMorphId(current.workspaceId);
        setSheet(null);
      });
      opener?.focus?.();
    });
    armVt(vt);
    void vt.finished.finally(() => {
      document.documentElement.classList.remove('vt-closing');
      // At rest nothing needs the name; clear it unless a newer open owns it.
      setMorphId((prev) => (prev === current.workspaceId ? null : prev));
    });
  }, [sheet, armVt]);

  // While ANY view transition runs, the spec captures the whole document
  // into the root snapshot — the live DOM is unhittable and every press
  // lands on <html> (probe-verified: mid-morph clicks targeted the root's
  // "dark" class). So interruption cannot be done in CSS; presses are
  // routed here instead: skip the transition (the live DOM is hit-testable
  // again the same instant), then deliver the press to what the user aimed
  // at. A workspace tile under the point wins even through the scrim —
  // "I should also be able to open another tile while the animation is
  // happening." Anything else goes to the topmost live element: the scrim
  // and panel dead space contract the sheet, real controls activate.
  useEffect(() => {
    const onPress = (e: PointerEvent) => {
      if (!vtLiveRef.current) return;
      vtLiveRef.current = false;
      activeVtRef.current?.skipTransition();
      // The press already happened against the un-hittable document, so the
      // browser's own click will target <html> and die; suppress it and
      // route the intent ourselves.
      e.preventDefault();
      e.stopPropagation();
      // Geometry, not hit-testing: right after a skip the live DOM can still
      // be one update-callback behind (probe-measured), but the board is
      // always mounted behind the sheet, so tile rects are always true.
      const tile = Array.from(
        document.querySelectorAll<HTMLElement>('[data-workspace-tile]'),
      ).find((t) => {
        const r = t.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      const closing = document.documentElement.classList.contains('vt-closing');
      const openWs = sheetIntentRef.current?.workspaceId ?? null;
      if (closing) {
        // Mid-contraction: a press on any tile (including the one closing)
        // opens it — reversal and tile-switch in one rule. Empty-board
        // presses need nothing beyond the skip.
        if (tile) openSheet(tile.dataset.workspaceTile as string, tile);
        return;
      }
      if (tile && tile.dataset.workspaceTile !== openWs) {
        // "I should also be able to open another tile while the animation
        // is happening."
        openSheet(tile.dataset.workspaceTile as string, tile);
        return;
      }
      if (openWs) {
        // Press on the morphing sheet itself (or its originating tile): a
        // real control inside the live panel activates; anything else means
        // "reverse it" — same rules as the settled panel.
        const top = document.elementsFromPoint(e.clientX, e.clientY)[0];
        if (
          top instanceof HTMLElement &&
          top.closest('.luce-sheet') &&
          top.closest('button, a, input, select, textarea, [data-selectable]')
        ) {
          top.click();
          return;
        }
        closeSheet();
        return;
      }
      // No sheet in play (e.g. the filter glide): hand the press to the
      // topmost live element so cluster tiles and nav stay responsive.
      const top = document.elementsFromPoint(e.clientX, e.clientY)[0];
      if (top instanceof HTMLElement) top.click();
    };
    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
  }, [openSheet, closeSheet]);

  // D6: ignition ceremony — once per session, skipped under reduced motion,
  // never gating the content (it only stages the arrival of what is already
  // rendered). D7: the three idle movers pause while the window is hidden.
  const igniting = useIgnition(snapshot !== null);
  const docHidden = useDocumentHidden();

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

  // Usage cross-reference: most-opened (frequent) + the full catalog. Both are
  // loaded ONCE here and sliced per workspace into each tile's sheet (owner:
  // usage renders in the same window as the tile it belongs to).
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
        /* usage cross-reference is best-effort; the health board still renders */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // The damage path — computed ONCE per snapshot (DESIGN-CONTRACT): the
  // sheet's cascades, the tiles' STALE DATA hints, and the hero's blast line
  // all read from this single result.
  const blast = useMemo<BlastRadius>(
    () =>
      snapshot
        ? computeBlastRadius(snapshot)
        : { suspectsByDataflow: new Map(), reportsByDataset: new Map(), suspectDatasetIds: new Set() },
    [snapshot],
  );

  // The board shows everything, or — with an active tile filter — only the
  // matching items, regrouped so empty workspaces drop out entirely. Tiles
  // triage themselves (§B): broken desc → suspects desc → overdue desc →
  // running present → name A–Z.
  const groups = useMemo(() => {
    const all = snapshot?.refreshables ?? [];
    // The filter selects WHICH clients show — it never recomputes a tile's
    // stats (owner: filtering to Broken showed 0% everywhere because health
    // was derived from the filtered subset). Full groups, filtered LIST.
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

  // D11 — the ONE hero number: share of refreshables that are neither broken
  // nor overdue. Null (an em-dash) when there is nothing to measure.
  const healthPct = useMemo(() => {
    const all = snapshot?.refreshables ?? [];
    if (all.length === 0) return null;
    const up = all.filter((r) => !isDown(r)).length;
    return Math.round((up / all.length) * 100);
  }, [snapshot]);

  // Access folded into each client tile (owner spec): workspaceId -> roster.
  const accessByWs = useMemo(() => {
    const m = new Map<string, InsightsWorkspaceAccess>();
    for (const a of snapshot?.access ?? []) m.set(a.workspaceId, a);
    return m;
  }, [snapshot]);

  const sheetGroup = sheet ? groups.find((g) => g.workspaceId === sheet.workspaceId) ?? null : null;

  /** Tile click: activate the filter, or clear it when already active. */
  const toggleFilter = (f: TileFilter) => {
    const apply = () => setActiveFilter((prev) => (prev === f ? null : f));
    if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
      apply();
      return;
    }
    // The grid transition rides a quick view transition — cards animate
    // instead of teleporting (owner: "animate and transition the cards below").
    document.documentElement.classList.add('vt-filter');
    const vt = document.startViewTransition(() => flushSync(apply));
    armVt(vt); // the grid glide is interruptible like every other morph
    void vt.finished.finally(() => document.documentElement.classList.remove('vt-filter'));
  };

  const scrollToSection = (id: string) => {
    // Layout moves obey Reduce Motion like everything else (Pierre, std 7).
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
      {/* §D: while the sheet is open the board beneath takes no input — the
          dialog re-enables pointer events on itself. */}
      <div
        className="max-w-6xl mx-auto p-6 space-y-8"
        style={sheet ? { pointerEvents: 'none' } : undefined}
      >
        {/* Header */}
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

        {/* Hero gauge (D11) + summary tiles — one machined cluster, parts
            separated by 2px of canvas (D2). Status tiles click-to-filter. */}
        <div className="grid gap-[2px] lg:grid-cols-[minmax(280px,2fr)_3fr]">
          <HeroGauge pct={healthPct} igniting={igniting} />
          <div className="luce-cluster grid-cols-2 sm:grid-cols-3">
            {tiles.map((tile, idx) => {
              const active = tile.filter !== undefined && tile.filter === activeFilter;
              // D8: at most ONE hot glow on screen — the Broken count, only
              // when something is actually broken (red at amber's intensity).
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

        {/* Sticky section nav (Matt #7) — wayfinding without scrolling blind */}
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

        {/* Health board, grouped by workspace (client) */}
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
            /* Most clients see exactly ONE workspace — the hero tile (§A). */
            <HeroTile
              group={groups[0]!}
              access={accessByWs.get(groups[0]!.workspaceId)}
              blast={blast}
              morphSource={!sheet && morphId === groups[0]!.workspaceId}
              onOpen={(el) => openSheet(groups[0]!.workspaceId, el)}
            />
          ) : (
            /* The n=20 triage grid (§B): damage findable across the room. */
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

        {/* Admin tier — the owner's eyes only */}
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
      {/* The sheet is a SIBLING of the (inert-able) board content, never a
          child — otherwise `inert` would disable the sheet's own controls. */}
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