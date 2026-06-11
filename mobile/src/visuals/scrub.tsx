import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, type LayoutChangeEvent } from 'react-native';
import { color, space, type } from '../design/tokens';
import { detent } from '../feel/haptics';
import { scrubHintGate } from './scrub-hint';

const TAP_SLOP = 4;

export interface ScrubState {
  width: number;
  selected: number | null;
  hintVisible: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
}

export function useScrub(
  count: number,
  indexForX: (x: number, width: number, count: number) => number,
): ScrubState {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [hintVisible, setHintVisible] = useState(() => scrubHintGate.claim());
  const widthRef = useRef(0);
  const countRef = useRef(count);
  countRef.current = count;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const movedRef = useRef(false);

  useEffect(() => {
    if (!hintVisible) return;
    return scrubHintGate.onDismiss(() => setHintVisible(false));
  }, [hintVisible]);

  const scrubTo = useCallback(
    (x: number) => {
      scrubHintGate.dismiss();
      const idx = indexForX(x, widthRef.current, countRef.current);
      if (idx < 0 || idx === selectedRef.current) return;
      selectedRef.current = idx;
      setSelected(idx);
      detent();
    },
    [indexForX],
  );

  const endTouch = useCallback(() => {
    if (!movedRef.current) {
      selectedRef.current = null;
      setSelected(null);
    }
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: (_e, g) => Math.abs(g.dy) > Math.abs(g.dx),
        onShouldBlockNativeResponder: (_e, g) => Math.abs(g.dx) >= Math.abs(g.dy),
        onPanResponderGrant: (e) => {
          movedRef.current = false;
          scrubTo(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e, g) => {
          if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) movedRef.current = true;
          scrubTo(e.nativeEvent.locationX);
        },
        onPanResponderRelease: endTouch,
        onPanResponderTerminate: endTouch,
      }),
    [scrubTo, endTouch],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    widthRef.current = w;
    setWidth(w);
  }, []);

  return { width, selected, hintVisible, onLayout, panHandlers: pan.panHandlers };
}

export const ScrubHintCaption: React.FC<{ visible: boolean }> = ({ visible }) =>
  visible ? <Text style={styles.hint}>Touch and hold to inspect values</Text> : null;

const styles = StyleSheet.create({
  hint: { ...type.micro, color: color.textTertiary, textAlign: 'center', marginTop: space.s },
});
