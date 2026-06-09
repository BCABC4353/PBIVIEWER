/**
 * UX-B4: Single-source viewer toolbar shared by ReportViewer, DashboardViewer,
 * and AppViewer. All three viewers delegate their toolbar geometry here.
 *
 * Slot layout (left → right):
 *   [Back] [divider?] [breadcrumb/title slot] [spacer] [right actions]
 *
 * Right-action visibility is controlled by the props each viewer passes:
 *   - onRefresh        → Refresh button (NEW-UX-3: disabled while isRefreshing)
 *   - onExportPdf      → Export PDF button (disabled while isExporting)
 *   - onFullScreen     → Full Screen button
 *   - onSlideshow      → Slideshow button (report-only)
 *   - exportStatus     → transient status text shown in the right section
 *   - lastDataRefresh  → freshness timestamp (UX-S14 / NEW-PROD-4)
 *   - itemName         → shown as breadcrumb text while loading (UX-S14)
 *   - isExporting      → disables Export button and relabels it
 *   - isRefreshing     → disables Refresh button (NEW-UX-3)
 *   - backLabel        → override "Back" text (AppViewer uses "Back to Apps")
 *   - titleIcon        → optional JSX icon in the breadcrumb area
 */

import React from 'react';
import {
  Button,
  Text,
  Breadcrumb,
  BreadcrumbItem,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowSyncRegular,
  ArrowDownloadRegular,
  FullScreenMaximizeRegular,
  PlayRegular,
  HomeRegular,
} from '@fluentui/react-icons';

export interface ViewerToolbarProps {
  /** Called when the back button is pressed. */
  onBack: () => void;
  /** Override label for the back button. Default: "Back". */
  backLabel?: string;
  /**
   * UX-S14: name of the item shown while loading and as the breadcrumb leaf.
   * When provided a breadcrumb [Home > name] is rendered.
   * When omitted only the back button and actions are shown.
   */
  itemName?: string;
  /**
   * Optional JSX icon placed left of itemName in the breadcrumb / title area.
   * AppViewer passes <AppsRegular />.
   */
  titleIcon?: React.ReactNode;
  /**
   * NEW-PROD-4: ISO-8601 freshness timestamp. Rendered with timezone label
   * and 4-digit year.
   */
  lastDataRefresh?: string | null;
  /** Transient export status text (Exported to PDF / Export failed / …). */
  exportStatus?: string | null;
  /** Shows and wires the Refresh button. */
  onRefresh?: () => void;
  /** NEW-UX-3: while true the Refresh button is disabled and shows a spinner label. */
  isRefreshing?: boolean;
  /** Shows and wires the Export PDF button. */
  onExportPdf?: () => void;
  /** While true the Export PDF button is disabled. */
  isExporting?: boolean;
  /** Shows and wires the Full Screen button. */
  onFullScreen?: () => void;
  /** Shows and wires the Slideshow button (report-only). */
  onSlideshow?: () => void;
  /**
   * When true, append a live "(N min ago)" relative age to the freshness stamp.
   * The App view sets this so users can watch the data age tick over and trust
   * the dashboard is current.
   */
  showRelativeAge?: boolean;
  /**
   * When true, the backing dataset has refreshed AFTER the on-screen content
   * loaded, so the Refresh button is emphasized to prompt the user to pull in
   * the newer data (the embedded Power BI service does not repaint on its own).
   */
  newDataAvailable?: boolean;
  /**
   * NEW-PROD-4: ISO-8601 timestamp of the upstream dataflow's last SUCCESSFUL
   * completion, shown as a second line. A dataset can report success on stale
   * data, so this is the independent "data is genuinely current" signal.
   */
  dataflowRefresh?: string | null;
  /** Label for the dataset stamp. "Data refreshed" (single dataset) or "Oldest data". */
  freshnessLabel?: string;
}

/**
 * NEW-PROD-4: Format an ISO-8601 date as M/D/YYYY HH:mm <TZ>.
 * Uses full 4-digit year and appends the browser's short timezone abbreviation.
 */
