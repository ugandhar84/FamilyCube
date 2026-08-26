/** @type {import("@bacons/apple-targets").Config} */
module.exports = {
  type: "widget",
  name: "FamilyCubeWidget",
  bundleIdentifier: "com.familycube.ios.widget",
  deploymentTarget: "16.0",
  // Was empty — the widget extension had no way to read the App Group
  // container WidgetDataModule.swift writes to, so even with correct code
  // on both ends the widget could never see real data. Requires the App
  // Group "group.com.familycube.ios" to actually be registered for BOTH
  // this widget target's bundle id AND the main app's
  // (com.familycube.ios) in the Apple Developer portal, then a
  // provisioning-profile regenerate — see CLAUDE.md's Known Build Quirks.
  entitlements: {
    "com.apple.security.application-groups": ["group.com.familycube.ios"],
  },
};
