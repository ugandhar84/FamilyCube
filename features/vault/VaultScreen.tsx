import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useAuthStore } from '@/store/authStore';
import AppHeader from '@/components/AppHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type VaultTab = 'gps' | 'health' | 'aiDoc' | 'memories' | 'ledger';

interface Medication {
  id: string;
  name: string;
  dosage: string;
  recipient: string;
  time: string;
  takenToday: boolean;
}

interface Vaccine {
  id: string;
  member: string;
  title: string;
  date: string;
  status: string;
}

interface Memory {
  id: string;
  title: string;
  date: string;
  emoji: string;
  hearts: number;
}

// ─── Sub-tab button ───────────────────────────────────────────────────────────

function SubTab({ label, icon, active, onPress, colors }: {
  label: string; icon: string; active: boolean;
  onPress: () => void; colors: any;
}) {
  return (
    <Pressable onPress={onPress}
      style={[s.subTab, active && { backgroundColor: colors.card, borderRadius: 10 }]}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={{ fontSize: 10, fontWeight: '700',
        color: active ? colors.textPrimary : colors.textTertiary, marginTop: 2 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

function SCard({ children, colors, isDark, style }: {
  children: React.ReactNode; colors: any; isDark: boolean; style?: any;
}) {
  return (
    <View style={[s.scard, {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderColor: isDark ? colors.border : '#EDEAF8',
      ...style,
    }]}>
      {children}
    </View>
  );
}

// ─── GPS tab ─────────────────────────────────────────────────────────────────

function GpsTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  return (
    <SCard colors={colors} isDark={isDark}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
        <View style={s.row}>
          <Ionicons name="radio" size={18} color={colors.teal} />
          <Text style={[s.cardTitle, { color: colors.textPrimary, marginLeft: 6 }]}>
            Household Safety GPS Radar
          </Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: colors.teal + '20', borderColor: colors.teal + '50' }]}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.teal }}>● Live</Text>
        </View>
      </View>

      {/* Radar map placeholder */}
      <View style={[s.radarMap, { backgroundColor: isDark ? '#0A1A0F' : '#F0FDF4',
        borderColor: colors.teal + '30' }]}>
        {/* Radar rings */}
        <View style={[s.radarRing, { width: 160, height: 160, borderColor: colors.teal + '20' }]} />
        <View style={[s.radarRing, { width: 100, height: 100, borderColor: colors.teal + '30' }]} />
        <View style={[s.radarRing, { width: 50, height: 50, borderColor: colors.teal + '40' }]} />
        <Text style={{ position: 'absolute', top: 12, left: 12, fontSize: 11, color: colors.textTertiary,
          fontWeight: '700' }}>Home HQ 🏠</Text>
        <Text style={{ position: 'absolute', bottom: 16, right: 12, fontSize: 10, color: colors.textTertiary }}>
          GPS safe zones active
        </Text>
      </View>

      {/* Member pins */}
      <View style={{ marginTop: 12, gap: 8 }}>
        {members.map(m => (
          <View key={m.id} style={[s.row, { justifyContent: 'space-between', paddingVertical: 8,
            paddingHorizontal: 12, borderRadius: 12,
            backgroundColor: isDark ? colors.surface : '#F8F5FF',
            borderWidth: 1, borderColor: colors.border }]}>
            <View style={s.row}>
              <Text style={{ fontSize: 20, marginRight: 8 }}>{m.emoji ?? m.name[0]}</Text>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                  {m.name.split(' ')[0]}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  {m.role === 'kid' ? '🎒 School Area' : '🏠 Home'}
                </Text>
              </View>
            </View>
            <View style={s.row}>
              <View style={[s.dot, { backgroundColor: '#22C55E', marginRight: 4 }]} />
              <Text style={{ fontSize: 11, color: colors.teal, fontWeight: '700' }}>Safe ✓</Text>
            </View>
          </View>
        ))}
      </View>
    </SCard>
  );
}

// ─── Health tab ───────────────────────────────────────────────────────────────

function HealthTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [meds, setMeds] = useState<Medication[]>([
    { id: '1', name: 'Vitamin D', dosage: '1000 IU', recipient: 'Leo', time: '8:00 AM', takenToday: false },
    { id: '2', name: 'Omega 3', dosage: '500 mg', recipient: 'Maya', time: '8:00 AM', takenToday: true },
    { id: '3', name: 'Melatonin', dosage: '1 mg', recipient: 'Sam', time: '8:00 PM', takenToday: false },
  ]);

  const vaccines: Vaccine[] = [
    { id: '1', member: 'Leo', title: 'Flu Shot 2026', date: '2026-09-15', status: 'Scheduled' },
    { id: '2', member: 'Maya', title: 'MMR Booster', date: '2026-06-01', status: 'Completed ✓' },
    { id: '3', member: 'Sam', title: 'DTaP', date: '2026-03-20', status: 'Completed ✓' },
  ];

  const markTaken = (id: string) =>
    setMeds(prev => prev.map(m => m.id === id ? { ...m, takenToday: true } : m));

  return (
    <>
      <SCard colors={colors} isDark={isDark}>
        <View style={[s.row, { marginBottom: 12 }]}>
          <Text style={{ fontSize: 16 }}>💊</Text>
          <Text style={[s.cardTitle, { color: colors.textPrimary, marginLeft: 6 }]}>Daily Medication Log</Text>
        </View>
        {meds.map(med => (
          <View key={med.id} style={[s.medRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                {med.name} ({med.dosage})
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                For: {med.recipient} · {med.time}
              </Text>
            </View>
            {med.takenToday ? (
              <View style={[s.pill, { backgroundColor: colors.teal + '20', borderColor: colors.teal + '50' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.teal }}>Taken ✓</Text>
              </View>
            ) : (
              <Pressable onPress={() => markTaken(med.id)}
                style={[s.actionBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Mark Taken</Text>
              </Pressable>
            )}
          </View>
        ))}
      </SCard>

      <SCard colors={colors} isDark={isDark}>
        <View style={[s.row, { marginBottom: 12 }]}>
          <Text style={{ fontSize: 16 }}>💉</Text>
          <Text style={[s.cardTitle, { color: colors.textPrimary, marginLeft: 6 }]}>Immunization Tracking</Text>
        </View>
        {vaccines.map(v => (
          <View key={v.id} style={[s.medRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                {v.member}: {v.title}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Date: {v.date}</Text>
            </View>
            <View style={[s.pill, {
              backgroundColor: v.status.includes('✓') ? colors.teal + '20' : colors.amber + '20',
              borderColor: v.status.includes('✓') ? colors.teal + '50' : colors.amber + '50',
            }]}>
              <Text style={{ fontSize: 10, fontWeight: '800',
                color: v.status.includes('✓') ? colors.teal : colors.amber }}>
                {v.status}
              </Text>
            </View>
          </View>
        ))}
      </SCard>
    </>
  );
}

// ─── AI Health tab ────────────────────────────────────────────────────────────

function AiDocTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult('');
    await new Promise(r => setTimeout(r, 1500));
    setResult(`✨ AI Health Assessment\n\nBased on your description, this sounds like it could be a mild seasonal symptom. Ensure adequate rest, hydration, and monitor for 24–48 hours.\n\n⚕️ Disclaimer: This is not medical advice. Consult a physician for persistent or severe symptoms.`);
    setLoading(false);
  };

  return (
    <SCard colors={colors} isDark={isDark}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
        <View style={s.row}>
          <Ionicons name="fitness" size={18} color={colors.teal} />
          <Text style={[s.cardTitle, { color: colors.textPrimary, marginLeft: 6 }]}>AI Symptom Analyzer</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: colors.teal + '20', borderColor: colors.teal + '50' }]}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: colors.teal }}>AI</Text>
        </View>
      </View>
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12, lineHeight: 17 }}>
        Describe family health symptoms or paste medical record queries for AI analysis.
      </Text>
      <TextInput
        value={prompt} onChangeText={setPrompt}
        placeholder="e.g. Maya has a mild throat tickle and 99.8°F temperature..."
        placeholderTextColor={colors.placeholder}
        multiline numberOfLines={3}
        style={[s.textarea, { color: colors.textPrimary, borderColor: colors.border,
          backgroundColor: colors.surface }]}
      />
      <Pressable onPress={analyze}
        style={[s.submitBtn, { backgroundColor: prompt.trim() ? colors.teal : colors.border }]}>
        <Text style={[s.submitBtnText, { color: prompt.trim() ? '#fff' : colors.textTertiary }]}>
          {loading ? 'Analyzing…' : 'Analyze Symptoms'}
        </Text>
      </Pressable>
      {result ? (
        <View style={[{ marginTop: 12, padding: 12, borderRadius: 14,
          backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '40' }]}>
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>{result}</Text>
        </View>
      ) : null}
    </SCard>
  );
}

