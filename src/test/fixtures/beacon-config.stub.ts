// Test stand-in for src/main/services/beacon-config.generated.ts (build-emitted,
// gitignored). Empty token/repo → the beacon is DISABLED under test, so no
// network is touched and IssueBeaconService is exercised via injected fakes.
export const BEACON_CONFIG = {
  token: '',
  repo: '',
  includeNames: true,
} as const;
