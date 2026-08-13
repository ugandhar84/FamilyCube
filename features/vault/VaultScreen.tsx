import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radio, Pill, ChefHat, Image as ImageIcon, ScrollText, Users, LogOut, FolderOpen, LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useAuthStore } from '@/store/authStore';
import type { MemberRole } from '@/store/familyStore';
import AppHeader from '@/components/AppHeader';
// Modular vault tabs
import GpsTabComp      from './tabs/GpsTab';
import HealthTabComp   from './tabs/HealthTab';
import MealsTabComp    from './tabs/MealsTab';
import MemoriesTabComp from './tabs/MemoriesTab';
import LedgerTabComp   from './tabs/LedgerTab';
import RosterTabComp   from './tabs/RosterTab';
import RecordsTabComp  from './tabs/RecordsTab';

// ─── Types ────────────────────────────────────────────────────────────────────

type VaultTab = 'gps' | 'health' | 'records' | 'meals' | 'memories' | 'ledger' | 'roster';

const BRAND = {
  purple:  '#7C3AED',
  teal:    '#14B8A6',
  amber:   '#F59E0B',
  emerald: '#10B981',
  rose:    '#F43F5E',
  blue:    '#3B82F6',
};

// ─── RBAC — which tabs each role can see ────────────────────────────────────
// Senior: read-only Memories only (parent pays, seniors are passive viewers)
// Kid:    no Records, no Roster
// Parent: all tabs

type TabDef = { id: VaultTab; label: string; Icon: LucideIcon; roles: MemberRole[] };

const SUBTABS: TabDef[] = [
  { id: 'gps',      label: 'Radar',    Icon: Radio,      roles: ['parent', 'kid'] },
  { id: 'health',   label: 'Health',   Icon: Pill,       roles: ['parent', 'kid'] },
  { id: 'records',  label: 'Records',  Icon: FolderOpen, roles: ['parent'] },
  { id: 'meals',    label: 'Meals',    Icon: ChefHat,    roles: ['parent'] },
  { id: 'memories', label: 'Memories', Icon: ImageIcon,  roles: ['parent', 'kid', 'senior'] },
  { id: 'ledger',   label: 'Ledger',   Icon: ScrollText, roles: ['parent', 'kid'] },
  { id: 'roster',   label: 'Roster',   Icon: Users,      roles: ['parent'] },
];

// ─── VaultScreen ─────────────────────────────────────────────────────────────

