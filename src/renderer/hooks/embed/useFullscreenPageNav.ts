import { useCallback, useEffect, useRef, useState } from 'react';
import * as pbi from 'powerbi-client';

export interface PageInfo {
  name: string;
  displayName: string;
}

export interface UseFullscreenPageNavOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface UseFullscreenPageNavResult {
  pages: PageInfo[];
  setPages: React.Dispatch<React.SetStateAction<PageInfo[]>>;
  currentPageIndex: number;
  setCurrentPageIndex: React.Dispatch<React.SetStateAction<number>>;
  isFullscreen: boolean;
  showFullscreenHint: boolean;
  navigateToPage: (pageIndex: number) => Promise<void>;
  pagesRef: React.MutableRefObject<PageInfo[]>;
  setEmbedRef: (ref: React.MutableRefObject<pbi.Embed | null>) => void;
}

export function useFullscreenPageNav(
  options: UseFullscreenPageNavOptions
): UseFullscreenPageNavResult {
  const { containerRef } = options;

  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);

  const pagesRef = useRef<PageInfo[]>([]);
  const currentPageIndexRef = useRef(0);

  const embedRefHolder = useRef<React.MutableRefObject<pbi.Embed | null> | null>(
    null
  );
  const setEmbedRef = useCallback(
    (ref: React.MutableRefObject<pbi.Embed | null>) => {
      embedRefHolder.current = ref;
    },
    []
  );

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  const navigateToPage = useCallback(
    async (pageIndex: number) => {
      const report = embedRefHolder.current?.current as pbi.Report | null;
      if (!report || pagesRef.current.length === 0) return;

      const targetIndex = Math.max(0, Math.min(pageIndex, pagesRef.current.length - 1));
      const targetPage = pagesRef.current[targetIndex];

      if (targetPage) {
        try {
          await report.setPage(targetPage.name);
          setCurrentPageIndex(targetIndex);
        } catch (error) {
          console.warn('[ReportViewer] Page navigation failed:', error);
        }
      }
    },
    []
  );

  useEffect(() => {
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);

      if (isNowFullscreen) {
        if (containerRef.current) {
          containerRef.current.focus();
        }
        if (pages.length > 1) {
          setShowFullscreenHint(true);
          if (hintTimer) clearTimeout(hintTimer);
          hintTimer = setTimeout(() => setShowFullscreenHint(false), 5000);
        }
      } else {
        setShowFullscreenHint(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, [pages.length, containerRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!document.fullscreenElement) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const currentPages = pagesRef.current;
        const currentIdx = currentPageIndexRef.current;

        if (currentPages.length === 0) return;

        if (e.key === 'ArrowRight') {
          const nextIndex = (currentIdx + 1) % currentPages.length;
          navigateToPage(nextIndex);
        } else if (e.key === 'ArrowLeft') {
          const prevIndex = (currentIdx - 1 + currentPages.length) % currentPages.length;
          navigateToPage(prevIndex);
        }

        if (containerRef.current) {
          containerRef.current.focus();
        }
      }
    };

    const focusReclaimTimers: ReturnType<typeof setTimeout>[] = [];

    const handleMouseDown = (e: MouseEvent) => {
      if (!document.fullscreenElement) return;

      if (containerRef.current?.contains(e.target as Node)) {
        focusReclaimTimers.push(
          setTimeout(() => {
            if (containerRef.current && document.fullscreenElement) {
              containerRef.current.focus();
            }
          }, 10)
        );
        focusReclaimTimers.push(
          setTimeout(() => {
            if (containerRef.current && document.fullscreenElement) {
              containerRef.current.focus();
            }
          }, 100)
        );
      }
    };

    let rafId: number | null = null;
    const reclaimFocusIfLost = () => {
      rafId = null;
      if (!document.fullscreenElement || !containerRef.current) return;
      const active = document.activeElement;
      if (active === document.body || active === null) {
        containerRef.current.focus();
      }
    };
    const handleFocusOut = () => {
      if (!document.fullscreenElement) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(reclaimFocusIfLost);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('focusout', handleFocusOut);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      for (const t of focusReclaimTimers) {
        clearTimeout(t);
      }
    };
  }, [navigateToPage, containerRef]);

  return {
    pages,
    setPages,
    currentPageIndex,
    setCurrentPageIndex,
    isFullscreen,
    showFullscreenHint,
    navigateToPage,
    pagesRef,
    setEmbedRef,
  };
}
