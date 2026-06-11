import { useRef, useState } from 'react';
import type * as pbi from 'powerbi-client';


export interface ViewerExportOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  getReportMeta?: (
    embedRef: React.MutableRefObject<pbi.Embed | null>
  ) => Promise<{ pageName?: string; bookmarkState?: string } | undefined>;
  reportExportIds?: { reportId: string; workspaceId: string };
}

export interface ViewerExportResult {
  isExporting: boolean;
  exportStatus: string | null;
  handleExportPdf: (embedRef: React.MutableRefObject<pbi.Embed | null>) => Promise<void>;
}

const isExportFeatureUnavailable = (message?: string): boolean => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('featurenotavailable') ||
    lower.includes('feature not available') ||
    lower.includes('404')
  );
};

export function useViewerExport(options: ViewerExportOptions): ViewerExportResult {
  const { containerRef, getReportMeta, reportExportIds } = options;

  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportInFlightRef = useRef(false);

  const showExportStatus = (message: string) => {
    setExportStatus(message);
    if (exportTimeoutRef.current) {
      clearTimeout(exportTimeoutRef.current);
    }
    exportTimeoutRef.current = setTimeout(() => {
      setExportStatus(null);
    }, 4000);
  };

  const handleExportPdf = async (
    embedRef: React.MutableRefObject<pbi.Embed | null>
  ): Promise<void> => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setIsExporting(true);
    try {
      const pathResponse = await window.electronAPI.export.choosePdfPath();
      if (!pathResponse.success) {
        if (pathResponse.error.code === 'CANCELLED') {
          showExportStatus('Export cancelled');
          return;
        }
        showExportStatus(pathResponse.error.message || 'Export cancelled');
        return;
      }

      const filePath = pathResponse.data.path;

      if (reportExportIds && getReportMeta) {
        const meta = await getReportMeta(embedRef);
        if (!meta) {
          showExportStatus('Report not ready');
          return;
        }

        const apiResponse = await window.electronAPI.content.exportReportToPdf(
          reportExportIds.reportId,
          reportExportIds.workspaceId,
          meta.pageName,
          meta.bookmarkState,
          filePath
        );

        if (apiResponse.success) {
          showExportStatus('Exported to PDF');
          return;
        }

        if (apiResponse.error.code === 'CANCELLED') {
          showExportStatus('Export cancelled');
          return;
        }

        const apiMsg = apiResponse.error.message || 'Export failed';
        if (!isExportFeatureUnavailable(apiMsg)) {
          showExportStatus(apiMsg);
          return;
        }

        const report = embedRef.current as pbi.Report | null;
        let hidPanes = false;
        if (report) {
          try {
            await report.updateSettings({
              panes: {
                filters: { visible: false, expanded: false },
                pageNavigation: { visible: false },
              },
              navContentPaneEnabled: false,
            });
            hidPanes = true;
            await new Promise<void>((resolve) => setTimeout(resolve, 500));
          } catch (err) {
            console.warn('[useViewerExport] Settings update for export failed:', err);
          }
        }

        const rect = containerRef.current?.getBoundingClientRect();
        const bounds =
          rect && rect.width > 0 && rect.height > 0
            ? {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
              }
            : undefined;

        const fallbackResponse = await window.electronAPI.export.currentViewToPdf({
          bounds,
          insets: { right: 40, bottom: 40 },
          filePath,
        });

        if (fallbackResponse.success) {
          showExportStatus('Exported to PDF');
        } else if (fallbackResponse.error.code === 'CANCELLED') {
          showExportStatus('Export cancelled');
        } else {
          showExportStatus(fallbackResponse.error.message || 'Export failed');
        }

        if (hidPanes && report) {
          try {
            await report.updateSettings({
              panes: {
                filters: { visible: true, expanded: false },
                pageNavigation: { visible: true },
              },
              navContentPaneEnabled: true,
            });
          } catch (err) {
            console.warn('[useViewerExport] Settings restore after export failed:', err);
          }
        }
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      const bounds =
        rect && rect.width > 0 && rect.height > 0
          ? {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            }
          : undefined;

      const response = await window.electronAPI.export.currentViewToPdf({
        bounds,
        filePath,
      });

      if (response.success) {
        showExportStatus('Exported to PDF');
      } else if (response.error.code === 'CANCELLED') {
        showExportStatus('Export cancelled');
      } else {
        showExportStatus(response.error.message || 'Export failed');
      }
    } catch (err) {
      showExportStatus(err instanceof Error ? err.message : 'Export failed');
    } finally {
      exportInFlightRef.current = false;
      setIsExporting(false);
    }
  };

  return { isExporting, exportStatus, handleExportPdf };
}
