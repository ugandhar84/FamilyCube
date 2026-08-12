/**
 * HubScreen — Family OS command center.
 * Matches HTML reference design exactly.
 * Parent: action bar · kid requests · dual wallet · en-route · approvals · timeline
 * Kid:    conflict warning · quick actions · status strip · wallets · quests · schedule
 * Senior: bonus tip card · payout receipts
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
  Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/questStore';
import { useEventStore } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import { useGroceryStore } from '@/store/groceryStore';
import { RADIUS } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import AppHeader from '@/components/AppHeader';
import FamilyAvatar from '@/components/FamilyAvatar';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

const { width: W } = Dimensions.get('window');
const isTablet = W >= 768;

function fmtClock() {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtTime(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Glass card style helper ──────────────────────────────────────────────────
function glassStyle(colors: any, extraBorder?: string) {
  return {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: extraBorder ?? colors.border,
    borderRadius: 24,
  };
}

// ─── En Route Modal ───────────────────────────────────────────────────────────
function EnRouteModal({ visible, onClose, kids, onDispatch }: {
  visible: boolean; onClose: () => void; kids: FamilyMember[]; onDispatch: (kid: string, eta: string) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const ETAS = ['5 min', '10 min', '15 min', '20 min', '30 min', '45 min'];
  const [eta, setEta] = useState('10 min');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }} />
        <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary, marginBottom: 4 }}>🚗 Dispatch En Route</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 20 }}>Notify your kids you're on the way</Text>

        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Picking up</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {kids.map(k => (
            <Pressable key={k.id} onPress={() => setSelected(selected === k.id ? null : k.id)}
              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: selected === k.id ? '#10B981' : colors.card, borderColor: selected === k.id ? '#10B981' : colors.border }}>
              <Text style={{ fontSize: 16 }}>{k.emoji ?? '👤'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: selected === k.id ? '#fff' : colors.textPrimary }}>{k.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>ETA</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {ETAS.map(e => (
            <Pressable key={e} onPress={() => setEta(e)}
              style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, borderWidth: 1,
                backgroundColor: eta === e ? colors.primary : colors.card, borderColor: eta === e ? colors.primary : colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: eta === e ? '#fff' : colors.textSecondary }}>{e}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => {
          const kidName = selected ? kids.find(k => k.id === selected)?.name ?? 'kids' : 'kids';
          onDispatch(kidName, eta);
          onClose();
        }}
          style={{ backgroundColor: '#10B981', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>🚗 Send En Route Ping</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Parent View ──────────────────────────────────────────────────────────────
function ParentView({ active, members, colors, isDark, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean; onEnRoute: () => void;
}) {
  const { quests, approveQuest } = useQuestStore();
  const { events, updateEvent } = useEventStore();
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();
  const kids = members.filter(m => m.role === 'kid');
  const allNames = members.map(m => m.name);

  useEffect(() => { loadGrocery('family-1'); }, []);

  const inReview = quests.filter(q => q.status === 'pending_approval');

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const todayEvents = events
    .filter(e => e.date === todayStr)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  // Pending ride/schedule requests from real event data
  const pendingRequests = events.filter(e => e.approvalPending);

  const pad = { paddingHorizontal: 16 };
  const COIN_VAL = 0.10;

  return (
    <>
      {/* ── Action bar ── */}
      <View style={[{ flexDirection: 'row', gap: 8, marginBottom: 16 }, pad]}>
        <Pressable style={[pv.actionBtn, { backgroundColor: BRAND.purple }]}>
          <Text style={{ fontSize: 20 }}>📋</Text>
          <Text style={pv.actionLabel}>Scan Flyer</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/quests')}
          style={[pv.actionBtn, { backgroundColor: '#10B981' }]}>
          <Text style={{ fontSize: 20 }}>➕</Text>
          <Text style={pv.actionLabel}>+ Quest</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/calendar')}
          style={[pv.actionBtn, { backgroundColor: BRAND.amber }]}>
          <Text style={{ fontSize: 20 }}>📅</Text>
          <Text style={pv.actionLabel}>+ Event</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/grocery' as any)}
          style={[pv.actionBtn, { backgroundColor: '#0ea5e9' }]}>
          <Text style={{ fontSize: 20 }}>🛒</Text>
          <Text style={pv.actionLabel}>
            {groceryItems.length > 0 ? `${groceryItems.length} items` : 'Grocery'}
          </Text>
        </Pressable>
      </View>

      {/* ── Pending kid carpool / schedule requests ── */}
      {pendingRequests.length > 0 && (
        <View style={[pad, { marginBottom: 14 }]}>
          <View style={{ backgroundColor: isDark ? 'rgba(120,53,15,0.2)' : '#FFFBEB', borderRadius: 20, borderWidth: 1, borderColor: '#F59E0B50', padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle" size={16} color="#F59E0B" />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#F59E0B' }}>
                {pendingRequests.length} Schedule / Carpool Request{pendingRequests.length !== 1 ? 's' : ''}
              </Text>
            </View>
            {pendingRequests.map(ev => (
              <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
                  {ev.title}
                  {ev.time ? <Text style={{ fontWeight: '500', color: colors.textSecondary }}>{' · '}{fmtTime(ev.time)}</Text> : null}
                </Text>
                <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, driverStatus: 'confirmed' })}
                  style={{ backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>✓ Claim</Text>
                </Pressable>
                <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, driverStatus: 'rejected' })}
                  style={{ backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>Decline</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Family Dual-Wallet ── */}
      <View style={[pad, { marginBottom: 14 }]}>
        <View style={[glassStyle(colors), { padding: 14, gap: 0 }]}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>💰 Kids' Wallets</Text>
            <Pressable onPress={() => router.push('/(tabs)/profile')}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary }}>Full Ledger →</Text>
            </Pressable>
          </View>
          {/* Per-kid rows */}
          {kids.map((k, i) => (
            <View key={k.id} style={[
              { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
              i < kids.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}>
              <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl}
                siblings={allNames} size={36} ringColor={BRAND.amber} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>
                {k.name.split(' ')[0]}
              </Text>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }}>
                  {k.mainCoins}🪙 <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>(${(k.mainCoins * COIN_VAL).toFixed(2)})</Text>
                </Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>
                  GP {k.gpCoins}⭐ <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>(${(k.gpCoins * COIN_VAL).toFixed(2)})</Text>
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ── En Route launcher ── */}
      <Pressable onPress={onEnRoute} style={[pad, { marginBottom: 14 }]}>
        <View style={{ backgroundColor: isDark ? '#052E1C' : '#ECFDF5', borderRadius: 20, borderWidth: 1, borderColor: '#10B98140', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B98125', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22 }}>🚗</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#10B981' }}>Dispatch En Route</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Broadcast ETA to family chat</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#10B981" />
        </View>
      </Pressable>

      {/* ── Quest Approvals / Action Clearance ── */}
      {inReview.length > 0 && (
        <View style={[pad, { marginBottom: 14 }]}>
          <View style={{ backgroundColor: isDark ? 'rgba(76,29,149,0.18)' : '#F5F3FF', borderRadius: 20, borderWidth: 1, borderColor: BRAND.purple + '40', padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>
                Action Center · {inReview.length} Quest{inReview.length !== 1 ? 's' : ''} Pending
              </Text>
              <Pressable onPress={() => inReview.forEach(q => approveQuest(q.id, active.id))}
                style={{ backgroundColor: BRAND.purple + '20', borderWidth: 1, borderColor: BRAND.purple + '60', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Approve All</Text>
              </Pressable>
            </View>
            {inReview.slice(0, 3).map(q => {
              const kid = members.find(m => m.id === q.assignedToId);
              return (
                <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: BRAND.purple + '15', borderWidth: 2, borderColor: BRAND.purple + '40', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>📸</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{q.title}</Text>
                    {kid && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                          siblings={allNames} size={16} ringColor={BRAND.purple} ringWidth={1} />
                        <Text style={{ fontSize: TYPO.micro + 1, color: BRAND.purple, fontWeight: '600' }}>{kid.name.split(' ')[0]}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable onPress={() => approveQuest(q.id, active.id)}
                    style={{ backgroundColor: BRAND.purple, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Pay 🪙{q.coins}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Today's Timeline ── */}
      <View style={pad}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Today's Timeline</Text>
        {todayEvents.length === 0 ? (
          <View style={[glassStyle(colors), { padding: 24, alignItems: 'center', gap: 6 }]}>
            <Text style={{ fontSize: 28 }}>📅</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>All clear — no events today</Text>
          </View>
        ) : (
          <View style={{ paddingLeft: 22, borderLeftWidth: 2, borderLeftColor: colors.border, gap: 10 }}>
            {todayEvents.map(ev => {
              const dotColor = ev.conflict ? BRAND.amber
                : ev.category === 'Medical' ? '#EF4444'
                : ev.category === 'Work' ? BRAND.purple
                : '#10B981';
              return (
                <View key={ev.id} style={{ position: 'relative' }}>
                  <View style={{ position: 'absolute', left: -27, top: 14, width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor, borderWidth: 2.5, borderColor: colors.background }} />
                  <View style={[glassStyle(colors, ev.conflict ? BRAND.amber + '40' : colors.border), {
                    padding: 12, gap: 4,
                    backgroundColor: ev.conflict ? (isDark ? '#2A1800' : '#FFFBEB') : colors.card,
                  }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.label + 1, fontWeight: '700', color: dotColor }}>
                        {ev.category ?? 'Event'}
                      </Text>
                      <Text style={{ fontSize: TYPO.label + 1, color: colors.textSecondary }}>{fmtTime(ev.time)}</Text>
                    </View>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                    {ev.driver && (
                      <Text style={{ fontSize: TYPO.label + 1, color: colors.textSecondary }}>
                        🚗 <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.driver}</Text>
                        {' '}
                        {ev.driverStatus === 'confirmed' && <Text style={{ color: '#10B981' }}>✓</Text>}
                        {ev.driverStatus === 'pending' && <Text style={{ color: BRAND.amber }}>⏳</Text>}
                      </Text>
                    )}
                    {ev.conflict && (
                      <Pressable style={{ backgroundColor: BRAND.amber, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 2 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Swap Driver</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </>
  );
}

const pv = StyleSheet.create({
  actionBtn: { flex: 1, borderRadius: 20, paddingVertical: 13, alignItems: 'center', gap: 4 },
  actionLabel: { fontSize: 10, fontWeight: '700', color: '#fff' },
});

// ─── Kid View ─────────────────────────────────────────────────────────────────
function KidView({ active, members, colors }: { active: FamilyMember; members: FamilyMember[]; colors: any }) {
  const { quests, submitQuest } = useQuestStore();
  const { events } = useEventStore();

  const myQuests   = quests.filter(q => q.assignedToId === active.id);
  const inProgress = myQuests.filter(q => q.status === 'todo' || q.status === 'claimed').length;
  const inReview   = myQuests.filter(q => q.status === 'pending_approval').length;
  const available  = quests.filter(q => !q.assignedToId && q.status === 'todo').length;

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const todayEvents = events.filter(e => e.date === todayStr).slice(0, 3);

  const mainCoins = active.mainCoins ?? active.coins ?? 0;
  const gpCoins   = active.gpCoins ?? 0;
  const streak    = active.streak ?? 0;
  const COIN_VAL  = 0.10;

  const pad = { paddingHorizontal: 16 };

  const ACTIONS = [
    { icon: '💬', label: 'Parent Chat',   color: BRAND.purple, action: () => router.push('/(tabs)/chat') },
    { icon: '🚗', label: 'Ask a Ride',    color: '#10B981',    action: () => Alert.alert('Ride Request', 'Your parent will be notified!') },
    { icon: '📚', label: 'Ask Tutor',     color: BRAND.amber,  action: () => Alert.alert('Tutor Request', 'Scheduling...') },
    { icon: '🎉', label: 'Cheer Sibling', color: BRAND.pink,   action: () => router.push('/(tabs)/quests') },
  ];

  return (
    <>
      {/* Conflict warning */}
      <View style={[pad, { marginBottom: 12 }]}>
        <View style={{ backgroundColor: '#78350F22', borderRadius: 18, borderWidth: 1, borderColor: '#F59E0B50', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 16 }}>⚠️</Text>
          <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textPrimary, fontWeight: '600' }}>
            Mom & Dad both signed up for pickup at 3:30 PM — check schedule!
          </Text>
        </View>
      </View>

      {/* Quick action grid 2×2 */}
      <View style={[pad, { marginBottom: 14 }]}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACTIONS.map(a => (
            <Pressable key={a.label} onPress={a.action}
              style={{ width: (W - 48) / 2, backgroundColor: a.color + '18', borderRadius: 18, paddingVertical: 14, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: a.color + '30' }}>
              <Text style={{ fontSize: 24 }}>{a.icon}</Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: a.color }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Quest status strip */}
      <View style={[{ flexDirection: 'row', gap: 8, marginBottom: 14 }, pad]}>
        {[
          { n: inProgress, label: 'In Progress', color: BRAND.purple, icon: '⚡' },
          { n: inReview,   label: 'In Review',   color: BRAND.amber,  icon: '⏳' },
          { n: available,  label: 'Open Tasks',  color: '#10B981',    icon: '🏆' },
        ].map(b => (
          <Pressable key={b.label} onPress={() => router.push('/(tabs)/quests')}
            style={{ flex: 1, backgroundColor: b.color + '15', borderRadius: 18, borderWidth: 1, borderColor: b.color + '40', paddingVertical: 14, alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 18 }}>{b.icon}</Text>
            <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: b.color }}>{b.n}</Text>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: b.color, textAlign: 'center' }}>{b.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Dual sub-wallets */}
      <View style={[{ flexDirection: 'row', gap: 8, marginBottom: 14 }, pad]}>
        <View style={{ flex: 1, backgroundColor: '#78350F22', borderRadius: 20, borderWidth: 1, borderColor: '#F59E0B40', padding: 14, gap: 4 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>🪙 Store Wallet</Text>
          <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: BRAND.amber }}>{mainCoins}</Text>
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>${(mainCoins * COIN_VAL).toFixed(2)} cash value</Text>
          <Pressable onPress={() => router.push('/(tabs)/store' as any)}
            style={{ backgroundColor: BRAND.amber, borderRadius: 10, paddingVertical: 7, alignItems: 'center', marginTop: 2 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Browse Perks</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, backgroundColor: '#4C1D9522', borderRadius: 20, borderWidth: 1, borderColor: BRAND.purple + '40', padding: 14, gap: 4 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>⭐ GP Bonus</Text>
          <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: BRAND.purple }}>{gpCoins}</Text>
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>from Grandma</Text>
          <Pressable onPress={() => Alert.alert('GP Cash Out', 'Ask a parent to convert your GP coins!')}
            style={{ backgroundColor: BRAND.purple, borderRadius: 10, paddingVertical: 7, alignItems: 'center', marginTop: 2 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Cash Out</Text>
          </Pressable>
        </View>
      </View>

      {/* Streak */}
      {streak > 0 && (
        <View style={[pad, { marginBottom: 12 }]}>
          <View style={[glassStyle(colors), { flexDirection: 'row', padding: 12, alignItems: 'center', gap: 10 }]}>
            <Text style={{ fontSize: 24 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>{streak} Day Streak!</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>Keep completing quests daily</Text>
            </View>
            <Text style={{ fontSize: 22 }}>🏅</Text>
          </View>
        </View>
      )}

      {/* My quests checklist */}
      <View style={pad}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>My Quests</Text>
        {myQuests.filter(q => q.status !== 'done').slice(0, 5).map(q => {
          const isPending = q.status === 'pending_approval';
          const isClaimed = q.status === 'claimed';
          return (
            <Pressable key={q.id} onPress={() => !isPending && submitQuest(q.id)}
              style={[glassStyle(colors), { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, marginBottom: 8 }]}>
              <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isPending ? BRAND.amber + '20' : isClaimed ? '#10B98120' : colors.surface,
                borderColor: isPending ? BRAND.amber : isClaimed ? '#10B981' : colors.border }}>
                {isPending && <Ionicons name="time" size={13} color={BRAND.amber} />}
                {isClaimed && <Ionicons name="checkmark" size={13} color="#10B981" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
                <Text style={{ fontSize: TYPO.label + 1, color: colors.textTertiary }}>
                  {isPending ? '⏳ Waiting for approval' : isClaimed ? '✓ Submitted' : q.category ?? ''}
                </Text>
              </View>
              <View style={{ backgroundColor: BRAND.amber + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.amber }}>🪙{q.coins}</Text>
              </View>
            </Pressable>
          );
        })}
        {myQuests.filter(q => q.status !== 'done').length === 0 && (
          <View style={[glassStyle(colors), { padding: 20, alignItems: 'center', gap: 6 }]}>
            <Text style={{ fontSize: 26 }}>🎉</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>All quests done! Amazing work!</Text>
          </View>
        )}
      </View>

      {/* Today's schedule glance */}
      {todayEvents.length > 0 && (
        <View style={[pad, { marginTop: 14 }]}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Today's Schedule</Text>
          <View style={[glassStyle(colors), { padding: 12, gap: 8 }]}>
            {todayEvents.map(ev => (
              <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.purple, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                  {ev.location && <Text style={{ fontSize: TYPO.label + 1, color: colors.textTertiary }}>{ev.location}</Text>}
                </View>
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{fmtTime(ev.time)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  );
}

// ─── Senior / Grandparent View ────────────────────────────────────────────────
function SeniorView({ active, members, colors }: { active: FamilyMember; members: FamilyMember[]; colors: any }) {
  const kids = members.filter(m => m.role === 'kid');
  const allNames = members.map(m => m.name);
  const RECEIPTS = [
    { kid: 'Leo',  amount: 2.50, date: 'Today',     reason: 'Bonus for A+ grade! 🌟' },
    { kid: 'Maya', amount: 1.50, date: 'Yesterday',  reason: 'Helped with house chores' },
    { kid: 'Sam',  amount: 1.00, date: '2 days ago', reason: 'Reading 20 mins every day' },
  ];

  const pad = { paddingHorizontal: 16 };

  return (
    <>
      {/* HQ card */}
      <View style={[pad, { marginBottom: 14 }]}>
        <View style={{ backgroundColor: '#4C1D9522', borderRadius: 20, borderWidth: 1, borderColor: BRAND.purple + '40', padding: 14, gap: 6 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            👵 Senior Caregiver & Driver HQ
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 20 }}>
            Grandparents can send bonus tips directly into grandchildren's GP sub-wallet and assist with carpool.
          </Text>
        </View>
      </View>

      {/* 2-button grid */}
      <View style={[{ flexDirection: 'row', gap: 10, marginBottom: 16 }, pad]}>
        <Pressable onPress={() => Alert.alert('Grandparent Tip', 'Choose a grandchild below')}
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: BRAND.purple + '40', padding: 14, gap: 5, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 26 }}>🎁</Text>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>Grandparent Tip</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Send bonus coins & love</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/profile')}
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 5, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 26 }}>📜</Text>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Payout Receipts</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>View confirmed receipts</Text>
        </Pressable>
      </View>

      {/* Per-kid tip buttons */}
      <View style={pad}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Send Bonus To</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {kids.map(kid => (
            <Pressable key={kid.id} onPress={() => Alert.alert('Bonus!', `Sending bonus to ${kid.name}...`)}
              style={{ backgroundColor: BRAND.purple, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                siblings={allNames} size={24} ringColor="#fff" ringWidth={1} bgColor={BRAND.purple + '60'} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>{kid.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </View>

        {/* Receipts */}
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Bonus Receipts</Text>
        <View style={{ gap: 8 }}>
          {RECEIPTS.map((r, i) => (
            <View key={i} style={[glassStyle(colors), { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }]}>
              <Text style={{ fontSize: 22 }}>🧾</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>${r.amount.toFixed(2)} → {r.kid}</Text>
                <Text style={{ fontSize: TYPO.label + 1, color: colors.textSecondary }}>{r.reason}</Text>
              </View>
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>{r.date}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember, loaded, loadFromStorage } = useFamilyStore();
  const { loadFromStorage: loadQuests } = useQuestStore();
  const { loadFromStorage: loadEvents } = useEventStore();
  const { loadFromStorage: loadRewards } = useRewardStore();

  const [refreshing, setRefreshing]         = useState(false);
  const [pinTarget, setPinTarget]             = useState<FamilyMember | null>(null);
  const [clock, setClock]                     = useState(fmtClock());
  const [enRouteVisible, setEnRouteVisible]   = useState(false);
  const [transitBanner, setTransitBanner]     = useState<{ kid: string; eta: string } | null>(null);

  useEffect(() => {
    if (!loaded) loadFromStorage();
    loadQuests();
    loadEvents();
    loadRewards();
  }, [loaded]);

  useEffect(() => {
    const id = setInterval(() => setClock(fmtClock()), 30000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadQuests(), loadEvents()]);
    setRefreshing(false);
  }, []);

  const active   = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';
  const isSenior = active?.role === 'senior';
  const isKid    = !isParent && !isSenior;

  const roleBadgeColor  = isParent ? '#10B981' : isSenior ? '#9D4EDD' : '#6C5CE7';
  const roleBadgeLabel  = isParent ? 'Parent' : isSenior ? 'Senior' : 'Kid';

  const handleDispatch = (kid: string, eta: string) => {
    setTransitBanner({ kid, eta });
  };

  if (!active) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>

      {/* ── Header ── */}
      <AppHeader
        memberName={active.name.split(' ')[0]}
        memberRole={active.role as 'parent' | 'kid' | 'senior'}
        onBellPress={() => Alert.alert('Nudge Center', 'Dinner ready · Meds · Pickup · Chore check')}
      />

      {/* ── Transit Banner (En Route) ── */}
      {transitBanner && (
        <View style={{ backgroundColor: '#065F46', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 16 }}>🚗</Text>
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#6EE7B7' }}>
            En Route to pick up {transitBanner.kid} · ETA {transitBanner.eta}
          </Text>
          <Pressable onPress={() => setTransitBanner(null)}
            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#10B98130', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={14} color="#6EE7B7" />
          </Pressable>
        </View>
      )}

      {/* ── Scrollable body ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 60 }}
      >
        {isParent && <ParentView active={active} members={members} colors={colors} isDark={isDark} onEnRoute={() => setEnRouteVisible(true)} />}
        {isKid    && <KidView    active={active} members={members} colors={colors} />}
        {isSenior && <SeniorView active={active} members={members} colors={colors} />}
      </ScrollView>

      {/* Modals */}
      <EnRouteModal
        visible={enRouteVisible}
        onClose={() => setEnRouteVisible(false)}
        kids={members.filter(m => m.role === 'kid')}
        onDispatch={handleDispatch}
      />
      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={() => { if (pinTarget) setActiveMember(pinTarget.id); setPinTarget(null); }}
        onCancel={() => setPinTarget(null)}
      />
    </SafeAreaView>
  );
}