// ─── Memories tab ─────────────────────────────────────────────────────────────

function MemoriesTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [items, setItems] = useState<Memory[]>([
    { id: '1', title: 'Beach Day 🌊', date: 'July 4, 2026', emoji: '🏖️', hearts: 12 },
    { id: '2', title: 'Leo\'s Soccer Trophy 🏆', date: 'June 15, 2026', emoji: '⚽', hearts: 8 },
    { id: '3', title: 'Family Game Night', date: 'May 28, 2026', emoji: '🎲', hearts: 15 },
    { id: '4', title: 'Maya\'s Science Fair 🔬', date: 'April 10, 2026', emoji: '🧪', hearts: 6 },
  ]);

  const addHeart = (id: string) =>
    setItems(prev => prev.map(m => m.id === id ? { ...m, hearts: m.hearts + 1 } : m));

  return (
    <>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>🖼️ Family Memories & Milestones</Text>
        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>Photo Timeline</Text>
      </View>
      {items.map(m => (
        <SCard key={m.id} colors={colors} isDark={isDark}>
          {/* Memory illustration */}
          <View style={[s.memoryThumb, { backgroundColor: isDark ? colors.surface : colors.primary + '10' }]}>
            <Text style={{ fontSize: 48 }}>{m.emoji}</Text>
          </View>
          <View style={[s.row, { justifyContent: 'space-between', marginTop: 10 }]}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{m.title}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>{m.date}</Text>
            </View>
            <Pressable onPress={() => addHeart(m.id)}
              style={[s.actionBtn, { backgroundColor: colors.primary + '20',
                borderWidth: 1, borderColor: colors.primary + '40' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>❤️ {m.hearts}</Text>
            </Pressable>
          </View>
        </SCard>
      ))}
    </>
  );
}

// ─── Ledger tab ───────────────────────────────────────────────────────────────

function LedgerTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  const kids = members.filter(m => m.role === 'kid');

  return (
    <SCard colors={colors} isDark={isDark}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>📜 Dual Wallet Ledger</Text>
        <Text style={{ fontSize: 11, color: colors.teal, fontWeight: '700' }}>Shared Parent Audit</Text>
      </View>

      {kids.length === 0 ? (
        <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
          No kids in the family yet.
        </Text>
      ) : kids.map(k => {
        const mainCoins = (k as any).coins ?? 0;
        const gpCoins   = 0;
        return (
          <View key={k.id} style={[{ padding: 12, borderRadius: 14, marginBottom: 10,
            backgroundColor: isDark ? colors.surface : '#F8F5FF',
            borderWidth: 1, borderColor: colors.border }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
              <View style={s.row}>
                <Text style={{ fontSize: 20, marginRight: 6 }}>{k.emoji ?? k.name[0]}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>
                  {k.name.split(' ')[0]}
                </Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.amber }}>
                Store: {mainCoins}🪙 | GP: {gpCoins}🪙
              </Text>
            </View>
            <View style={[s.row, { gap: 8 }]}>
              <Pressable onPress={() => Alert.alert('Pay Main Wallet', `Pay out ${k.name.split(' ')[0]}'s ${mainCoins} store coins?`)}
                style={[s.actionBtn, { flex: 1, justifyContent: 'center', backgroundColor: colors.teal }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', textAlign: 'center' }}>
                  💸 Pay Main Wallet
                </Text>
              </Pressable>
              <Pressable onPress={() => Alert.alert('Reimburse GP Bonus', `Reimburse ${k.name.split(' ')[0]}'s ${gpCoins} GP bonus coins?`)}
                style={[s.actionBtn, { flex: 1, justifyContent: 'center', backgroundColor: colors.primary }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', textAlign: 'center' }}>
                  🍪 Reimburse GP
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </SCard>
  );
}

// ─── VaultScreen ─────────────────────────────────────────────────────────────

export default function VaultScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { signOut } = useAuthStore();

  const [activeTab, setActiveTab] = useState<VaultTab>('gps');

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent     = activeMember?.role === 'parent';

  const bg = isDark ? '#0B0F1A' : '#F3F4F8';

  const SUBTABS: { id: VaultTab; label: string; icon: string }[] = [
    { id: 'gps',      label: 'GPS',     icon: '📡' },
    { id: 'health',   label: 'Health',  icon: '💊' },
    { id: 'aiDoc',    label: 'AI Doc',  icon: '🏥' },
    { id: 'memories', label: 'Memories',icon: '🖼️' },
    { id: 'ledger',   label: 'Ledger',  icon: '📜' },
  ];

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['top']}>

      {/* ── App bar ── */}
      <AppHeader
        memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
        memberRole={activeMember?.role as 'parent' | 'kid' | 'senior' ?? 'parent'}
        onBellPress={() => {}}
        onPersonaPress={() => {}}
      />

      {/* ── Sub-tab nav (stays fixed) ── */}
      <View style={[s.subTabBar, { backgroundColor: isDark ? colors.card : '#fff',
        borderBottomColor: colors.border }]}>
        <View style={[s.subTabInner, { backgroundColor: isDark ? colors.surface : '#F3F4F8',
          borderColor: colors.border }]}>
          {SUBTABS.map(t => (
            <SubTab key={t.id} label={t.label} icon={t.icon}
              active={activeTab === t.id} onPress={() => setActiveTab(t.id)} colors={colors} />
          ))}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Page title row ── */}
        <View style={[s.header, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Family Hearth</Text>
          <Pressable onPress={() => Alert.alert('Sign Out', 'Sign out of Family Cube?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
          ])}>
            <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={{ padding: 12, gap: 10 }}>

        {activeTab === 'gps'      && <GpsTab members={members} colors={colors} isDark={isDark} />}
        {activeTab === 'health'   && <HealthTab colors={colors} isDark={isDark} />}
        {activeTab === 'aiDoc'    && <AiDocTab colors={colors} isDark={isDark} />}
        {activeTab === 'memories' && <MemoriesTab colors={colors} isDark={isDark} />}
        {activeTab === 'ledger'   && <LedgerTab members={members} colors={colors} isDark={isDark} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 16, paddingVertical: 12,
                 borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  subTabBar:   { paddingHorizontal: 12, paddingVertical: 8,
                 borderBottomWidth: StyleSheet.hairlineWidth },
  subTabInner: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 3 },
  subTab:      { flex: 1, paddingVertical: 7, alignItems: 'center', gap: 1 },

  scard:       { borderRadius: 18, borderWidth: 1, padding: 14,
                 shadowColor: '#000', shadowOpacity: 0.04,
                 shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  cardTitle:   { fontSize: 14, fontWeight: '800' },

  row:         { flexDirection: 'row', alignItems: 'center' },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  statusBadge: { borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  pill:        { borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  actionBtn:   { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row',
                 alignItems: 'center', justifyContent: 'center' },

  // GPS
  radarMap:    { height: 160, borderRadius: 16, borderWidth: 1, alignItems: 'center',
                 justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  radarRing:   { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  medRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                 borderBottomWidth: StyleSheet.hairlineWidth },

  // Memory
  memoryThumb: { width: '100%', height: 110, borderRadius: 14, alignItems: 'center',
                 justifyContent: 'center' },

  textarea:    { borderWidth: 1.5, borderRadius: 12, padding: 10, fontSize: 14,
                 minHeight: 70, textAlignVertical: 'top', marginBottom: 12 },
  submitBtn:   { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  submitBtnText:{ fontSize: 14, fontWeight: '700' },
});
