export type Tier = 'designed' | 'composed' | 'preset';

export interface HapticDriver {
  readonly supportsDesigned: boolean;
  readonly supportsComposed: boolean;
  playDesignedEngage(): Promise<void>;
  playDesignedGive(): Promise<void>;
  playDesignedResurface(): Promise<void>;
  playComposedEngage(): Promise<void>;
  playComposedGive(): Promise<void>;
  playComposedResurface(): Promise<void>;
}

export const noopDriver: HapticDriver = {
  supportsDesigned: false,
  supportsComposed: false,
  playDesignedEngage: () => Promise.resolve(),
  playDesignedGive: () => Promise.resolve(),
  playDesignedResurface: () => Promise.resolve(),
  playComposedEngage: () => Promise.resolve(),
  playComposedGive: () => Promise.resolve(),
  playComposedResurface: () => Promise.resolve(),
};
