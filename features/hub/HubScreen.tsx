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
  Animated, Modal, Alert, Dimensions, Platform,
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

// ─── Profile Switcher Modal ───────────────────────────────────────────────────
function ProfileSwitcherModal({ visible, onClose, members, activeId, onSelect }: {
  visible: boolean; onClose: () => void; members: FamilyMember[];
  activeId: string | null; onSelect: (m: FamilyMember) => void;
}) {
  const { colors } = useTheme();
  const parents = members.filter(m => m.role === 'parent');
  const kids    = members.filter(m => m.role === 'kid');
  const seniors = members.filter(m => m.role === 'senior');

  const Group = ({ title, list }: { title: string; list: FamilyMember[] }) =>
    list.length === 0 ? null : (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 }}>{title}</Text>
        {list.map(m => {
          const isActive = m.id === activeId;
          const accent = m.role === 'parent' ? colors.parent : m.role === 'senior' ? '#9D4EDD' : colors.primary;
          return (
            <Pressable key={m.id} onPress={() => { onSelect(m); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, marginBottom: 4, backgroundColor: isActive ? accent + '18' : 'transparent' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: accent + '22', borderWidth: 2, borderColor: isActive ? accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{m.emoji ?? m.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'capitalize' }}>{m.role}</Text>
              </View>
              {m.role === 'kid' && (
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B' }}>🪙 {m.mainCoins}</Text>
                  <Text style={{ fontSize: 10, color: '#9D4EDD' }}>⭐ {m.gpCoins} GP</Text>
                </View>
              )}
              {isActive && <Ionicons name="checkmark-circle" size={22} color={accent} />}
            </Pressable>
          );
        })}
      </View>
    );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }} />
        <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary, marginBottom: 4 }}>Switch Profile</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 20 }}>Tap a member to switch your active view</Text>
        <Group title="Parents" list={parents} />
        <Group title="Kids" list={kids} />
        <Group title="Grandparents / Seniors" list={seniors} />
        <Pressable onPress={() => { onClose(); router.push('/(tabs)/profile'); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginTop: 4 }}>
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '600' }}>Manage Members & Settings</Text>
        </Pressable>
      </View>
    </Modal>
  );
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
function ParentView({ active, members, colors, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; onEnRoute: () => void;
}) {
  const { quests, approveQuest } = useQuestStore();
  const { events } = useEventStore();
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();
  const kids = members.filter(m => m.role === 'kid');

  useEffect(() => { loadGrocery('family-1'); }, []);
  const inReview = quests.filter(q => q.status === 'pending_approval');

  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter(e => e.date === today).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  const MOCK_REQUESTS = [
    { emoji: '🚗', type: 'Ride', who: 'Leo', detail: 'Soccer practice at 3:30 PM' },
  ];

  const pad = { paddingHorizontal: 16 };

  return (
    <>
      {/* Action bar */}
      <View style={[{ flexDirection: 'row', gap: 8, marginBottom: 14 }, pad]}>
        {/* Scan Flyer — purple gradient */}
        <Pressable style={{ flex: 1, borderRadius: 20, paddingVertical: 13, alignItems: 'center', gap: 4, backgroundColor: '#6C5CE7', overflow: 'hidden' }}>
          <Text style={{ fontSize: 18 }}>📋</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Scan Flyer</Text>
        </Pressable>
        {/* + Quest */}
        <Pressable onPress={() => router.push('/(tabs)/quests')}
          style={{ flex: 1, borderRadius: 20, paddingVertical: 13, alignItems: 'center', gap: 4, backgroundColor: '#10B981' }}>
          <Text style={{ fontSize: 18 }}>➕</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>+ Quest</Text>
        </Pressable>
        {/* + Event */}
        <Pressable onPress={() => router.push('/(tabs)/calendar')}
          style={{ flex: 1, borderRadius: 20, paddingVertical: 13, alignItems: 'center', gap: 4, backgroundColor: '#F59E0B' }}>
          <Text style={{ fontSize: 18 }}>📅</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>+ Event</Text>
        </Pressable>
        {/* Grocery */}
        <Pressable onPress={() => router.push('/(tabs)/grocery' as any)}
          style={{ flex: 1, borderRadius: 20, paddingVertical: 13, alignItems: 'center', gap: 4, backgroundColor: '#0ea5e9' }}>
          <Text style={{ fontSize: 18 }}>🛒</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
            {groceryItems.length > 0 ? `${groceryItems.length} items` : 'Grocery'}
          </Text>
        </Pressable>
      </View>

      {/* Kid schedule requests — amber gradient */}
      {MOCK_REQUESTS.map((r, i) => (
        <Pressable key={i} style={[pad, { marginBottom: 12 }]}>
          <View style={{ backgroundColor: '#78350F22', borderRadius: 24, borderWidth: 1, borderColor: '#F59E0B60', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#F59E0B' }}>Schedule Request · {r.type}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>{r.who}: {r.detail}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </Pressable>
              <Pressable style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          </View>
        </Pressable>
      ))}

      {/* Dual wallet summary glass card */}
      <View style={[pad, { marginBottom: 14 }]}>
        <View style={[glassStyle(colors), { padding: 14, gap: 10 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>💰 Family Wallet Summary</Text>
            <Pressable onPress={() => router.push('/(tabs)/profile')}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Full Ledger →</Text>
            </Pressable>
          </View>
          {kids.map(k => (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 18 }}>{k.emoji ?? '👤'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>{k.name.split(' ')[0]}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>Store: {k.mainCoins}🪙</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#9D4EDD', marginLeft: 8 }}>GP: {k.gpCoins}⭐</Text>
            </View>
          ))}
        </View>
      </View>

      {/* En Route launcher */}
      <Pressable onPress={onEnRoute} style={[pad, { marginBottom: 14 }]}>
        <View style={{ backgroundColor: '#064E3B', borderRadius: 24, borderWidth: 1, borderColor: '#10B98140', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B98130', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22 }}>🚗</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#10B981' }}>Dispatch En Route</Text>
            <Text style={{ fontSize: 12, color: '#6EE7B7' }}>Notify kids you're on your way home</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#10B981" />
        </View>
      </Pressable>

      {/* Approvals */}
      {inReview.length > 0 && (
        <View style={[pad, { marginBottom: 14 }]}>
          <View style={[glassStyle(colors, '#10B98140'), { padding: 14, gap: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#10B981' }}>
                ✅ {inReview.length} Quest{inReview.length !== 1 ? 's' : ''} Awaiting Approval
              </Text>
              <Pressable onPress={() => inReview.forEach(q => approveQuest(q.id, active.id))}
                style={{ backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Approve All</Text>
              </Pressable>
            </View>
            {inReview.slice(0, 3).map(q => {
              const kid = members.find(m => m.id === q.assignedToId);
              return (
                <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                  {/* Photo proof thumbnail placeholder */}
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#6C5CE720', borderWidth: 2, borderColor: '#6C5CE750', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>📸</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{q.title}</Text>
                    {kid && <Text style={{ fontSize: 11, color: '#9D4EDD', fontWeight: '600' }}>{kid.emoji} {kid.name.split(' ')[0]}</Text>}
                    <Text style={{ fontSize: 10, color: '#9D8FF5' }}>Photo Proof Attached</Text>
                  </View>
                  <Pressable onPress={() => approveQuest(q.id, active.id)}
                    style={{ backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Pay 🪙{q.coins}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Today's timeline */}
      <View style={pad}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Today's Timeline</Text>
        {todayEvents.length === 0 ? (
          <View style={[glassStyle(colors), { padding: 24, alignItems: 'center', gap: 6 }]}>
            <Text style={{ fontSize: 28 }}>📅</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textTertiary }}>No events scheduled today</Text>
          </View>
        ) : (
          <View style={{ paddingLeft: 24, borderLeftWidth: 2, borderLeftColor: colors.border, gap: 12 }}>
            {todayEvents.map((ev, i) => {
              const hasConflict = (ev as any).conflict;
              const dotColor = hasConflict ? '#F59E0B' : ev.category === 'Medical' ? '#EF4444' : ev.category === 'Work' ? '#6C5CE7' : '#10B981';
              return (
                <View key={ev.id} style={{ position: 'relative' }}>
                  <View style={{ position: 'absolute', left: -29, top: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor, borderWidth: 3, borderColor: colors.background }} />
                  <View style={[glassStyle(colors, hasConflict ? '#F59E0B40' : colors.border), { padding: 12, gap: 6,
                    backgroundColor: hasConflict ? '#78350F15' : colors.card }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ backgroundColor: dotColor + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: dotColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>{ev.category ?? 'Event'}</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>{fmtTime(ev.time)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                    {(ev as any).driver && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>🚗 Driver: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{(ev as any).driver}</Text></Text>
                    )}
                    {hasConflict && (
                      <Pressable style={{ backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Swap Driver</Text>
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

// ─── Kid View ─────────────────────────────────────────────────────────────────
function KidView({ active, members, colors }: { active: FamilyMember; members: FamilyMember[]; colors: any }) {
  const { quests, submitQuest } = useQuestStore();
  const { events } = useEventStore();

  const myQuests   = quests.filter(q => q.assignedToId === active.id);
  const inProgress = myQuests.filter(q => q.status === 'todo' || q.status === 'claimed').length;
  const inReview   = myQuests.filter(q => q.status === 'pending_approval').length;
  const available  = quests.filter(q => !q.assignedToId && q.status === 'todo').length;

  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter(e => e.date === today).slice(0, 3);

  const mainCoins = active.mainCoins ?? active.coins ?? 0;
  const gpCoins   = active.gpCoins ?? 0;
  const streak    = active.streak ?? 0;
  const COIN_VALUE = 0.10;

  const pad = { paddingHorizontal: 16 };

  return (
    <>
      {/* Conflict warning */}
      <View style={[pad, { marginBottom: 12 }]}>
        <View style={{ backgroundColor: '#78350F22', borderRadius: 20, borderWidth: 1, borderColor: '#F59E0B50', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 16 }}>⚠️</Text>
          <Text style={{ flex: 1, fontSize: 12, color: colors.textPrimary, fontWeight: '600' }}>
            Mom & Dad both signed up for pickup at 3:30 PM — check schedule!
          </Text>
        </View>
      </View>

      {/* Quick actions glass card */}
      <View style={[pad, { marginBottom: 14 }]}>
        <View style={[glassStyle(colors), { padding: 12 }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { icon: '💬', label: 'Parent Chat',   color: '#6C5CE7', action: () => router.push('/(tabs)/chat') },
              { icon: '🚗', label: 'Ask a Ride',    color: '#10B981', action: () => Alert.alert('Ride Request', 'Your parent will be notified!') },
              { icon: '📚', label: 'Ask Tutor',     color: '#F59E0B', action: () => Alert.alert('Tutor Request', 'Scheduling...') },
              { icon: '🎉', label: 'Cheer Sibling', color: '#EF4444', action: () => router.push('/(tabs)/quests') },
            ].map(a => (
              <Pressable key={a.label} onPress={a.action}
                style={{ width: (W - 64) / 2, backgroundColor: a.color + '18', borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: a.color + '30' }}>
                <Text style={{ fontSize: 22 }}>{a.icon}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: a.color }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Status 3-box strip */}
      <View style={[{ flexDirection: 'row', gap: 8, marginBottom: 14 }, pad]}>
        {[
          { n: inProgress, label: 'In Progress', color: '#6C5CE7', icon: '⚡' },
          { n: inReview,   label: 'In Review',   color: '#F59E0B', icon: '⏳' },
          { n: available,  label: 'Open Tasks',  color: '#10B981', icon: '🏆' },
        ].map(b => (
          <Pressable key={b.label} onPress={() => router.push('/(tabs)/quests')}
            style={{ flex: 1, backgroundColor: b.color + '15', borderRadius: 20, borderWidth: 1, borderColor: b.color + '40', paddingVertical: 14, alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 18 }}>{b.icon}</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: b.color }}>{b.n}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: b.color, textAlign: 'center' }}>{b.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Dual sub-wallets */}
      <View style={[{ flexDirection: 'row', gap: 8, marginBottom: 14 }, pad]}>
        {/* Main store wallet — amber */}
        <View style={{ flex: 1, backgroundColor: '#78350F22', borderRadius: 22, borderWidth: 1, borderColor: '#F59E0B40', padding: 14, gap: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B' }}>🪙 Store Wallet</Text>
          <Text style={{ fontSize: 26, fontWeight: '900', color: '#F59E0B' }}>{mainCoins}</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>${(mainCoins * COIN_VALUE).toFixed(2)} cash value</Text>
          <Pressable onPress={() => router.push('/(tabs)/profile')}
            style={{ backgroundColor: '#F59E0B', borderRadius: 10, paddingVertical: 7, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Browse Perks</Text>
          </Pressable>
        </View>
        {/* GP bonus wallet — purple */}
        <View style={{ flex: 1, backgroundColor: '#4C1D9522', borderRadius: 22, borderWidth: 1, borderColor: '#9D4EDD40', padding: 14, gap: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#9D4EDD' }}>⭐ GP Bonus</Text>
          <Text style={{ fontSize: 26, fontWeight: '900', color: '#9D4EDD' }}>{gpCoins}</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>from Grandma</Text>
          <Pressable onPress={() => Alert.alert('GP Cash Out', 'Ask a parent to convert your GP coins!')}
            style={{ backgroundColor: '#9D4EDD', borderRadius: 10, paddingVertical: 7, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Cash Out</Text>
          </Pressable>
        </View>
      </View>

      {/* Streak */}
      {streak > 0 && (
        <View style={[pad, { marginBottom: 12 }]}>
          <View style={[glassStyle(colors), { flexDirection: 'row', padding: 12, alignItems: 'center', gap: 10 }]}>
            <Text style={{ fontSize: 24 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{streak} Day Streak!</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Keep completing quests daily</Text>
            </View>
            <Text style={{ fontSize: 22 }}>🏅</Text>
          </View>
        </View>
      )}

      {/* My quests checklist */}
      <View style={pad}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>My Quests</Text>
        {myQuests.filter(q => q.status !== 'done').slice(0, 5).map(q => {
          const isPending = q.status === 'pending_approval';
          const isClaimed = q.status === 'claimed';
          return (
            <Pressable key={q.id} onPress={() => !isPending && submitQuest(q.id)}
              style={[glassStyle(colors), { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, marginBottom: 8 }]}>
              <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isPending ? '#F59E0B20' : isClaimed ? '#10B98120' : colors.surface,
                borderColor: isPending ? '#F59E0B' : isClaimed ? '#10B981' : colors.border }}>
                {isPending ? <Ionicons name="time" size={13} color="#F59E0B" /> : isClaimed ? <Ionicons name="checkmark" size={13} color="#10B981" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                  {isPending ? '⏳ Waiting for approval' : isClaimed ? '✓ Submitted' : q.category ?? ''}
                </Text>
              </View>
              <View style={{ backgroundColor: '#F59E0B20', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>🪙{q.coins}</Text>
              </View>
            </Pressable>
          );
        })}
        {myQuests.filter(q => q.status !== 'done').length === 0 && (
          <View style={[glassStyle(colors), { padding: 20, alignItems: 'center', gap: 6 }]}>
            <Text style={{ fontSize: 26 }}>🎉</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textTertiary }}>All quests done! Amazing work!</Text>
          </View>
        )}
      </View>

      {/* Today's schedule glance */}
      {todayEvents.length > 0 && (
        <View style={[pad, { marginTop: 14 }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Today's Schedule</Text>
          <View style={[glassStyle(colors), { padding: 12, gap: 8 }]}>
            {todayEvents.map(ev => (
              <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6C5CE7', marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                  {ev.location && <Text style={{ fontSize: 11, color: colors.textTertiary }}>{ev.location}</Text>}
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{fmtTime(ev.time)}</Text>
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
  const RECEIPTS = [
    { kid: 'Leo',  amount: 2.50, date: 'Today',      reason: 'Bonus for A+ grade! 🌟' },
    { kid: 'Maya', amount: 1.50, date: 'Yesterday',   reason: 'Helped with house chores' },
    { kid: 'Sam',  amount: 1.00, date: '2 days ago',  reason: 'Reading 20 mins every day' },
  ];

  const pad = { paddingHorizontal: 16 };

  return (
    <>
      {/* Purple info card */}
      <View style={[pad, { marginBottom: 14 }]}>
        <View style={{ backgroundColor: '#4C1D9522', borderRadius: 24, borderWidth: 1, borderColor: '#9D4EDD40', padding: 14, gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#9D4EDD', textTransform: 'uppercase', letterSpacing: 0.8 }}>👵 Senior Caregiver & Driver HQ</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>Grandparents have exclusive rights to send bonus tips into the Grandparent Sub-Wallet.</Text>
        </View>
      </View>

      {/* 2-button grid */}
      <View style={[{ flexDirection: 'row', gap: 10, marginBottom: 20 }, pad]}>
        <Pressable onPress={() => Alert.alert('Grandparent Tip', 'Choose a grandchild below')}
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: '#9D4EDD40', padding: 16, gap: 6, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 28 }}>🎁</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#9D4EDD' }}>Grandparent Tip</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary }}>Send bonus coins & love</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/profile')}
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 28 }}>📜</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>Payout Receipts</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary }}>View confirmed receipts</Text>
        </Pressable>
      </View>

      {/* Per-kid tip buttons */}
      <View style={pad}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Send Bonus To</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {kids.map(kid => (
            <Pressable key={kid.id} onPress={() => Alert.alert('Bonus!', `Sending bonus to ${kid.name}...`)}
              style={{ backgroundColor: '#9D4EDD', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18 }}>{kid.emoji ?? '👤'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{kid.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </View>

        {/* Receipts */}
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Bonus Receipts</Text>
        <View style={{ gap: 8 }}>
          {RECEIPTS.map((r, i) => (
            <View key={i} style={[glassStyle(colors), { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }]}>
              <Text style={{ fontSize: 22 }}>🧾</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>${r.amount.toFixed(2)} → {r.kid}</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>{r.reason}</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>{r.date}</Text>
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
  const [switcherVisible, setSwitcherVisible] = useState(false);
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

  const handleMemberSelect = (m: FamilyMember) => {
    if (m.pinEnabled && m.pin) { setPinTarget(m); return; }
    setActiveMember(m.id);
  };

  const handleDispatch = (kid: string, eta: string) => {
    setTransitBanner({ kid, eta });
  };

  if (!active) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>

      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {/* Left: clock + CUBE OS pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>{clock}</Text>
          </View>
          <View style={{ backgroundColor: '#6C5CE7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 1.5 }}>CUBE OS</Text>
          </View>
        </View>

        {/* Right: nudge bell + profile button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => Alert.alert('Nudge Center', 'Dinner ready · Meds · Pickup · Chore check')}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F59E0B18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F59E0B30' }}>
            <Ionicons name="notifications-outline" size={17} color="#F59E0B" />
          </Pressable>
          <Pressable onPress={() => setSwitcherVisible(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 18 }}>{active.emoji ?? active.name[0]}</Text>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>{active.name.split(' ')[0]}</Text>
              <View style={{ backgroundColor: roleBadgeColor + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: roleBadgeColor, textTransform: 'uppercase' }}>{roleBadgeLabel}</Text>
              </View>
            </View>
            <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
          </Pressable>
        </View>
      </View>

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
        {isParent && <ParentView active={active} members={members} colors={colors} onEnRoute={() => setEnRouteVisible(true)} />}
        {isKid    && <KidView    active={active} members={members} colors={colors} />}
        {isSenior && <SeniorView active={active} members={members} colors={colors} />}
      </ScrollView>

      {/* Modals */}
      <ProfileSwitcherModal
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
        members={members}
        activeId={activeMemberId}
        onSelect={handleMemberSelect}
      />
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
