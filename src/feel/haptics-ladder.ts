import * as Haptics from 'expo-haptics';
import { type HapticDriver, type Tier, noopDriver } from './haptics-driver';
import { createRateLimiter } from './motion-core';

export interface LadderCaps {
  supportsDesigned: boolean;
  supportsComposed: boolean;
}

export function selectTier(caps: LadderCaps): Tier {
  if (caps.supportsDesigned) return 'designed';
  if (caps.supportsComposed) return 'composed';
  return 'preset';
}

export interface LadderOptions {
  driver?: HapticDriver;
  getEnabled?: () => boolean;
  now?: () => number;
}

export interface HapticLadder {
  pushThrough(): void;
  resurface(): void;
  detent(): void;
  fire(trigger: () => Promise<void>): void;
}

export function buildLadder(opts?: LadderOptions): HapticLadder {
  const driver = opts?.driver ?? noopDriver;
  const getEnabled = opts?.getEnabled ?? (() => true);
  const detentGate = createRateLimiter(30, opts?.now);

  function fire(trigger: () => Promise<void>): void {
    if (!getEnabled()) return;
    try {
      trigger().catch(() => {});
    } catch {
    }
  }

  function pushThrough(): void {
    if (!getEnabled()) return;
    const tier = selectTier(driver);
    const run = async () => {
      if (tier === 'designed') {
        await driver.playDesignedEngage();
        await driver.playDesignedGive();
      } else if (tier === 'composed') {
        await driver.playComposedEngage();
        await driver.playComposedGive();
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    };
    run().catch(() => {});
  }

  function resurface(): void {
    if (!getEnabled()) return;
    const tier = selectTier(driver);
    const run = async () => {
      if (tier === 'designed') {
        await driver.playDesignedResurface();
      } else if (tier === 'composed') {
        await driver.playComposedResurface();
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    };
    run().catch(() => {});
  }

  function detent(): void {
    if (!detentGate()) return;
    fire(() => Haptics.selectionAsync());
  }

  return { pushThrough, resurface, detent, fire };
}
