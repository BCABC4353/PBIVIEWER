import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@fluentui/react-components';
import {
  PenRegular,
  HighlightRegular,
  ArrowUndoRegular,
  DeleteRegular,
  DismissRegular,
} from '@fluentui/react-icons';

type AnnotationTool = 'pen' | 'highlighter';

interface Stroke {
  tool: AnnotationTool;
  points: Array<[number, number]>;
}

const STROKE_COLOR = '#FF5F15';

const TOOL_STYLE: Record<AnnotationTool, { width: number; opacity: number }> = {
  pen: { width: 3, opacity: 1 },
  highlighter: { width: 22, opacity: 0.35 },
};

const MIN_POINT_DISTANCE = 0.15;

export interface AnnotationLayerProps {
  onExit: () => void;
  className?: string;
  paletteClassName?: string;
}

export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  onExit,
  className = '',
  paletteClassName = 'bottom-6',
}) => {
  const [tool, setTool] = useState<AnnotationTool>('pen');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const draftRef = useRef<Stroke | null>(null);
  const activePointerId = useRef<number | null>(null);

  const updateDraft = (next: Stroke | null) => {
    draftRef.current = next;
    setDraft(next);
  };

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

  const toPoint = (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    return [((e.clientX - rect.left) / w) * 100, ((e.clientY - rect.top) / h) * 100];
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || activePointerId.current !== null) return;
    activePointerId.current = e.pointerId ?? -1;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
    }
    updateDraft({ tool, points: [toPoint(e)] });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const current = draftRef.current;
    if (!current || (e.pointerId ?? -1) !== activePointerId.current) return;
    const point = toPoint(e);
    const last = current.points[current.points.length - 1];
    if (!last) return;
    if (
      Math.abs(point[0] - last[0]) < MIN_POINT_DISTANCE &&
      Math.abs(point[1] - last[1]) < MIN_POINT_DISTANCE
    ) {
      return;
    }
    updateDraft({ ...current, points: [...current.points, point] });
  };

  const finishStroke = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.pointerId ?? -1) !== activePointerId.current) return;
    activePointerId.current = null;
    const current = draftRef.current;
    updateDraft(null);
    const first = current?.points[0];
    if (!current || !first) return;
    const points: Array<[number, number]> =
      current.points.length > 1
        ? current.points
        : [first, [first[0] + 0.01, first[1] + 0.01]];
    setStrokes((all) => [...all, { ...current, points }]);
  };

  const handleUndo = () => {
    setStrokes((all) => all.slice(0, -1));
  };

  const handleClear = () => {
    activePointerId.current = null;
    updateDraft(null);
    setStrokes([]);
  };

  const renderStroke = (stroke: Stroke, key: string) => (
    <polyline
      key={key}
      data-tool={stroke.tool}
      points={stroke.points.map(([x, y]) => `${x},${y}`).join(' ')}
      fill="none"
      stroke={STROKE_COLOR}
      strokeOpacity={TOOL_STYLE[stroke.tool].opacity}
      strokeWidth={TOOL_STYLE[stroke.tool].width}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );

  return (
    <div className={`absolute inset-0 ${className}`} data-annotation-layer>
      <svg
        data-annotation-surface
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full cursor-crosshair touch-none select-none"
        aria-label="Drawing surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
      >
        {strokes.map((s, i) => renderStroke(s, `s${i}`))}
        {draft && renderStroke(draft, 'draft')}
      </svg>

      <div
        role="toolbar"
        aria-label="Drawing tools"
        className={`absolute left-1/2 -translate-x-1/2 ${paletteClassName} flex items-center gap-1 bg-ink/85 rounded-full px-2 py-1.5 shadow-lg`}
      >
        <Button
          appearance={tool === 'pen' ? 'primary' : 'subtle'}
          icon={<PenRegular />}
          onClick={() => setTool('pen')}
          aria-label="Pen"
          aria-pressed={tool === 'pen'}
          title="Pen"
          className={tool === 'pen' ? undefined : 'text-white'}
        />
        <Button
          appearance={tool === 'highlighter' ? 'primary' : 'subtle'}
          icon={<HighlightRegular />}
          onClick={() => setTool('highlighter')}
          aria-label="Highlighter"
          aria-pressed={tool === 'highlighter'}
          title="Highlighter"
          className={tool === 'highlighter' ? undefined : 'text-white'}
        />
        <div className="h-5 w-px bg-white/30 mx-1" aria-hidden="true" />
        <Button
          appearance="subtle"
          icon={<ArrowUndoRegular />}
          onClick={handleUndo}
          disabled={strokes.length === 0}
          aria-label="Undo"
          title="Undo last stroke"
          className="text-white"
        />
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          onClick={handleClear}
          disabled={strokes.length === 0 && !draft}
          aria-label="Clear drawing"
          title="Clear all ink"
          className="text-white"
        />
        <div className="h-5 w-px bg-white/30 mx-1" aria-hidden="true" />
        <Button
          appearance="subtle"
          icon={<DismissRegular />}
          onClick={onExit}
          aria-label="Stop drawing"
          title="Stop drawing (Esc)"
          className="text-white"
        />
      </div>
    </div>
  );
};

export default AnnotationLayer;
