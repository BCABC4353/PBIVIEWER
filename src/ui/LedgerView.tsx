import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import { categoricalHue } from '../design/tokens';
import {
  buildTree,
  toggleExpanded,
  isExpanded,
  type LedgerRow,
  type LedgerTree,
  type LedgerNode,
} from '../core/ledger-logic';
import {
  advance,
  canAdvance,
  canRewind,
  rewind,
  type CarouselState,
} from '../core/carousel-logic';

interface LedgerViewProps {
  groupLevels: string[];
  rows: LedgerRow[];
  measures: string[];
  title: string;
}

function FlatRow({
  node,
  level,
  tree,
  onToggle,
  measureLabel,
  grandTotal,
  colorIndex,
}: {
  node: LedgerNode;
  level: number;
  tree: LedgerTree;
  onToggle: (path: string[]) => void;
  measureLabel: string;
  grandTotal: number;
  colorIndex: number;
}) {
  const expanded = isExpanded(tree, node.fullPath);
  const pct = grandTotal > 0 ? node.value / grandTotal : 0;
  const barWidth = Math.round(pct * 100);
  const indent = level * space.l;
  const hue = categoricalHue(colorIndex);

  return (
    <View>
      <Pressable
        onPress={() => !node.isLeaf && onToggle(node.fullPath)}
        accessibilityRole={node.isLeaf ? 'text' : 'button'}
        accessibilityState={node.isLeaf ? undefined : { expanded }}
        accessibilityLabel={`${node.key}: ${node.value} ${measureLabel}`}
        style={({ pressed }) => [
          styles.trow,
          level === 0 ? styles.trowLv0 : styles.trowLv1,
          pressed && !node.isLeaf && styles.rowPressed,
        ]}
      >
        <View style={[styles.nameCell, { paddingLeft: indent }]}>
          {!node.isLeaf ? (
            <Text style={[styles.chev, expanded && styles.chevOpen]}>
              {'›'}
            </Text>
          ) : (
            <View style={[styles.swat, { backgroundColor: hue }]} />
          )}
          <Text
            style={level === 0 ? styles.labelLv0 : styles.labelLv1}
            numberOfLines={1}
          >
            {node.key}
          </Text>
        </View>
        <View style={styles.vbarCell}>
          <View style={styles.vbar}>
            <View style={[styles.vbarFill, { width: `${barWidth}%` }]} />
          </View>
        </View>
        <Text style={level === 0 ? styles.valLv0 : styles.valLv1}>
          {node.value}
        </Text>
      </Pressable>
      {expanded && !node.isLeaf
        ? node.children.map((child, i) => (
            <FlatRow
              key={child.key}
              node={child}
              level={level + 1}
              tree={tree}
              onToggle={onToggle}
              measureLabel={measureLabel}
              grandTotal={grandTotal}
              colorIndex={colorIndex + i}
            />
          ))
        : null}
    </View>
  );
}

