// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // React Native renders to native views, not HTML — apostrophes/quotes in JSX text don't need HTML escaping
      "react/no-unescaped-entities": "off",
    },
  }
]);
