import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import { useAuthStore } from '../../stores/auth-store';
import type {
  InsightsSnapshot,
  InsightsRefreshable,
  ContentItem,
  AdminInsights,
  InsightsWorkspaceAccess,
} from '../../../shared/types';
import {
  luce,
  ladder,
  kindColor,
  statusGlyph,
  statusColor,
  statusLabel,
  downForLabel,
  dormantDownLabel,
  isDown,
  isDormant,
  matchesTileFilter,
  failureRateCaption,
  dotStripCells,
  groupByWorkspace,
  groupSummaryLabel,
  triageSortGroups,
  workspaceSuspectCount,
  workspaceAffectedReportCount,
  cascadeReports,
  oldestSuccessIso,
  unlockStageText,
  type TileFilter,
  type WorkspaceGroup,
} from './insights-luce';
import { computeBlastRadius, type BlastRadius } from '../../../shared/blast-radius';
import { prefersReducedMotion, SPRING_SETTLE, useIgnition, useDocumentHidden, useSpringNumber } from './luce-motion';
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
 *      expands (FLIP, §D) into the blast-radius sheet (§C): dataflows with
 *      damage cascades, datasets (suspects badged STALE DATA), and the
 *      people with access, folded in.
 *   3. Your usage + the admin tier (owner-only; App audiences, activity).
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

// ---------------------------------------------------------------------------
// Small Luce primitives (scoped to this page)
// ---------------------------------------------------------------------------

/**
 * Switchgear (D10): every button presses 80ms INTO the panel and releases on
 * the 250ms settle spring (see .luce-btn). `primary` is the gear selector —
 * the one capsule with the anodised bezel and a resting glow (D9/D10).
 */
const LuceButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'accent' | 'quiet' }
> = ({ tone = 'quiet', className, style, children, ...rest }) => (
  <button
    {...rest}
    className={`luce-btn px-3 py-1.5 text-sm ${
      tone === 'primary' ? 'luce-btn--primary px-4' : tone === 'accent' ? 'luce-btn--accent' : ''
    } ${className ?? ''}`}
    style={style}
  >
    {children}
  </button>
);

/** Status = glyph + label, colored text on a neutral recessed well (D12). */
const StatusChip: React.FC<{ status: InsightsRefreshable['lastStatus'] }> = ({ status }) => (
  <span
    className="luce-chip inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
    style={{ color: statusColor[status] }}
  >
    <span aria-hidden="true">{statusGlyph[status]}</span>
    <span>{statusLabel[status]}</span>
  </span>
);

const OverdueChip: React.FC<{ scheduleSummary?: string }> = ({ scheduleSummary }) => (
  <span
    className="luce-chip inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
    style={{ color: luce.warn }}
    title={`Schedule: ${scheduleSummary || 'enabled'} — but no recent successful refresh`}
  >
    <span aria-hidden="true">▲</span>
    <span>Overdue</span>
  </span>
);

/** Gray-violet "abandoned" chip (Matt #4): "DORMANT · down 657d". */
const DormantChip: React.FC<{ item: InsightsRefreshable }> = ({ item }) => {
  const down = dormantDownLabel(item);
  return (
    <span
      className="luce-chip inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
      style={{ color: luce.dormant, ...tabular }}
      title="No refresh attempt in over a year — likely abandoned"
    >
      <span aria-hidden="true">◷</span>
      <span>Dormant{down ? ` · ${down}` : ''}</span>
    </span>
  );
};

/** DATASET / DATAFLOW identity chip — same muted tints everywhere (Matt #3). */
const KindChip: React.FC<{ kind: InsightsRefreshable['kind'] }> = ({ kind }) => (
  <span
    className="luce-chip px-1.5 py-px text-[10px] uppercase tracking-wider whitespace-nowrap"
    style={{ color: kindColor[kind] }}
  >
    {kind}
  </span>
);

/** Tooltip for one dot: failed dataset dots explain themselves (Matt #5). */
function dotTitle(
  cell: ReturnType<typeof dotStripCells>[number],
  kind: InsightsRefreshable['kind'],
): string | undefined {
  if (cell.state === 'none') return undefined;
  const time = formatTime(cell.endTime);
  if (cell.state === 'ok') return `OK · ${time}`;
  if (kind === 'dataflow') {
    return `Failed · ${time} (no detail provided by Power BI for dataflows)`;
  }
  if (cell.errorCode) return `Failed · ${time} · ${cell.errorCode}: ${cell.errorDetail ?? ''}`;
  return `Failed · ${time}`;
}

/**
 * 12 dots, oldest → newest, filled from the LEFT. One pulse grammar everywhere
 * (DESIGN-CONTRACT §A): fail = red, ok = white-alpha .25, unused slots are
 * unlit lamps. The caption lives UNDER the dots, 10px/faint (§C).
 */
