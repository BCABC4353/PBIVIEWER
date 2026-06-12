import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import { BarChart } from '../visuals/BarChart';
import { LedgerView } from './LedgerView';
import { parseManifest, type ParsedManifest } from '../core/manifest-types';
import {
  DENIALS_BAR_DATA,
  ALL_LEDGERS,
  type MockLedgerDataset,
} from './denials-mock-data';
import MANIFEST_RAW from '../../design-lab/board11-data/denials-manifest.json';

const MANIFEST: ParsedManifest = parseManifest(MANIFEST_RAW);

function findLedger(tileId: string): MockLedgerDataset | undefined {
  return ALL_LEDGERS.find((d) => d.tileId === tileId);
}

const SectionLabel: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.sectionLabel}>
    <Text style={styles.sectionText}>{text}</Text>
  </View>
);

export const DenialsScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const barTiles = MANIFEST.tiles.filter(
    (t) => t.render === 'bar' || t.render === 'bar (grouped)',
  );
  const ledgerTiles = MANIFEST.tiles.filter((t) => t.render === 'ledger');

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable onPress={onBack} disabled={!onBack} accessibilityRole="button" accessibilityLabel="Back to Reports">
          <Text style={styles.bc}>
            <Text style={styles.bcAccent}>● </Text>
            REPORTS
          </Text>
        </Pressable>
        <Text style={styles.title}>Denials</Text>
      </View>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {barTiles.map((tile) => (
          <View key={tile.id} style={styles.tileCard}>
            <SectionLabel text={tile.measure[0] ?? 'Denials by Week'} />
            <BarChart data={DENIALS_BAR_DATA} />
          </View>
        ))}
        {ledgerTiles.length > 0 ? (
          <SectionLabel text="PIVOTS" />
        ) : null}
        {ledgerTiles.map((tile) => {
          const mock = findLedger(tile.id);
          if (!mock) return null;
          return (
            <View key={tile.id} style={styles.tileCard}>
              <LedgerView
                groupLevels={mock.groupLevels}
                rows={mock.rows}
                measures={tile.measure.length > 0 ? tile.measure : [mock.measureLabel]}
                title={mock.groupLevels[0] ?? tile.id}
              />
            </View>
          );
        })}
        <View style={styles.footer}>
          <Text style={styles.footerText}>MOCK DATA · OFFLINE</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  header: {
    paddingHorizontal: space.l,
    paddingTop: space.s,
    paddingBottom: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  bc: { ...type.micro, color: color.textTertiary, letterSpacing: 0.4 },
  bcAccent: { color: color.accent },
  title: { ...type.title, color: color.textPrimary, marginTop: 4 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space.l, paddingBottom: space.xxl },
  tileCard: {
    marginTop: space.m,
    paddingBottom: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  sectionLabel: { paddingTop: space.m, paddingBottom: space.xs },
  sectionText: {
    ...type.micro,
    fontWeight: '500',
    letterSpacing: 0.4,
    color: color.textTertiary,
    textTransform: 'uppercase',
  },
  footer: { paddingTop: space.xl, alignItems: 'center' },
  footerText: { ...type.micro, color: color.textTertiary, letterSpacing: 0.4 },
});
