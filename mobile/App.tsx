import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Root } from './src/ui/Root';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { createDataSource, getSavedMode, setSavedMode, type DataMode } from './src/core/data-source-factory';
import type { DataSource } from './src/core/types';
import { color } from './src/design/tokens';

/**
 * Composition root: four-tab shell (Fleet / Reports / Alerts / Settings),
 * data source per the persisted mode (sample data by default; Live once the
 * Azure config is pasted and the user connects — see src/auth/azure-config.ts).
 */
export default function App() {
  const [mode, setMode] = useState<DataMode>('mock');
  const [source, setSource] = useState<DataSource>(() => createDataSource('mock'));

  useEffect(() => {
    void getSavedMode().then((saved) => {
      if (saved !== 'mock') {
        setMode(saved);
        setSource(createDataSource(saved));
      }
    });
  }, []);

  const handleModeChange = useCallback((next: DataMode) => {
    setMode(next);
    void setSavedMode(next);
    setSource(createDataSource(next));
  }, []);

  return (
    <View style={styles.root}>
      <Root
        source={source}
        settings={
          <SettingsScreen
            mode={mode}
            onModeChange={handleModeChange}
            onDataSourceChange={() => setSource(createDataSource(mode))}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
});
