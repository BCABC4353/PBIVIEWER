/**
 * useSlideList
 *
 * Owns the slide-source data for PresentationMode: report pages, bookmarks,
 * the unified slide list, and the readiness flag. Also produces the Power BI
 * `loaded` event handler that pulls pages/bookmarks off the embedded report.
 *
 * - The `loaded` handler reads the live embed and is memoized with an empty dep
 *   array (a forward-reference pattern).
 * - Because usePowerBIEmbed needs `events` as an input while useSlideList needs
 *   the `embedRef` it returns, this hook owns an internal holder ref. The caller
 *   wires the real embedRef in via `setEmbedRef(embedRef)` after usePowerBIEmbed
 *   returns. The `loaded` handler resolves the embed lazily at event-fire time,
 *   so the wiring is always in place by the time it runs.
 * - The slide list is rebuilt by an effect that watches pages/bookmarks/mode,
 *   including the bookmark-mode fallback to pages.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pbi from 'powerbi-client';

interface ReportPage {
  name: string;
  displayName: string;
}

interface ReportBookmark {
  name: string;
  displayName: string;
  state?: string;
}

// Unified slide item that can be either a page or bookmark
export interface SlideItem {
  type: 'page' | 'bookmark';
  name: string;
  displayName: string;
  pageName?: string;
}

export interface UseSlideListResult {
  slides: SlideItem[];
  slidesReady: boolean;
  /**
   * Power BI embed `events` object containing the `loaded` handler. Pass this
   * straight into usePowerBIEmbed.
   */
  events: { loaded: () => Promise<void> };
  /**
   * Wire the embedRef returned by usePowerBIEmbed into this hook so the `loaded`
   * handler can read the live embed. Call once per render with the embedRef.
   */
  setEmbedRef: (embedRef: React.MutableRefObject<pbi.Embed | null>) => void;
}

export function useSlideList(slideshowMode: string): UseSlideListResult {
  const [pages, setPages] = useState<ReportPage[]>([]);
  const [bookmarks, setBookmarks] = useState<ReportBookmark[]>([]);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [slidesReady, setSlidesReady] = useState(false);

  // Internal holder for the embedRef that usePowerBIEmbed returns. Populated by
  // setEmbedRef(); read lazily inside the `loaded` handler at event-fire time.
  const embedRefHolder = useRef<React.MutableRefObject<pbi.Embed | null> | null>(null);

  const setEmbedRef = useCallback(
    (embedRef: React.MutableRefObject<pbi.Embed | null>) => {
      embedRefHolder.current = embedRef;
    },
    []
  );

  // Loaded handler — pull pages and (optionally) bookmarks. Slides list is
  // rebuilt by a separate effect that watches pages/bookmarks/slideshowMode.
  const events = useMemo(
    () => ({
      loaded: async () => {
        const report = (embedRefHolder.current?.current ?? null) as pbi.Report | null;
        if (!report) return;

        try {
          const reportPages = await report.getPages();
          const visiblePages = reportPages
            .filter((p) => p.visibility !== 1)
            .map((p) => ({
              name: p.name,
              displayName: p.displayName,
            }));
          setPages(visiblePages);
        } catch (err) {
          console.error('Failed to get pages:', err);
        }

        try {
          const bookmarksManager = report.bookmarksManager;
          const reportBookmarks = await bookmarksManager.getBookmarks();
          const bookmarksList = reportBookmarks.map((b) => ({
            name: b.name,
            displayName: b.displayName || b.name,
            state: b.state,
          }));
          setBookmarks(bookmarksList);
        } catch (err) {
          // Bookmarks may not be available for all reports
          console.warn('Failed to get bookmarks (may not be supported):', err);
          setBookmarks([]);
        }
      },
    }),
    // The holder ref is stable; its identity never changes between renders, so
    // there are no reactive dependencies to track here.
    []
  );

  // Build slides list based on slideshowMode when pages/bookmarks change
  useEffect(() => {
    const newSlides: SlideItem[] = [];

    if (slideshowMode === 'pages' || slideshowMode === 'both') {
      for (const page of pages) {
        newSlides.push({
          type: 'page',
          name: page.name,
          displayName: page.displayName,
        });
      }
    }

    if (slideshowMode === 'bookmarks' || slideshowMode === 'both') {
      for (const bookmark of bookmarks) {
        newSlides.push({
          type: 'bookmark',
          name: bookmark.name,
          displayName: bookmark.displayName,
        });
      }
    }

    // Fallback: if no slides available in bookmark mode, use pages
    if (newSlides.length === 0 && pages.length > 0) {
      for (const page of pages) {
        newSlides.push({
          type: 'page',
          name: page.name,
          displayName: page.displayName,
        });
      }
    }

    setSlides(newSlides);
    setSlidesReady(newSlides.length > 0);
  }, [pages, bookmarks, slideshowMode]);

  return { slides, slidesReady, events, setEmbedRef };
}

export default useSlideList;