const RunDotStrip: React.FC<{
  runs?: InsightsRefreshable['recentRuns'];
  kind: InsightsRefreshable['kind'];
  /** Decorative copy on a tile face: no tooltips, no testid — the sheet-row
   *  strips stay the single interactive source of truth (Matt #5). */
  quiet?: boolean;
  /** Dot diameter: 7px in the sheet/hero, 6px on the n=20 tiles (§A/§B). */
  size?: number;
}> = ({ runs, kind, quiet = false, size = 7 }) => {
  const cells = dotStripCells(runs);
  const label = failureRateCaption(runs);
  return (
    <div
      className="flex flex-col items-start gap-1"
      {...(quiet ? {} : { 'data-testid': 'run-dot-strip' })}
    >
      <div className="flex items-center" style={{ gap: 4 }} aria-hidden="true">
        {cells.map((c, i) => (
          <span
            key={i}
            title={quiet ? undefined : dotTitle(c, kind)}
            className="inline-block rounded-full"
            style={{
              width: size,
              height: size,
              ...(c.state === 'ok'
                ? { background: 'rgba(255,255,255,0.25)' }
                : c.state === 'fail'
                  ? { background: luce.broken, transform: 'scale(1.25)' }
                  : { background: 'rgba(255,255,255,0.07)' }),
            }}
          />
        ))}
      </div>
      {quiet ? null : label ? (
        <span style={{ fontSize: 10, color: ladder.faint, ...tabular }}>{label}</span>
      ) : (
        <span style={{ fontSize: 10, color: ladder.faint }}>
          last {Math.min(runs?.length ?? 0, 12) || '—'} runs
        </span>
      )}
    </div>
  );
};

/** STALE DATA badge (§C): the amber mark a suspect dataset carries wherever it
 *  renders — never an OK/green chip anywhere a suspect appears. */
const StaleBadge: React.FC = () => (
  <span
    className="whitespace-nowrap shrink-0"
    style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: luce.warn,
      background: 'rgba(232,163,61,0.12)',
      borderRadius: 4,
      padding: '2px 6px',
    }}
  >
    STALE DATA
  </span>
);

/** Damage summary chips (§A/§B): `N broken` red · `N overdue` amber · `N OK`
 *  low. Health is silent — no green, no "all good" substitute. */
const DamageCounts: React.FC<{ counts: WorkspaceGroup['counts']; size?: number; gap?: number }> = ({
  counts,
  size = 11,
  gap = 10,
}) => {
  const quiet = counts.ok + counts.live;
  return (
    <span className="flex items-center shrink-0 whitespace-nowrap" style={{ fontSize: size, gap, ...tabular }}>
      {counts.broken > 0 && <span style={{ color: luce.broken }}>{counts.broken} broken</span>}
      {counts.overdue > 0 && <span style={{ color: luce.warn }}>{counts.overdue} overdue</span>}
      <span style={{ color: ladder.low }}>{quiet} OK</span>
    </span>
  );
};

/**
 * Sheet row — DESIGN-CONTRACT §C row grid (kills the meta collisions): four
 * fixed tracks `[status 88px] [name 1fr] [pulse 132px] [meta 224px]`, gap 16.
 * META is exactly two stacked nowrap 11px lines: relative time + trigger (low)
 * over the absolute timestamp (faint). The pulse caption lives under the dots
 * inside the 132px track — trigger text never shares its line.
 */
