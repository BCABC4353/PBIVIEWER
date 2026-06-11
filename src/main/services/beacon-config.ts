import { BEACON_CONFIG } from './beacon-config.generated';

const cfg = BEACON_CONFIG as { token?: string; repo?: string; includeNames?: boolean };

export const beaconConfig = {
  token: cfg.token ?? '',
  repo: cfg.repo ?? '',
  includeNames: cfg.includeNames !== false,
} as const;
