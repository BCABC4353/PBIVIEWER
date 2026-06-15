import React, { useRef, useState } from 'react';
import { useSharedElementMorph } from '../use-shared-element-morph';
import type { SharedElementMorphHandle } from '../use-shared-element-morph';

interface TileSpec {
  id: string;
  label: string;
  color: string;
}

const TILES: TileSpec[] = [
  { id: 'a', label: 'Alpha', color: '#4f46e5' },
  { id: 'b', label: 'Beta', color: '#0891b2' },
  { id: 'c', label: 'Gamma', color: '#059669' },
];

interface PanelProps {
  tile: TileSpec | null;
  morphRef: React.RefObject<HTMLElement | null>;
  sourceRef: React.RefObject<Element | null>;
  onOpened: () => void;
  onClosed: () => void;
  handleRef: React.RefObject<SharedElementMorphHandle | null>;
  timeScale: number;
}

function MorphPanel(props: PanelProps): React.ReactElement {
  const { tile, morphRef, sourceRef, onOpened, onClosed, handleRef, timeScale } = props;

  const handle = useSharedElementMorph({
    morphRef,
    sourceRef,
    onOpened,
    onClosed,
    timeScale,
  });

  (handleRef as React.MutableRefObject<SharedElementMorphHandle | null>).current = handle;

  return (
    <div
      ref={morphRef as React.RefObject<HTMLDivElement>}
      data-morph-node="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: tile?.color ?? '#1e1e2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transformOrigin: '0 0',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <span style={{ color: '#fff', fontSize: 32, fontWeight: 700 }}>
        {tile?.label ?? ''}
      </span>
    </div>
  );
}

interface FullMorphContract {
  open: (id: string) => void;
  close: () => void;
  interruptAt: (id: string) => void;
  setSpeed: (mult: number) => void;
  getTrackedRect: () => { x: number; y: number; width: number; height: number } | null;
  state: () => { phase: string; progress: number };
  openThenInterruptAt: (id: string, progress: number) => void;
}

export function MorphDemo(): React.ReactElement {
  const [activeTile, setActiveTile] = useState<TileSpec | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [timeScale, setTimeScale] = useState(1);

  const morphNodeRef = useRef<HTMLElement | null>(null);
  const sourceRefs = useRef<Map<string, Element | null>>(new Map());
  const activeSourceRef = useRef<Element | null>(null);
  const handleRef = useRef<SharedElementMorphHandle | null>(null);

  const onOpened = (): void => {
    setIsOpen(true);
    if (morphNodeRef.current) {
      (morphNodeRef.current as HTMLElement).style.pointerEvents = 'auto';
    }
  };

  const onClosed = (): void => {
    setIsOpen(false);
    setPanelVisible(false);
    setActiveTile(null);
    if (morphNodeRef.current) {
      (morphNodeRef.current as HTMLElement).style.pointerEvents = 'none';
    }
  };

  const openTile = (tile: TileSpec): void => {
    const sourceEl = sourceRefs.current.get(tile.id) ?? null;
    activeSourceRef.current = sourceEl;
    setActiveTile(tile);
    setPanelVisible(true);
    requestAnimationFrame(() => {
      handleRef.current?.open();
    });
  };

  const closeTile = (): void => {
    setIsOpen(false);
    if (morphNodeRef.current) {
      (morphNodeRef.current as HTMLElement).style.pointerEvents = 'none';
    }
    handleRef.current?.close();
  };

  const sourceRefProxy: React.RefObject<Element | null> = {
    get current() { return activeSourceRef.current; },
  };

  const control: FullMorphContract = {
    open: (id: string) => {
      const tile = TILES.find((t) => t.id === id);
      if (tile) openTile(tile);
    },
    close: () => closeTile(),
    interruptAt: (id: string) => {
      const tile = TILES.find((t) => t.id === id);
      if (tile && isOpen) {
        closeTile();
      } else if (tile) {
        openTile(tile);
      }
    },
    setSpeed: (mult: number) => {
      setTimeScale(mult);
    },
    getTrackedRect: () => {
      const el = document.querySelector<HTMLElement>('[data-morph-node="true"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    state: () => ({
      phase: handleRef.current?.phase() ?? 'idle',
      progress: handleRef.current?.progress() ?? 0,
    }),
    openThenInterruptAt: (id: string, progress: number) => {
      const tile = TILES.find((t) => t.id === id);
      if (!tile) return;
      openTile(tile);
      const poll = (): void => {
        const p = handleRef.current?.progress() ?? 0;
        const ph = handleRef.current?.phase() ?? 'idle';
        if (ph === 'opening' && p >= progress) {
          closeTile();
          return;
        }
        if (ph === 'opening') {
          requestAnimationFrame(poll);
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(poll));
    },
  };

  if (typeof window !== 'undefined') {
    (window as Window & { __morph?: FullMorphContract }).__morph = control;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f0f1a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', gap: 16 }}>
        {TILES.map((tile) => (
          <button
            key={tile.id}
            ref={(el) => { sourceRefs.current.set(tile.id, el); }}
            onClick={() => openTile(tile)}
            style={{
              width: 160,
              height: 90,
              background: tile.color,
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 18,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {tile.label}
          </button>
        ))}
      </div>

      {panelVisible && (
        <MorphPanel
          tile={activeTile}
          morphRef={morphNodeRef}
          sourceRef={sourceRefProxy}
          onOpened={onOpened}
          onClosed={onClosed}
          handleRef={handleRef}
          timeScale={timeScale}
        />
      )}

      {isOpen && (
        <button
          onClick={closeTile}
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 200,
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      )}
    </div>
  );
}
