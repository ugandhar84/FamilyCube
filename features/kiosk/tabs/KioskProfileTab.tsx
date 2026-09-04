/**
 * KioskProfileTab — kiosk wrapper around the phone's ProfileSettingsScreen,
 * reused as-is (PIN management, notifications, subscription, danger zone —
 * ~2000 lines of settings, not worth re-deriving a trimmed kiosk version
 * of, per explicit product decision this session). Live-requested: "add
 * all the pills for the pages which is on the mobile hub screen [to] the
 * kiosk side bar" — Profile is the Hub's own AppsQuickAccessPills entry.
 *
 * ProfileSettingsScreen reads activeMemberId/router itself and has no
 * `hideHeader` prop the way SchoolScreen/HealthRecordsScreen do, but does
 * take `hideBackButton` — kiosk isn't pushed onto a navigation stack (it's
 * embedded directly inside KioskScreen's own tabbed rail), so there's no
 * route for router.back() to pop; the phone's back chevron would otherwise
 * be a dead button here (live-reported: "GO_BACK not handled" warning).
 * Its internal sub-navigation (router.push('/profile-settings/...'),
 * '/admin', etc.) are real routes and still work unmodified from inside
 * kiosk since those DO push onto the stack.
 */
import ProfileSettingsScreen from '@/features/profile/ProfileSettingsScreen';

export function KioskProfileTab() {
  return <ProfileSettingsScreen hideBackButton />;
}
