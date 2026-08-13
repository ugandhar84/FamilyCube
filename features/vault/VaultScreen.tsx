import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Alert, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useAuthStore } from '@/store/authStore';
import AppHeader from '@/components/AppHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type VaultTab = 'gps' | 'health' | 'aiDoc' | 'memories' | 'ledger';

interface Medication {
  id: string; name: string; dosage: string;
  recipient: string; time: string; takenToday: boolean;
}
interface Vaccine {
  id: string; member: string; title: string; date: string; status: string;
}
interface Memory {
  id: string; title: string; date: string; emoji: string; hearts: number;
}

const BRAND = {
  purple: '#7C3AED',
  teal:   '#14B8A6',
  amber:  '#F59E0B',
  emerald:'#10B981',
  rose:   '#F43F5E',
};

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function SCard({ children, colors, isDark, style }: {
  children: React.ReactNode; colors: any; isDark: boolean; style?: any;
}) {
  return (
    <View style={[s.scard, {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderColor: isDark ? colors.border : '#EDE9FE',
      shadowColor: BRAND.purple,
      ...style,
    }]}>
      {children}
    </View>
  );
}

function CardHeader({ icon, title, badge, badgeColor, colors }: {
  icon: string; title: string; badge?: string; badgeColor?: string; colors: any;
}) {
  return (
    <View style={s.cardHeaderRow}>
      <Text style={s.cardHeaderIcon}>{icon}</Text>
      <Text style={[s.cardHeaderTitle, { color: colors.textPrimary }]}>{title}</Text>
      {badge ? (
        <View style={[s.badge, { backgroundColor: (badgeColor ?? BRAND.purple) + '20',
          borderColor: (badgeColor ?? BRAND.purple) + '50' }]}>
          <Text style={[s.badgeText, { color: badgeColor ?? BRAND.purple }]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.statusPill, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <Text style={[s.statusPillText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── GPS tab ─────────────────────────────────────────────────────────────────

function GpsTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  const pins = [
    { name: 'Alex (Dad)',    emoji: '👨', location: 'Home HQ 🏠',        battery: 94, safe: true,  charging: true },
    { name: 'Priya (Mom)',   emoji: '👩', location: 'Home HQ 🏠',        battery: 72, safe: true,  charging: false },
    { name: 'Leo',           emoji: '🦁', location: 'Oak Elementary 🎒', battery: 88, safe: true,  charging: false },
    { name: 'Maya',          emoji: '🌸', location: 'Drama Club 🎭',     battery: 91, safe: true,  charging: true },
    { name: 'Grandma Mary',  emoji: '👵', location: 'Senior Center 🏛️',  battery: 65, safe: true,  charging: false },
  ];

  // Map live members → overlay pins
  const livePins = pins.filter(p => members.some(m => m.name.includes(p.name.split(' ')[0]) || p.name.startsWith(m.name.split(' ')[0])));

  return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader icon="📡" title="Household Safety Radar" badge="● Live" badgeColor={BRAND.teal} colors={colors} />

      {/* Dark radar map */}
      <View style={s.radarMap}>
        <View style={[s.radarGrid]} />
        <View style={[s.radarRing, { width: 210, height: 210, borderColor: BRAND.teal + '18' }]} />
        <View style={[s.radarRing, { width: 140, height: 140, borderColor: BRAND.teal + '28' }]} />
        <View style={[s.radarRing, { width: 70, height: 70, borderColor: BRAND.teal + '40' }]} />
        <View style={s.radarCrossH} />
        <View style={s.radarCrossV} />

        {/* Member pins scattered at fixed positions */}
        {[
          { top: 16,  left: 16  },
          { top: 16,  right: 20 },
          { top: '40%' as any, left: '35%' as any },
          { bottom: 20, right: 16 },
          { bottom: 24, left: 24 },
        ].map((pos, i) => {
          const pin = livePins[i] ?? pins[i];
          if (!pin) return null;
          return (
            <View key={i} style={[s.radarPin, pos]}>
              <View style={[s.radarPinDot, { borderColor: BRAND.teal }]}>
                <Text style={{ fontSize: 16 }}>{pin.emoji}</Text>
              </View>
              <View style={s.radarPinLabel}>
                <Text style={s.radarPinName}>{pin.name.split(' ')[0]}</Text>
                <Text style={[s.radarPinBatt, { color: pin.battery > 80 ? BRAND.teal : BRAND.amber }]}>
                  {pin.charging ? '⚡' : '🔋'}{pin.battery}%
                </Text>
              </View>
            </View>
          );
        })}

        <Text style={s.radarFootnote}>GPS Geofence Active · 5 members tracked</Text>
      </View>

      {/* Member telemetry list */}
      <View style={{ gap: 8, marginTop: 4 }}>
        {pins.map((p, i) => (
          <View key={i} style={[s.telemetryRow, {
            backgroundColor: isDark ? colors.surface : '#F0FDF9',
            borderColor: isDark ? colors.border : BRAND.teal + '30',
          }]}>
            <Text style={{ fontSize: 22, marginRight: 10 }}>{p.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                {p.name.split(' ')[0]}
                {p.name.includes('(') ? <Text style={{ fontWeight: '500', color: colors.textSecondary }}> · {p.name.match(/\((.+)\)/)?.[1]}</Text> : null}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>{p.location}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <StatusPill label="✓ Safe" color={BRAND.teal} />
              <Text style={{ fontSize: 10, color: p.battery > 75 ? BRAND.teal : BRAND.amber, fontWeight: '700' }}>
                {p.charging ? '⚡' : ''}{p.battery}%
              </Text>
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
    { id: '1', name: 'Vitamin D', dosage: '1000 IU', recipient: 'Leo',  time: '8:00 AM', takenToday: false },
    { id: '2', name: 'Omega 3',   dosage: '500 mg',  recipient: 'Maya', time: '8:00 AM', takenToday: true  },
    { id: '3', name: 'Melatonin', dosage: '1 mg',    recipient: 'Sam',  time: '8:00 PM', takenToday: false },
  ]);

  const vaccines: Vaccine[] = [
    { id: '1', member: 'Leo',  title: 'Flu Shot 2026', date: '2026-09-15', status: 'Scheduled' },
    { id: '2', member: 'Maya', title: 'MMR Booster',   date: '2026-06-01', status: 'Completed ✓' },
    { id: '3', member: 'Sam',  title: 'DTaP',          date: '2026-03-20', status: 'Completed ✓' },
  ];

  const markTaken = (id: string) =>
    setMeds(prev => prev.map(m => m.id === id ? { ...m, takenToday: true } : m));

  return (
    <>
      <SCard colors={colors} isDark={isDark}>
        <CardHeader icon="💊" title="Daily Medication Log" colors={colors} />
        <View style={{ marginTop: 12, gap: 10 }}>
          {meds.map(med => (
            <View key={med.id} style={[s.medRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                  {med.name}
                  <Text style={{ fontWeight: '500' }}> ({med.dosage})</Text>
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                  For: {med.recipient} · {med.time}
                </Text>
              </View>
              {med.takenToday ? (
                <StatusPill label="Taken ✓" color={BRAND.teal} />
              ) : (
                <TouchableOpacity onPress={() => markTaken(med.id)}
                  style={[s.markBtn, { backgroundColor: BRAND.purple }]}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Mark Taken</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </SCard>

      <SCard colors={colors} isDark={isDark}>
        <CardHeader icon="💉" title="Immunization Tracking" colors={colors} />
        <View style={{ marginTop: 12, gap: 10 }}>
          {vaccines.map(v => {
            const done = v.status.includes('✓');
            return (
              <View key={v.id} style={[s.medRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                    {v.member}: {v.title}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                    Date: {v.date}
                  </Text>
                </View>
                <StatusPill label={v.status} color={done ? BRAND.teal : BRAND.amber} />
              </View>
            );
          })}
        </View>
      </SCard>
    </>
  );
}

// ─── AI Health tab ────────────────────────────────────────────────────────────

function AiDocTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [prompt, setPrompt]   = useState('');
  const [result, setResult]   = useState('');
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult('');
    await new Promise(r => setTimeout(r, 1500));
    setResult('✨ AI Health Assessment\n\nBased on your description, this sounds like a mild seasonal symptom. Ensure adequate rest, hydration, and monitor for 24–48 hours.\n\n⚕️ Disclaimer: This is not medical advice. Consult a physician for persistent or severe symptoms.');
    setLoading(false);
  };

  return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader icon="🏥" title="AI Symptom Analyzer" badge="Gemini AI" badgeColor={BRAND.teal} colors={colors} />
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8, marginBottom: 12, lineHeight: 17 }}>
        Describe family health symptoms or paste medical queries for instant AI analysis.
      </Text>
      <TextInput
        value={prompt} onChangeText={setPrompt}
        placeholder="e.g. Maya has a mild throat tickle and 99.8°F temperature…"
        placeholderTextColor={colors.placeholder}
        multiline numberOfLines={3}
        style={[s.textarea, { color: colors.textPrimary, borderColor: colors.border,
          backgroundColor: colors.surface }]}
      />
      <TouchableOpacity onPress={analyze}
        style={[s.submitBtn, { backgroundColor: prompt.trim() ? BRAND.teal : colors.border }]}>
        <Text style={[s.submitBtnText, { color: prompt.trim() ? '#fff' : colors.textTertiary }]}>
          {loading ? '✨ Analyzing…' : 'Analyze Symptoms'}
        </Text>
      </TouchableOpacity>
      {result ? (
        <View style={{ marginTop: 12, padding: 14, borderRadius: 16,
          backgroundColor: BRAND.teal + '15', borderWidth: 1, borderColor: BRAND.teal + '40' }}>
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>{result}</Text>
        </View>
      ) : null}
    </SCard>
  );
}

// ─── Memories tab ─────────────────────────────────────────────────────────────

const MEMORY_PALETTE = [
  ['#7C3AED', '#6D28D9'],
  ['#0EA5E9', '#0284C7'],
  ['#10B981', '#059669'],
  ['#F59E0B', '#D97706'],
];

function MemoriesTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [items, setItems] = useState<Memory[]>([
    { id: '1', title: 'Beach Day 🌊',         date: 'July 4, 2026',   emoji: '🏖️', hearts: 12 },
    { id: '2', title: "Leo's Soccer Trophy",   date: 'June 15, 2026',  emoji: '🏆', hearts: 8  },
    { id: '3', title: 'Family Game Night',     date: 'May 28, 2026',   emoji: '🎲', hearts: 15 },
    { id: '4', title: "Maya's Science Fair",   date: 'April 10, 2026', emoji: '🔬', hearts: 6  },
  ]);

  const addHeart = (id: string) =>
    setItems(prev => prev.map(m => m.id === id ? { ...m, hearts: m.hearts + 1 } : m));

  return (
    <>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
        <Text style={[s.sectionLabel, { color: colors.textPrimary }]}>🖼️ Family Memories & Milestones</Text>
        <Text style={{ fontSize: 12, color: BRAND.purple, fontWeight: '700' }}>Photo Timeline</Text>
      </View>
      {items.map((m, i) => {
        const [fromC, toC] = MEMORY_PALETTE[i % MEMORY_PALETTE.length];
        return (
          <SCard key={m.id} colors={colors} isDark={isDark}>
            {/* Illustrated thumbnail */}
            <View style={[s.memoryThumb, { backgroundColor: fromC }]}>
              <Text style={{ fontSize: 60 }}>{m.emoji}</Text>
              {/* subtle shimmer overlay */}
              <View style={[StyleSheet.absoluteFill, { borderRadius: 16,
                backgroundColor: toC, opacity: 0.4 }]} pointerEvents="none" />
            </View>
            <View style={[s.row, { justifyContent: 'space-between', marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>{m.title}</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{m.date}</Text>
              </View>
              <TouchableOpacity onPress={() => addHeart(m.id)}
                style={[s.heartBtn, { backgroundColor: BRAND.purple + '15',
                  borderColor: BRAND.purple + '40' }]}>
                <Text style={{ fontSize: 14 }}>❤️</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>{m.hearts}</Text>
              </TouchableOpacity>
            </View>
          </SCard>
        );
      })}
    </>
  );
}

// ─── Ledger tab ───────────────────────────────────────────────────────────────

function LedgerTab({ members, colors, isDark }: { members: any[]; colors: any; isDark: boolean }) {
  const kids = members.filter(m => m.role === 'kid');

  return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader icon="📜" title="Dual Wallet Ledger" badge="Parent Audit" badgeColor={BRAND.teal} colors={colors} />

      {kids.length === 0 ? (
        <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
          No kids in the family yet.
        </Text>
      ) : kids.map(k => {
        const mainCoins = (k as any).mainCoins ?? (k as any).coins ?? 0;
        const gpCoins   = (k as any).gpCoins ?? 0;
        return (
          <View key={k.id} style={[s.kidLedgerCard, {
            backgroundColor: isDark ? colors.surface : '#F5F3FF',
            borderColor: isDark ? colors.border : '#DDD6FE',
          }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
              <View style={s.row}>
                <Text style={{ fontSize: 26, marginRight: 8 }}>{k.emoji ?? '👤'}</Text>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>
                    {k.name.split(' ')[0]}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>Kid Wallet</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: BRAND.amber }}>
                  {mainCoins}🪙
                </Text>
                <Text style={{ fontSize: 10, color: colors.textTertiary }}>GP Bonus: {gpCoins}🪙</Text>
              </View>
            </View>

            {/* Coin bar */}
            <View style={[s.coinBar, { backgroundColor: isDark ? colors.border : '#EDE9FE' }]}>
              <View style={[s.coinBarFill, {
                width: `${Math.min(100, (mainCoins / 200) * 100)}%` as any,
                backgroundColor: BRAND.purple,
              }]} />
            </View>

            <View style={[s.row, { gap: 8, marginTop: 10 }]}>
              <TouchableOpacity
                onPress={() => Alert.alert('Pay Main Wallet', `Pay out ${k.name.split(' ')[0]}'s ${mainCoins} store coins?`)}
                style={[s.walletBtn, { backgroundColor: BRAND.teal }]}>
                <Text style={s.walletBtnText}>💸 Pay Main</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert('Reimburse GP', `Reimburse ${k.name.split(' ')[0]}'s ${gpCoins} GP bonus?`)}
                style={[s.walletBtn, { backgroundColor: BRAND.purple }]}>
                <Text style={s.walletBtnText}>🍪 GP Bonus</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </SCard>
  );
}

// ─── VaultScreen ─────────────────────────────────────────────────────────────

const SUBTABS: { id: VaultTab; label: string; icon: string }[] = [
  { id: 'gps',      label: 'Radar',    icon: '📡' },
  { id: 'health',   label: 'Health',   icon: '💊' },
  { id: 'aiDoc',    label: 'AI Doc',   icon: '🏥' },
  { id: 'memories', label: 'Memories', icon: '🖼️' },
  { id: 'ledger',   label: 'Ledger',   icon: '📜' },
];

export default function VaultScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { signOut } = useAuthStore();

  const [activeTab, setActiveTab] = useState<VaultTab>('gps');

  const scrollRef = useRef<ScrollView>(null);
  const prevMemberRef = useRef(activeMemberId);
  useEffect(() => {
    if (prevMemberRef.current === activeMemberId) return;
    prevMemberRef.current = activeMemberId;
    setActiveTab('gps');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeMemberId]);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const bg = isDark ? '#0B0F1A' : '#F3F0FB';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
        memberRole={activeMember?.role as 'parent' | 'kid' | 'senior' ?? 'parent'}
        onBellPress={() => {}}
        onPersonaPress={() => {}}
      />

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 52 }}>

        {/* Title bar */}
        <View style={[s.titleBar]}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 }}>
              Family Vault
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
              GPS · Health · Memories · Ledger
            </Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert('Sign Out', 'Sign out of Family Cube?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
          ])}>
            <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Scrollable pill sub-tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabScrollContent}
          style={{ marginHorizontal: 14, marginBottom: 14 }}>
          {SUBTABS.map(t => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)}
                style={[s.tabPill, {
                  backgroundColor: active ? BRAND.purple : isDark ? colors.surface : '#EDE9FE',
                  borderColor: active ? BRAND.purple : isDark ? colors.border : '#DDD6FE',
                }]}>
                <Text style={{ fontSize: 15 }}>{t.icon}</Text>
                <Text style={[s.tabPillText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 14, gap: 12 }}>
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
  safe:     { flex: 1 },
  titleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 14 },

  // Tab bar
  tabScrollContent: { gap: 8, paddingRight: 4 },
  tabPill:          { flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingVertical: 8, paddingHorizontal: 14,
                      borderRadius: 22, borderWidth: 1.5 },
  tabPillText:      { fontSize: 13, fontWeight: '800' },

  // Section card
  scard:     { borderRadius: 22, borderWidth: 1.5, padding: 16,
               shadowOpacity: 0.06, shadowRadius: 12,
               shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  sectionLabel: { fontSize: 14, fontWeight: '800' },

  // Card header
  cardHeaderRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderIcon:  { fontSize: 18 },
  cardHeaderTitle: { fontSize: 14, fontWeight: '900', flex: 1 },

  badge:     { borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },

  statusPill:     { borderRadius: 99, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '800' },

  row: { flexDirection: 'row', alignItems: 'center' },

  // GPS
  radarMap: {
    height: 180, borderRadius: 18, marginVertical: 14,
    backgroundColor: '#030712', borderWidth: 1, borderColor: '#14B8A620',
    position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  radarGrid: {
    ...StyleSheet.absoluteFillObject,
    // simple grid pattern simulation via background tiling isn't in RN, use opacity
    opacity: 0.15,
  },
  radarRing: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  radarCrossH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth,
                 backgroundColor: '#14B8A620', top: '50%' },
  radarCrossV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth,
                 backgroundColor: '#14B8A620', left: '50%' },
  radarPin:   { position: 'absolute', alignItems: 'center' },
  radarPinDot:{ width: 34, height: 34, borderRadius: 17, borderWidth: 2,
               backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  radarPinLabel: { backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 8,
                   paddingHorizontal: 6, paddingVertical: 2, marginTop: 2, alignItems: 'center' },
  radarPinName:  { fontSize: 9, fontWeight: '800', color: '#fff' },
  radarPinBatt:  { fontSize: 8, fontWeight: '700' },
  radarFootnote: { position: 'absolute', bottom: 8, fontSize: 9, color: '#14B8A680', fontWeight: '700' },

  telemetryRow: { flexDirection: 'row', alignItems: 'center', padding: 12,
                  borderRadius: 16, borderWidth: 1 },

  // Health
  medRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10,
            borderBottomWidth: StyleSheet.hairlineWidth },
  markBtn: { borderRadius: 12, paddingVertical: 7, paddingHorizontal: 14 },

  // AI Doc
  textarea:    { borderWidth: 1.5, borderRadius: 14, padding: 12, fontSize: 14,
                 minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  submitBtn:   { borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '800' },

  // Memories
  memoryThumb: { width: '100%', height: 130, borderRadius: 16,
                 alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heartBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5,
                 paddingHorizontal: 12, paddingVertical: 8,
                 borderRadius: 14, borderWidth: 1 },

  // Ledger
  kidLedgerCard: { borderRadius: 18, borderWidth: 1.5, padding: 14, marginTop: 14 },
  coinBar:       { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  coinBarFill:   { height: '100%', borderRadius: 3 },
  walletBtn:     { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  walletBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
});
