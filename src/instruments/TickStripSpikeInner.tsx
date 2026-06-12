import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TickStrip } from './TickStrip';
import { color } from '../design/tokens';

export default function TickStripSpikeInner() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>Large — normal (6m 12s into 15m cycle)</Text>
      <View style={styles.stripWrap}>
        <TickStrip size="large" value={6.2} valueText="06:12" />
      </View>

      <Text style={styles.sectionLabel}>Large — overdue 47m</Text>
      <View style={styles.stripWrap}>
        <TickStrip size="large" value={15} overdue={47} valueText="+47m" />
      </View>

      <Text style={styles.sectionLabel}>Medium — row scale samples</Text>
      <View style={styles.stripWrap}>
        <TickStrip size="medium" value={6.2} width={110} />
      </View>
      <View style={styles.stripWrap}>
        <TickStrip size="medium" value={12.1} width={110} />
      </View>
      <View style={styles.stripWrap}>
        <TickStrip size="medium" value={15} overdue={47} width={110} />
      </View>
      <View style={styles.stripWrap}>
        <TickStrip size="medium" value={3.4} width={110} />
      </View>

      <Text style={styles.sectionLabel}>Small — inline scale</Text>
      <View style={styles.stripWrap}>
        <TickStrip size="small" value={9} width={64} />
      </View>
      <View style={styles.stripWrap}>
        <TickStrip size="small" value={4.5} width={64} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
  content: { padding: 24, gap: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase', color: color.textTertiary },
  stripWrap: { backgroundColor: color.surface1, padding: 8, borderRadius: 8 },
});
