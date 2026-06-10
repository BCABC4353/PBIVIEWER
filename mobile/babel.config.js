module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated/plugin (a shim over react-native-worklets/plugin
    // in Reanimated 4) MUST be the last plugin in the list.
    plugins: ['react-native-reanimated/plugin'],
  };
};
