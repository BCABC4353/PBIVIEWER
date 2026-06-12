import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TickStrip } from './TickStrip';
import { BarChartSkia } from './BarChartSkia';
import { KpiSkia } from './KpiSkia';
import { LineChartSkia } from './LineChartSkia';
import { DonutSkia } from './DonutSkia';
import { WaterfallSkia } from './WaterfallSkia';
import { color } from '../design/tokens';
import { varianceBridge, isOk } from '../enhance/index';

const W = 360;

const bridgeResult = varianceBridge(
  { Revenue: 1840, AR_Start: 420, New_Claims: 380 },
  { Revenue: 1920, AR_Start: 380, New_Claims: 410, Payments: 290 },
);

const waterfallSteps = isOk(bridgeResult) ? bridgeResult.value.steps : [];

export default function SkiaGalleryInner() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.section}>Tick Strip — Large (6m12s, 15m cycle)</Text>
      <View style={styles.well}>
        <TickStrip size="large" value={6.2} width={W} />
      </View>

      <Text style={styles.section}>Tick Strip — Large Overdue 47m</Text>
      <View style={styles.well}>
        <TickStrip size="large" value={15} overdue={47} width={W} />
      </View>

      <Text style={styles.section}>Tick Strip — Medium</Text>
      <View style={styles.well}>
        <TickStrip size="medium" value={9} width={110} />
      </View>

      <Text style={styles.section}>Bar Chart — Skia</Text>
      <View style={styles.well}>
        <BarChartSkia
          width={W}
          height={140}
          input={{
            values: [420, 380, 410, 460, 390, 430],
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          }}
        />
      </View>

      <Text style={styles.section}>KPI Numeral — Skia</Text>
      <View style={styles.well}>
        <KpiSkia
          width={W}
          height={120}
          label="Net Collections — Jun"
          value="$1.84M"
          delta={4.2}
          deltaText="4.2% VS MAY"
        />
      </View>

      <Text style={styles.section}>Line + Bands — Skia</Text>
      <View style={styles.well}>
        <LineChartSkia
          width={W}
          height={140}
          points={[
            { value: 180, label: 'W1' }, { value: 220, label: 'W2' },
            { value: 195, label: 'W3' }, { value: 240, label: 'W4' },
            { value: 210, label: 'W5' }, { value: 265, label: 'W6' },
            { value: 230, label: 'W7' }, { value: 280, label: 'W8' },
            { value: 255, label: 'W9' }, { value: 310, label: 'W10' },
            { value: 290, label: 'W11' }, { value: 340, label: 'W12' },
          ]}
          rollingWindow={4}
        />
      </View>

      <Text style={styles.section}>Donut — Skia</Text>
      <View style={styles.well}>
        <DonutSkia
          width={W}
          height={200}
          slices={[
            { value: 342, label: 'CO-29' },
            { value: 218, label: 'CO-4' },
            { value: 156, label: 'PR-1' },
            { value: 98, label: 'CO-97' },
            { value: 67, label: 'Other' },
          ]}
          centerText="881"
        />
      </View>

      <Text style={styles.section}>Waterfall — Skia (Board 07 colors)</Text>
      <View style={styles.well}>
        <WaterfallSkia
          width={W}
          height={180}
          steps={waterfallSteps}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
  content: { padding: 20, gap: 14 },
  section: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.textTertiary,
  },
  well: {
    backgroundColor: color.surface1,
    padding: 12,
    borderRadius: 10,
  },
});
