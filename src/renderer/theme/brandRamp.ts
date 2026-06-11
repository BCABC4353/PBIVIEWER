import { createLightTheme, createDarkTheme } from '@fluentui/react-components';
import type { BrandVariants } from '@fluentui/react-components';

const orangeRamp: BrandVariants = {
  10: '#FFF5F0',
  20: '#FFE8D9',
  30: '#FFD4B8',
  40: '#FFBA8C',
  50: '#FF9C61',
  60: '#FF7A37',
  70: '#FF6B22',
  80: '#FF5F15',
  90: '#F04E06',
  100: '#E04400',
  110: '#C93E00',
  120: '#A33200',
  130: '#7C2500',
  140: '#561900',
  150: '#300E00',
  160: '#1A0800',
};

export const brandLightTheme = createLightTheme(orangeRamp);
export const brandDarkTheme = createDarkTheme(orangeRamp);
