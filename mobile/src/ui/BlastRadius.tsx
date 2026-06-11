import React, { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { color, radius, space, statusGlyph, type } from '../design/tokens';
import type { Refreshable } from '../core/types';
import {
  itemSeverity,
  sheetSections,
  tileCountsLine,
  type TileSeverity,
  type WorkspaceTile,
} from '../core/workspace-tiles';
import { FleetRow, RunDots } from './components';
import { latch } from '../feel/haptics';
import { motionEnabled, springs } from '../feel/springs';

const severityTone: Record<TileSeverity, string> = {
  broken: color.broken,
  attention: color.warn,
  quiet: color.neutral,
};

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}


export const WorkspaceTileCard: React.FC<{
  tile: WorkspaceTile;
  onExpand: (tile: WorkspaceTile, windowFrame: FrameRect) => void;
}> = ({ tile, onExpand }) => {
  const frameRef = useRef<View>(null);
  const tone = severityTone[tile.severity];

  const press = useCallback(() => {
    const node = frameRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      onExpand(tile, { x, y, width, height });
    });
  }, [tile, onExpand]);

  return (
    <View ref={frameRef} collapsable={false} style={tileStyles.frame}>
      <Pressable
        onPress={press}
        style={({ pressed }) => [tileStyles.card, pressed && tileStyles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${tile.workspaceName} workspace, ${tileCountsLine(tile)}. Expands.`}
      >
        <View style={[tileStyles.edge, { backgroundColor: tone }]} />
        <View style={tileStyles.body}>
          <View style={tileStyles.titleRow}>
            <Text style={[tileStyles.glyph, { color: tone }]}>{statusGlyph[tile.worst.lastStatus]}</Text>
            <Text style={tileStyles.name} numberOfLines={1}>
              {tile.workspaceName}
            </Text>
          </View>
          <Text style={tileStyles.counts} numberOfLines={1}>
            {tileCountsLine(tile)}
          </Text>
          <View style={tileStyles.worstRow}>
            <Text style={tileStyles.worstName} numberOfLines={1}>
              {tile.worst.name}
            </Text>
            <RunDots item={tile.worst} tone={tone} />
          </View>
        </View>
      </Pressable>
    </View>
  );
};

const tileStyles = StyleSheet.create({
  frame: { marginHorizontal: space.m, marginBottom: space.m },
  card: {
    flexDirection: 'row',
    backgroundColor: color.surface1,
    borderRadius: radius.card,
    overflow: 'hidden',
    minHeight: 44,
  },
  cardPressed: { backgroundColor: color.surface2, transform: [{ scale: 0.985 }] },
  edge: { width: 4 },
  body: { flex: 1, paddingHorizontal: space.m, paddingVertical: space.m, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  glyph: { fontSize: 14, width: 18, textAlign: 'center' },
  name: { ...type.body, fontWeight: '600', color: color.textPrimary, flex: 1 },
  counts: { ...type.caption, color: color.textSecondary },
  worstRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s, marginTop: 2 },
  worstName: { ...type.caption, color: color.textTertiary, flexShrink: 1 },
});


const TOP_INSET = 56;

const SETTLE = {
  stiffness: springs.card.stiffness,
  damping: springs.card.damping,
  mass: springs.card.mass,
} as const;

export const BlastSheet: React.FC<{
  tile: WorkspaceTile;
  origin: FrameRect;
  host: { width: number; height: number };
  now: number;
  onClose: () => void;
  onOpenItem?: (item: Refreshable) => void;
  downstreamNotes?: Record<string, string | undefined>;
}> = ({ tile, origin, host, now, onClose, onOpenItem, downstreamNotes }) => {
  const progress = useSharedValue(0);
  const motion = useRef(motionEnabled()).current;
  const closing = useRef(false);

  useEffect(() => {
    if (!motion) {
      progress.value = 1;
      return;
    }
    progress.value = withSpring(1, SETTLE, (finished) => {
      if (finished) runOnJS(latch)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (!motion) {
      onClose();
      return;
    }
    progress.value = withSpring(0, SETTLE, (finished) => {
      if (finished) {
        runOnJS(latch)();
        runOnJS(onClose)();
      }
    });
  }, [motion, onClose, progress]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => sub.remove();
  }, [requestClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const panelStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: interpolate(p, [0, 1], [origin.x, 0], Extrapolation.CLAMP),
      top: interpolate(p, [0, 1], [origin.y, TOP_INSET], Extrapolation.CLAMP),
      width: interpolate(p, [0, 1], [origin.width, host.width], Extrapolation.CLAMP),
      height: interpolate(p, [0, 1], [origin.height, host.height - TOP_INSET], Extrapolation.CLAMP),
      borderRadius: interpolate(p, [0, 1], [radius.card, radius.sheet], Extrapolation.CLAMP),
    };
  });

  const fillInStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const tone = severityTone[tile.severity];
  const sections = sheetSections(tile.items);

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      {}
      <Animated.View style={[StyleSheet.absoluteFill, motion ? backdropStyle : null]}>
        {motion ? (
          <BlurView
            intensity={28}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {}
        <View style={sheetStyles.dim} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Close workspace details"
        />
      </Animated.View>

      <Animated.View style={[sheetStyles.panel, panelStyle]}>
        <View style={[sheetStyles.panelEdge, { backgroundColor: tone }]} />
        <View style={sheetStyles.header}>
          <View style={sheetStyles.headerText}>
            <View style={sheetStyles.headerTitleRow}>
              <Text style={[sheetStyles.headerGlyph, { color: tone }]}>
                {statusGlyph[tile.worst.lastStatus]}
              </Text>
              <Text style={sheetStyles.headerName} numberOfLines={1}>
                {tile.workspaceName}
              </Text>
            </View>
            <Text style={sheetStyles.headerCounts} numberOfLines={1}>
              {tileCountsLine(tile)}
            </Text>
          </View>
          <Pressable
            onPress={requestClose}
            style={({ pressed }) => [sheetStyles.close, pressed && sheetStyles.closePressed]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={sheetStyles.closeGlyph}>✕</Text>
          </Pressable>
        </View>

        <Animated.View style={[sheetStyles.fillIn, motion ? fillInStyle : null]}>
          <ScrollView contentContainerStyle={sheetStyles.scrollBody} showsVerticalScrollIndicator={false}>
            {sections.map((section) => (
              <View key={section.key}>
                <Text style={sheetStyles.sectionTitle}>{section.title}</Text>
                {section.items.map((item) => (
                  <FleetRow
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    now={now}
                    variant="sheet"
                    tone={severityTone[itemSeverity(item)]}
                    downstreamNote={item.kind === 'dataflow' ? downstreamNotes?.[item.id] : undefined}
                    onPress={() => onOpenItem?.(item)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const sheetStyles = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: {
    position: 'absolute',
    backgroundColor: color.surface1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  panelEdge: { width: 4 },
  header: {
    position: 'absolute',
    left: 4,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: space.m,
    paddingTop: space.m,
  },
  headerText: { flex: 1, gap: 4 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  headerGlyph: { fontSize: 14, width: 18, textAlign: 'center' },
  headerName: { ...type.title, color: color.textPrimary, flexShrink: 1 },
  headerCounts: { ...type.caption, color: color.textSecondary },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
  closeGlyph: { ...type.body, color: color.textSecondary },

  fillIn: { flex: 1, marginTop: 88 },
  scrollBody: { paddingBottom: space.xl },
  sectionTitle: {
    ...type.micro,
    color: color.textTertiary,
    letterSpacing: 1.2,
    paddingHorizontal: space.m,
    paddingTop: space.l,
    paddingBottom: space.s,
  },
});
