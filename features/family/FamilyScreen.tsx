import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Image,
  Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import {
  Users, MapPin, Heart, GraduationCap, Home, Image as ImageIcon,
  Gift, Gamepad2, Plus, ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';

// Tool card definition
interface Tool {
  key: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  accent: string;        // bg tint token name
  route: string;
}

function FamilyMemberAvatar({ member, size = 52 }: { member: any; size?: number }) {
  const name: string = member?.name ?? '?';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const hue = name.charCodeAt(0) % 360;
  const avatarBg = `hsl(${hue},50%,55%)`;

  if (member?.avatarUrl) {
    return (
      <Image
        source={{ uri: member.avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2,
          borderWidth: 2.5, borderColor: '#fff' }}
      />
    );
  }

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: avatarBg, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2.5, borderColor: '#fff' }}>
      <Text style={{ fontSize: size * 0.34, fontWeight: '700', color: '#fff' }}>{initials}</Text>
    </View>
  );
}

// Staggered entrance animation — re-plays when `animKey` changes (tab switch only)
function AnimatedCard({ index, animKey, children, style }: {
  index: number; animKey: number; children: React.ReactNode; style?: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Start invisible and slide up
    opacity.setValue(0);
    translateY.setValue(20);
    const delay = 60 + index * 50; // slight initial delay so header lands first
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 280, delay,
        easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: 300, delay,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, [animKey]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

export default function FamilyScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => (m as any).id === activeMemberId) ?? members[0];
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const P = colors.primary;

  // Header fade-in + card animation
  // Only plays on first mount and when switching FROM another tab —
  // never on back-navigation from a subpage (which would flash cards to 0).
  // `hasAnimated` tracks whether we've run the intro this tab-session;
  // `lastTabName` lets us detect a real tab switch vs a stack pop.
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-16)).current;
  const [focusCount, setFocusCount] = useState(0);
  const navigation = useNavigation();
  // Track whether we're in a "subpage pushed" state so blur/focus from
  // back-navigation doesn't re-trigger the entrance animation.
  const isSubpageActive = useRef(false);

  const playEntrance = useCallback(() => {
    headerOpacity.setValue(0);
    headerY.setValue(-16);
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(headerY, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    setFocusCount(c => c + 1);
  }, []);

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    playEntrance();

    // Listen for subpages being pushed/popped on this navigator so we can
    // skip the entrance animation when the user just pops back to this screen.
    const unsubPush = (navigation as any).addListener?.('blur', () => {
      // Check if a route was pushed on top (state has more than 1 route)
      const state = (navigation as any).getState?.();
      if (state && state.index > 0) {
        isSubpageActive.current = true;
      }
    });

    return () => {
      useUIStore.getState().setFullBleedScreenActive(false);
      unsubPush?.();
    };
  }, []);

  useFocusEffect(useCallback(() => {
    if (isSubpageActive.current) {
      // Returning from a subpage — keep content visible, no animation flash
      isSubpageActive.current = false;
      // Ensure header is fully visible in case it was mid-animation
      headerOpacity.setValue(1);
      headerY.setValue(0);
      return;
    }
    // Real tab switch — play full entrance
    playEntrance();
  }, [playEntrance]));

  const TOOLS: Tool[] = [
    {
      key: 'people',
      label: 'People',
      subtitle: 'Profiles and permissions',
      icon: Users,
      accent: colors.primaryLight,
      route: '/(tabs)/tasks', // opens roster/profile settings
    },
    {
      key: 'locations',
      label: 'Locations',
      subtitle: 'Privacy-aware sharing',
      icon: MapPin,
      accent: colors.tealLight,
      route: '/(tabs)/findFam',
    },
    {
      key: 'health',
      label: 'Health',
      subtitle: 'Medications and records',
      icon: Heart,
      accent: colors.amberLight,
      route: '/(tabs)/family-health',
    },
    {
      key: 'school',
      label: 'School',
      subtitle: 'Schedules and pickup',
      icon: GraduationCap,
      accent: colors.tealLight,
      route: '/(tabs)/school',
    },
    {
      key: 'homecare',
      label: 'Home care',
      subtitle: 'Maintenance and notes',
      icon: Home,
      accent: colors.amberLight,
      route: '/(tabs)/tasks',
    },
    {
      key: 'memories',
      label: 'Memories',
      subtitle: 'Photos and family stories',
      icon: ImageIcon,
      accent: colors.pinkLight,
      route: '/(tabs)/memories',
    },
    {
      key: 'rewards',
      label: 'Rewards',
      subtitle: 'Coins and perks',
      icon: Gift,
      accent: colors.amberLight,
      route: '/(tabs)/store',
    },
    {
      key: 'games',
      label: 'Games',
      subtitle: 'Fun for everyone',
      icon: Gamepad2,
      accent: colors.pinkLight,
      route: '/(tabs)/tasks',
    },
  ];

  const countLabel = members.length === 1 ? 'One person'
    : members.length === 2 ? 'Two people'
    : members.length === 3 ? 'Three people'
    : members.length === 4 ? 'Four people'
    : members.length === 5 ? 'Five people'
    : `${members.length} people`;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* ── Title header ── */}
        <Animated.View style={{
          paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 4,
          opacity: headerOpacity, transform: [{ translateY: headerY }],
          flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
        }}>
          <Text style={{ fontSize: 34, fontWeight: '700', color: colors.textPrimary,
            letterSpacing: -0.5, flex: 1 }}>
            Your family
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/tasks' as any)}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: pressed ? colors.border : '#FFFFFF',
              borderWidth: 1, borderColor: colors.border,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#172337', shadowOpacity: 0.08,
              shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
              elevation: 2, marginBottom: 4,
            })}>
            <Plus size={20} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        </Animated.View>

        {/* ── Family card ── */}
        <AnimatedCard index={1} animKey={focusCount} style={{ marginHorizontal: 20, marginBottom: 32 }}>
        <View style={{
          backgroundColor: colors.surface, borderRadius: 20, padding: 20,
          shadowColor: isDark ? 'transparent' : '#172337',
          shadowOpacity: isDark ? 0 : 0.04, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 1,
        }}>
          {/* Stacked avatars */}
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            {members.slice(0, 6).map((m, i) => (
              <View key={(m as any).id} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: members.length - i }}>
                <FamilyMemberAvatar member={m} size={52} />
              </View>
            ))}
          </View>

          {/* Family name + subtitle + link */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>
                The {familyName}s
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 3 }}>
                {countLabel} · one calm family space
              </Text>
            </View>
            <Pressable onPress={() => router.push('/(tabs)/tasks' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: P }}>
                View people →
              </Text>
            </Pressable>
          </View>
        </View>
        </AnimatedCard>

        {/* ── Family tools section ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary,
            letterSpacing: 1, marginBottom: 8 }}>
            FAMILY TOOLS
          </Text>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 }}>
            Everything in one place
          </Text>
        </View>

        {/* ── 2-column tool grid ── */}
        <View style={{ paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {TOOLS.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <AnimatedCard key={tool.key} index={index + 2} animKey={focusCount} style={{ width: '47%' }}>
                <AnimatedPressable
                  onPress={() => router.push(tool.route as any)}
                  style={{
                    backgroundColor: tool.accent,
                    borderRadius: 18, padding: 18,
                    minHeight: 140, justifyContent: 'space-between',
                  }}>
                  {/* Icon */}
                  <Icon size={26} color={P} strokeWidth={1.8} />

                  {/* Label + subtitle + arrow */}
                  <View style={{ gap: 3, marginTop: 16 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>
                      {tool.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
                      {tool.subtitle}
                    </Text>
                    <Text style={{ fontSize: 18, color: P, marginTop: 6 }}>→</Text>
                  </View>
                </AnimatedPressable>
              </AnimatedCard>
            );
          })}
        </View>

      </ScrollView>
    </View>
  );
}
