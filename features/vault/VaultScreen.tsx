import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  StyleSheet, Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import {
  Radio, Pill, ChefHat, Image as ImageIcon, ScrollText,
  Users, LogOut, FolderOpen, Gift, ChevronRight,
  ShoppingCart, Coins, Heart, BookOpen,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useAuthStore } from '@/store/authStore';
import { useRewardStore } from '@/store/rewardStore';
import type { MemberRole } from '@/store/familyStore';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';

import GpsTabComp      from './tabs/GpsTab';
import HealthTabComp   from './tabs/HealthTab';
import MealsTabComp    from './tabs/MealsTab';
import MemoriesTabComp from './tabs/MemoriesTab';
import RosterTabComp   from './tabs/RosterTab';
import RecordsTabComp  from './tabs/RecordsTab';
import SchoolTabComp   from './tabs/SchoolTab';
import GroceryScreen   from '@/features/grocery/GroceryScreen';
import StoreScreen     from '@/features/store/StoreScreen';

// ─── Feature definitions ──────────────────────────────────────────────────────

type FeatureId = 'gps' | 'school' | 'health' | 'records' | 'meals' | 'memories' | 'roster' | 'grocery' | 'store';

interface Feature {
  id: FeatureId;
  label: string;
  subtitle: string;
  emoji: string;       // used in sheet title only
  Icon: any;           // lucide icon for tile
  accent: string;
  bg: string;
  bgDark: string;
  roles: MemberRole[];
}

const FEATURES: Feature[] = [
  { id: 'gps',      label: 'Radar',    subtitle: 'Live family locations',   emoji: '📡', Icon: Radio,        accent: '#14B8A6', bg: '#ECFDF5', bgDark: '#0D2E2A', roles: ['parent', 'kid'] },
  { id: 'school',   label: 'School',   subtitle: 'Timetable · Terms',       emoji: '📚', Icon: BookOpen,     accent: '#9261C7', bg: '#F5F3FF', bgDark: '#1A1030', roles: ['parent', 'kid'] },
  { id: 'health',   label: 'Health',   subtitle: 'My Active Medications',    emoji: '💊', Icon: Heart,        accent: '#F43F5E', bg: '#FFF1F2', bgDark: '#2D1019', roles: ['parent', 'kid'] },
  { id: 'grocery',  label: 'Grocery',  subtitle: 'Runs · Lists · Receipts', emoji: '🛒', Icon: ShoppingCart, accent: '#10B981', bg: '#ECFDF5', bgDark: '#0D2A1E', roles: ['parent'] },
  { id: 'meals',    label: 'Meals',    subtitle: 'Recipes · Nutrition',     emoji: '🍽️', Icon: ChefHat,      accent: '#F59E0B', bg: '#FFFBEB', bgDark: '#2D2008', roles: ['parent'] },
  { id: 'memories', label: 'Memories', subtitle: 'Photos · Moments',        emoji: '📸', Icon: ImageIcon,    accent: '#EC4899', bg: '#FDF2F8', bgDark: '#2D0D1F', roles: ['parent', 'kid', 'senior'] },
  { id: 'records',  label: 'Records',  subtitle: 'Documents · Files',       emoji: '📁', Icon: FolderOpen,   accent: '#6366F1', bg: '#EEF2FF', bgDark: '#1A1A38', roles: ['parent'] },
  { id: 'roster',   label: 'Roster',   subtitle: 'Members · Roles',         emoji: '👥', Icon: Users,        accent: '#3B82F6', bg: '#EFF6FF', bgDark: '#0D1A2D', roles: ['parent'] },
  { id: 'store',    label: 'Perks',    subtitle: 'Rewards · Redeem',        emoji: '🎁', Icon: Gift,         accent: '#7C3AED', bg: '#F5F3FF', bgDark: '#1A1030', roles: ['parent', 'kid'] },
];

// ─── Feature Detail View (inline, bottom nav stays visible) ──────────────────

