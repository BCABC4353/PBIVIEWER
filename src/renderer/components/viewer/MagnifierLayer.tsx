import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Text } from '@fluentui/react-components';
import {
  ZoomInRegular,
  ZoomOutRegular,
  ArrowResetRegular,
  DismissRegular,
} from '@fluentui/react-icons';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const WHEEL_SENSITIVITY = 0.0015;
const BUTTON_STEP = 1.4;
const DOUBLE_CLICK_SCALE = 2.5;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export interface MagnifierLayerProps {
  targetRef: React.RefObject<HTMLElement | null>;
  onExit: () => void;
  className?: string;
  paletteClassName?: string;
}

export const MagnifierLayer: React.FC<MagnifierLayerProps> = ({
  targetRef,
  onExit,
  className = '',
  paletteClassName = 'bottom-6',
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const panPointerId = useRef<number | null>(null);
  const lastPan = useRef<[number, number] | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const surfaceRect = useCallback((): { width: number; height: number; left: number; top: number } => {
    const el = overlayRef.current;
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return { width: 1, height: 1, left: 0, top: 0 };
    }
    const r = el.getBoundingClientRect();
    return { width: r.width || 1, height: r.height || 1, left: r.left, top: r.top };
  }, []);

  const clampPan = useCallback(
    (s: number): void => {
      const { width, height } = surfaceRect();
      txRef.current = clamp(txRef.current, width * (1 - s), 0);
      tyRef.current = clamp(tyRef.current, height * (1 - s), 0);
    },
    [surfaceRect],
  );

  const applyTransform = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    const s = scaleRef.current;
    if (s === 1) {
      txRef.current = 0;
      tyRef.current = 0;
      target.style.transform = '';
      target.style.transformOrigin = '';
      target.style.willChange = '';
    } else {
      target.style.transformOrigin = '0 0';
      target.style.transform = `translate(${txRef.current}px, ${tyRef.current}px) scale(${s})`;
      target.style.willChange = 'transform';
    }
    setZoomPct(Math.round(s * 100));
  }, [targetRef]);

  const zoomAt = useCallback(
    (px: number, py: number, nextScale: number) => {
      const s0 = scaleRef.current;
      const s1 = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (s1 === s0) return;
      txRef.current = px - (px - txRef.current) * (s1 / s0);
      tyRef.current = py - (py - tyRef.current) * (s1 / s0);
      scaleRef.current = s1;
      clampPan(s1);
      applyTransform();
    },
    [applyTransform, clampPan],
  );

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { left, top } = surfaceRect();
      zoomAt(
        e.clientX - left,
        e.clientY - top,
        scaleRef.current * Math.exp(-e.deltaY * WHEEL_SENSITIVITY),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, surfaceRect]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onExit();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onExit]);

  useEffect(() => {
    const target = targetRef.current;
    return () => {
      if (!target) return;
      target.style.transform = '';
      target.style.transformOrigin = '';
      target.style.willChange = '';
    };
  }, [targetRef]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || scaleRef.current === 1 || panPointerId.current !== null) return;
    panPointerId.current = e.pointerId ?? -1;
    lastPan.current = [e.clientX, e.clientY];
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lastPan.current === null || (e.pointerId ?? -1) !== panPointerId.current) return;
    const [lx, ly] = lastPan.current;
    txRef.current += e.clientX - lx;
    tyRef.current += e.clientY - ly;
    lastPan.current = [e.clientX, e.clientY];
    clampPan(scaleRef.current);
    applyTransform();
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.pointerId ?? -1) !== panPointerId.current) return;
    panPointerId.current = null;
    lastPan.current = null;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scaleRef.current > 1) {
      scaleRef.current = 1;
      applyTransform();
      return;
    }
    const { left, top } = surfaceRect();
    zoomAt(e.clientX - left, e.clientY - top, DOUBLE_CLICK_SCALE);
  };

  const zoomStep = (dir: 1 | -1) => {
    const { width, height } = surfaceRect();
    zoomAt(width / 2, height / 2, scaleRef.current * (dir === 1 ? BUTTON_STEP : 1 / BUTTON_STEP));
  };

  const reset = () => {
    scaleRef.current = 1;
    applyTransform();
  };

  return (
    <div className={`absolute inset-0 ${className}`} data-magnifier-layer>
      <div
        ref={overlayRef}
        data-magnifier-surface
        aria-label="Zoom surface"
        className="absolute inset-0 touch-none select-none"
        style={{ cursor: zoomPct > 100 ? 'grab' : 'zoom-in' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={handleDoubleClick}
      />

      <div
        role="toolbar"
        aria-label="Zoom controls"
        className={`absolute left-1/2 -translate-x-1/2 ${paletteClassName} flex items-center gap-1 bg-ink/85 rounded-full px-2 py-1.5 shadow-lg`}
      >
        <Button
          appearance="subtle"
          icon={<ZoomOutRegular />}
          onClick={() => zoomStep(-1)}
          disabled={zoomPct <= 100}
          aria-label="Zoom out"
          title="Zoom out (scroll down)"
          className="text-white"
        />
        <Text
          data-zoom-readout
          className="text-white text-center"
          style={{ fontSize: 12, minWidth: 44, fontVariantNumeric: 'tabular-nums' }}
          aria-live="polite"
        >
          {zoomPct}%
        </Text>
        <Button
          appearance="subtle"
          icon={<ZoomInRegular />}
          onClick={() => zoomStep(1)}
          disabled={zoomPct >= MAX_SCALE * 100}
          aria-label="Zoom in"
          title="Zoom in (scroll up)"
          className="text-white"
        />
        <div className="h-5 w-px bg-white/30 mx-1" aria-hidden="true" />
        <Button
          appearance="subtle"
          icon={<ArrowResetRegular />}
          onClick={reset}
          disabled={zoomPct <= 100}
          aria-label="Reset zoom"
          title="Reset to 100% (double-click)"
          className="text-white"
        />
        <div className="h-5 w-px bg-white/30 mx-1" aria-hidden="true" />
        <Button
          appearance="subtle"
          icon={<DismissRegular />}
          onClick={onExit}
          aria-label="Stop zooming"
          title="Stop zooming (Esc)"
          className="text-white"
        />
      </div>
    </div>
  );
};

export default MagnifierLayer;
