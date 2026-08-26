import { useEffect, useRef, useState } from 'react';
import { Tabs, router } from 'expo-router';
import {
  View, Text, StyleSheet, Pressable, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { tabBarAnim, showTabBar } from '@/lib/tabBarVisibility';
import TravelBanner from '@/components/TravelBanner';
import { useNotifStore } from '@/store/notifStore';
import { useChatStore } from '@/store/chatStore';
import { useRewardStore } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import { useAuthStore } from '@/store/authStore';
import { useEventStore } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useHelpStore } from '@/store/helpStore';
import { useUIStore } from '@/store/uiStore';
import { Sparkles, Plus, Home, ListChecks, MessageCircle } from 'lucide-react-native';
import AskCubeChat from '@/components/AskCubeChat';

// ── Tab icon name map ─────────────────────────────────────────────────────────
const ICON_OUTLINE: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  index:    'grid-outline',
  tasks:    'checkmark-done-outline',
  chat:     'chatbubbles-outline',
  profile:  'apps-outline',
  memories: 'images-outline',
  gps:      'radio-outline',
  store:    'gift-outline',
};
const ICON_FILLED: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  index:    'grid',
  tasks:    'checkmark-done',
  chat:     'chatbubbles',
  profile:  'apps',
  memories: 'images',
  gps:      'radio',
  store:    'gift',
};

// ── Tab definitions ───────────────────────────────────────────────────────────
// Grandparents get Memories in the 5th slot instead of Apps/Profile —
// settings/PIN for GP are still reachable from the Hub's profile switcher,
// same as every other role; this only changes what's one tap away in the bar.
//
// 'quests' and 'calendar' merged into a single 'tasks' tab (chores + events
// in one unified list) — see features/tasks/TasksScreen.tsx. The old route
// files stay registered below (not in these visible arrays) so any existing
// router.push('/(tabs)/quests' | '/(tabs)/calendar') deep link (push
// notification taps, Ask Cube proposal cards, etc.) keeps resolving instead
// of crashing, until those call sites are migrated to '/(tabs)/tasks'.
// 'profile'/Apps removed from the bar — AppsQuickAccessPills (Hub's own
// pill row, right below the header) already deep-links straight into every
// feature that grid held (School/Health/Grocery/Meals/Ledger/Memories/
// Records), so the tab was a redundant second hop to the same
// destinations. The '/(tabs)/profile' ROUTE stays registered below (not in
// this array) since the pills still navigate to it — only the always-
// visible tab-bar entry point is gone.
const TABS_DEFAULT = [
  { name: 'index',    label: 'Hub'    },
  { name: 'tasks',    label: 'Tasks'  },
  { name: 'store',    label: 'Store'  },
  { name: 'chat',     label: 'Chat'   },
  { name: 'gps',      label: 'FindFam' },
] as const;
const TABS_SENIOR = [
  { name: 'index',    label: 'Hub'      },
  { name: 'tasks',    label: 'Tasks'    },
  { name: 'chat',     label: 'Chat'     },
  { name: 'memories', label: 'Memories' },
] as const;

type TabName = typeof TABS_DEFAULT[number]['name'] | typeof TABS_SENIOR[number]['name'];

