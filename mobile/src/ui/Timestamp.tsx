import React, { useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { timestampPair } from '../core/time-format';

export const Timestamp: React.FC<{
  iso?: string;
  now: number;
  prefix?: string;
  fallback?: string;
  style?: StyleProp<TextStyle>;
}> = ({ iso, now, prefix = '', fallback = '—', style }) => {
  const [absolute, setAbsolute] = useState(false);
  const pair = timestampPair(iso, now);
  if (!pair) return <Text style={style}>{fallback}</Text>;
  const shown = absolute ? pair.absolute : pair.relative || pair.absolute;
  return (
    <Text
      style={style}
      onPress={() => setAbsolute((v) => !v)}
      suppressHighlighting
      accessibilityRole="button"
      accessibilityLabel={`${prefix}${pair.absolute}`}
      accessibilityHint={absolute ? 'Switches to relative time' : 'Switches to exact time'}
    >
      {prefix}
      {shown}
    </Text>
  );
};
