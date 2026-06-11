
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

export interface SlideItem {
  type: 'page' | 'bookmark';
  name: string;
  displayName: string;
  pageName?: string;
}

export interface UseSlideListResult {
  slides: SlideItem[];
  slidesReady: boolean;
  events: { loaded: () => Promise<void> };
  setEmbedRef: (embedRef: React.MutableRefObject<pbi.Embed | null>) => void;
}

export function useSlideList(slideshowMode: string): UseSlideListResult {
  const [pages, setPages] = useState<ReportPage[]>([]);
  const [bookmarks, setBookmarks] = useState<ReportBookmark[]>([]);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [slidesReady, setSlidesReady] = useState(false);

  const embedRefHolder = useRef<React.MutableRefObject<pbi.Embed | null> | null>(null);

  const setEmbedRef = useCallback(
    (embedRef: React.MutableRefObject<pbi.Embed | null>) => {
      embedRefHolder.current = embedRef;
    },
    []
  );

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
          console.warn('Failed to get bookmarks (may not be supported):', err);
          setBookmarks([]);
        }
      },
    }),
    []
  );

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
