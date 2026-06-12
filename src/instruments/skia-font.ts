import { matchFont } from '@shopify/react-native-skia';

export interface FontSpec {
  fontFamily: string;
  fontSize: number;
  fontStyle: 'normal' | 'italic' | 'oblique';
  fontWeight: '400' | '500' | '600' | '700';
}

export function tryMatchFont(spec: FontSpec) {
  try {
    return matchFont(spec);
  } catch {
    return null;
  }
}
