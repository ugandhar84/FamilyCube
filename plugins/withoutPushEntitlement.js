/**
 * Custom Expo config plugin that removes the `aps-environment` entitlement
 * from the iOS build. This allows expo-notifications to be used for LOCAL
 * notifications without requiring the Push Notifications capability —
 * which personal Apple Developer accounts ($0) cannot provision.
 *
 * Remove this plugin once you join the Apple Developer Program ($99/year)
 * and want to enable remote push notifications.
 */
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