export default function VaultScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { signOut } = useAuthStore();

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const role: MemberRole = activeMember?.role ?? 'parent';

  const visibleTabs = SUBTABS.filter(t => t.roles.includes(role));
  const defaultTab = visibleTabs[0]?.id ?? 'memories';

  const [activeTab, setActiveTab] = useState<VaultTab>(defaultTab);

  const scrollRef = useRef<ScrollView>(null);
  const prevMemberRef = useRef(activeMemberId);
  useEffect(() => {
    if (prevMemberRef.current === activeMemberId) return;
    prevMemberRef.current = activeMemberId;
    // Reset to role-appropriate default tab when member switches
    const newRole: MemberRole = members.find(m => m.id === activeMemberId)?.role ?? 'parent';
    const tabs = SUBTABS.filter(t => t.roles.includes(newRole));
    setActiveTab(tabs[0]?.id ?? 'memories');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeMemberId, members]);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);

  const bg = isDark ? '#0B0F1A' : '#F3F0FB';

  // Senior-specific: read-only flag passed to Memories tab
  const isSenior = role === 'senior';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
        memberRole={role as 'parent' | 'kid' | 'senior'}
        onBellPress={() => {}}
        onPersonaPress={() => {}}
      />

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 52 }}>

        <View style={s.titleBar}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 }}>
              Family Vault
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
              {isSenior ? 'Family Memories' : 'GPS · Health · Records · Meals · Memories · Ledger'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert('Sign Out', 'Sign out of Family Cube?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
          ])}>
            <LogOut size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Horizontal pill tab bar — only shows role-permitted tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabScrollContent}
          style={{ marginHorizontal: 14, marginBottom: 14 }}>
          {visibleTabs.map(t => {
            const active = activeTab === t.id;
            const TIcon = t.Icon;
            return (
              <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)}
                style={[s.tabPill, {
                  backgroundColor: active ? BRAND.purple : isDark ? colors.surface : '#EDE9FE',
                  borderColor: active ? BRAND.purple : isDark ? colors.border : '#DDD6FE',
                }]}>
                <TIcon size={15} color={active ? '#fff' : colors.textSecondary} />
                <Text style={[s.tabPillText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 14, gap: 12 }}>
          {activeTab === 'gps'      && <GpsTabComp      colors={colors} isDark={isDark} />}
          {activeTab === 'health'   && <HealthTabComp   colors={colors} isDark={isDark} kidView={role === 'kid'} />}
          {activeTab === 'records'  && <RecordsTabComp  colors={colors} isDark={isDark} />}
          {activeTab === 'meals'    && <MealsTabComp    colors={colors} isDark={isDark} />}
          {activeTab === 'memories' && <MemoriesTabComp colors={colors} isDark={isDark} readOnly={isSenior} />}
          {activeTab === 'ledger'   && <LedgerTabComp   colors={colors} isDark={isDark} />}
          {activeTab === 'roster'   && <RosterTabComp   colors={colors} isDark={isDark} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:     { flex: 1 },
  titleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 14 },

  tabScrollContent: { gap: 8, paddingRight: 4 },
  tabPill:      { flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingVertical: 8, paddingHorizontal: 14,
                  borderRadius: 22, borderWidth: 1.5 },
  tabPillText:  { fontSize: 13, fontWeight: '800' },

  scard:        { borderRadius: 22, borderWidth: 1.5, padding: 16,
                  shadowOpacity: 0.06, shadowRadius: 12,
                  shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  sectionLabel: { fontSize: 14, fontWeight: '800' },

  cardHeaderRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderIconBox: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardHeaderTitle:   { fontSize: 14, fontWeight: '900', flex: 1 },

  badge:         { borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:     { fontSize: 11, fontWeight: '800' },
  statusPill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 99, borderWidth: 1,
                   paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText:{ fontSize: 11, fontWeight: '800' },

  row: { flexDirection: 'row', alignItems: 'center' },

  // GPS
  radarMap: { height: 190, borderRadius: 18, marginVertical: 14, backgroundColor: '#030712',
              borderWidth: 1, borderColor: '#14B8A620', position: 'relative',
              overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  radarRing:    { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  radarCrossH:  { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth,
                  backgroundColor: '#14B8A620', top: '50%' },
  radarCrossV:  { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth,
                  backgroundColor: '#14B8A620', left: '50%' },
  radarPin:      { position: 'absolute', alignItems: 'center' },
  radarPinDot:   { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5,
                   alignItems: 'center', justifyContent: 'center' },
  radarPinLabel: { backgroundColor: 'rgba(15,23,42,0.88)', borderRadius: 8,
                   paddingHorizontal: 6, paddingVertical: 2, marginTop: 3, alignItems: 'center' },
  radarPinName:  { fontSize: 8, fontWeight: '800', color: '#fff' },
  radarPinBatt:  { fontSize: 7, fontWeight: '700' },
  radarFootnoteRow: { position: 'absolute', bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  radarFootnote: { fontSize: 9, color: '#14B8A680', fontWeight: '700' },
  telemetryRow:  { flexDirection: 'row', alignItems: 'center', padding: 12,
                   borderRadius: 16, borderWidth: 1 },

  // Health
  medIconBox: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  medRow:     { flexDirection: 'row', alignItems: 'center', paddingBottom: 12,
                borderBottomWidth: StyleSheet.hairlineWidth },
  markBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12,
                paddingVertical: 7, paddingHorizontal: 12 },

  // AI Doc
  textarea:     { borderWidth: 1.5, borderRadius: 14, padding: 12, fontSize: 14,
                  minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  submitBtn:    { borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  submitBtnText:{ fontSize: 14, fontWeight: '800' },

  // Memories
  memoryThumb: { width: '100%', height: 130, borderRadius: 16,
                 alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heartBtn:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
                 paddingVertical: 8, borderRadius: 14, borderWidth: 1 },

  // Ledger
  kidLedgerCard: { borderRadius: 18, borderWidth: 1.5, padding: 14, marginTop: 14 },
  coinBar:       { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  coinBarFill:   { height: '100%', borderRadius: 3 },
  walletBtn:     { flex: 1, borderRadius: 14, paddingVertical: 10,
                   alignItems: 'center', justifyContent: 'center' },
  walletBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // Meals
  mealIconBox:   { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mealCard:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 12 },
  groceryInput:  { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#334155',
                   backgroundColor: '#0F172A', color: '#E2E8F0', fontSize: 13,
                   paddingHorizontal: 12, paddingVertical: 9 },
  groceryAddBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND.emerald,
                   alignItems: 'center', justifyContent: 'center' },
  aisleLabel:    { fontSize: 10, fontWeight: '900', color: '#64748B', letterSpacing: 1 },
  groceryRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
                   paddingHorizontal: 12, paddingVertical: 10 },
  recipeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)',
                   justifyContent: 'center', padding: 16, zIndex: 99 },
  recipeCard:    { borderRadius: 24, padding: 20, maxHeight: '90%' },
  recipeSection: { fontSize: 13, fontWeight: '900', marginBottom: 8 },
  ingPill:       { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  stepNum:       { width: 22, height: 22, borderRadius: 11, alignItems: 'center',
                   justifyContent: 'center', marginRight: 10, flexShrink: 0 },

  // Roster
  inviteInput:     { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  inviteBtn:       { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rosterRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1.5, padding: 12 },
  rosterActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
                     borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  pinBox:          { marginTop: 6, borderRadius: 16, borderWidth: 1, padding: 14 },
  pinInput:        { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12,
                     paddingVertical: 9, fontSize: 16, letterSpacing: 4, textAlign: 'center' },
});
