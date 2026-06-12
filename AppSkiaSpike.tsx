import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { color } from './src/design/tokens';

export default function AppSkiaSpike() {
  return (
    <View style={styles.root}>
      <WithSkiaWeb
        opts={{ locateFile: () => '/canvaskit.wasm' }}
        getComponent={() => import('./src/instruments/TickStripSpikeInner')}
        fallback={null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
});
