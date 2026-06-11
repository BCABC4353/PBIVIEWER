import { createLightTheme, createDarkTheme } from '@fluentui/react-components';
import type { BrandVariants, Theme } from '@fluentui/react-components';
import tokens from './tokens.json';

const orangeRamp: BrandVariants = tokens.color.brand;

export const brandLightTheme: Theme = {
  ...createLightTheme(orangeRamp),
  colorNeutralForegroundOnBrand: tokens.color.ink,
};

export const brandDarkTheme: Theme = {
  ...createDarkTheme(orangeRamp),
  colorNeutralForegroundOnBrand: tokens.color.ink,
};