function FeatureDetail({
  feature, colors, isDark, role, activeMember, onClose,
}: {
  feature: Feature;
  colors: any;
  isDark: boolean;
  role: MemberRole;
  activeMember: any;
  onClose: () => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Page header — same style as main tabs */}
      <View style={{ flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        backgroundColor: colors.background }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ width: 34, height: 34, borderRadius: 10,
          backgroundColor: feature.accent + '18', borderWidth: 1, borderColor: feature.accent + '30',
          alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <feature.Icon size={17} color={feature.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }}>
            {feature.label}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
            {role === 'kid' && feature.id === 'health' ? 'My Active Medications' : feature.subtitle}
          </Text>
        </View>
        {feature.id !== 'gps' && feature.id !== 'health' && (
          <View style={{ backgroundColor: isDark ? feature.bgDark : feature.bg,
            borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
            borderWidth: 1, borderColor: feature.accent + '30' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: feature.accent }}>
              {activeMember?.name?.split(' ')[0] ?? 'You'}
            </Text>
          </View>
        )}
      </View>

      {/* Content */}
      {feature.id === 'grocery' ? (
        <GroceryScreen hideHeader />
      ) : feature.id === 'store' ? (
        <StoreScreen hideHeader />
      ) : feature.id === 'gps' ? (
        // Own layout, not the shared ScrollView — the map wants to fill
        // most of the screen at the top with details scrollable below it,
        // not be squeezed into a padded scroll column like the other tabs.
        <GpsTabComp colors={colors} isDark={isDark} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 80, paddingTop: 14 }}>
          {feature.id === 'school'   && <SchoolTabComp   colors={colors} isDark={isDark} isKid={role === 'kid'} />}
          {feature.id === 'health'   && <HealthTabComp   colors={colors} isDark={isDark} kidView={role === 'kid'} />}
          {feature.id === 'records'  && <RecordsTabComp  colors={colors} isDark={isDark} />}
          {feature.id === 'meals'    && <MealsTabComp    colors={colors} isDark={isDark} />}
          {feature.id === 'memories' && <MemoriesTabComp colors={colors} isDark={isDark} readOnly={role === 'senior'} />}
          {feature.id === 'roster'   && <RosterTabComp   colors={colors} isDark={isDark} />}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Tile({
  feature, colors, isDark, onPress, badge,
}: {
  feature: Feature;
  colors: any;
  isDark: boolean;
  onPress: () => void;
  badge?: number;
}) {
  const TIcon = feature.Icon;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82}
      style={[tileS.tile, { backgroundColor: colors.card, borderColor: feature.accent + (isDark ? '40' : '30'), shadowColor: feature.accent }]}>
      <LinearGradient
        colors={[feature.accent + '16', feature.accent + '00']}
        start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={18} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
      )}
      <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)' }} pointerEvents="none" />

      {badge != null && badge > 0 && (
        <View style={[tileS.badge, { backgroundColor: feature.accent }]}>
          <Text style={tileS.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      {/* Icon circle */}
      <View style={{ width: 38, height: 38, borderRadius: 12, marginBottom: 7,
        backgroundColor: feature.accent + '1C', borderWidth: 1, borderColor: feature.accent + '35',
        alignItems: 'center', justifyContent: 'center' }}>
        <TIcon size={17} color={feature.accent} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.1, textAlign: 'center' }} numberOfLines={1}>
        {feature.label}
      </Text>
      <Text style={{ fontSize: 9.5, color: colors.textTertiary, fontWeight: '600', marginTop: 2,
        textAlign: 'center' }} numberOfLines={2}>
        {feature.subtitle}
      </Text>
    </TouchableOpacity>
  );
}

// ─── VaultScreen ──────────────────────────────────────────────────────────────

export default function VaultScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { signOut } = useAuthStore();
  const rewards = useRewardStore(s => s.rewards);
  // Lets Hub's quick-access pills deep-link straight into a feature (e.g.
  // /(tabs)/profile?openFeature=health) instead of landing on the grid.
  const params = useLocalSearchParams<{ openFeature?: string }>();

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const role: MemberRole = activeMember?.role ?? 'parent';
  const coins = activeMember?.coins ?? 0;

  const [openFeature, setOpenFeature] = useState<Feature | null>(null);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);

  useEffect(() => {
    if (!params.openFeature) return;
    const match = FEATURES.find(f => f.id === params.openFeature && f.roles.includes(role));
    if (match) setOpenFeature(match);
  }, [params.openFeature, role]);

  const visibleFeatures = FEATURES.filter(f => f.roles.includes(role));

  // Pending rewards badge for parents
  const pendingRewards = role === 'parent'
    ? rewards.filter((r: any) => r.pendingApproval).length
    : 0;

  const getBadge = (id: FeatureId) => {
    if (id === 'store') return pendingRewards;
    return 0;
  };

  // When a feature is open, render it inline (bottom nav stays visible)
  if (openFeature) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <FeatureDetail
          feature={openFeature}
          colors={colors}
          isDark={isDark}
          role={role}
          activeMember={activeMember}
          onClose={() => setOpenFeature(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
        memberRole={role as 'parent' | 'kid' | 'senior'}
        notifCount={unreadNotifCount}
        onBellPress={() => setNotifPanelOpen(true)}
        onPersonaPress={() => {}}
      />
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}>

        {/* Title */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start',
          justifyContent: 'space-between', paddingVertical: 18 }}>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary,
              letterSpacing: -0.3 }}>Apps</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
              {role === 'senior' ? 'Family Memories' : `${visibleFeatures.length} features`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {coins > 0 && (
              <View style={{ backgroundColor: isDark ? colors.amber + '20' : colors.amberLight,
                borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                borderWidth: 1, borderColor: colors.amber + '40',
                flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Coins size={13} color={colors.amber} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.amber }}>{coins}</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => Alert.alert('Sign Out', 'Sign out of Family Cube?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
            ])}>
              <LogOut size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Feature grid — 3 columns, compact glass tiles */}
        <View style={gridS.grid}>
          {visibleFeatures.map(f => (
            <View key={f.id} style={gridS.cell}>
              <Tile
                feature={f}
                colors={colors}
                isDark={isDark}
                onPress={() => setOpenFeature(f)}
                badge={getBadge(f.id)}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const gridS = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31%' },
});

const tileS = StyleSheet.create({
  tile: {
    borderRadius: 18, borderWidth: 1.5, padding: 12,
    alignItems: 'center', overflow: 'hidden',
    shadowOpacity: 0.12, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
    position: 'relative',
  },
  badge: {
    position: 'absolute', top: 8, right: 8,
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, zIndex: 1,
  },
  badgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },
});

