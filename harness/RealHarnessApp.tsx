import React, { useEffect, useRef, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MOCK_SNAPSHOT } from './mock-data';
import { InsightsPage } from '../src/renderer/components/insights/InsightsPage';

function installElectronStub(): void {
  const api = {
    content: {
      getInsights: async () => ({ success: true as const, data: MOCK_SNAPSHOT }),
      getAllItems: async () => ({
        success: true as const,
        data: {
          reports: MOCK_SNAPSHOT.reports ?? [],
          dashboards: [] as Array<{ id: string; name: string; workspaceId: string }>,
        },
      }),
      getAdminInsights: async () => ({
        success: false as const,
        error: { code: 'ADMIN_REQUIRED', message: 'stub', userMessage: 'stub' },
      }),
    },
    usage: {
      getFrequent: async () => ({ success: true as const, data: [] as unknown[] }),
    },
  };
  (window as Window & { electronAPI?: typeof api }).electronAPI = api;
  (window as Window & { __HARNESS?: boolean }).__HARNESS = true;
}

installElectronStub();

type SetTimeScale = React.Dispatch<React.SetStateAction<number>>;

function MorphBridge({ setTimeScale }: { setTimeScale: SetTimeScale }): null {
  const speedRef = useRef(1);

  useEffect(() => {
    function getFirstTileId(): string | null {
      const el = document.querySelector<HTMLElement>('[data-workspace-tile]');
      return el ? (el.getAttribute('data-workspace-tile') ?? null) : null;
    }

    function openTile(tileId: string): void {
      const btn = document.querySelector<HTMLButtonElement>(`[data-workspace-tile="${tileId}"]`);
      if (btn) btn.click();
    }

    function closeTile(): void {
      const closeBtn = document.querySelector<HTMLButtonElement>('button[aria-label="Close details"]');
      if (closeBtn) { closeBtn.click(); return; }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    function getPhase(): string {
      const h = (window as Window & { __morphHandle?: { phase: () => string; progress: () => number } }).__morphHandle;
      return h ? h.phase() : 'idle';
    }

    function getProgress(): number {
      const h = (window as Window & { __morphHandle?: { phase: () => string; progress: () => number } }).__morphHandle;
      return h ? h.progress() : 0;
    }

    const api = {
      open(tileId: string) {
        openTile(tileId ?? (getFirstTileId() ?? ''));
      },
      close() {
        closeTile();
      },
      openThenInterruptAt(tileId: string, progress: number) {
        const id = tileId ?? (getFirstTileId() ?? '');
        openTile(id);
        const poll = (): void => {
          const ph = getPhase();
          const pr = getProgress();
          if (ph === 'opening' && pr >= progress) {
            closeTile();
            return;
          }
          if (ph === 'opening') requestAnimationFrame(poll);
        };
        requestAnimationFrame(() => requestAnimationFrame(poll));
      },
      setSpeed(mult: number) {
        speedRef.current = mult;
        setTimeScale(mult);
      },
      getTrackedRect(): DOMRect | null {
        const el = document.querySelector<HTMLElement>('.luce-sheet');
        if (!el) return null;
        return el.getBoundingClientRect();
      },
      isPointerBlocked(x: number, y: number): boolean {
        const el = document.elementFromPoint(x, y);
        if (!el) return false;
        return (el as HTMLElement).classList.contains('luce-scrim') ||
          (el.closest('[aria-modal="true"]') !== null && !el.closest('button') && !el.closest('a'));
      },
      state(): { phase: string; progress: number } {
        return { phase: getPhase(), progress: getProgress() };
      },
    };

    (window as Window & { __morph?: typeof api }).__morph = api;
  }, [setTimeScale, speedRef]);

  return null;
}

export const RealHarnessApp: React.FC = () => {
  const [timeScale, setTimeScale] = useState(1);

  return (
    <MemoryRouter>
      <MorphBridge setTimeScale={setTimeScale} />
      <InsightsPage timeScale={timeScale} />
    </MemoryRouter>
  );
};
