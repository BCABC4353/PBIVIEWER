import React from 'react';
import { Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import type { Refreshable } from '../core/types';
import { DetailLine, StatusChip, detailTrigger } from './components';
import { Sparkline } from './Sparkline';

export const RefreshDetailScreen: React.FC<{ item: Refreshable; onBack: () => void }> = ({
  item,
  onBack,
}) => {
  const now = Date.now();
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle}>{item.name}</Text>
        <Text style={styles.detailSub}>
          {item.workspaceName} · {item.kind}
        </Text>
        <View style={{ marginTop: space.m }}>
          <StatusChip status={item.lastStatus} overdue={item.scheduleOverdue} />
        </View>
      </View>
      <View style={styles.detailBody}>
        <DetailLine
          label="Last success"
          value={item.lastSuccessTime ? undefined : '—'}
          timestamp={{ iso: item.lastSuccessTime, now }}
        />
        <DetailLine
          label="Last attempt"
          value={item.lastAttemptTime ? undefined : '—'}
          timestamp={{ iso: item.lastAttemptTime, now }}
        />
        {item.kind === 'dataset' ? <DetailLine label="Trigger" value={detailTrigger(item.lastRefreshType)} /> : null}
        <DetailLine label="Schedule" value={item.scheduleSummary} />
        <DetailLine label="Owner" value={item.configuredBy} />
        <DetailLine label="Error" value={item.errorCode} tone={color.broken} />
        {item.recentDurationsMin ? (
          <Sparkline values={item.recentDurationsMin} label="Refresh duration — recent runs" />
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.canvas,
    paddingTop: Platform.select({ android: StatusBar.currentHeight ?? 0, default: 0 }),
  },
  back: { paddingHorizontal: space.l, paddingVertical: space.s, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { ...type.body, color: color.accent },
  detailHeader: { paddingHorizontal: space.l, paddingTop: space.m },
  detailTitle: { ...type.title, color: color.textPrimary },
  detailSub: { ...type.caption, color: color.textTertiary, marginTop: 4 },
  detailBody: { paddingHorizontal: space.l, marginTop: space.l },
});
