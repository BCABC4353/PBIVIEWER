
import React, { useEffect, useState } from 'react';
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
  CheckmarkCircleRegular,
} from '@fluentui/react-icons';

const REFRESH_FLASH_MS = 5000;

export interface ViewerToolbarProps {
  onBack: () => void;
  backLabel?: string;
  itemName?: string;
  titleIcon?: React.ReactNode;
  lastDataRefresh?: string | null;
  exportStatus?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onExportPdf?: () => void;
  isExporting?: boolean;
  onFullScreen?: () => void;
  onSlideshow?: () => void;
  showRelativeAge?: boolean;
  newDataAvailable?: boolean;
  dataflowRefresh?: string | null;
  freshnessLabel?: string;
  showFreshness?: boolean;
  justRefreshedAt?: number | null;
  freshnessDiagnostic?: string | null;
}

function formatRelativeAge(ageMs: number): string {
  const mins = Math.max(0, Math.floor(ageMs / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return mins === 1 ? '1 min ago' : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function formatRefreshTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  let tz = '';
  try {
    tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
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
  showFreshness = false,
  justRefreshedAt = null,
  freshnessDiagnostic = null,
}) => {
  const hasBreadcrumb = Boolean(itemName);

  const [flashActive, setFlashActive] = useState(false);
  useEffect(() => {
    if (!justRefreshedAt) return;
    setFlashActive(true);
    const timer = setTimeout(() => setFlashActive(false), REFRESH_FLASH_MS);
    return () => clearTimeout(timer);
  }, [justRefreshedAt]);

  const renderStamp = (
    label: string,
    iso?: string | null,
    placeholder = false,
    extraTitle?: string | null,
  ): React.ReactNode => {
    const withExtra = (base?: string) =>
      [base, extraTitle].filter(Boolean).join(' · ') || undefined;
    if (!iso) {
      if (!placeholder) return null;
      return (
        <Text
          className="text-neutral-foreground-3 text-xs whitespace-nowrap"
          title={withExtra(`${label}: not yet known`)}
        >
          {label}: —
        </Text>
      );
    }
    const ageMs = Date.now() - new Date(iso).getTime();
    const isStale = Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000;
    let relative = '';
    if (showRelativeAge && Number.isFinite(ageMs)) {
      relative = ` (${formatRelativeAge(ageMs)})`;
    }
    const formatted = formatRefreshTime(iso);
    if (!formatted) return null;
    const tone = flashActive
      ? 'text-status-success'
      : isStale
        ? 'text-status-warning'
        : 'text-neutral-foreground-3';
    return (
      <Text
        className={`${tone} text-xs whitespace-nowrap`}
        title={withExtra(isStale ? `${label} is more than a day old` : undefined)}
      >
        {isStale && !flashActive ? '⚠ ' : ''}
        {label}: {formatted}
        {relative}
      </Text>
    );
  };

  return (
    <div
      data-viewer-toolbar
      className="h-12 bg-neutral-background-2 border-b border-neutral-stroke-2 flex items-center px-4 gap-4"
    >
      {}
      <Button
        appearance="subtle"
        icon={<ArrowLeftRegular />}
        onClick={onBack}
      >
        {backLabel}
      </Button>

      {}
      {hasBreadcrumb && (
        <>
          <div className="h-6 w-px bg-neutral-stroke-2" aria-hidden="true" />

          {}
          {titleIcon ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-accent-primary shrink-0">{titleIcon}</span>
              <Text weight="semibold" className="truncate" title={itemName}>
                {itemName}
              </Text>
            </div>
          ) : (
            <div className="min-w-0 overflow-hidden">
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
                  <Text className="truncate" title={itemName}>
                    {itemName}
                  </Text>
                </BreadcrumbItem>
              </Breadcrumb>
            </div>
          )}
        </>
      )}

      {}
      <div className="flex-1" />

      {}
      <div className="flex items-center gap-2 shrink-0">
        {}
        {(showFreshness || lastDataRefresh || dataflowRefresh) && (
          <div
            className="flex items-center gap-2 mr-2"
            role="status"
            aria-live="polite"
            data-freshness-strip
          >
            {flashActive ? (
              <span className="flex items-center gap-1 text-status-success text-xs whitespace-nowrap">
                <CheckmarkCircleRegular aria-hidden="true" />
                Updated
              </span>
            ) : newDataAvailable && !isRefreshing ? (
              <span
                className="text-accent-primary text-xs whitespace-nowrap"
                title="The dataset has refreshed since this screen loaded — click Refresh to update"
              >
                ● Newer data available
              </span>
            ) : null}
            <div className="flex flex-col items-end leading-tight">
              {renderStamp(freshnessLabel, lastDataRefresh, showFreshness, freshnessDiagnostic)}
              {renderStamp('Dataflow', dataflowRefresh, showFreshness)}
            </div>
          </div>
        )}

        {}
        {exportStatus && (
          <Text className="text-neutral-foreground-3 text-sm mr-2">
            {exportStatus}
          </Text>
        )}

        {}
        {onRefresh && (
          <Button
            appearance="subtle"
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
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        )}

        {}
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

        {}
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

        {}
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
