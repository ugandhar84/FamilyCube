/** @type {import("@bacons/apple-targets").Config} */
module.exports = {
  type: "widget",
  name: "FamilyCubeWidget",
  bundleIdentifier: "com.familycube.ios.widget",
  // Was 16.0 while the main app (app.config.js) targets 17.0 — the widget
  // view's .containerBackground(for: .widget) modifier (required on 17+
  // for the widget to render at all, see FamilyCubeWidget.swift's own
  // comment) failed to compile at this lower target. No reason for the
  // widget extension to support an older OS than the app it ships inside.
  deploymentTarget: "17.0",
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
