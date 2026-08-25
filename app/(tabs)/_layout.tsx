import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'expo-router';
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
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useHelpStore } from '@/store/helpStore';
import { useUIStore } from '@/store/uiStore';
import { Sparkles, Plus } from 'lucide-react-native';
import AskCubeChat from '@/components/AskCubeChat';

// ── Tab icon name map ─────────────────────────────────────────────────────────
const ICON_OUTLINE: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  index:    'grid-outline',
  tasks:    'checkmark-done-outline',
  chat:     'chatbubbles-outline',
  profile:  'apps-outline',
  memories: 'images-outline',
};
const ICON_FILLED: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  index:    'grid',
  tasks:    'checkmark-done',
  chat:     'chatbubbles',
  profile:  'apps',
  memories: 'images',
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
const TABS_DEFAULT = [
  { name: 'index',    label: 'Hub'   },
  { name: 'tasks',    label: 'Tasks' },
  { name: 'chat',     label: 'Chat'  },
  { name: 'profile',  label: 'Apps'  },
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

  const iconName = focused ? ICON_FILLED[name] : ICON_OUTLINE[name];
  const color    = focused ? activeColor : inactiveColor;

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
  const isSenior = members.find(m => m.id === activeMemberId)?.role === 'senior';
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

  const bgColor     = isDark ? '#1A1428' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(160,125,212,0.15)' : 'rgba(108,92,231,0.10)';

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
        style={[styles.bar, { backgroundColor: bgColor, borderTopColor: borderColor }]}
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
  const fullBleedScreenActive = useUIStore(s => s.fullBleedScreenActive);
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const insets = useSafeAreaInsets();

  // Boot all stores once when the tab shell mounts — before any screen renders
  useEffect(() => {
    if (!familyLoaded) loadFamily();
    if (!eventsLoaded) loadEvents();
    if (!questsLoaded) loadQuests();
  }, []);

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
        <Tabs.Screen name="store"    options={{ href: null }} />
        <Tabs.Screen name="profile"  />
        {/* Superseded by 'tasks' (merged Quests + Schedule) — kept registered,
            not in the visible bar, so old deep links still resolve. */}
        <Tabs.Screen name="quests"   options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        {/* Hidden routes — not in tab bar */}
        <Tabs.Screen name="grocery"              options={{ href: null }} />
        <Tabs.Screen name="notifications"        options={{ href: null }} />
        <Tabs.Screen name="care"                 options={{ href: null }} />
        <Tabs.Screen name="memories"             options={{ href: null }} />
        <Tabs.Screen name="health"               options={{ href: null }} />
        <Tabs.Screen name="journal"              options={{ href: null }} />
        <Tabs.Screen name="all-notifications"    options={{ href: null }} />
      </Tabs>

      {/* Shared FAB — Ask Cube (sparkle) everywhere except Chat/Tasks;
          morphs in place into Tasks' own "+" (opens SmartTaskComposer via
          the one-shot openTaskComposerRequested flag TasksScreen consumes)
          the moment the Tasks tab is focused. One physical button, one
          position, crossfading icon — not two separate FABs swapping in
          and out. Parent-only: Ask Cube can act broadly across the
          household (grocery, meals, chores, schedule) on the parent's
          behalf, which isn't something a kid/teen/GP account should be
          able to trigger; Tasks' own "+" for kid/teen still uses its own
          separate role-gated logic inside TasksScreen, unaffected by this
          parent-only gate. */}
      {activeMember?.role === 'parent' && (
        <>
          {/* Hidden on the Chat tab — a second AI entry point on top of the
              family's own messaging surface was redundant/confusing there.
              If it's already open when the user navigates to Chat, leave it
              open rather than yanking it away mid-conversation — only the
              launcher button hides. */}
          {!onChatTab && !fullBleedScreenActive && (
            <Pressable
              onPress={() => {
                if (onTasksTab) useUIStore.getState().setOpenTaskComposerRequested(true);
                else setAskCubeOpen(true);
              }}
              style={{
                position: 'absolute', right: 16, bottom: (insets.bottom || 16) + 74,
                width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }}>
              {onTasksTab ? <Plus size={24} color="#fff" /> : <Sparkles size={22} color="#fff" />}
            </Pressable>
          )}
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
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 20,
    elevation: 12,
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
});
