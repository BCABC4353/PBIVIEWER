import { BEACON_CONFIG } from './beacon-config.generated';

/**
 * Stable import surface for the issue-beacon configuration. The underlying
 * values are baked in at build time by scripts/generate-config.js from the
 * BEACON_* env vars and are gitignored (like the Azure config). When the token
 * or repo is empty, the beacon is DISABLED — a normal build transmits nothing.
 */
// Read through `unknown` so the generated file's `as const` literal types don't
// narrow these comparisons (the real values vary per build).
const cfg = BEACON_CONFIG as { token?: string; repo?: string; includeNames?: boolean };

export const beaconConfig = {
  token: cfg.token ?? '',
  repo: cfg.repo ?? '',
  // Names are included by default per the operator's choice; a build can set
  // BEACON_INCLUDE_NAMES=false to send codes/counts only (e.g. regulated data).
  includeNames: cfg.includeNames !== false,
} as const;
