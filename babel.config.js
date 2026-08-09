module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated v4: plugin is no longer needed — babel-preset-expo handles it
  };
};