// ── Animated tab icon — spring bounce on selection ────────────────────────────
function AnimatedTabIcon({ name, focused, activeColor, inactiveColor }: {
  name: TabName; focused: boolean; activeColor: string; inactiveColor: string;
}) {
  const scale       = useRef(new Animated.Value(1)).current;
  const prevFocused = useRef(false);

  useEffect(() => {
    if (focused && !prevFocused.current) {
      scale.setValue(0.82);
      Animated.spring(scale, {
        toValue: 1, useNativeDriver: true, tension: 260, friction: 7,
      }).start();
    }
    prevFocused.current = focused;
  }, [focused]);

  const color = focused ? activeColor : inactiveColor;

  // Hub/Tasks/Chat use lucide icons instead of their Ionicons equivalents —
  // deliberate per-tab requests, not a library-wide switch; gps/profile/
  // memories stay on Ionicons (ICON_OUTLINE/ICON_FILLED) below.
  const LUCIDE_ICONS: Partial<Record<TabName, typeof Home>> = {
    index: Home, tasks: ListChecks, chat: MessageCircle,
  };
  const LucideIcon = LUCIDE_ICONS[name];
  if (LucideIcon) {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <LucideIcon size={22} color={color} strokeWidth={focused ? 2.4 : 2} fill={focused ? color : 'none'} fillOpacity={focused ? 0.15 : 0} />
      </Animated.View>
    );
  }

  const iconName = focused ? ICON_FILLED[name] : ICON_OUTLINE[name];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={iconName} size={22} color={color} />
    </Animated.View>
  );
}

