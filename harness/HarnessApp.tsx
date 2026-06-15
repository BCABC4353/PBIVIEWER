import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { HashRouter, MemoryRouter } from 'react-router-dom';
import { MOCK_SNAPSHOT } from './mock-data';
import { groupByWorkspace, triageSortGroups } from '../src/renderer/components/insights/insights-luce';
import { WorkspaceTile } from '../src/renderer/components/insights/WorkspaceTile';
import { WorkspaceSheet } from '../src/renderer/components/insights/WorkspaceSheet';
import '../src/renderer/components/insights/insights-luce.css';

type Phase = 'idle' | 'opening' | 'open' | 'closing';

interface MorphState {
  phase: Phase;
  progress: number;
}

interface ActiveVt {
  skipTransition: () => void;
  finished: Promise<unknown>;
}

const BASE_MORPH_DURATION_MS = 420;
const BLAST_EMPTY = {
  suspectsByDataflow: new Map<string, unknown[]>(),
  reportsByDataset: new Map<string, unknown[]>(),
  suspectDatasetIds: new Set<string>(),
};

const groups = triageSortGroups(
  groupByWorkspace(MOCK_SNAPSHOT.refreshables),
  BLAST_EMPTY.suspectDatasetIds,
);

export const HarnessApp: React.FC = () => {
  const [sheet, setSheet] = useState<{ workspaceId: string; el: HTMLElement | null } | null>(null);
  const [morphId, setMorphId] = useState<string | null>(null);
  const [sheetSettled, setSheetSettled] = useState(true);
  const [speedMult, setSpeedMult] = useState(1);

  const phaseRef = useRef<Phase>('idle');
  const progressRef = useRef(0);
  const activeVtRef = useRef<ActiveVt | null>(null);
  const sheetIntentRef = useRef<{ workspaceId: string; el: HTMLElement } | null>(null);
  const animStartRef = useRef(0);
  const animDurRef = useRef(BASE_MORPH_DURATION_MS);
  const rafRef = useRef<number | null>(null);

  const updateProgress = useCallback(() => {
    const elapsed = performance.now() - animStartRef.current;
    const dur = animDurRef.current;
    progressRef.current = Math.min(elapsed / dur, 1);
    if (progressRef.current < 1) {
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const startProgressTracking = useCallback((dur: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    animStartRef.current = performance.now();
    animDurRef.current = dur;
    progressRef.current = 0;
    rafRef.current = requestAnimationFrame(updateProgress);
  }, [updateProgress]);

  const stopProgressTracking = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const applySpeed = useCallback((mult: number) => {
    const dur = BASE_MORPH_DURATION_MS / mult;
    document.documentElement.style.setProperty('--morph-open', `${dur}ms`);
    animDurRef.current = dur;
  }, []);

  useEffect(() => {
    applySpeed(speedMult);
  }, [speedMult, applySpeed]);

  const openSheet = useCallback((workspaceId: string, el: HTMLElement) => {
    sheetIntentRef.current = { workspaceId, el };
    if (typeof document.startViewTransition !== 'function') {
      setSheetSettled(true);
      setSheet({ workspaceId, el });
      phaseRef.current = 'open';
      return;
    }
    phaseRef.current = 'opening';
    progressRef.current = 0;
    document.documentElement.classList.remove('vt-closing');
    flushSync(() => {
      setSheetSettled(false);
      setMorphId(workspaceId);
    });
    activeVtRef.current?.skipTransition();
    const dur = BASE_MORPH_DURATION_MS / speedMult;
    startProgressTracking(dur);
    const vt = document.startViewTransition(() => {
      flushSync(() => setSheet({ workspaceId, el }));
    });
    activeVtRef.current = vt;
    void vt.finished.then(() => {
      phaseRef.current = 'open';
      progressRef.current = 1;
      stopProgressTracking();
      setSheetSettled(true);
    }).catch(() => {
      phaseRef.current = 'idle';
      stopProgressTracking();
    });
  }, [speedMult, startProgressTracking, stopProgressTracking]);

  const closeSheet = useCallback(() => {
    const current = sheet ?? (sheetIntentRef.current ? { workspaceId: sheetIntentRef.current.workspaceId, el: sheetIntentRef.current.el } : null);
    if (!current) return;
    sheetIntentRef.current = null;
    if (typeof document.startViewTransition !== 'function') {
      flushSync(() => setSheet(null));
      phaseRef.current = 'idle';
      return;
    }
    phaseRef.current = 'closing';
    progressRef.current = 0;
    document.documentElement.classList.add('vt-closing');
    activeVtRef.current?.skipTransition();
    const closeDur = (BASE_MORPH_DURATION_MS / speedMult) * 0.77;
    startProgressTracking(closeDur);
    const vt = document.startViewTransition(() => {
      flushSync(() => {
        setMorphId(current.workspaceId);
        setSheet(null);
      });
    });
    activeVtRef.current = vt;
    void vt.finished.then(() => {
      phaseRef.current = 'idle';
      progressRef.current = 1;
      stopProgressTracking();
      document.documentElement.classList.remove('vt-closing');
      setMorphId((prev) => (prev === current.workspaceId ? null : prev));
    }).catch(() => {
      phaseRef.current = 'idle';
      stopProgressTracking();
    });
  }, [sheet, speedMult, startProgressTracking, stopProgressTracking]);

  useEffect(() => {
    const api = {
      open(tileId: string) {
        const group = groups.find((g) => g.workspaceId === tileId);
        if (!group) return;
        const el = document.querySelector<HTMLElement>(`[data-workspace-tile="${tileId}"]`);
        openSheet(tileId, el ?? document.body);
      },
      close() {
        closeSheet();
      },
      openThenInterruptAt(tileId: string, progress: number) {
        const group = groups.find((g) => g.workspaceId === tileId);
        if (!group) return;
        const el = document.querySelector<HTMLElement>(`[data-workspace-tile="${tileId}"]`);
        openSheet(tileId, el ?? document.body);
        const dur = BASE_MORPH_DURATION_MS / speedMult;
        const delay = Math.max(0, Math.floor(progress * dur));
        setTimeout(() => {
          if (phaseRef.current === 'opening' || phaseRef.current === 'open') {
            closeSheet();
          }
        }, delay);
      },
      setSpeed(multiplier: number) {
        setSpeedMult(multiplier);
        applySpeed(multiplier);
      },
      getTrackedRect(): DOMRect | null {
        const el = document.querySelector<HTMLElement>('.luce-sheet') ??
          document.querySelector<HTMLElement>(`[data-workspace-tile="${morphId}"]`);
        if (!el) return null;
        return el.getBoundingClientRect();
      },
      isPointerBlocked(x: number, y: number): boolean {
        const el = document.elementFromPoint(x, y);
        if (!el) return false;
        return el.classList.contains('luce-scrim') ||
          (el as HTMLElement).style?.pointerEvents === 'none' ||
          el.closest('[aria-modal="true"]') !== null && !el.closest('button') && !el.closest('a');
      },
      state(): MorphState {
        return { phase: phaseRef.current, progress: progressRef.current };
      },
    };
    (window as Window & { __morph?: typeof api }).__morph = api;
  }, [openSheet, closeSheet, applySpeed, speedMult, morphId]);

  const sheetGroup = sheet ? groups.find((g) => g.workspaceId === sheet.workspaceId) ?? null : null;

  return (
    <MemoryRouter>
      <div
        className="luce-board"
        style={{ minHeight: '100vh', color: 'rgba(255,255,255,0.64)', padding: 32 }}
      >
        <div
          style={sheet ? { pointerEvents: 'none' } : undefined}
        >
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
              Morph Harness — Baseline Reel
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              {groups.length} workspace tiles. Use window.__morph to drive.
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {groups.map((g) => (
              <WorkspaceTile
                key={g.workspaceId}
                group={g}
                affectedCount={0}
                morphSource={!sheet && morphId === g.workspaceId}
                onOpen={(el) => openSheet(g.workspaceId, el)}
              />
            ))}
          </div>
        </div>
        {sheetGroup && (
          <WorkspaceSheet
            group={sheetGroup}
            blast={BLAST_EMPTY as Parameters<typeof WorkspaceSheet>[0]['blast']}
            reports={MOCK_SNAPSHOT.reports}
            usage={[]}
            catalog={[]}
            settled={sheetSettled}
            onClose={closeSheet}
          />
        )}
      </div>
    </MemoryRouter>
  );
};
