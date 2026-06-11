import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import type { DataSource } from './src/core/types';
import { color } from './src/design/tokens';

export default function App() {
  const [mode, setMode] = useState<DataMode>('mock');
  const [source, setSource] = useState<DataSource>(() => createDataSource('mock'));
  const [reports, setReports] = useState<ReportsModel | null>(null);
  const modeRef = useRef<DataMode>(mode);

  useEffect(() => {
    void getSavedMode().then((saved) => {
      if (saved !== 'mock') {
        modeRef.current = saved;
        setMode(saved);
        setSource(createDataSource(saved));
        setReports(createReportsModel(saved));
      }
    });
  }, []);

  const handleModeChange = useCallback((next: DataMode) => {
    modeRef.current = next;
    setMode(next);
    void setSavedMode(next);
    setSource(createDataSource(next));
    setReports(createReportsModel(next));
  }, []);

  return (
    <View style={styles.root}>
      <Root
        source={source}
        reports={reports}
        settings={
          <SettingsScreen
            mode={mode}
            onModeChange={handleModeChange}
            onDataSourceChange={() => {
              setSource(createDataSource(modeRef.current));
              setReports(createReportsModel(modeRef.current));
            }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
});
