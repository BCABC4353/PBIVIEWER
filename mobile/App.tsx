import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { FleetHealthScreen, RefreshDetailScreen } from './src/ui/screens';
import { MockDataSource } from './src/core/mock-data';
import type { Refreshable } from './src/core/types';
import { color } from './src/design/tokens';

/**
 * Phase 1 shell: Fleet Health → Refresh Detail, mock data source.
 * Swap MockDataSource for LiveFleetClient + an MSAL TokenProvider once the
 * mobile redirect URI is registered (see README.md).
 */
export default function App() {
  const source = useMemo(() => new MockDataSource(), []);
  const [detail, setDetail] = useState<Refreshable | null>(null);

  return (
    <View style={styles.root}>
      {detail ? (
        <RefreshDetailScreen item={detail} onBack={() => setDetail(null)} />
      ) : (
        <FleetHealthScreen source={source} onOpen={setDetail} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
});
