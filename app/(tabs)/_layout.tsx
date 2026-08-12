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

// ── Tab icon name map ─────────────────────────────────────────────────────────
const ICON_OUTLINE: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  index:    'home-outline',
  quests:   'flag-outline',
  calendar: 'calendar-outline',
  chat:     'chatbubbles-outline',
  gps:      'map-outline',
  store:    'gift-outline',
  profile:  'person-outline',
};
const ICON_FILLED: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  index:    'home',
  quests:   'flag',
  calendar: 'calendar',
  chat:     'chatbubbles',
  gps:      'map',
  store:    'gift',
  profile:  'person',
};

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { name: 'index',    label: 'Hub'      },
  { name: 'quests',   label: 'Quests'   },
  { name: 'calendar', label: 'Schedule' },
  { name: 'chat',     label: 'Chat'     },
  { name: 'gps',      label: 'GPS'      },
  { name: 'store',    label: 'Store'    },
  { name: 'profile',  label: 'Profile'  },
] as const;

type TabName = typeof TABS[number]['name'];

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
  const unreadCount = useNotifStore(s => s.unreadCount);
  const lastNavTime = useRef(0);

  const activeColor   = colors.primary;
  const inactiveColor = colors.tabInactive;
  const TAB_COUNT     = TABS.length;

  const activeTabIndex = TABS.findIndex(t => t.name === state.routes[state.index]?.name);

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
          const showBadge = name === 'chat' && unreadCount > 0;

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
                  <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 9 ? '9+' : String(unreadCount)}
                    </Text>
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
        <Tabs.Screen name="quests"   />
        <Tabs.Screen name="calendar" />
        <Tabs.Screen name="chat"     />
        <Tabs.Screen name="gps"      />
        <Tabs.Screen name="store"    />
        <Tabs.Screen name="profile"  />
        <Tabs.Screen name="grocery" options={{ href: null }} />
        {/* Hidden — old Petkoinia screens kept as routes but removed from tab bar */}
        <Tabs.Screen name="notifications"        options={{ href: null }} />
        <Tabs.Screen name="care"                 options={{ href: null }} />
        <Tabs.Screen name="connect"              options={{ href: null }} />
        <Tabs.Screen name="memories"             options={{ href: null }} />
        <Tabs.Screen name="health"               options={{ href: null }} />
        <Tabs.Screen name="journal"              options={{ href: null }} />
        <Tabs.Screen name="social"               options={{ href: null }} />
        <Tabs.Screen name="sos"                  options={{ href: null }} />
        <Tabs.Screen name="playdates"            options={{ href: null }} />
        <Tabs.Screen name="all-notifications"    options={{ href: null }} />
        <Tabs.Screen name="social-notifications" options={{ href: null }} />
      </Tabs>
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
    fontSize: 10,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 13,
  },
});