function formatRefreshTime(isoString: string): string {
  const date = new Date(isoString);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()); // 4-digit year (NEW-PROD-4)
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  // Short TZ label — e.g. "CST", "GMT+2". Intl may return "UTC" or an offset
  // string on some platforms; both are valid for this use case.
  let tz = '';
  try {
    tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    // Non-fatal: skip TZ label on platforms where Intl is unavailable.
  }

  return `${month}/${day}/${year} ${hours}:${minutes}${tz ? ' ' + tz : ''}`;
}

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  onBack,
  backLabel = 'Back',
  itemName,
  titleIcon,
  lastDataRefresh,
  exportStatus,
  onRefresh,
  isRefreshing = false,
  onExportPdf,
  isExporting = false,
  onFullScreen,
  onSlideshow,
  showRelativeAge = false,
  newDataAvailable = false,
  dataflowRefresh,
  freshnessLabel = 'Data refreshed',
}) => {
  const hasBreadcrumb = Boolean(itemName);

  // Render one freshness line: "<label>: M/D/YYYY HH:mm TZ (N min ago)" with a
  // ⚠ warning color when older than a day. Returns null when no timestamp.
  const renderStamp = (label: string, iso?: string | null): React.ReactNode => {
    if (!iso) return null;
    const ageMs = Date.now() - new Date(iso).getTime();
    const isStale = Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000;
    let relative = '';
    if (showRelativeAge && Number.isFinite(ageMs)) {
      const mins = Math.max(0, Math.floor(ageMs / 60000));
      relative = mins < 1 ? ' (just now)' : mins === 1 ? ' (1 min ago)' : ` (${mins} min ago)`;
    }
    return (
      <Text
        className={`${isStale ? 'text-status-warning' : 'text-neutral-foreground-3'} text-xs`}
        title={isStale ? `${label} is more than a day old` : undefined}
      >
        {isStale ? '⚠ ' : ''}
        {label}: {formatRefreshTime(iso)}
        {relative}
      </Text>
    );
  };

  return (
    <div
      data-viewer-toolbar
      className="h-12 bg-neutral-background-2 border-b border-neutral-stroke-2 flex items-center px-4 gap-4"
    >
      {/* Back button */}
      <Button
        appearance="subtle"
        icon={<ArrowLeftRegular />}
        onClick={onBack}
      >
        {backLabel}
      </Button>

      {/* Breadcrumb section — only when we have an item name (UX-S14) */}
      {hasBreadcrumb && (
        <>
          <div className="h-6 w-px bg-neutral-stroke-2" aria-hidden="true" />

          {titleIcon ? (
            // App-style title: [icon] [name] without home crumb
            <div className="flex items-center gap-2">
              <span className="text-accent-primary">{titleIcon}</span>
              <Text weight="semibold">{itemName}</Text>
            </div>
          ) : (
            // Report/Dashboard breadcrumb: Home > name
            <Breadcrumb aria-label="Navigation breadcrumb">
              <BreadcrumbItem>
                <Button
                  appearance="subtle"
                  icon={<HomeRegular />}
                  onClick={onBack}
                  aria-label="Home"
                >
                  Home
                </Button>
              </BreadcrumbItem>
              <BreadcrumbItem>
                <Text>{itemName}</Text>
              </BreadcrumbItem>
            </Breadcrumb>
          )}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* NEW-PROD-4: freshness timestamp with TZ label */}
        {/* Freshness: dataset refresh time + upstream dataflow last-success time.
            Two compact lines so a "succeeded on stale data" case (the two times
            diverge) is visible at a glance. */}
        {(lastDataRefresh || dataflowRefresh) && (
          <div className="flex flex-col items-end mr-2 leading-tight">
            {renderStamp(freshnessLabel, lastDataRefresh)}
            {renderStamp('Dataflow', dataflowRefresh)}
          </div>
        )}

        {/* Transient export status message */}
        {exportStatus && (
          <Text className="text-neutral-foreground-3 text-sm mr-2">
            {exportStatus}
          </Text>
        )}

        {/* NEW-UX-3: Refresh — disabled while in-progress. When newer data has
            landed since the screen loaded, emphasize it as a "New data" nudge. */}
        {onRefresh && (
          <Button
            appearance={newDataAvailable && !isRefreshing ? 'primary' : 'subtle'}
            icon={<ArrowSyncRegular />}
            onClick={onRefresh}
            disabled={isRefreshing}
            title={
              isRefreshing
                ? 'Refreshing…'
                : newDataAvailable
                  ? 'Newer data has been published — click to update the screen'
                  : 'Refresh'
            }
            aria-label={
              isRefreshing ? 'Refreshing' : newDataAvailable ? 'New data available, refresh' : 'Refresh'
            }
          >
            {isRefreshing ? 'Refreshing…' : newDataAvailable ? 'New data — Refresh' : 'Refresh'}
          </Button>
        )}

        {/* Export PDF */}
        {onExportPdf && (
          <Button
            appearance="subtle"
            icon={<ArrowDownloadRegular />}
            onClick={onExportPdf}
            disabled={isExporting}
            title="Export current view to PDF"
          >
            {isExporting ? 'Exporting…' : 'Export PDF'}
          </Button>
        )}

        {/* Slideshow (report-only) */}
        {onSlideshow && (
          <Button
            appearance="subtle"
            icon={<PlayRegular />}
            onClick={onSlideshow}
            title="Start slideshow presentation"
          >
            Slideshow
          </Button>
        )}

        {/* Full Screen */}
        {onFullScreen && (
          <Button
            appearance="subtle"
            icon={<FullScreenMaximizeRegular />}
            onClick={onFullScreen}
            title="Enter full screen mode"
            aria-label="Full screen"
          />
        )}
      </div>
    </div>
  );
};

export default ViewerToolbar;
