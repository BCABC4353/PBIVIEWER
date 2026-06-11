/**
 * BlastRadius — the fleet board's workspace TILES and their full-screen
 * expansion (docs/design/BLAST-RADIUS.md, phone pattern).
 *
 * The interaction: each workspace is a tile (status edge, worst pulse dots,
 * counts). Tap → the tile EXPANDS into a sheet on ONE continuous reanimated
 * settle spring (springs.card — the house "card expand/collapse" curve,
 * ~400ms feel), growing from the tile's measured frame while the board blurs
 * and dims behind it. Tap the dimmed strip, the close affordance, or Android
 * system back → it contracts the same way in reverse. Nothing teleports; the
 * tile literally becomes the sheet (FLIP on layout, not a fade-swap).
 *
 * Haptics: ONE light detent (haptics.latch) when the sheet latches fully
 * open, ONE when it lands fully closed. The travel is silent.
 *
 * Reduce Motion: instant open/close, static dim instead of animated blur,
 * no haptics.
 *
 * Inside, items are organized BY TYPE — dataflows (upstream) first, then
 * datasets (core/blast-radius.ts, unit-tested). Each dataflow row carries a
 * downstream-damage annotation SLOT (`downstreamNotes`), hidden when absent —
 * the cascade data arrives with the blast-radius spine; nothing is fabricated.
 */
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
} from '../core/blast-radius';
import { FleetRow, RunDots } from './components';
import { latch } from '../feel/haptics';
import { motionEnabled, springs } from '../feel/springs';

/** Severity → tone, straight from tokens: red is broken's alone. */
const severityTone: Record<TileSeverity, string> = {
  broken: color.broken,
  attention: color.warn,
  quiet: color.neutral,
};

/** A measured rectangle, relative to the fleet screen's overlay host. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// WorkspaceTileCard — the collapsed face on the board
// ---------------------------------------------------------------------------

export const WorkspaceTileCard: React.FC<{
  tile: WorkspaceTile;
  /** Called with the tile's frame in WINDOW coordinates — the expansion origin. */
  onExpand: (tile: WorkspaceTile, windowFrame: FrameRect) => void;
}> = ({ tile, onExpand }) => {
  const frameRef = useRef<View>(null);
  const tone = severityTone[tile.severity];

  const press = useCallback(() => {
    // measureInWindow, not onLayout: the tile lives in a scrolled list, so
    // only window coordinates are honest about where it is RIGHT NOW.
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
    minHeight: 44, // floor; real tiles run ~96pt
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

// ---------------------------------------------------------------------------
// BlastSheet — the expanded tile
// ---------------------------------------------------------------------------

/** The blurred board stays visible above the open sheet — and is tappable to close. */
const TOP_INSET = 56;

/** The settle spring (springs.card: SwiftUI 0.42/0.82 — ~400ms card expand),
 *  re-expressed for reanimated's withSpring (same physical triple). */
const SETTLE = {
  stiffness: springs.card.stiffness,
  damping: springs.card.damping,
  mass: springs.card.mass,
} as const;

export const BlastSheet: React.FC<{
  tile: WorkspaceTile;
  /** Expansion origin: the tile's frame relative to the overlay host. */
  origin: FrameRect;
  /** The overlay host's size — the sheet's fully-open target. */
  host: { width: number; height: number };
  now: number;
  /** Fired after the contraction lands (instantly under Reduce Motion). */
  onClose: () => void;
  /** Drill into one item (existing RefreshDetail flow). */
  onOpenItem?: (item: Refreshable) => void;
  /**
   * Downstream-damage annotation per dataflow id ("what refreshed against
   * stale data"). Slot only — absent notes render nothing. The cascade spine
   * is built separately; this sheet never invents damage.
   */
  downstreamNotes?: Record<string, string | undefined>;
}> = ({ tile, origin, host, now, onClose, onOpenItem, downstreamNotes }) => {
  // ONE shared value drives everything — panel frame, backdrop, content —
  // so the whole expansion is one continuous spring, never a fade-swap.
  const progress = useSharedValue(0);
  const motion = useRef(motionEnabled()).current;
  const closing = useRef(false);

  useEffect(() => {
    if (!motion) {
      progress.value = 1; // Reduce Motion: open instantly, no haptic.
      return;
    }
    progress.value = withSpring(1, SETTLE, (finished) => {
      if (finished) runOnJS(latch)(); // the ONE detent at full-open
    });
    // Mount-only: the expansion happens once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (!motion) {
      onClose(); // instant, silent
      return;
    }
    progress.value = withSpring(0, SETTLE, (finished) => {
      if (finished) {
        runOnJS(latch)(); // the ONE detent at close
        runOnJS(onClose)();
      }
    });
  }, [motion, onClose, progress]);

  // Android system back contracts the sheet instead of leaving the screen.
  // (iOS has no system back here; web's shim only logs, so gate to Android.)
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

  // Content rides the SAME spring: the tile's facts (name, counts) persist
  // through the morph; the deeper rows fill in as room becomes available.
  const fillInStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const tone = severityTone[tile.severity];
  const sections = sheetSections(tile.items);

  return (
    // accessibilityViewIsModal: while the sheet is up, screen readers must
    // not wander the blurred board behind it.
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      {/* The board, blurring and dimming behind the growing tile. Tapping it closes. */}
      <Animated.View style={[StyleSheet.absoluteFill, motion ? backdropStyle : null]}>
        {motion ? (
          <BlurView
            intensity={28}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {/* Static dim — under Reduce Motion it IS the whole backdrop. */}
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
    left: 4, // clears the edge bar
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

  fillIn: { flex: 1, marginTop: 88 }, // below the header band
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
