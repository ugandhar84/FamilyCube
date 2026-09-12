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
import { Bell, DollarSign, Home, FileText, User, KeyRound, Calendar, UserPlus } from 'lucide-react-native';
import ProfileSettingsScreen from '@/features/profile/ProfileSettingsScreen';
import { KioskFormDrawer } from '../components/KioskFormDrawer';
import { useKioskColors } from '../kioskPalette';

export function KioskProfileTab() {
  const { k } = useKioskColors();
  // hideSensitiveAdminRows — live audit finding: Data Recovery (the family
  // passcode that decrypts chat/location/medical history) and Admin
  // Console were both reachable here with kiosk's 30-minute idle-lock
  // instead of a phone's near-instant lock/biometric gate. Permissions
  // aren't wrong (same isParent gate as mobile), but a shared wall-mounted
  // device left unlocked for half an hour is a materially bigger exposure
  // window for these two admin/security actions than a phone anyone would
  // notice missing from their pocket. Both are setup actions a parent can
  // still do from their own phone — hiding them here doesn't remove the
  // capability, just this extra, higher-risk entry point to it. Data
  // Recovery was later asked back specifically, as a proper side-sheet
  // form rather than staying gone entirely [live-requested: "i need all
  // these to be side bar forms" / "it is for kiosk only"] — see
  // dataRecoveryShell below, which overrides hideSensitiveAdminRows for
  // just that one row (ProfileSettingsScreen.tsx's own comment on that
  // prop). Admin Console has no shell and stays hidden — not requested,
  // and the idle-lock exposure concern is still real for it.
  // hideHero — the identity card (avatar/name/role) is redundant on kiosk:
  // the same identity is always visible in the persistent sidebar
  // (ParentStatsColumn/KioskKidTeenStatsColumn) [live-requested: "remove
  // the heroin the profile as we aalready have it in the static side bar
  // we can add that fuctionality long press" — see those files' own
  // onLongPress wiring to EditMyProfileSheet]. columns=3 re-flows the same
  // sections into a 3-column grid, matching Chores/Health's own layout
  // [live-requested: "profile page redesing .. 3 col. like similar to
  // toehr.."] — no section's content/logic changed, only the wrapping
  // layout (see ProfileSettingsScreen.tsx's own columns prop comment).
  // notificationsShell — swaps the Notifications row's bottom sheet for a
  // right-side KioskFormDrawer around the exact same real body/state
  // [live-requested: "show the notification sheet right side bar"], same
  // pattern as the medication/location history drawers built earlier this
  // session (KioskHealthTab.tsx / KioskFindFamTab.tsx).
  // currencyShell/familyNameShell — same right-drawer swap as
  // notifications; both rows previously opened the phone's own
  // AppBottomSheet on kiosk, which doesn't fit this shell [live-requested:
  // "should work uagsnadhr family USD - all should work like a mobile"].
  // calendarSyncShell — Calendar Sync previously router.push'ed its own
  // full-screen phone route, which stretched a single-column settings page
  // edge-to-edge on a wide kiosk canvas [live-reported: "calendar sync
  // also like wide seems like using the mobile view can we make the kiosk
  // dedicated view like showing the side bar recipe"]. Same right-drawer
  // swap as every other row above, around the exact same real OAuth/state
  // (CalendarSyncBody) — no sync logic duplicated.
  return (
    <ProfileSettingsScreen
      hideBackButton hideSensitiveAdminRows hideHero columns={2}
      notificationsShell={(visible, onClose, children) => (
        <KioskFormDrawer
          visible={visible}
          variant="drawer"
          title="Notifications"
          subtitle="Choose what you hear about, and when"
          accent={k.primary}
          Icon={Bell}
          k={k}
          onClose={onClose}
        >
          {children}
        </KioskFormDrawer>
      )}
      currencyShell={(visible, onClose, children) => (
        <KioskFormDrawer
          visible={visible}
          variant="drawer"
          title="Currency"
          subtitle="How coins convert to real money for the whole family"
          accent={k.primary}
          Icon={DollarSign}
          k={k}
          onClose={onClose}
        >
          {children}
        </KioskFormDrawer>
      )}
      familyNameShell={(visible, onClose, children) => (
        <KioskFormDrawer
          visible={visible}
          variant="drawer"
          title="Family Name"
          subtitle="Shown on the Hub, the widget, and shared with anyone you invite"
          accent={k.primary}
          Icon={Home}
          k={k}
          onClose={onClose}
        >
          {children}
        </KioskFormDrawer>
      )}
      termsShell={(visible, onClose, children) => (
        <KioskFormDrawer
          visible={visible}
          variant="drawer"
          title="Terms & Privacy"
          subtitle="Terms of service, privacy policy, AI disclosure"
          accent={k.primary}
          Icon={FileText}
          k={k}
          onClose={onClose}
        >
          {children}
        </KioskFormDrawer>
      )}
      memberSheetShell={(visible, onClose, title, subtitle, children) => (
        <KioskFormDrawer
          visible={visible}
          variant="drawer"
          title={title}
          subtitle={subtitle}
          accent={k.primary}
          Icon={User}
          k={k}
          onClose={onClose}
        >
          {children}
        </KioskFormDrawer>
      )}
      dataRecoveryShell={(visible, onClose, children) => (
        <KioskFormDrawer
          visible={visible}
          variant="drawer"
          title="Data Recovery"
          subtitle="Family passcode that protects chat, location, and medical records"
          accent={k.danger}
          Icon={KeyRound}
          k={k}
          onClose={onClose}
        >
          {children}
        </KioskFormDrawer>
      )}
      calendarSyncShell={(visible, onClose, children) => (
        <KioskFormDrawer
          visible={visible}
          variant="drawer"
          title="Calendar Sync"
          subtitle="Connect work and personal calendars"
          accent={k.primary}
          Icon={Calendar}
          k={k}
          onClose={onClose}
        >
          {children}
        </KioskFormDrawer>
      )}
      inviteShell={(visible, onClose, children) => (
        <KioskFormDrawer
          visible={visible}
          variant="drawer"
          title="Invite Family Member"
          subtitle="Add their details, then share the code they'll use to join"
          accent={k.primary}
          Icon={UserPlus}
          k={k}
          onClose={onClose}
        >
          {children}
        </KioskFormDrawer>
      )}
    />
  );
}
