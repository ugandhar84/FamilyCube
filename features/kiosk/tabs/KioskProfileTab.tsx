/**
 * KioskProfileTab — kiosk wrapper around the phone's ProfileSettingsScreen,
 * reused as-is (PIN management, notifications, subscription, danger zone —
 * ~2000 lines of settings, not worth re-deriving a trimmed kiosk version
 * of, per explicit product decision this session). Live-requested: "add
 * all the pills for the pages which is on the mobile hub screen [to] the
 * kiosk side bar" — Profile is the Hub's own AppsQuickAccessPills entry.
 *
 * ProfileSettingsScreen reads activeMemberId/router itself and has no
 * `hideHeader` prop the way SchoolScreen/HealthRecordsScreen do — its own
 * header (with a router.back() button) renders as-is here. Its internal
 * sub-navigation (router.push('/profile-settings/...'), '/admin', etc.)
 * are real routes and work unmodified from inside kiosk; router.back()
 * naturally returns to this tab.
 */
import ProfileSettingsScreen from '@/features/profile/ProfileSettingsScreen';

export function KioskProfileTab() {
  return <ProfileSettingsScreen />;
}
