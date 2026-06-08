import { useCallback, useEffect, useRef, useState } from 'react';
import * as pbi from 'powerbi-client';

export interface PageInfo {
  name: string;
  displayName: string;
}

export interface UseFullscreenPageNavOptions {
  /** Embed container; focus is reclaimed here and fullscreen targets it. */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface UseFullscreenPageNavResult {
  pages: PageInfo[];
  setPages: React.Dispatch<React.SetStateAction<PageInfo[]>>;
  currentPageIndex: number;
  setCurrentPageIndex: React.Dispatch<React.SetStateAction<number>>;
  isFullscreen: boolean;
  showFullscreenHint: boolean;
  /** Navigate to a page by index (clamped). Updates currentPageIndex. */
  navigateToPage: (pageIndex: number) => Promise<void>;
  /**
   * Stable ref to the live page list, for callers that build Power BI event
   * handlers before the hook's state is in scope (e.g. ReportViewer's
   * pageChanged handler reads the current pages without re-creating the memo).
   */
  pagesRef: React.MutableRefObject<PageInfo[]>;
  /**
   * Lazily inject the embed handle from usePowerBIEmbed. ReportViewer must
   * build the `events` object (which this hook's owner consumes) before
   * usePowerBIEmbed returns its embedRef — a forward reference. Wiring the
   * (stable-identity) embedRef back in here lets navigateToPage read the live
   * embed. Mirrors the useSlideList/setEmbedRef pattern in PresentationMode.
   */
  setEmbedRef: (ref: React.MutableRefObject<pbi.Embed | null>) => void;
}

/**
 * ARCH-S8: Fullscreen page navigation for ReportViewer.
 *
 * Owns the page list, current-page index, fullscreen flag, and the
 * keyboard-hint timer. Wires arrow-key page nav + slicer-click focus
 * reclamation while fullscreen.
 *
 * Page-list / current-index / fullscreen-flag logic is extracted verbatim from
 * the original in-component effects in ReportViewer.tsx. ARCH-S8 also replaces
 * the original setInterval(500) focus poll with an event-driven focusout +
 * requestAnimationFrame guard that reclaims keyboard focus only when it falls to
 * <body>/null in fullscreen — never stealing it from the embed iframe or any
 * other focusable element (preserves slicer/visual interaction).
 */
export function useFullscreenPageNav(
  options: UseFullscreenPageNavOptions
): UseFullscreenPageNavResult {
  const { containerRef } = options;

  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);

  // Keep refs in sync with state for use in event handlers.
  const pagesRef = useRef<PageInfo[]>([]);
  const currentPageIndexRef = useRef(0);

  // Lazily-injected embed handle (see setEmbedRef). A ref-to-a-ref so the
  // stable-identity embedRef from usePowerBIEmbed can be wired in after this
  // hook runs, without re-rendering.
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

  // Navigate to a specific page by index.
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

  // Fullscreen change detection.
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

  // Keyboard navigation for fullscreen mode.
  // Use capture phase to intercept events before the iframe consumes them.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation when in fullscreen
      if (!document.fullscreenElement) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // CRITICAL: Stop event propagation BEFORE anything else
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const currentPages = pagesRef.current;
        const currentIdx = currentPageIndexRef.current;

        if (currentPages.length === 0) return;

        if (e.key === 'ArrowRight') {
          // Next page (wrap around)
          const nextIndex = (currentIdx + 1) % currentPages.length;
          navigateToPage(nextIndex);
        } else if (e.key === 'ArrowLeft') {
          // Previous page (wrap around)
          const prevIndex = (currentIdx - 1 + currentPages.length) % currentPages.length;
          navigateToPage(prevIndex);
        }

        // Re-focus the container to prevent iframe from receiving future events
        if (containerRef.current) {
          containerRef.current.focus();
        }
      }
    };

    // #E2: track the fire-and-forget focus-reclaim timeouts so they can be
    // cancelled on unmount / dependency-change. They're short-lived (10ms /
    // 100ms) and complete quickly — no real "leak" — but leaving them untracked
    // means a refocus can fire after teardown; tracking + clearing makes them
    // cancellable for correctness. Focus behavior is unchanged.
    const focusReclaimTimers: ReturnType<typeof setTimeout>[] = [];

    // Prevent iframe from stealing focus on mouse clicks in fullscreen
    const handleMouseDown = (e: MouseEvent) => {
      if (!document.fullscreenElement) return;

      // If clicking inside the embed container, allow the click but refocus after
      if (containerRef.current?.contains(e.target as Node)) {
        // Use multiple timeouts to ensure we regain focus
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

    // ARCH-S8: reclaim keyboard focus when it falls to <body>/null in
    // fullscreen (e.g. after a click on empty chrome) so arrow-key page nav
    // keeps working. Event-driven via focusout + requestAnimationFrame rather
    // than a polling timer. The rAF lets the browser settle focus first; we
    // only reclaim when focus landed nowhere — never stealing it from the embed
    // iframe or any real focusable element, so slicer/visual interaction is
    // preserved.
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

    // Use capture phase to intercept events before they reach the iframe
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
      // #E2: cancel any pending focus-reclaim timeouts.
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
