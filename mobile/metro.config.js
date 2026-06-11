// Metro config — exists for ONE reason: the canonical refresh-health
// derivations live in the DESKTOP tree (../src/shared/refresh-health-core.ts)
// and mobile/src/core/refresh-health.ts imports them relatively. Metro only
// bundles files inside its watched folders, so the repo-root src/shared
// directory must be added to watchFolders explicitly. Everything else stays
// Expo's defaults.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [
  ...(config.watchFolders ?? []),
  // Repo-root shared modules (pure TS, no node/electron imports).
  path.resolve(__dirname, '../src/shared'),
];

module.exports = config;