const RefreshableRow: React.FC<{ item: InsightsRefreshable; stale?: boolean }> = ({
  item,
  stale = false,
}) => {
  const down = downForLabel(item);
  const dormant = isDormant(item);
  const anchor = item.lastAttemptTime || item.lastSuccessTime;
  const rel = relativeAge(anchor);
  return (
    <div
      role="row"
      className="grid items-center transition-colors hover:bg-white/[0.03]"
      style={{
        gridTemplateColumns: '88px minmax(0, 1fr) 132px 224px',
        columnGap: 16,
        padding: '12px 0',
      }}
    >
      {/* Status (88px): a suspect dataset NEVER shows OK — it carries the badge. */}
      <div className="min-w-0">{stale ? <StaleBadge /> : <StatusChip status={item.lastStatus} />}</div>

      {/* Name (1fr, min-width 0, ellipsis) */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-medium" style={{ color: luce.textPrimary }}>
            {item.name}
          </span>
          <KindChip kind={item.kind} />
          {item.scheduleOverdue && <OverdueChip scheduleSummary={item.scheduleSummary} />}
          {dormant && <DormantChip item={item} />}
        </div>
        {(down || item.errorCode || item.configuredBy) && (
          <div className="mt-1 flex items-center gap-3 text-[12px] min-w-0" style={{ color: luce.textTertiary }}>
            {down && (
              <span className="font-semibold whitespace-nowrap" style={{ color: luce.broken, ...tabular }}>
                {down}
              </span>
            )}
            {item.errorCode && (
              <span title={`Power BI error: ${item.errorCode}`} className="truncate">
                {item.errorCode}
              </span>
            )}
            {item.configuredBy && <span className="truncate">{item.configuredBy}</span>}
          </div>
        )}
      </div>

      {/* Pulse (132px): dots + caption stacked, never sharing the meta lines. */}
      <div style={{ width: 132 }}>
        <RunDotStrip runs={item.recentRuns} kind={item.kind} />
      </div>

      {/* Meta (224px, right-aligned): exactly two 11px nowrap lines. */}
      <div className="text-right min-w-0">
        <div
          className="overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontSize: 11, color: ladder.low }}
        >
          {rel || '—'} · {item.kind === 'dataset' ? triggerLabel(item.lastRefreshType) : '—'}
        </div>
        <div
          className="overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontSize: 11, color: ladder.faint, ...tabular }}
        >
          {formatTime(anchor)}
        </div>
      </div>
    </div>
  );
};



// ---------------------------------------------------------------------------
// Blast-radius sheet (DESIGN-CONTRACT §C/§D/§E): the tile literally BECOMES
// the sheet — FLIP on the settle spring, shared elements riding the flight,
// three waves of fill-in, machined-glass material with the blur deferred to
// settle. Inside: dataflows (upstream) with their damage cascades, datasets
// (suspects carry the STALE DATA badge), then the people with access.
// ---------------------------------------------------------------------------

/** Section label — 11px caps, tracking 0.08em, faint (§C). */
const SheetLabel: React.FC<{ children: React.ReactNode; wave?: 1 | 2 | 3 }> = ({ children, wave }) => (
  <div
    className={`mb-1${wave ? ` luce-wave luce-wave--${wave}` : ''}`}
    style={{
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: ladder.faint,
    }}
  >
    {children}
  </div>
);

/** Cascade lists cap at 4 named items; "+N more" expands in place (§C). */
const CASCADE_CAP = 4;

/**
 * Downstream damage under a failed/stale dataflow: an indented cascade block
 * — amber connector, suspect datasets with STALE DATA badges, then the
 * reports affected. Red never appears here: red is the root cause's alone.
 */
const DamageCascade: React.FC<{
  suspects: InsightsRefreshable[];
  reportsByDataset: BlastRadius['reportsByDataset'];
}> = ({ suspects, reportsByDataset }) => {
  const [allSets, setAllSets] = useState(false);
  const [allReports, setAllReports] = useState(false);
  const reports = cascadeReports(suspects, reportsByDataset);
  const shownSets = allSets ? suspects : suspects.slice(0, CASCADE_CAP);
  const shownReports = allReports ? reports : reports.slice(0, CASCADE_CAP);
  const moreBtn: React.CSSProperties = { fontSize: 12, color: ladder.low };
  return (
    <div className="relative" style={{ paddingLeft: 36, paddingBottom: 12 }} data-testid="damage-cascade">
      <span
        aria-hidden="true"
        className="absolute"
        style={{ left: 18, top: 0, bottom: 12, width: 1, background: 'rgba(232,163,61,0.35)' }}
      />
      <div style={{ fontSize: 12, fontWeight: 500, color: luce.warn }}>
        → {suspects.length} dataset{suspects.length === 1 ? '' : 's'} refreshed against stale data
      </div>
      <div className="mt-1 space-y-1">
        {shownSets.map((ds) => (
          <div key={ds.id} className="flex items-center gap-2 min-w-0">
            <span className="truncate" style={{ fontSize: 13, color: ladder.mid }}>
              {ds.name}
            </span>
            <StaleBadge />
          </div>
        ))}
        {!allSets && suspects.length > CASCADE_CAP && (
          <button
            className="block cursor-pointer border-0 bg-transparent p-0 text-left"
            style={moreBtn}
            onClick={(e) => {
              e.stopPropagation();
              setAllSets(true);
            }}
          >
            +{suspects.length - CASCADE_CAP} more
          </button>
        )}
      </div>
      {reports.length === 0 ? (
        <div className="mt-2" style={{ fontSize: 12, fontWeight: 500, color: ladder.low }}>
          → no bound reports
        </div>
      ) : (
        <>
          <div className="mt-2" style={{ fontSize: 12, fontWeight: 500, color: luce.warn }}>
            → {reports.length} report{reports.length === 1 ? '' : 's'} affected
          </div>
          <div className="mt-1 space-y-1">
            {shownReports.map((r) => (
              <div key={r.id} className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className="inline-block rounded-full shrink-0"
                  style={{ width: 6, height: 6, background: luce.warn }}
                />
                <span className="truncate" style={{ fontSize: 13, color: ladder.mid }}>
                  {r.name}
                </span>
              </div>
            ))}
            {!allReports && reports.length > CASCADE_CAP && (
              <button
                className="block cursor-pointer border-0 bg-transparent p-0 text-left"
                style={moreBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setAllReports(true);
                }}
              >
                +{reports.length - CASCADE_CAP} more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const canAnimate = (el: Element | null): el is HTMLElement & { animate: Element['animate'] } =>
  !!el && typeof el.animate === 'function';

const WorkspaceSheet: React.FC<{
  group: WorkspaceGroup;
  access?: InsightsWorkspaceAccess;
  blast: BlastRadius;
  fromRect: DOMRect | null;
  onClose: () => void;
}> = ({ group, access, blast, fromRect, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const closingRef = useRef(false);
  // §E resolution: the sheet's own backdrop blur is OFF during the flight —
  // the gradient ramp alone carries the material — and switches on at settle.
  const [settled, setSettled] = useState(false);

  // §D expansion — FLIP from the tile's rect to the sheet's natural rect over
  // 400ms on the settle spring; transform + opacity (+ radius 12→16) only.
  // The shared client name counter-scales so it reads 15px at takeoff and
  // snaps to real 28px text at settle. Scrim fades 0→1 over 250ms linear.
  useEffect(() => {
    const el = panelRef.current;
    if (!canAnimate(el)) {
      setSettled(true);
      return;
    }
    if (prefersReducedMotion() || !fromRect || fromRect.width === 0) {
      // Reduced motion: no FLIP, no stagger — 150ms linear opacity at final
      // geometry, blur applied statically.
      setSettled(true);
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'linear' });
      if (canAnimate(scrimRef.current)) {
        scrimRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'linear' });
      }
      return;
    }
    const to = el.getBoundingClientRect();
    const sx = fromRect.width / to.width;
    const sy = fromRect.height / to.height;
    const dx = fromRect.left - to.left;
    const dy = fromRect.top - to.top;
    const flight = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '12px', opacity: 1 },
        { transform: 'none', borderRadius: '16px', opacity: 1 },
      ],
      { duration: 400, easing: SPRING_SETTLE, fill: 'both' },
    );
    flight.onfinish = () => setSettled(true);
    const nameEl = nameRef.current;
    if (canAnimate(nameEl) && sx > 0) {
      // 15px on the tile → 28px in the sheet: under the panel's sx the name
      // needs scale 15/(28·sx) at t=0 to read tile-sized for the whole flight.
      nameEl.style.transformOrigin = 'left center';
      nameEl.animate([{ transform: `scale(${15 / (28 * sx)})` }, { transform: 'none' }], {
        duration: 400,
        easing: SPRING_SETTLE,
        fill: 'both',
      });
    }
    if (canAnimate(scrimRef.current)) {
      scrimRef.current.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 250,
        easing: 'linear',
        fill: 'both',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §D contraction — waves out in reverse (opacity only), panel FLIPs back
  // over 400ms settle, scrim fades 250ms. A close mid-flight retargets from
  // the CURRENT transform; it never restarts from 0.
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const el = panelRef.current;
    if (!canAnimate(el) || !fromRect || fromRect.width === 0 || prefersReducedMotion()) {
      if (canAnimate(el) && prefersReducedMotion()) {
        const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 150,
          easing: 'linear',
          fill: 'forwards',
        });
        fade.onfinish = onClose;
      } else {
        onClose();
      }
      return;
    }
    // Retarget: sample the in-flight transform, cancel the open animation,
    // and fly from exactly there back to the tile's rectangle.
    const cs = getComputedStyle(el);
    const fromTransform = cs.transform && cs.transform !== 'none' ? cs.transform : 'none';
    if (typeof el.getAnimations === 'function') {
      for (const a of el.getAnimations()) a.cancel();
    }
    setSettled(false); // blur off for the return flight
    const to = el.getBoundingClientRect();
    const sx = fromRect.width / to.width;
    const sy = fromRect.height / to.height;
    const dx = fromRect.left - to.left;
    const dy = fromRect.top - to.top;
    // Waves out in reverse: damage/people first, then the rest — opacity only.
    const wavesOut = el.querySelectorAll<HTMLElement>('.luce-wave');
    wavesOut.forEach((node) => {
      if (!canAnimate(node)) return;
      const last = node.classList.contains('luce-wave--3');
      node.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 150,
        delay: last ? 0 : 60,
        easing: 'linear',
        fill: 'forwards',
      });
    });
    const anim = el.animate(
      [
        { transform: fromTransform, borderRadius: '16px', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '12px', opacity: 0 },
      ],
      { duration: 400, easing: SPRING_SETTLE, fill: 'forwards' },
    );
    if (canAnimate(scrimRef.current)) {
      scrimRef.current.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 250,
        easing: 'linear',
        fill: 'forwards',
      });
    }
    anim.onfinish = onClose;
  }, [fromRect, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const dataflows = group.items.filter((i) => i.kind === 'dataflow');
  const datasets = group.items.filter((i) => i.kind === 'dataset');
  const pulseItem =
    group.items.find((i) => i.lastStatus === group.worst && (i.recentRuns?.length ?? 0) > 0) ??
    group.items.find((i) => (i.recentRuns?.length ?? 0) > 0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ pointerEvents: 'auto' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${group.workspaceName} details`}
    >
      {/* The board recedes behind one deep scrim; clicking it contracts. */}
      <button
        ref={scrimRef}
        aria-label="Close"
        className="luce-scrim absolute inset-0 cursor-pointer border-0"
        onClick={close}
      />
      <div
        ref={panelRef}
        className={`luce-sheet relative flex flex-col${settled ? ' luce-sheet--settled' : ''}`}
        style={{ width: 'min(880px, 100vw - 96px)', maxHeight: 'calc(100vh - 96px)' }}
      >
        <div className="luce-sheet-vignette" aria-hidden="true" />
        {/* Header (sticky over the scrolling body). Shared elements that rode
            the FLIP: name, damage chips, worst-asset pulse strip. A second
            click anywhere on it contracts the sheet (§D). */}
        <div
          className="relative z-[1] flex items-start justify-between gap-4 shrink-0 cursor-pointer"
          style={{ padding: '28px 32px 16px' }}
          onClick={close}
        >
          <div className="min-w-0">
            <h3
              ref={nameRef}
              className="truncate"
              style={{ fontSize: 28, fontWeight: 600, color: ladder.hi, letterSpacing: '-0.01em' }}
            >
              {group.workspaceName}
            </h3>
            <div
              className="text-xs mt-1"
              style={{ color: group.counts.broken > 0 ? luce.broken : luce.textTertiary, ...tabular }}
            >
              {groupSummaryLabel(group)}
            </div>
            {pulseItem && (
              <div className="mt-2">
                <RunDotStrip quiet runs={pulseItem.recentRuns} kind={pulseItem.kind} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <DamageCounts counts={group.counts} size={13} gap={16} />
            <button
              className="cursor-pointer border-0 bg-transparent inline-flex items-center justify-center"
              style={{ fontSize: 12, color: ladder.low, minWidth: 32, minHeight: 32 }}
              onClick={close}
              aria-label="Close details"
            >
              × Close
            </button>
          </div>
        </div>
        {/* Body scrolls under the header. Waves: 1 = section headers +
            dataflow rows, 2 = dataset rows + meta, 3 = cascades + people. */}
        <div className="relative z-[1] overflow-y-auto" style={{ padding: '0 32px 28px' }}>
          <div className="space-y-6">
            {dataflows.length > 0 && (
              <div>
                <SheetLabel wave={1}>Dataflows — upstream ({dataflows.length})</SheetLabel>
                <div className="luce-hairline-rows">
                  {dataflows.map((r) => {
                    const suspects = blast.suspectsByDataflow.get(r.id);
                    return (
                      <div key={`${r.kind}-${r.id}`}>
                        <div className="luce-wave luce-wave--1">
                          <RefreshableRow item={r} />
                        </div>
                        {suspects && suspects.length > 0 && (
                          <div className="luce-wave luce-wave--3">
                            <DamageCascade suspects={suspects} reportsByDataset={blast.reportsByDataset} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <SheetLabel wave={1}>Datasets ({datasets.length})</SheetLabel>
              {datasets.length === 0 ? (
                <p className="text-xs luce-wave luce-wave--2" style={{ color: luce.textTertiary }}>
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
              <SheetLabel wave={1}>People with access</SheetLabel>
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
          </div>
        </div>
      </div>
    </div>
  );
};

/** Meta pill — 10px caps faint on a .04 well, radius 4 (§B row 3). */
const MetaPill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    className="whitespace-nowrap"
    style={{
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: ladder.faint,
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 4,
      padding: '2px 8px',
      ...tabular,
    }}
  >
    {children}
  </span>
);

/**
 * One client, one tile (DESIGN-CONTRACT §B): uniform 124px, status edge,
 * name + damage chips, worst-asset pulse, meta pills. Broken tiles sit
 * higher (s3 + shadow-2) over a red under-glow; workspaces with suspect
 * datasets carry the STALE DATA hint. While its sheet is open the tile is a
 * 124px ghost so the grid never reflows (§D).
 */
const WorkspaceTile: React.FC<{
  group: WorkspaceGroup;
  access?: InsightsWorkspaceAccess;
  suspectCount: number;
  ghost: boolean;
  onOpen: (rect: DOMRect, el: HTMLElement) => void;
}> = ({ group, access, suspectCount, ghost, onOpen }) => {
  const pulseItem =
    group.items.find((i) => i.lastStatus === group.worst && (i.recentRuns?.length ?? 0) > 0) ??
    group.items.find((i) => (i.recentRuns?.length ?? 0) > 0);
  const broken = group.counts.broken > 0;
  const edge = broken ? luce.broken : group.counts.overdue > 0 ? luce.warn : ladder.hairline;
  const flows = group.items.filter((i) => i.kind === 'dataflow').length;
  const sets = group.items.length - flows;
  const members = !access || access.users === null ? null : access.users.length;
  return (
    <div className="relative">
      {broken && <span aria-hidden="true" className="luce-tile-underglow" />}
      <button
        className={`luce-tile${broken ? ' luce-tile--broken' : ''}`}
        style={ghost ? { opacity: 0 } : undefined}
        onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect(), e.currentTarget)}
        aria-haspopup="dialog"
        aria-label={`Open ${group.workspaceName} details`}
      >
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0"
          style={{ width: 3, background: edge }}
        />
        <div className="flex items-center justify-between gap-3 min-w-0">
          <span className="truncate" style={{ fontSize: 15, fontWeight: 600, color: ladder.hi }}>
            {group.workspaceName}
          </span>
          <DamageCounts counts={group.counts} />
        </div>
        <div className="mt-3 flex items-center gap-3 min-w-0">
          {pulseItem && <RunDotStrip quiet size={6} runs={pulseItem.recentRuns} kind={pulseItem.kind} />}
          {pulseItem && (
            <span className="truncate" style={{ fontSize: 12, color: ladder.low }}>
              {pulseItem.name}
            </span>
          )}
          {suspectCount > 0 && <StaleBadge />}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <MetaPill>
            {sets} dataset{sets === 1 ? '' : 's'}
          </MetaPill>
          <MetaPill>
            {flows} dataflow{flows === 1 ? '' : 's'}
          </MetaPill>
          <MetaPill>
            {members === null ? 'members not visible' : `${members} member${members === 1 ? '' : 's'}`}
          </MetaPill>
        </div>
      </button>
    </div>
  );
};

/** Column label on the hero tile — 10px caps, tracking 0.08em, faint (§A). */
const HeroLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: ladder.faint,
    }}
  >
    {children}
  </div>
);

/**
 * The solo-client hero tile (DESIGN-CONTRACT §A): when a client sees exactly
 * one workspace, that single tile folds in named assets with pulse strips,
 * members, and freshness — the n=20 tile grown up, same edge/chips/pulse
 * grammar. The amber blast line appears only when suspects exist; health
 * stays silent (no green substitute, ever).
 */
const HeroTile: React.FC<{
  group: WorkspaceGroup;
  access?: InsightsWorkspaceAccess;
  blast: BlastRadius;
  ghost: boolean;
  onOpen: (rect: DOMRect, el: HTMLElement) => void;
}> = ({ group, access, blast, ghost, onOpen }) => {
  const broken = group.counts.broken > 0;
  const edge = broken ? luce.broken : group.counts.overdue > 0 ? luce.warn : ladder.hairline;
  const suspectCount = workspaceSuspectCount(group, blast.suspectDatasetIds);
  const affected = workspaceAffectedReportCount(group, blast);
  const assets = group.items;
  const shownAssets = assets.slice(0, 5);
  const members = !access || access.users === null ? null : access.users;
  const oldest = oldestSuccessIso(group.items);
  const schedule = group.items.find((i) => i.scheduleSummary)?.scheduleSummary;
  const nowrap: React.CSSProperties = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
  return (
    <button
      className="luce-tile luce-hero-tile"
      data-testid="luce-hero-tile"
      style={ghost ? { opacity: 0 } : undefined}
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect(), e.currentTarget)}
      aria-haspopup="dialog"
      aria-label={`Open ${group.workspaceName} details`}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 4, borderRadius: '4px 0 0 4px', background: edge }}
      />
      {/* Row 1 — name + damage summary */}
      <div className="flex items-start justify-between gap-4 min-w-0">
        <span
          className="truncate"
          style={{ fontSize: 28, fontWeight: 600, color: ladder.hi, letterSpacing: '-0.01em' }}
        >
          {group.workspaceName}
        </span>
        <DamageCounts counts={group.counts} size={13} gap={16} />
      </div>
      {/* Row 2 — the blast line, only when suspects exist (silence = health) */}
      {suspectCount > 0 && (
        <div className="mt-2" style={{ fontSize: 14, fontWeight: 500, color: luce.warn }}>
          {affected} report{affected === 1 ? '' : 's'} may be reading stale data — open to trace
        </div>
      )}
      {/* Row 3 — ASSETS / MEMBERS / FRESHNESS */}
      <div className="mt-6 grid grid-cols-3" style={{ gap: 32 }}>
        <div className="min-w-0">
          <HeroLabel>Assets</HeroLabel>
          {shownAssets.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="mt-2 min-w-0">
              <div className="truncate" style={{ fontSize: 13, color: ladder.mid }}>
                {item.name}
              </div>
              <div className="mt-1">
                <RunDotStrip quiet runs={item.recentRuns} kind={item.kind} />
              </div>
            </div>
          ))}
          {assets.length > 5 && (
            <div className="mt-2" style={{ fontSize: 11, color: ladder.low }}>
              +{assets.length - 5} more
            </div>
          )}
        </div>
        <div className="min-w-0">
          <HeroLabel>Members</HeroLabel>
          {members === null ? (
            <div className="mt-2" style={{ fontSize: 12, color: ladder.low, ...nowrap }}>
              not visible to your account
            </div>
          ) : (
            <>
              <div className="mt-2" style={{ fontSize: 20, fontWeight: 600, color: ladder.hi, ...tabular }}>
                {members.length}
              </div>
              {members.slice(0, 5).map((u, i) => (
                <div key={`${u.email || u.name}-${i}`} className="mt-1 truncate" style={{ fontSize: 12, color: ladder.mid }}>
                  {u.name}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="min-w-0">
          <HeroLabel>Freshness</HeroLabel>
          <div className="mt-2" style={{ fontSize: 12, ...nowrap }}>
            <span style={{ color: ladder.low }}>Oldest success: </span>
            <span style={{ color: ladder.mid }}>{oldest ? relativeAge(oldest) || 'just now' : '—'}</span>
          </div>
          {oldest && (
            <div style={{ fontSize: 11, color: ladder.faint, ...tabular, ...nowrap }}>
              {formatTime(oldest)}
            </div>
          )}
          <div className="mt-2" style={{ fontSize: 12, ...nowrap }}>
            <span style={{ color: ladder.low }}>Next scheduled: </span>
            <span style={{ color: ladder.mid }}>{schedule ?? '—'}</span>
          </div>
        </div>
      </div>
    </button>
  );
};

/** Engraved eyebrow + title — one heading treatment for every section (Matt #8). */
const SectionHeading: React.FC<{ id: string; eyebrow: string; title: string }> = ({ id, eyebrow, title }) => (
  <div className="mb-1">
    <div className="luce-legend">{eyebrow}</div>
    <h2 id={id} className="text-lg font-semibold" style={{ color: luce.textPrimary }}>
      {title}
    </h2>
  </div>
);


// ---------------------------------------------------------------------------
// The hero INSTRUMENT (D11) — a real gauge, not a numeral on a card.
// Geometry ported from the eye-tuned mobile dial (IgnitionSweep): 270° throw
// from 135°, graduated tick ring, unlit groove, a lit arc built from three
// stops of one light (breath / bloom / filament), tapered needle blade with
// counterweight, machined hub. Tuned by rendered screenshot, not by intent.
// ---------------------------------------------------------------------------
const DIAL_SWEEP = 270;
const DIAL_START = 135;

function dialPoint(c: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
}

const LuceDial: React.FC<{ pct: number; size?: number }> = ({ pct, size = 224 }) => {
  const c = size / 2;
  const faceR = c - 2;
  const tickOuter = c - 12;
  const tickMinorIn = tickOuter - 7;
  const tickMajorIn = tickOuter - 13;
  const arcR = tickOuter - 19;
  const needleTip = arcR + 5;
  const hubR = 13;
  const f = Math.max(0, Math.min(1, pct / 100));
  const circ = 2 * Math.PI * arcR;
  const arcLen = circ * (DIAL_SWEEP / 360);
  const dash = `${arcLen} ${circ - arcLen}`;
  const off = arcLen * (1 - f);
  const ticks: React.ReactNode[] = [];
  const count = 40;
  for (let i = 0; i <= count; i++) {
    const deg = DIAL_START + (i / count) * DIAL_SWEEP;
    const major = i % 5 === 0;
    const p1 = dialPoint(c, major ? tickMajorIn : tickMinorIn, deg);
    const p2 = dialPoint(c, tickOuter, deg);
    ticks.push(
      <line
        key={deg}
        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)'}
        strokeWidth={major ? 2 : 1}
        strokeLinecap="round"
      />,
    );
  }
  const na = DIAL_START + f * DIAL_SWEEP;
  const dir = dialPoint(0, 1, na);
  const perp = { x: -dir.y, y: dir.x };
  const baseR = hubR - 2;
  const blade = [
    `${c + baseR * dir.x + 2.6 * perp.x},${c + baseR * dir.y + 2.6 * perp.y}`,
    `${c + (needleTip - 1) * dir.x + 0.7 * perp.x},${c + (needleTip - 1) * dir.y + 0.7 * perp.y}`,
    `${c + needleTip * dir.x},${c + needleTip * dir.y}`,
    `${c + (needleTip - 1) * dir.x - 0.7 * perp.x},${c + (needleTip - 1) * dir.y - 0.7 * perp.y}`,
    `${c + baseR * dir.x - 2.6 * perp.x},${c + baseR * dir.y - 2.6 * perp.y}`,
  ].join(' ');
  const arcProps = {
    cx: c, cy: c, r: arcR, fill: 'none',
    strokeDasharray: dash, strokeDashoffset: off,
    transform: `rotate(${DIAL_START}, ${c}, ${c})`, strokeLinecap: 'round' as const,
  };
  return (
    <svg width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id="luce-dial-face" cx="50%" cy="36%" r="78%">
          <stop offset="0%" stopColor="#1C1C21" />
          <stop offset="58%" stopColor="#131316" />
          <stop offset="100%" stopColor="#0A0A0C" />
        </radialGradient>
        <radialGradient id="luce-dial-hub" cx="50%" cy="34%" r="80%">
          <stop offset="0%" stopColor="#2A2A30" />
          <stop offset="100%" stopColor="#131316" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={faceR} fill="url(#luce-dial-face)" />
      <circle cx={c} cy={c} r={faceR} fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={2} />
      <circle cx={c} cy={c - 0.5} r={faceR - 1.5} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
      {ticks}
      <circle {...arcProps} stroke="rgba(255,255,255,0.06)" strokeWidth={3} strokeDashoffset={0} />
      <circle {...arcProps} stroke={luce.accent} strokeOpacity={0.08} strokeWidth={15} />
      <circle {...arcProps} stroke={luce.accent} strokeOpacity={0.24} strokeWidth={7} />
      <circle {...arcProps} stroke={luce.accent} strokeOpacity={1} strokeWidth={2.5} />
      <g className="luce-needle luce-dial-needle" style={{ transformOrigin: `${c}px ${c}px` }}>
        <line
          x1={c} y1={c}
          x2={c - 16 * dir.x} y2={c - 16 * dir.y}
          stroke="#B97D2A" strokeWidth={5} strokeLinecap="round"
        />
        <polygon points={blade} fill={luce.accent} />
      </g>
      <circle cx={c} cy={c} r={hubR} fill="url(#luce-dial-hub)" />
      <circle cx={c} cy={c} r={hubR} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
      <circle cx={c} cy={c} r={3.4} fill={luce.accent} />
    </svg>
  );
};

/**
 * D1/D11 — the hero instrument: backlight deck → data → lens, holding the ONE
 * dominant figure (overall data health, % of refreshables that are neither
 * broken nor overdue). The numeral springs to new values with mass (D5) and
 * counts up from 0 during the ignition ceremony (D6). The live-dot, the meter
 * needle's tremor, and the backlight drift are the board's only three idle
 * movers (D7: 4.8s / 7s / 9s).
 */
const HeroGauge: React.FC<{ pct: number | null; igniting: boolean }> = ({ pct, igniting }) => {
  const { value, ref } = useSpringNumber(pct ?? 0, { startFromZero: igniting });
  const needleAt = Math.max(0, Math.min(100, value));
  return (
    <div
      className="luce-panel luce-panel--raised luce-hero-panel luce-rise p-6 flex items-center gap-8"
      style={{ '--luce-i': 0 } as React.CSSProperties}
      data-testid="luce-hero"
    >
      <div className="luce-backlight luce-backlight--live" aria-hidden="true" />
      {igniting && <span className="luce-flow" aria-hidden="true" />}
      {/* The instrument: needle + lit arc ride the same sprung value as the
          numeral, so the whole cluster moves as one mass. */}
      <div className="relative z-[1] shrink-0" style={{ width: 224, height: 224 }}>
        <LuceDial pct={pct === null ? 0 : needleAt} />
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ bottom: 40 }}
        >
          <div
            ref={ref}
            className="luce-hero-num"
            style={{ fontSize: 40, lineHeight: 1 }}
            aria-label={pct === null ? 'Data health unknown' : `Data health ${pct} percent`}
          >
            {pct === null ? '—' : Math.round(value)}
            {pct !== null && <span className="luce-hero-unit">%</span>}
          </div>
        </div>
      </div>
      <div className="relative z-[1] flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="luce-live-dot" aria-hidden="true" />
          <span className="luce-legend">Data health</span>
        </div>
        <div className="text-[12px] leading-relaxed max-w-[200px]" style={{ color: luce.textTertiary }}>
          datasets &amp; dataflows neither broken nor overdue
        </div>
      </div>
      <div className="luce-lens" aria-hidden="true" />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  // The Administration entry is for the owner alone (owner directive).
  const isOwner = (user?.email ?? '').toLowerCase() === 'brendan@bc-abc.com';

  const [snapshot, setSnapshot] = useState<InsightsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Active summary-tile filter (Matt #2), null = show everything.
  const [activeFilter, setActiveFilter] = useState<TileFilter | null>(null);
  // Blast-radius sheet: the open workspace + the tile rect it grows from +
  // the originating tile element (focus returns to it on contraction, §D).
  const [sheet, setSheet] = useState<{
    workspaceId: string;
    rect: DOMRect | null;
    el: HTMLElement | null;
  } | null>(null);

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
    const visible = activeFilter ? all.filter((r) => matchesTileFilter(r, activeFilter)) : all;
    return triageSortGroups(groupByWorkspace(visible), blast.suspectDatasetIds);
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

  const neverOpened = useMemo(() => {
    if (catalog.length === 0) return [];
    const openedIds = new Set(frequent.map((f) => f.id));
    return catalog.filter((c) => !openedIds.has(c.id)).slice(0, 15);
  }, [catalog, frequent]);

  // Access folded into each client tile (owner spec): workspaceId -> roster.
  const accessByWs = useMemo(() => {
    const m = new Map<string, InsightsWorkspaceAccess>();
    for (const a of snapshot?.access ?? []) m.set(a.workspaceId, a);
    return m;
  }, [snapshot]);

  const sheetGroup = sheet ? groups.find((g) => g.workspaceId === sheet.workspaceId) ?? null : null;

  /** Tile click: activate the filter, or clear it when already active. */
  const toggleFilter = (f: TileFilter) => {
    setActiveFilter((prev) => (prev === f ? null : f));
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
              Every client workspace, one board — refreshes, access, and usage. Snapshot from{' '}
              {formatTime(snapshot.generatedAt)}
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
                  <span
                    className="luce-tile-lamp"
                    aria-hidden="true"
                    style={{
                      background: tile.loud ? tile.color : 'rgba(255,255,255,0.10)',
                      boxShadow: tile.loud ? `0 0 8px ${tile.color}` : 'none',
                    }}
                  />
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
              ['Usage', 'insights-usage'],
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
              ghost={sheet?.workspaceId === groups[0]!.workspaceId}
              onOpen={(rect, el) => setSheet({ workspaceId: groups[0]!.workspaceId, rect, el })}
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
                  suspectCount={workspaceSuspectCount(g, blast.suspectDatasetIds)}
                  ghost={sheet?.workspaceId === g.workspaceId}
                  onOpen={(rect, el) => setSheet({ workspaceId: g.workspaceId, rect, el })}
                />
              ))}
            </div>
          )}
        </section>

        {/* Your usage */}
        <section
          id="insights-usage"
          aria-labelledby="insights-usage-heading"
          className="luce-wing-r"
          style={{ scrollMarginTop: 48, '--luce-i': 1 } as React.CSSProperties}
        >
          <div className="mb-3">
            <SectionHeading id="insights-usage-heading" eyebrow="Usage" title="Your usage" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="luce-panel luce-card p-3">
              <div className="luce-legend mb-2 px-2 pt-1">You open most</div>
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
            <div className="luce-panel luce-card p-3">
              <div className="luce-legend mb-2 px-2 pt-1">Never opened by you</div>
              {neverOpened.length === 0 ? (
                <p className="text-xs" style={{ color: luce.textTertiary }}>
                  {catalog.length === 0 ? 'Catalog still loading…' : "You've opened everything you can see."}
                </p>
              ) : (
                <div className="space-y-1">
                  {neverOpened.map((c) => (
                    <div key={c.id} className="px-2 py-1 rounded-lg transition-colors hover:bg-white/[0.03]">
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
        {sheetGroup && (
          <WorkspaceSheet
            group={sheetGroup}
            access={accessByWs.get(sheetGroup.workspaceId)}
            blast={blast}
            fromRect={sheet?.rect ?? null}
            onClose={() => {
              // §D: focus returns to the originating tile on contraction.
              const opener = sheet?.el;
              setSheet(null);
              opener?.focus?.();
            }}
          />
        )}
      </div>
    </div>
  );
};

export default InsightsPage;