export const LedgerView: React.FC<LedgerViewProps> = ({
  groupLevels,
  rows,
  measures,
  title,
}) => {
  const count = measures.length;
  const [carousel, setCarousel] = useState<CarouselState>({ index: 0, count: Math.max(count, 1) });
  const [tree, setTree] = useState<LedgerTree>(() => buildTree(rows, groupLevels));

  const measureLabel = measures[carousel.index] ?? '';

  const handleToggle = (path: string[]) => {
    setTree((prev) => toggleExpanded(prev, path));
  };

  const handlePrev = () => {
    if (canRewind(carousel)) setCarousel((c) => rewind(c));
  };

  const handleNext = () => {
    if (canAdvance(carousel)) setCarousel((c) => advance(c));
  };

  return (
    <View style={styles.block}>
      <View style={styles.ledtop}>
        <Text style={styles.ledTitle}>{title}</Text>
        <Text style={styles.ledMeta}>{groupLevels.join(' › ')}</Text>
      </View>
      {count > 1 ? (
        <View style={styles.carousel}>
          <Pressable
            onPress={handlePrev}
            disabled={!canRewind(carousel)}
            accessibilityRole="button"
            accessibilityLabel="Previous measure"
            style={[styles.cbtn, !canRewind(carousel) && styles.cbtnOff]}
          >
            <Text style={styles.cbtnText}>{'‹'}</Text>
          </Pressable>
          <View style={styles.cmid}>
            <Text style={styles.cmidLabel} numberOfLines={1}>
              {measureLabel}
            </Text>
            <Text style={styles.cmidMeta}>
              {carousel.index + 1} / {count}
            </Text>
          </View>
          <Pressable
            onPress={handleNext}
            disabled={!canAdvance(carousel)}
            accessibilityRole="button"
            accessibilityLabel="Next measure"
            style={[styles.cbtn, !canAdvance(carousel) && styles.cbtnOff]}
          >
            <Text style={styles.cbtnText}>{'›'}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.singleMeasure} numberOfLines={1}>
          {measureLabel}
        </Text>
      )}
      <View style={styles.ledgerBorder}>
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>TOTAL</Text>
          <View style={styles.vbarCell}>
            <View style={styles.vbar} />
          </View>
          <Text style={styles.grandVal}>{tree.grandTotal}</Text>
        </View>
        <ScrollView scrollEnabled={false}>
          {tree.roots.map((node, i) => (
            <FlatRow
              key={node.key}
              node={node}
              level={0}
              tree={tree}
              onToggle={handleToggle}
              measureLabel={measureLabel}
              grandTotal={tree.grandTotal}
              colorIndex={i}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  block: { paddingTop: space.s },
  ledtop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: space.xs,
  },
  ledTitle: { ...type.caption, fontWeight: '600', color: color.textPrimary },
  ledMeta: { ...type.micro, color: color.textTertiary },
  carousel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingVertical: space.xs,
    paddingBottom: space.s,
  },
  cbtn: {
    width: 28,
    height: 30,
    borderRadius: 8,
    backgroundColor: color.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cbtnOff: { opacity: 0.3 },
  cbtnText: { ...type.body, color: color.textTertiary },
  cmid: { flex: 1, alignItems: 'center' },
  cmidLabel: { ...type.caption, fontWeight: '500', color: color.textPrimary },
  cmidMeta: { ...type.micro, color: color.textTertiary, marginTop: 2 },
  singleMeasure: { ...type.micro, color: color.textTertiary, marginBottom: space.s },
  ledgerBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  grandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
    gap: space.s,
  },
  grandLabel: {
    flex: 1,
    ...type.micro,
    fontWeight: '500',
    letterSpacing: 0.4,
    color: color.textTertiary,
  },
  grandVal: { ...type.caption, color: color.textPrimary, minWidth: 48, textAlign: 'right' },
  trow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
    gap: space.s,
  },
  trowLv0: { height: 40 },
  trowLv1: { height: 34 },
  rowPressed: { backgroundColor: color.surface2 },
  nameCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs, minWidth: 0 },
  chev: { ...type.micro, color: color.textTertiary, width: 10 },
  chevOpen: { transform: [{ rotate: '90deg' }] },
  swat: { width: 7, height: 7, borderRadius: 2 },
  labelLv0: { ...type.caption, fontWeight: '500', color: color.textPrimary, flexShrink: 1 },
  labelLv1: { ...type.caption, color: color.textSecondary, flexShrink: 1 },
  vbarCell: { width: 64, justifyContent: 'center' },
  vbar: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: color.surface2,
    overflow: 'hidden',
  },
  vbarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 1.5,
    backgroundColor: color.textTertiary,
  },
  valLv0: {
    ...type.caption,
    color: color.textPrimary,
    minWidth: 48,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  valLv1: {
    ...type.caption,
    color: color.textSecondary,
    minWidth: 48,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
