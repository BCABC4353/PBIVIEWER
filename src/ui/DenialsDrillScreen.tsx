import React, { useEffect, useRef, useCallback } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { categoricalHue } from '../design/tokens';
import { pushThrough, resurface } from '../feel/haptics';
import {
  makeIdleAnim,
  startDrill,
  startReversal,
  tickAnim,
  morphProgressFromAnim,
  buildDrillPayload,
  buildDrillKeyframe,
  type DrillAnimState,
} from '../core/denials-drill-vm';
import { interpolateMorph, type MorphKeyframe } from '../core/morph-choreo';
import type { LedgerNode, LedgerTree } from '../core/ledger-logic';
import { drillStyles as styles } from './drill-screen-styles';

interface Props {
  node: LedgerNode;
  tree: LedgerTree;
  categoryIndex: number;
  onBack: () => void;
}

interface AnimRef {
  anim: DrillAnimState;
  keyframe: MorphKeyframe;
  rafId: number | null;
}

function nowSec(): number {
  return Date.now() / 1000;
}

export const DenialsDrillScreen: React.FC<Props> = ({ node, tree, categoryIndex, onBack }) => {
  const payload = buildDrillPayload(node, tree, categoryIndex);
  const hue = categoricalHue(categoryIndex);

  const [anim, setAnim] = React.useState<DrillAnimState>(() => makeIdleAnim(false));
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const animRef = useRef<AnimRef>({
    anim: makeIdleAnim(false),
    keyframe: buildDrillKeyframe(0, 48, 390, 844),
    rafId: null,
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((val) => {
      setReduceMotion(val);
      animRef.current.anim = makeIdleAnim(val);
    });
  }, []);

  const stopRaf = useCallback(() => {
    if (animRef.current.rafId !== null) {
      cancelAnimationFrame(animRef.current.rafId);
      animRef.current.rafId = null;
    }
  }, []);

  const driveAnim = useCallback(() => {
    const step = () => {
      const now = nowSec();
      const next = tickAnim(animRef.current.anim, now);
      animRef.current.anim = next;
      setAnim({ ...next });
      if (next.phase === 'drilling' || next.phase === 'reversing') {
        animRef.current.rafId = requestAnimationFrame(step);
      } else {
        animRef.current.rafId = null;
        if (next.phase === 'open') setIsOpen(true);
        if (next.phase === 'idle') setIsOpen(false);
      }
    };
    animRef.current.rafId = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const kf = buildDrillKeyframe(0, 48, 390, 844);
    animRef.current.keyframe = kf;
    const drilled = startDrill(makeIdleAnim(reduceMotion), nowSec(), kf);
    animRef.current.anim = drilled;
    setAnim(drilled);
    pushThrough();
    if (reduceMotion) { setIsOpen(true); } else { driveAnim(); }
    return stopRaf;
  }, [reduceMotion, driveAnim, stopRaf]);

  const handleBack = useCallback(() => {
    stopRaf();
    const rev = startReversal(animRef.current.anim, nowSec());
    animRef.current.anim = rev;
    setAnim(rev);
    resurface();
    if (reduceMotion) { onBack(); return; }
    const step = () => {
      const now = nowSec();
      const next = tickAnim(animRef.current.anim, now);
      animRef.current.anim = next;
      setAnim({ ...next });
      if (next.phase === 'reversing') {
        animRef.current.rafId = requestAnimationFrame(step);
      } else {
        animRef.current.rafId = null;
        onBack();
      }
    };
    animRef.current.rafId = requestAnimationFrame(step);
  }, [stopRaf, reduceMotion, onBack]);

  const progress = morphProgressFromAnim(anim);
  const geo = interpolateMorph(animRef.current.keyframe, progress);
  const contentOpacity = isOpen ? 1 : Math.max(0, (progress - 0.7) / 0.3);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable onPress={handleBack} accessibilityRole="button" accessibilityLabel="Back to Denials">
          <Text style={styles.bc}>
            <Text style={styles.bcAccent}>‹ </Text>
            DENIALS · {payload.category}
          </Text>
        </Pressable>
        <View style={styles.titleRow}>
          <View style={[styles.swat, { backgroundColor: hue }]} />
          <Text style={styles.title}>{payload.payor}</Text>
        </View>
        <View style={[styles.accentLine, { backgroundColor: hue }]} />
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.morphContainer, {
          opacity: reduceMotion ? 1 : contentOpacity,
          height: reduceMotion ? undefined : geo.rect.h > 100 ? undefined : 0,
          overflow: 'hidden',
        }]}>
          <Text style={styles.sliceLabel}>
            DENIAL $ BY POST DATE WEEK
            <Text style={styles.sliceMeta}>  SLICE · {payload.payor}</Text>
          </Text>
          <View style={styles.sliceBars}>
            {payload.slicePoints.map((pt, i) => {
              const maxVal = Math.max(...payload.slicePoints.map((p) => p.value));
              const barH = maxVal > 0 ? Math.round((pt.value / maxVal) * 80) : 0;
              return (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.bar, { height: barH, backgroundColor: hue }]} />
                  <Text style={styles.barLabel} numberOfLines={1}>{pt.label}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.tableHeader}>
            <Text style={styles.thCode}>CODE</Text>
            <Text style={styles.thDesc}>DESCRIPTION</Text>
            <Text style={styles.thClaims}>CLAIMS</Text>
            <Text style={styles.thDenied}>DENIED $</Text>
          </View>
          {payload.leafRows.map((row, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.tdCode} numberOfLines={1}>{row.code}</Text>
              <Text style={styles.tdDesc} numberOfLines={1}>{row.description}</Text>
              <Text style={styles.tdClaims}>{row.claims}</Text>
              <Text style={styles.tdDenied}>{row.deniedDollars}</Text>
            </View>
          ))}
          <View style={styles.tableTotal}>
            <Text style={styles.tdTotalLabel}>TOTAL</Text>
            <Text style={styles.tdTotalClaims}>{payload.totalClaims}</Text>
            <Text style={styles.tdTotalDenied}>{payload.totalDenied}</Text>
          </View>
          <View style={styles.drillFoot}>
            <Text style={styles.drillFootText}>
              SLICE · {payload.category} / {payload.payor} · ROLLS INTO BOOK TOTAL
            </Text>
          </View>
          <View style={styles.footer}>
            <Text style={styles.footerText}>MOCK DATA · OFFLINE</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
