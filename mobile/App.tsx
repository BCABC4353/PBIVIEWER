import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  // Settings fires onModeChange then onDataSourceChange in the same tick, so
  // the rebuild must read the mode through a ref — `mode` from this render
  // would still be the OLD value and rebuild the wrong source.
  const modeRef = useRef<DataMode>(mode);

  useEffect(() => {
    void getSavedMode().then((saved) => {
      if (saved !== 'mock') {
        modeRef.current = saved;
        setMode(saved);
        setSource(createDataSource(saved));
      }
    });
  }, []);

  const handleModeChange = useCallback((next: DataMode) => {
    modeRef.current = next;
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
            onDataSourceChange={() => setSource(createDataSource(modeRef.current))}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
});
