import { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert, TextInput, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Car, BookOpen, ShoppingCart, Fuel, AlertTriangle,
  ChevronDown, ChevronUp, CheckCircle, Star, Zap, User,
} from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { router } from 'expo-router';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useEventStore } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import { SectionCard } from './hubComponents';
import { localToday } from './hubUtils';
import { ChildChoreBoard } from '@/features/chores/ChildChoreBoard';

const GAS_LOG_KEY = (memberId: string) => `@familycube_gas_log_${memberId}`;

const pad = { paddingHorizontal: 16, marginBottom: 4 } as const;

// ─── Gas log entry ────────────────────────────────────────────────────────────
type GasEntry = { id: string; date: string; gallons: string; odometer: string; note: string };

export function TeenView({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
}) {
  const { events, updateEvent } = useEventStore();
  const { chores, updateChore } = useChoreStore();
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();
  const familyId = (active as any).familyId ?? 'family-1';
  useEffect(() => { loadGrocery(familyId); }, [familyId]);
  const { updateMember, awardCoins } = useFamilyStore();
  const { sendRequest } = useKidRequestStore();
  const sendMessage = useChatStore(s => s.sendMessage);
  const today = localToday();

  const siblings = members.filter(m => (m.role === 'kid') && m.id !== active.id);
  const parents  = members.filter(m => m.role === 'parent');

  // ── Profile / Car flag ────────────────────────────────────────────────────────
  const hasCar = active.hasCar ?? false;
  const rideEarnings    = active.rideEarningsPerRun    ?? 50;
  const groceryEarnings = active.groceryEarningsPerRun ?? 30;

  const toggleCar = () => updateMember(active.id, { hasCar: !hasCar });

  // ── Junior Dispatch — rides open to teens with cars ──────────────────────────
  const openPickups = events.filter(e =>
    e.isOpenToTeens &&
    e.helperStatus !== 'confirmed' &&
    e.date >= today
  );
  const myPickups = events.filter(e =>
    e.helper && (e.helper.includes(active.name) || active.name.includes(e.helper.split(' ')[0])) &&
    e.helperStatus === 'confirmed' &&
    e.date >= today
  );
  const [dispatchExpanded, setDispatchExpanded] = useState(openPickups.length > 0);
  const [passedPickups, setPassedPickups] = useState<string[]>([]);

  const claimPickup = (evId: string) => {
    const ev = events.find(e => e.id === evId);
    updateEvent(evId, { helper: active.name, helperStatus: 'confirmed' });
    // Credit coins: use rideCoins set by parent, fall back to member's rideEarningsPerRun
    const coins = ev?.rideCoins ?? rideEarnings;
    if (coins > 0) awardCoins(active.id, coins, 'mainCoins');
  };

  // ── Tutoring / Sibling Help ───────────────────────────────────────────────────
  const tutorChores = chores.filter(c =>
    c.categoryType === 'routine' &&
    c.title.toLowerCase().includes('tutor') ||
    (c.categoryType === 'bounty' && c.title.toLowerCase().includes('homework'))
  );
  const [tutorExpanded, setTutorExpanded] = useState(false);
  const [tutorKid, setTutorKid] = useState<FamilyMember | null>(null);
  const [tutorSubject, setTutorSubject] = useState('');
  const [tutorNote, setTutorNote] = useState('');
  const [tutorSent, setTutorSent] = useState(false);

  const sendTutorOffer = () => {
    if (!tutorKid || !tutorSubject.trim()) return;
    const detail = `${active.name.split(' ')[0]} can help ${tutorKid.name.split(' ')[0]} with ${tutorSubject.trim()}${tutorNote.trim() ? ` — ${tutorNote.trim()}` : ''}`;
    sendRequest({ type: 'tutor', fromMemberId: active.id, detail, urgency: 'normal' });
    sendMessage('all', active.id, `🎒 ${detail}`);
    setTutorSent(true);
    setTimeout(() => { setTutorKid(null); setTutorSubject(''); setTutorNote(''); setTutorSent(false); }, 2500);
  };

  // ── Errand Bounties ───────────────────────────────────────────────────────────
  const errandChores = chores.filter(c =>
    c.categoryType === 'bounty' && c.status === 'todo' &&
    (!c.assignedToId || c.assignedToId === active.id)
  );
  const [errandExpanded, setErrandExpanded] = useState(false);

  // ── Gas / Vehicle Log ─────────────────────────────────────────────────────────
  const [gasExpanded, setGasExpanded] = useState(false);
  const [gasLog, setGasLog] = useState<GasEntry[]>(() => {
    // seed from AsyncStorage on first render — populated by useEffect below
    return [];
  });
  const [newGallons, setNewGallons] = useState('');
  const [newOdo, setNewOdo] = useState('');
  const [newGasNote, setNewGasNote] = useState('');
  const [vehicleIssue, setVehicleIssue] = useState('');
  const [issueSent, setIssueSent] = useState(false);

  // Load persisted gas log on mount
  useState(() => {
    AsyncStorage.getItem(GAS_LOG_KEY(active.id)).then(raw => {
      if (raw) { try { setGasLog(JSON.parse(raw)); } catch { /* ignore */ } }
    });
  });

  const persistGasLog = (log: GasEntry[]) => {
    AsyncStorage.setItem(GAS_LOG_KEY(active.id), JSON.stringify(log));
  };

  const addGasEntry = () => {
    if (!newGallons.trim()) return;
    const entry: GasEntry = {
      id: Date.now().toString(), date: today,
      gallons: newGallons, odometer: newOdo, note: newGasNote,
    };
    const updated = [entry, ...gasLog];
    setGasLog(updated);
    persistGasLog(updated);
    setNewGallons(''); setNewOdo(''); setNewGasNote('');
  };

  const reportIssue = () => {
    if (!vehicleIssue.trim()) return;
    const detail = `🚗 Vehicle issue reported by ${active.name.split(' ')[0]}: ${vehicleIssue.trim()}`;
    sendRequest({ type: 'emergency', fromMemberId: active.id, detail, urgency: 'soon' });
    sendMessage('all', active.id, detail);
    setVehicleIssue('');
    setIssueSent(true);
    setTimeout(() => setIssueSent(false), 2000);
  };

  // ── Cash-out ──────────────────────────────────────────────────────────────────
  const [cashExpanded, setCashExpanded] = useState(false);
  const CASH_METHODS = ['💳 Venmo Teen', '🏦 Greenlight', '🍎 Apple Cash'] as const;
  const [cashMethod, setCashMethod] = useState<string>(CASH_METHODS[0]);
  const [cashAmount, setCashAmount] = useState('');

  const requestCashOut = () => {
    if (!cashAmount.trim()) return;
    const coins = active.mainCoins ?? active.coins ?? 0;
    const detail = `💵 Cash-out request: $${cashAmount} via ${cashMethod} (balance: ${coins} coins)`;
    sendRequest({ type: 'delegation', fromMemberId: active.id, detail, urgency: 'normal' });
    sendMessage('all', active.id, `${active.name.split(' ')[0]} requested cash-out: $${cashAmount} via ${cashMethod}`);
    Alert.alert('Cash-Out Sent!', 'Your parent has been notified and will review the request.');
    setCashAmount('');
  };

  // ── Grocery runs ─────────────────────────────────────────────────────────────
  const [groceryExpanded, setGroceryExpanded] = useState(false);
  const openGroceryRuns = chores.filter(c =>
    (c.categoryType === 'bounty') &&
    (c.title.toLowerCase().includes('grocery') || c.title.toLowerCase().includes('errand') || c.title.toLowerCase().includes('shopping')) &&
    c.status === 'todo' &&
    (!c.assignedToId || c.assignedToId === active.id)
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false}>

      {/* ── Teen Profile Card ── */}
      <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
        <View style={{ backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1.5,
          borderColor: isDark ? colors.border : '#E8E8F0', padding: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22,
              backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
              <User size={22} color={BRAND.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>
                {active.name.split(' ')[0]}'s Profile
              </Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                {active.mainCoins ?? active.coins ?? 0} coins · {active.xp} XP · Level {active.level}
              </Text>
            </View>
          </View>

          {/* Car flag */}
          <Pressable
            onPress={toggleCar}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14,
              backgroundColor: hasCar ? (isDark ? '#1a1000' : '#FFFBEB') : (isDark ? colors.surface : '#F8FAFC'),
              borderWidth: 1.5, borderColor: hasCar ? BRAND.amber : colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: hasCar ? BRAND.amber : colors.textPrimary }}>
                🚗 I Have a Car
              </Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                {hasCar
                  ? `Ride pickups routed to you · +${rideEarnings} coins/run`
                  : 'Toggle on to join the sibling pickup pool'}
              </Text>
            </View>
            <View style={{ width: 44, height: 26, borderRadius: 13,
              backgroundColor: hasCar ? BRAND.amber : (isDark ? '#334155' : '#CBD5E1'),
              justifyContent: 'center', paddingHorizontal: 3 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                alignSelf: hasCar ? 'flex-end' : 'flex-start' }} />
            </View>
          </Pressable>

          {/* Earnings summary */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {hasCar && (
              <View style={{ flex: 1, padding: 10, borderRadius: 12,
                backgroundColor: isDark ? BRAND.amber + '15' : BRAND.amber + '10',
                borderWidth: 1, borderColor: BRAND.amber + '30', alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.amber }}>+{rideEarnings}¢</Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary, marginTop: 2 }}>per pickup</Text>
              </View>
            )}
            <View style={{ flex: 1, padding: 10, borderRadius: 12,
              backgroundColor: isDark ? BRAND.teal + '15' : BRAND.teal + '10',
              borderWidth: 1, borderColor: BRAND.teal + '30', alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.teal }}>+{groceryEarnings}¢</Text>
              <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary, marginTop: 2 }}>per grocery run</Text>
            </View>
          </View>
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 8, textAlign: 'center' }}>
            Earnings configured by parents · paid to your wallet on completion
          </Text>
        </View>
      </View>

      {/* ── Chore Board (inherits all kid chores) ── */}
      <ChildChoreBoard member={active} members={members} colors={colors} isDark={isDark} />

      {/* ── Junior Dispatch (only when hasCar) ── */}
      {hasCar && <View style={pad}>
        <View style={{ backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1,
          borderColor: isDark ? colors.border : '#E8E8F0', overflow: 'hidden', marginBottom: 12 }}>
          <Pressable
            onPress={() => setDispatchExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20,
              backgroundColor: BRAND.amber + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={20} color={BRAND.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                  Junior Dispatch
                </Text>
                {openPickups.filter(e => !passedPickups.includes(e.id)).length > 0 && (
                  <View style={{ backgroundColor: BRAND.amber, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>
                      {openPickups.filter(e => !passedPickups.includes(e.id)).length}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                {openPickups.length > 0 ? 'Sibling pickups you can cover' : 'No open pickups right now'}
              </Text>
            </View>
            {dispatchExpanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>

          {dispatchExpanded && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
              {openPickups.filter(e => !passedPickups.includes(e.id)).map(ev => {
                const kid = members.find(m => m.id === ev.memberId);
                const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US',
                  { weekday: 'short', month: 'short', day: 'numeric' }) : ev.date;
                return (
                  <View key={ev.id} style={{ borderRadius: 14, borderWidth: 1,
                    borderColor: isDark ? BRAND.amber + '40' : '#FDE68A',
                    backgroundColor: isDark ? '#2D1800' : '#FFFBEB', overflow: 'hidden' }}>
                    <View style={{ backgroundColor: BRAND.amber, paddingHorizontal: 14, paddingVertical: 8,
                      flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 13 }}>🚗</Text>
                      <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                        RIDE · {evDay}{ev.time ? ` · ${ev.time}` : ''}
                      </Text>
                      {/* Coins badge — only teens see this, never GPs */}
                      {(ev.rideCoins ?? rideEarnings) > 0 && (
                        <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                          flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={{ fontSize: 11 }}>🪙</Text>
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>
                            +{ev.rideCoins ?? rideEarnings}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ padding: 12, gap: 3 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? '#FCD34D' : '#78350F' }}>
                        {kid?.name.split(' ')[0] ?? 'Sibling'} · {ev.title}
                      </Text>
                      {(ev.pickupLocation || ev.dropLocation) && (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                          {[ev.pickupLocation, ev.dropLocation].filter(Boolean).join(' → ')}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: isDark ? BRAND.amber + '30' : '#FDE68A' }}>
                      <Pressable onPress={() => claimPickup(ev.id)}
                        style={({ pressed }) => ({ flex: 2, paddingVertical: 13, alignItems: 'center', gap: 1,
                          backgroundColor: BRAND.amber, opacity: pressed ? 0.8 : 1 })}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>✋ I Got This</Text>
                        <Text style={{ fontSize: TYPO.micro, color: '#ffffffCC' }}>
                          earn +{ev.rideCoins ?? rideEarnings} coins
                        </Text>
                      </Pressable>
                      <View style={{ width: 1, backgroundColor: isDark ? BRAND.amber + '30' : '#FDE68A' }} />
                      <Pressable onPress={() => setPassedPickups(p => [...p, ev.id])}
                        style={({ pressed }) => ({ flex: 1, paddingVertical: 13, alignItems: 'center', gap: 1, opacity: pressed ? 0.7 : 1 })}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Pass</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>no pressure</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              {openPickups.filter(e => !passedPickups.includes(e.id)).length === 0 && (
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, textAlign: 'center', paddingVertical: 8 }}>
                  No open pickups — check back later
                </Text>
              )}
              {/* My confirmed pickups */}
              {myPickups.length > 0 && (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>My Confirmed Runs</Text>
                  {myPickups.map(ev => {
                    const kid = members.find(m => m.id === ev.memberId);
                    const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US',
                      { weekday: 'short', month: 'short', day: 'numeric' }) : ev.date;
                    return (
                      <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                        padding: 10, borderRadius: 12,
                        backgroundColor: isDark ? BRAND.teal + '15' : BRAND.teal + '12',
                        borderWidth: 1, borderColor: BRAND.teal + '30' }}>
                        <CheckCircle size={14} color={BRAND.teal} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>
                            {kid?.name.split(' ')[0] ?? 'Sibling'} · {ev.title}
                          </Text>
                          <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{evDay}{ev.time ? ` · ${ev.time}` : ''}</Text>
                        </View>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: BRAND.teal }}>Confirmed</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>
      </View>}

      {/* ── Tutoring / Sibling Help ── */}
      <View style={pad}>
        <SectionCard
          icon={<BookOpen size={16} color={BRAND.purple} />}
          title="Tutor a Sibling"
          badge={undefined}
          collapsible defaultExpanded={false}
          colors={colors} isDark={isDark}>

          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginBottom: 12 }}>
            Offer your time to help a sibling with homework or studying. Parent sees the offer.
          </Text>

          {tutorSent ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: 28 }}>📚</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.teal, marginTop: 8 }}>
                Offer sent to parents!
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {/* Kid selector */}
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Who needs help?</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {siblings.map(k => (
                  <Pressable key={k.id} onPress={() => setTutorKid(k)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
                      borderRadius: 12, borderWidth: 1.5,
                      borderColor: tutorKid?.id === k.id ? BRAND.purple : colors.border,
                      backgroundColor: tutorKid?.id === k.id ? BRAND.purple + '15' : 'transparent' }}>
                    <Text style={{ fontSize: 16 }}>{k.emoji ?? '👤'}</Text>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                      color: tutorKid?.id === k.id ? BRAND.purple : colors.textPrimary }}>{k.name.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </View>
              {/* Subject */}
              <TextInput
                placeholder="Subject (e.g. Math, Science)"
                placeholderTextColor={colors.textTertiary}
                value={tutorSubject}
                onChangeText={setTutorSubject}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  padding: 10, fontSize: TYPO.body, color: colors.textPrimary,
                  backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
              />
              <TextInput
                placeholder="Optional note to sibling"
                placeholderTextColor={colors.textTertiary}
                value={tutorNote}
                onChangeText={setTutorNote}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  padding: 10, fontSize: TYPO.body, color: colors.textPrimary,
                  backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
              />
              <Pressable onPress={sendTutorOffer}
                style={({ pressed }) => ({ borderRadius: 12, backgroundColor: BRAND.purple,
                  paddingVertical: 12, alignItems: 'center', opacity: pressed || !tutorKid || !tutorSubject.trim() ? 0.5 : 1 })}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>📚 Offer Help</Text>
              </Pressable>
            </View>
          )}
        </SectionCard>
      </View>

      {/* ── Errand Bounties ── */}
      {errandChores.length > 0 && (
        <View style={pad}>
          <SectionCard
            icon={<ShoppingCart size={16} color={BRAND.teal} />}
            title="Errand Bounties"
            badge={errandChores.length} badgeColor={BRAND.teal}
            collapsible defaultExpanded={errandChores.length > 0}
            colors={colors} isDark={isDark}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginBottom: 10 }}>
              Parent-posted paid errands you can claim
            </Text>
            {errandChores.map(c => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 12, borderRadius: 14, marginBottom: 8,
                backgroundColor: isDark ? BRAND.teal + '10' : BRAND.teal + '08',
                borderWidth: 1, borderColor: BRAND.teal + '30' }}>
                <Zap size={18} color={BRAND.teal} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{c.title}</Text>
                  {c.description && (
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>{c.description}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.teal }}>+{c.coinsReward}¢</Text>
                  <Pressable
                    onPress={() => {
                      updateChore(c.id, { status: 'in_progress', assignedToId: active.id });
                      sendMessage('all', active.id, `🏃 ${active.name.split(' ')[0]} claimed errand: "${c.title}"`);
                    }}
                    style={({ pressed }) => ({ backgroundColor: BRAND.teal, borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 5, opacity: pressed ? 0.8 : 1 })}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>Claim</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </SectionCard>
        </View>
      )}

      {/* ── Grocery Runs ── */}
      <View style={pad}>
        <View style={{ backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12 }}>
          <Pressable onPress={() => setGroceryExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20,
              backgroundColor: BRAND.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCart size={20} color={BRAND.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Grocery Runs</Text>
                {openGroceryRuns.length > 0 && (
                  <View style={{ backgroundColor: BRAND.teal, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>{openGroceryRuns.length}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                {openGroceryRuns.length > 0 ? `${openGroceryRuns.length} open run${openGroceryRuns.length > 1 ? 's' : ''} · +${groceryEarnings}¢ each` : `Earn +${groceryEarnings} coins per completed run`}
              </Text>
            </View>
            {groceryExpanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>

          {groceryExpanded && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
              {openGroceryRuns.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>No grocery runs posted yet — check back later</Text>
                </View>
              ) : (
                openGroceryRuns.map(c => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 12, borderRadius: 14,
                    backgroundColor: isDark ? BRAND.teal + '10' : BRAND.teal + '08',
                    borderWidth: 1, borderColor: BRAND.teal + '30' }}>
                    <ShoppingCart size={18} color={BRAND.teal} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{c.title}</Text>
                      {c.description && (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>{c.description}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.teal }}>+{groceryEarnings}¢</Text>
                      <Pressable
                        onPress={() => {
                          updateChore(c.id, { status: 'in_progress', assignedToId: active.id });
                          sendMessage('all', active.id, `🛒 ${active.name.split(' ')[0]} claimed grocery run: "${c.title}"`);
                        }}
                        style={({ pressed }) => ({ backgroundColor: BRAND.teal, borderRadius: 8,
                          paddingHorizontal: 10, paddingVertical: 5, opacity: pressed ? 0.8 : 1 })}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>Claim</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
              <Pressable
                onPress={() => Alert.alert('Request a Run', 'Ask a parent to post a grocery run for you to claim.')}
                style={({ pressed }) => ({ borderRadius: 12, borderWidth: 1.5, borderColor: BRAND.teal,
                  paddingVertical: 10, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal }}>+ Request a Run</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* ── Family Grocery List ── */}
      <View style={pad}>
        <SectionCard
          icon={<ShoppingCart size={16} color={BRAND.teal} />}
          title="Family Grocery List"
          badge={groceryItems.length || undefined} badgeColor={BRAND.teal}
          collapsible defaultExpanded={false}
          colors={colors} isDark={isDark}>
          {groceryItems.length === 0 ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>List is empty — parent will add items</Text>
          ) : (
            groceryItems.map((item, i) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: isDark ? colors.border : '#F1F5F9' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.teal }} />
                <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary }}>{item.name}</Text>
                {item.quantity ? <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{item.quantity}</Text> : null}
              </View>
            ))
          )}
          <Pressable onPress={() => router.push('/(tabs)/grocery' as any)}
            style={{ marginTop: 10, borderRadius: 10, borderWidth: 1.5, borderColor: BRAND.teal + '50',
              paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.teal }}>Open Full List →</Text>
          </Pressable>
        </SectionCard>
      </View>

      {/* ── Gas / Vehicle Log (only when hasCar) ── */}
      {hasCar && <View style={pad}>
        <View style={{ backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12 }}>
          <Pressable onPress={() => setGasExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20,
              backgroundColor: '#10B98120', alignItems: 'center', justifyContent: 'center' }}>
              <Fuel size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Gas & Vehicle Log</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                {gasLog.length > 0 ? `${gasLog.length} entr${gasLog.length === 1 ? 'y' : 'ies'} logged` : 'Log fill-ups & report issues'}
              </Text>
            </View>
            {gasExpanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>

          {gasExpanded && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
              {/* Report issue */}
              <View style={{ backgroundColor: isDark ? '#1F0000' : '#FEF2F2', borderRadius: 14,
                borderWidth: 1, borderColor: '#FCA5A530', padding: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} color="#EF4444" />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>Report Vehicle Issue</Text>
                </View>
                <TextInput
                  placeholder="Describe the issue (e.g. low tire, weird noise)"
                  placeholderTextColor={colors.textTertiary}
                  value={vehicleIssue}
                  onChangeText={setVehicleIssue}
                  style={{ borderWidth: 1, borderColor: '#FCA5A570', borderRadius: 10,
                    padding: 8, fontSize: TYPO.body, color: colors.textPrimary,
                    backgroundColor: isDark ? colors.surface : '#fff' }}
                />
                <Pressable onPress={reportIssue}
                  style={({ pressed }) => ({ backgroundColor: '#EF4444', borderRadius: 10,
                    paddingVertical: 10, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                    {issueSent ? '✓ Sent to Parents' : '⚠️ Send Report'}
                  </Text>
                </Pressable>
              </View>

              {/* Log fill-up */}
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary,
                textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 }}>Log Fill-Up</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  placeholder="Gallons"
                  placeholderTextColor={colors.textTertiary}
                  value={newGallons}
                  onChangeText={setNewGallons}
                  keyboardType="decimal-pad"
                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                    padding: 8, fontSize: TYPO.body, color: colors.textPrimary,
                    backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
                />
                <TextInput
                  placeholder="Odometer"
                  placeholderTextColor={colors.textTertiary}
                  value={newOdo}
                  onChangeText={setNewOdo}
                  keyboardType="number-pad"
                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                    padding: 8, fontSize: TYPO.body, color: colors.textPrimary,
                    backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
                />
              </View>
              <TextInput
                placeholder="Note (optional)"
                placeholderTextColor={colors.textTertiary}
                value={newGasNote}
                onChangeText={setNewGasNote}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                  padding: 8, fontSize: TYPO.body, color: colors.textPrimary,
                  backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
              />
              <Pressable onPress={addGasEntry}
                style={({ pressed }) => ({ backgroundColor: '#10B981', borderRadius: 10,
                  paddingVertical: 10, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>⛽ Log Fill-Up</Text>
              </Pressable>

              {/* History */}
              {gasLog.length > 0 && (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>Recent</Text>
                  {gasLog.slice(0, 5).map(entry => (
                    <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 10, borderRadius: 10,
                      backgroundColor: isDark ? '#10B98110' : '#ECFDF5',
                      borderWidth: 1, borderColor: '#10B98130' }}>
                      <Fuel size={14} color="#10B981" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>
                          {entry.gallons} gal{entry.odometer ? ` · ${entry.odometer} mi` : ''}
                        </Text>
                        {entry.note ? <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{entry.note}</Text> : null}
                      </View>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{entry.date.slice(5)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </View>}

      {/* ── Digital Cash-Out ── */}
      <View style={pad}>
        <SectionCard
          icon={<Star size={16} color={BRAND.amber} />}
          title="Cash Out Earnings"
          badge={undefined}
          collapsible defaultExpanded={false}
          colors={colors} isDark={isDark}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginBottom: 12 }}>
            Request a payout for completed errands. Parent approves before transfer.
          </Text>
          {/* Method selector */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {CASH_METHODS.map(m => (
              <Pressable key={m} onPress={() => setCashMethod(m)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5,
                  borderColor: cashMethod === m ? BRAND.amber : colors.border,
                  backgroundColor: cashMethod === m ? BRAND.amber + '18' : 'transparent' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                  color: cashMethod === m ? BRAND.amber : colors.textSecondary }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              placeholder="Amount ($)"
              placeholderTextColor={colors.textTertiary}
              value={cashAmount}
              onChangeText={setCashAmount}
              keyboardType="decimal-pad"
              style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                padding: 10, fontSize: TYPO.body, color: colors.textPrimary,
                backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
            />
            <Pressable onPress={requestCashOut}
              style={({ pressed }) => ({ backgroundColor: BRAND.amber, borderRadius: 12,
                paddingHorizontal: 16, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>Request</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 8 }}>
            Balance: {active.mainCoins ?? active.coins ?? 0} coins · {active.xp} XP
          </Text>
        </SectionCard>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
