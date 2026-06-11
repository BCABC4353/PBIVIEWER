import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Root } from './src/ui/Root';
import { SettingsScreen } from './src/ui/SettingsScreen';
import {
  createDataSource,
  createReportsModel,
  getSavedMode,
  setSavedMode,
  type DataMode,
  type ReportsModel,
} from './src/core/data-source-factory';
import { deviceCodeController } from './src/auth/device-code-controller-instance';
import type { DataSource } from './src/core/types';
import { color } from './src/design/tokens';

export default function App() {
  const [mode, setMode] = useState<DataMode>('mock');
  const [source, setSource] = useState<DataSource>(() => createDataSource('mock'));
  const [reports, setReports] = useState<ReportsModel | null>(null);

  useEffect(() => {
    void getSavedMode().then((saved) => {
      if (saved !== 'mock') {
        setMode(saved);
        setSource(createDataSource(saved));
        setReports(createReportsModel(saved));
      }
    });
  }, []);

  const handleModeChange = useCallback((next: DataMode) => {
    setMode(next);
    void setSavedMode(next);
    setSource(createDataSource(next));
    setReports(createReportsModel(next));
  }, []);

  useEffect(
    () => deviceCodeController.onSignedIn(() => handleModeChange('live')),
    [handleModeChange],
  );

  return (
    <View style={styles.root}>
      <Root
        mode={mode}
        source={source}
        reports={reports}
        settings={<SettingsScreen mode={mode} onModeChange={handleModeChange} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
});