// ── Custom tab bar ────────────────────────────────────────────────────────────
function CustomTabBar({ state, navigation }: any) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // Chat tab shows a plain unread DOT, not a count — distinct from the
  // AppHeader bell's numeric badge (general app notifications: quest
  // posted/approved/etc.). Reads chatStore's own per-channel unread
  // tracking, not notifStore's unreadCount — those used to be the same
  // number, conflating "you have an app notification" with "you have an
  // unread chat message," which are genuinely different things.
  const chatUnreadCounts = useChatStore(s => s.unreadCounts);
  const hasUnreadChat = Object.values(chatUnreadCounts).some(n => n > 0);
  const lastNavTime = useRef(0);
  const { members, activeMemberId } = useFamilyStore();
  const activeRole = members.find(m => m.id === activeMemberId)?.role;
  const isSenior = activeRole === 'senior';
  // Pending redemption count — parent-only signal (only a parent approves
  // a kid's coin redemption); a kid/teen/senior sees the Store tab with no
  // badge even if redemptions happen to be pending, same as Chat's badge
  // logic only counting UNREAD (not "any message exists").
  const pendingRedemptions = useRewardStore(s => s.redemptions).filter(r => r.status === 'pending').length;
  const showStoreBadge = activeRole === 'parent' && pendingRedemptions > 0;
  // FindFam (gps) is now in TABS_DEFAULT for everyone except senior
  // (who gets Memories in that slot instead) — kid/teen/parent all share
  // the same bar shape now that kids also get direct FindFam access.
  const TABS = isSenior ? TABS_SENIOR : TABS_DEFAULT;

  const activeColor   = colors.primary;
  const inactiveColor = colors.tabInactive;
  const TAB_COUNT     = TABS.length;

  const activeTabIndex = TABS.findIndex(t => t.name === state.routes[state.index]?.name);
  const activeRouteName: string | undefined = state.routes[state.index]?.name;
  useEffect(() => {
    useUIStore.getState().setActiveTabName(activeRouteName);
  }, [activeRouteName]);

  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth / TAB_COUNT;

  const pillAnim = useRef(new Animated.Value(activeTabIndex >= 0 ? activeTabIndex : 0)).current;
  useEffect(() => {
    if (activeTabIndex < 0) return;
    Animated.timing(pillAnim, {
      toValue: activeTabIndex,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    showTabBar();
  }, [activeTabIndex]);

  // Matches colors.background exactly so the nav reads as part of the same
  // canvas, not a separate bar sitting on top of it — was hardcoded to
  // stale pre-Kinfolk-rebrand hex (#1A1428/#FFFFFF, purple border) that
  // never tracked the real theme tokens.
  const bgColor = colors.background;

  const [barHeight, setBarHeight] = useState(0);
  const totalHeight = barHeight + (insets.bottom || 16);

  return (
    <Animated.View style={{
      backgroundColor: bgColor,
      transform: [{
        translateY: tabBarAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [totalHeight, 0],
        }),
      }],
    }}>
      <View
        style={[styles.bar, { backgroundColor: bgColor }]}
        onLayout={e => { setBarWidth(e.nativeEvent.layout.width); setBarHeight(e.nativeEvent.layout.height); }}
      >
        {/* Sliding gradient pill */}
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.pillWrap, {
              width: tabWidth,
              transform: [{
                translateX: pillAnim.interpolate({
                  inputRange: TABS.map((_, i) => i),
                  outputRange: TABS.map((_, i) => i * tabWidth),
                  extrapolate: 'clamp',
                }),
              }],
            }]}
          >
            <LinearGradient
              colors={[colors.primary + '22', colors.accent + '14']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.pill}
            />
          </Animated.View>
        )}

        {TABS.map(({ name, label }, index) => {
          const focused = activeTabIndex === index;
          const route   = state.routes.find((r: any) => r.name === name);
          const showBadge = name === 'chat' && hasUnreadChat;
          const showStoreCount = name === 'store' && showStoreBadge;

          return (
            <Pressable
              key={name}
              onPress={() => {
                const now = Date.now();
                if (now - lastNavTime.current < 400) return;
                lastNavTime.current = now;
                const event = navigation.emit({ type: 'tabPress', target: route?.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(name);
              }}
              style={styles.tabItem}
            >
              <View style={{ position: 'relative' }}>
                <AnimatedTabIcon
                  name={name}
                  focused={focused}
                  activeColor={activeColor}
                  inactiveColor={inactiveColor}
                />
                {showBadge && (
                  <View style={[styles.dotBadge, { backgroundColor: colors.danger }]} />
                )}
                {showStoreCount && (
                  <View style={[styles.countBadge, { backgroundColor: colors.danger }]}>
                    <Text style={styles.countBadgeText}>{pendingRedemptions > 9 ? '9+' : pendingRedemptions}</Text>
                  </View>
                )}
              </View>
              <Text style={[
                styles.label,
                { color: focused ? activeColor : inactiveColor, fontWeight: focused ? '700' : '500' },
              ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ height: insets.bottom || 16, backgroundColor: bgColor }} />
    </Animated.View>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function TabLayout() {
  const { colors } = useTheme();
  const { loaded: familyLoaded, loadFromStorage: loadFamily, members, activeMemberId } = useFamilyStore();
  const { loaded: eventsLoaded, loadFromStorage: loadEvents } = useEventStore();
  const { loaded: questsLoaded, loadFromStorage: loadQuests } = useQuestStore();
  const { loaded: helpLoaded,   loadFromStorage: loadHelp   } = useHelpStore();
  const [askCubeOpen, setAskCubeOpen] = useState(false);
  // Read from CustomTabBar's own React Navigation `state` prop (via
  // uiStore.activeTabName) rather than expo-router's usePathname() —
  // usePathname() lagged/mismatched the real focused tab on Expo Router's
  // lazy+frozen tab screens (live-reported: the shared FAB below sometimes
  // showed "+" on Hub/Apps and sparkle on Tasks, backwards). state.routes[
  // state.index] is synchronous and authoritative.
  const activeTabName = useUIStore(s => s.activeTabName);
  const onChatTab = activeTabName === 'chat';
  // Grocery has its own dedicated "+" (add item) FAB in the same bottom-
  // right position — the shared Ask Cube sparkle would otherwise stack
  // directly on top of it. Same treatment as Chat below.
  const onGroceryTab = activeTabName === 'grocery';
  // One shared FAB (not two separate ones) swaps between Ask Cube
  // (sparkle, every tab except Chat/Tasks) and Tasks' own smart-create
  // entry point (+, Tasks tab only) — same physical button, same position.
  // A crossfade animation was tried first but the Pressable unmounts/
  // remounts whenever onChatTab toggles (see !onChatTab && ... below),
  // which reset the animated value's continuity and left the icon stuck
  // on stale state after certain tab sequences (live-reported repeatedly:
  // "+" stuck showing on Hub/Apps after visiting Chat). Plain conditional
  // icon render instead — no animation, but always correct.
  const onTasksTab = activeTabName === 'tasks';
  // Store and FindFam (gps) both have their own focused, full-screen
  // purposes (redeem/approve perks; check the family map) where a
  // household-wide AI assistant launcher is off-topic clutter, same
  // reasoning as Chat/Grocery above — just without a replacement FAB of
  // their own, so the button simply disappears rather than swapping icon.
  const onStoreTab = activeTabName === 'store';
  const onGpsTab = activeTabName === 'gps';
  // Memories gets the same treatment as Tasks — shared FAB morphs to "+"
  // and posts a memory instead of opening Ask Cube, rather than being
  // hidden. Posting a memory isn't parent-only the way Ask Cube is, so
  // this is read outside the `activeMember?.role === 'parent'` gate below
  // (see the FAB render's own comment for how that split plays out).
  const onMemoriesTab = activeTabName === 'memories';
  // Health & Records' own "+ Add" affordances are already parent(-only-
  // visible) inside HealthRecordsList.tsx/RecordsTab.tsx (kidView hides
  // them) — unlike Memories, this one stays INSIDE the parent-only gate
  // below rather than being a carved-out exception, so a kid/teen/senior
  // viewing this screen still just gets the FAB hidden (same as Store/
  // FindFam), not a "+" they can't actually use.
  const onFamilyHealthTab = activeTabName === 'family-health';
  const healthRecordsActiveSegment = useUIStore(s => s.healthRecordsActiveSegment);
  const fullBleedScreenActive = useUIStore(s => s.fullBleedScreenActive);
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const insets = useSafeAreaInsets();

  // Defensive reset: fullBleedScreenActive is only ever legitimately set
  // true by GpsTab.tsx/HealthTab.tsx while their own Vault sub-screen is
  // open (client-side state inside VaultScreen — activeTabName stays
  // 'profile'/'apps' the whole time, no route change fires). If either
  // screen's cleanup effect doesn't run — abrupt unmount, a navigation
  // reset instead of a normal pop, anything React's effect cleanup
  // doesn't cover — the flag can get stuck true and permanently hide the
  // shared FAB on every tab, with no way to clear it short of a full app
  // relaunch. This codebase has already hit the sibling class of this bug
  // once (see onTasksTab's own comment above, "+ stuck showing on
  // Hub/Apps"). Since neither legitimate setter corresponds to an
  // activeTabName change, forcing it false whenever the focused TAB
  // itself changes is always safe — it can't fight a screen that's still
  // genuinely full-bleed, because that screen never changes activeTabName
  // while it's open.
  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(false);
  }, [activeTabName]);

  // Boot all stores once when the tab shell mounts — before any screen renders
  useEffect(() => {
    if (!familyLoaded) loadFamily();
    if (!eventsLoaded) loadEvents();
    if (!questsLoaded) loadQuests();
  }, []);

  // A signed-in account can reach /(tabs) with terms_accepted/
  // onboarding_completed=true (set the moment they accept terms) but with
  // no family ever created or joined — e.g. they backed out of Setup/
  // JoinFamilyScreen after accepting terms. Every tab screen assumes an
  // active member exists, so without this redirect the app renders a blank
  // screen behind the tab bar instead of sending them back to finish setup.
  //
  // Gated on a real session existing: familyStore.reset() (runs on sign-out)
  // sets members to [] with loaded:true, and this tab shell can still be
  // mounted for one more render before the sign-out navigation actually
  // swaps the stack — without this guard, that one-render window raced this
  // effect straight to /onboarding for a user who just signed out cleanly.
  //
  // Gated on familyLoadStatus === 'confirmed' rather than familyLoaded: a
  // still-resolving fetch (e.g. a transient auth-propagation race right
  // after sign-in) previously looked identical to "genuinely no family" the
  // instant familyLoaded flipped true, bouncing an already-onboarded user
  // with a real family into onboarding's Create/Join Family screen.
  // familyLoadStatus only reaches 'confirmed' once familyStore's bounded
  // retry loop has actually finished, so this can no longer fire prematurely.
  //
  // One-shot via redirectedToOnboarding: without it, this effect could
  // re-fire on every members.length/familyLoadStatus transition. Combined
  // with SetupFamilyScreen's own existing-family check (which can bounce
  // the user back to /(tabs), remounting this component), an unguarded
  // effect risked a genuine ping-pong loop between the two route groups —
  // a prior fix attempt at a related issue caused exactly this kind of
  // infinite loop. A plain useRef (not module state) still gets a fresh
  // guard on a genuine new mount of this component.
  const hasSession = useAuthStore(s => !!s.session);
  const familyLoadStatus = useFamilyStore(s => s.familyLoadStatus);
  const redirectedToOnboarding = useRef(false);
  useEffect(() => {
    if (redirectedToOnboarding.current) return;
    if (hasSession && familyLoadStatus === 'confirmed' && members.length === 0) {
      redirectedToOnboarding.current = true;
      router.replace('/onboarding');
    }
  }, [hasSession, familyLoadStatus, members.length]);

  // Prefetch the default chat channel at tab-shell mount, same as Hub/
  // Tasks' own stores above — Chat's ENTIRE data pipeline (message fetch,
  // decrypt, realtime subscribe) was previously 100% deferred until the
  // moment the user actually tapped the Chat tab, unlike every other tab
  // whose store is already warm by then. That's the single biggest reason
  // Chat specifically felt slow to open (live-reported): the first tap of
  // a session paid the full loadChannel cost synchronously-relative-to-
  // the-tap instead of it already being in flight/done. Only warms the
  // default 'all' channel (senior accounts get redirected to
  // 'seniors_all' inside ChatScreen itself, a separate known duplicate-
  // fetch issue) — not the per-member DM channels, which aren't known
  // until ChatScreen computes its own channel list.
  useEffect(() => {
    if (familyLoaded) useChatStore.getState().loadChannel('all');
  }, [familyLoaded]);

  // Boot help store once family members are loaded — scope fetch to this family's IDs
  useEffect(() => {
    if (!helpLoaded && members.length > 0) {
      loadHelp(members.map(m => m.id));
    }
  }, [members.length]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TravelBanner />
      <Tabs
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
          lazy: true,
          freezeOnBlur: true,
        }}
      >
        <Tabs.Screen name="index"    />
        <Tabs.Screen name="tasks"    />
        <Tabs.Screen name="chat"     />
        <Tabs.Screen name="store"    />
        {/* FindFam — in TABS_DEFAULT for everyone except senior (Memories
            takes that slot instead); registered without href:null like
            every other visible tab, same pattern already used for
            'memories' (senior-only) — role-based visibility is handled
            entirely by which TABS array CustomTabBar renders. */}
        <Tabs.Screen name="gps"      />
        {/* Superseded by 'tasks' (merged Quests + Schedule) — kept registered,
            not in the visible bar, so old deep links still resolve. */}
        <Tabs.Screen name="quests"   options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        {/* Hidden routes — not in tab bar */}
        <Tabs.Screen name="grocery"              options={{ href: null }} />
        <Tabs.Screen name="meals"                options={{ href: null }} />
        <Tabs.Screen name="school"               options={{ href: null }} />
        <Tabs.Screen name="notifications"        options={{ href: null }} />
        <Tabs.Screen name="memories"             options={{ href: null }} />
        {/* Family Health & Records combined (one screen, segmented switch) */}
        <Tabs.Screen name="family-health"        options={{ href: null }} />
        <Tabs.Screen name="all-notifications"    options={{ href: null }} />
      </Tabs>

      {/* Shared FAB — Ask Cube (sparkle) everywhere except Chat/Grocery/
          Store/FindFam/Tasks/Memories/Health & Records; morphs in place
          into Tasks' own "+" (opens SmartTaskComposer via the one-shot
          openTaskComposerRequested flag TasksScreen consumes), Memories'
          own "+" (openMemoryComposerRequested, MemoriesTab consumes), or
          Health & Records' own "+" (openHealthRecordsComposerRequested,
          HealthTab/RecordsTab each consume it for whichever segment is
          mounted) depending on which is focused. One physical button, one
          position, crossfading icon — not separate FABs swapping in and
          out. Ask Cube itself (the sparkle face, Tasks' "+", and Health &
          Records' "+") stays parent-only — Ask Cube can act broadly across
          the household on the parent's behalf, which isn't something a
          kid/teen/GP account should trigger, Tasks' kid/teen creation path
          uses its own separate header buttons instead of this shared
          button, and Health & Records' own add-medication/add-record
          controls are already parent(-visible)-only inside
          HealthRecordsList.tsx/RecordsTab.tsx (kidView hides them) — so a
          kid/teen there correctly just gets the FAB hidden, same as Store/
          FindFam. Memories' "+" is the one exception carved out of the
          gate below — posting a memory isn't a parent-only action the way
          Ask Cube is. */}
      {(activeMember?.role === 'parent' || onMemoriesTab) && (
        <>
          {/* Hidden on the Chat tab — a second AI entry point on top of the
              family's own messaging surface was redundant/confusing there.
              If it's already open when the user navigates to Chat, leave it
              open rather than yanking it away mid-conversation — only the
              launcher button hides. Also hidden on Grocery — that screen
              has its own dedicated "+" (add item) FAB in the same
              bottom-right spot, and stacking the sparkle directly on top
              of it was redundant/confusing the same way. Also hidden on
              Store and FindFam — both are focused, single-purpose screens
              (redeem/approve perks; check the family map) where a
              household-wide AI launcher doesn't add anything and just
              clutters the corner. */}
          {!onChatTab && !onGroceryTab && !onStoreTab && !onGpsTab && !fullBleedScreenActive
            && (activeMember?.role === 'parent' || onMemoriesTab) && (() => {
            // Health & Records has its own inner segmented switch (Health/
            // Immunizations/Records) nested inside one route — the FAB
            // tracks that too, not just which top-level route is focused,
            // so it visually matches whichever segment is actually showing
            // (danger-red for Health, teal for Immunizations or Records).
            const fabColor = onFamilyHealthTab
              ? (healthRecordsActiveSegment === 'health' ? colors.danger : colors.teal)
              : colors.primary;
            return (
              <Pressable
                onPress={() => {
                  if (onTasksTab) useUIStore.getState().setOpenTaskComposerRequested(true);
                  else if (onMemoriesTab) useUIStore.getState().setOpenMemoryComposerRequested(true);
                  else if (onFamilyHealthTab) useUIStore.getState().setOpenHealthRecordsComposerRequested(true);
                  else setAskCubeOpen(true);
                }}
                style={{
                  position: 'absolute', right: 16, bottom: (insets.bottom || 16) + 74,
                  width: 52, height: 52, borderRadius: 26, backgroundColor: fabColor,
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: fabColor, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                }}>
                {(onTasksTab || onMemoriesTab || onFamilyHealthTab) ? <Plus size={24} color="#fff" /> : <Sparkles size={22} color="#fff" />}
              </Pressable>
            );
          })()}
          <AskCubeChat
            visible={askCubeOpen}
            onClose={() => setAskCubeOpen(false)}
            activeMember={activeMember}
            members={members}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    // Flush with the canvas — no border/shadow/elevation seam. Nav should
    // read as part of the same surface as the page above it, not a
    // separate lifted bar (explicit direction, plus this shadowColor was
    // leftover pre-Kinfolk-rebrand purple that never matched anything).
    flexDirection: 'row',
    paddingTop: 8,
    position: 'relative',
  },
  pillWrap: {
    position: 'absolute',
    top: 6,
    left: 0,
    height: 56,
    paddingHorizontal: 4,
  },
  pill: {
    flex: 1,
    borderRadius: 14,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingTop: 2,
    gap: 2,
  },
  label: {
    fontSize: 12,
  },
  dotBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
});
