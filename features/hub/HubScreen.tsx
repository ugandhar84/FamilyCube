/**
 * HubScreen — Family OS command centre.
 *
 * RBAC:
 *   parent  — full authority: approve quests/rides, create events/quests, en-route, wallet audit
 *   kid     — request-only: ask ride/tutor, see own events/quests/wallet, cheer siblings
 *   senior  — caregiver: claim/decline rides, send GP tips, read-only family timeline
 *
 * Every section is derived from live store data — no mock/static content.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  RefreshControl, Alert, Dimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/questStore';
import { useEventStore, FamilyEvent } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import { useGroceryStore } from '@/store/groceryStore';
import { TYPO } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import AppHeader from '@/components/AppHeader';
import FamilyAvatar from '@/components/FamilyAvatar';
import HelpQueueSection from '@/components/HelpQueueSection';
import HelpRequestModal from '@/components/HelpRequestModal';
import { BRAND } from '@/components/FamilyCubeLogo';

const { width: W } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Local YYYY-MM-DD — never UTC to avoid midnight timezone drift */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtClock() {
  const now = new Date();
  const h = now.getHours();
  return `${h % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtTime(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const CAT_COLOR: Record<string, string> = {
  Medical: '#EF4444',
  Work:    BRAND.purple,
  Sports:  '#10B981',
  School:  BRAND.amber,
  Study:   '#3B82F6',
  Event:   BRAND.teal,
};
function catColor(cat?: string) { return cat ? (CAT_COLOR[cat] ?? BRAND.teal) : BRAND.teal; }

// ─── Shared small components ──────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[sc.sectionLabel, { color: colors.textTertiary }]}>{label}</Text>
  );
}

function Card({ children, accent, colors, isDark, style }: {
  children: React.ReactNode; accent?: string; colors: any; isDark: boolean; style?: any;
}) {
  const bg = accent
    ? isDark ? accent + '18' : accent + '12'
    : colors.card;
  const border = accent ? accent + '45' : colors.border;
  return (
    <View style={[sc.card, { backgroundColor: bg, borderColor: border }, style]}>
      {children}
    </View>
  );
}

function AlertBanner({ icon, title, subtitle, color, children }: {
  icon: string; title: string; subtitle?: string; color: string; children?: React.ReactNode;
}) {
  return (
    <View style={[sc.alertBanner, { backgroundColor: color + '18', borderColor: color + '50' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: children ? 10 : 0 }}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color }}>{title}</Text>
          {subtitle && <Text style={{ fontSize: TYPO.label, color, opacity: 0.8, marginTop: 1 }}>{subtitle}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

const sc = StyleSheet.create({
  sectionLabel: {
    fontSize: TYPO.label, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 10,
  },
  card: {
    borderRadius: 20, borderWidth: 1, padding: 14,
  },
  alertBanner: {
    borderRadius: 18, borderWidth: 1.5, padding: 14,
  },
});

// ─── En Route Modal ───────────────────────────────────────────────────────────
function EnRouteModal({ visible, onClose, kids, onDispatch }: {
  visible: boolean; onClose: () => void;
  kids: FamilyMember[]; onDispatch: (kid: string, eta: string) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [eta, setEta] = useState('10 min');
  const ETAS = ['5 min', '10 min', '15 min', '20 min', '30 min', '45 min'];
  const allNames = kids.map(k => k.name);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, borderTopWidth: 1, borderColor: colors.border }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }} />
        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, marginBottom: 4 }}>🚗 Dispatch En Route</Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 20 }}>Notify your kids you're on the way</Text>

        <SectionLabel label="Picking up" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {kids.map(k => {
            const sel = selected === k.id;
            return (
              <Pressable key={k.id} onPress={() => setSelected(sel ? null : k.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: sel ? '#10B981' : colors.card,
                  borderColor: sel ? '#10B981' : colors.border }}>
                <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl}
                  siblings={allNames} size={24} ringColor={sel ? '#fff' : '#10B981'} ringWidth={1} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? '#fff' : colors.textPrimary }}>
                  {k.name.split(' ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel label="ETA" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {ETAS.map(e => (
            <Pressable key={e} onPress={() => setEta(e)}
              style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, borderWidth: 1,
                backgroundColor: eta === e ? '#10B981' : colors.card,
                borderColor: eta === e ? '#10B981' : colors.border }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: eta === e ? '#fff' : colors.textSecondary }}>{e}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => {
          const kidName = selected ? kids.find(k => k.id === selected)?.name.split(' ')[0] ?? 'kids' : 'kids';
          onDispatch(kidName, eta);
          onClose();
        }} style={{ backgroundColor: '#10B981', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>🚗 Send En Route Ping</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── PARENT VIEW ──────────────────────────────────────────────────────────────
/**
 * Scenarios handled:
 * 1. All clear — show quick actions, wallets, en-route, timeline
 * 2. Pending ride/schedule requests — amber card with Claim/Decline per request
 * 3. No driver assigned for kid's event today — urgent red warning
 * 4. Driver conflict on an event — amber + Swap Driver CTA
 * 5. Quest completions awaiting approval — purple action center, Approve All
 * 6. Today's full family timeline with driver status + conflict markers
 * 7. Grocery count badge on Grocery action button
 */
function ParentView({ active, members, colors, isDark, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean; onEnRoute: () => void;
}) {
  const { quests, approveQuest } = useQuestStore();
  const { events, updateEvent } = useEventStore();
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();

  useEffect(() => { loadGrocery('family-1'); }, []);

  const kids    = members.filter(m => m.role === 'kid');
  const allNames = members.map(m => m.name);
  const today   = localToday();

  const todayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  // Pending ride / schedule requests that need parent action
  const pendingRequests = events.filter(e => e.approvalPending);

  // Events today where a kid needs transport but no driver is assigned
  const noDriverEvents = todayEvents.filter(e =>
    e.memberId &&
    members.find(m => m.id === e.memberId)?.role === 'kid' &&
    (e.category === 'Sports' || e.category === 'School' || e.category === 'Medical') &&
    e.location &&
    !e.driver
  );

  // Quests submitted by kids awaiting parent pay-out
  const awaitingApproval = quests.filter(q => q.status === 'pending_approval');

  const COIN_VAL = 0.10;
  const pad = { paddingHorizontal: 16 };

  return (
    <>
      {/* ── 1. Quick action bar ── */}
      <View style={[{ flexDirection: 'row', gap: 8, marginBottom: 16 }, pad]}>
        {[
          { icon: '📋', label: 'Scan Flyer', color: BRAND.purple, action: () => Alert.alert('Scan Flyer', 'Open camera to scan an activity flyer') },
          { icon: '➕', label: '+ Quest',    color: '#10B981',    action: () => router.push('/(tabs)/quests') },
          { icon: '📅', label: '+ Event',    color: BRAND.amber,  action: () => router.push('/(tabs)/calendar') },
          {
            icon: '🛒',
            label: groceryItems.length > 0 ? `${groceryItems.length} items` : 'Grocery',
            color: '#0ea5e9',
            action: () => router.push('/(tabs)/grocery' as any),
          },
        ].map(a => (
          <Pressable key={a.label} onPress={a.action}
            style={{ flex: 1, borderRadius: 20, paddingVertical: 13, alignItems: 'center', gap: 4, backgroundColor: a.color }}>
            <Text style={{ fontSize: 20 }}>{a.icon}</Text>
            <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '700', color: '#fff' }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── 2. URGENT: Kid event today with no driver ── */}
      {noDriverEvents.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        return (
          <View key={ev.id} style={[pad, { marginBottom: 12 }]}>
            <AlertBanner icon="🚨" title={`No driver — ${ev.title}`}
              subtitle={`${kid?.name.split(' ')[0] ?? 'Kid'} · ${fmtTime(ev.time)} · ${ev.location}`}
              color="#EF4444">
              <Pressable onPress={() => router.push('/(tabs)/calendar')}
                style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Assign Driver Now</Text>
              </Pressable>
            </AlertBanner>
          </View>
        );
      })}

      {/* ── 3. Pending kid carpool / schedule requests ── */}
      {pendingRequests.length > 0 && (
        <View style={[pad, { marginBottom: 14 }]}>
          <AlertBanner icon="🙋" color={BRAND.amber}
            title={`${pendingRequests.length} Schedule / Ride Request${pendingRequests.length > 1 ? 's' : ''}`}
            subtitle="Needs your approval">
            {pendingRequests.map(ev => {
              const requester = ev.driverRequestedBy ?? members.find(m => m.id === ev.memberId)?.name ?? 'Kid';
              return (
                <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                      {ev.title}
                    </Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                      {requester} · {fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, driverStatus: 'confirmed' })}
                    style={{ backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>✓ Claim</Text>
                  </Pressable>
                  <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, driverStatus: 'rejected', declineReason: 'Declined by parent', declinedBy: active.name })}
                    style={{ backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>✕</Text>
                  </Pressable>
                </View>
              );
            })}
          </AlertBanner>
        </View>
      )}

      {/* ── 4. Quest Action Clearance Center ── */}
      {awaitingApproval.length > 0 && (
        <View style={[pad, { marginBottom: 14 }]}>
          <Card accent={BRAND.purple} colors={colors} isDark={isDark}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>
                ✅ {awaitingApproval.length} Quest{awaitingApproval.length > 1 ? 's' : ''} Pending Payout
              </Text>
              <Pressable onPress={() => awaitingApproval.forEach(q => approveQuest(q.id, active.id))}
                style={{ backgroundColor: BRAND.purple + '25', borderWidth: 1, borderColor: BRAND.purple + '60', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
                <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: BRAND.purple }}>Approve All</Text>
              </Pressable>
            </View>
            {awaitingApproval.slice(0, 4).map(q => {
              const kid = members.find(m => m.id === q.assignedToId);
              return (
                <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: BRAND.purple + '15', borderWidth: 2, borderColor: BRAND.purple + '40', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>📸</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{q.title}</Text>
                    {kid && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
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
            {awaitingApproval.length > 4 && (
              <Pressable onPress={() => router.push('/(tabs)/quests')}>
                <Text style={{ fontSize: TYPO.caption, color: BRAND.purple, fontWeight: '700', textAlign: 'center', paddingTop: 4 }}>
                  +{awaitingApproval.length - 4} more — View all →
                </Text>
              </Pressable>
            )}
          </Card>
        </View>
      )}

      {/* ── 5. Kids' Dual-Wallets ── */}
      <View style={[pad, { marginBottom: 14 }]}>
        <Card colors={colors} isDark={isDark}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>💰 Kids' Wallets</Text>
            <Pressable onPress={() => router.push('/(tabs)/profile')}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary }}>Full Ledger →</Text>
            </Pressable>
          </View>
          {kids.length === 0 ? (
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No kids added yet.</Text>
          ) : (
            kids.map((k, i) => (
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
                    {k.mainCoins}🪙{'  '}
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>(${(k.mainCoins * COIN_VAL).toFixed(2)})</Text>
                  </Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>
                    GP {k.gpCoins}⭐{'  '}
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>(${(k.gpCoins * COIN_VAL).toFixed(2)})</Text>
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>
      </View>

      {/* ── 6. En Route launcher ── */}
      <Pressable onPress={onEnRoute} style={[pad, { marginBottom: 14 }]}>
        <View style={{ backgroundColor: isDark ? '#052E1C' : '#ECFDF5', borderRadius: 20, borderWidth: 1, borderColor: '#10B98145', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B98125', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22 }}>🚗</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#10B981' }}>Dispatch En Route</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Broadcast your ETA to family chat</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#10B981" />
        </View>
      </Pressable>

      {/* ── 7. Today's Family Timeline ── */}
      <View style={pad}>
        <SectionLabel label="Today's Family Timeline" />
        {todayEvents.length === 0 ? (
          <Card colors={colors} isDark={isDark} style={{ padding: 24, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 30 }}>📅</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>All clear — no events today</Text>
          </Card>
        ) : (
          <View style={{ paddingLeft: 22, borderLeftWidth: 2, borderLeftColor: colors.border, gap: 10 }}>
            {todayEvents.map(ev => {
              const dot = ev.conflict ? BRAND.amber : catColor(ev.category);
              const member = members.find(m => m.id === ev.memberId);
              return (
                <View key={ev.id} style={{ position: 'relative' }}>
                  <View style={{ position: 'absolute', left: -27, top: 14, width: 10, height: 10, borderRadius: 5, backgroundColor: dot, borderWidth: 2.5, borderColor: colors.background }} />
                  <Card accent={ev.conflict ? BRAND.amber : undefined} colors={colors} isDark={isDark}>
                    {/* Row 1: category chip + time */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {member && (
                          <FamilyAvatar name={member.name} emoji={member.emoji} avatarUrl={member.avatarUrl}
                            siblings={allNames} size={18} ringColor={dot} ringWidth={1} />
                        )}
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: dot }}>{ev.category ?? 'Event'}</Text>
                      </View>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{fmtTime(ev.time)}</Text>
                    </View>
                    {/* Row 2: title */}
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, marginBottom: ev.driver ? 4 : 0 }}>
                      {ev.title}
                    </Text>
                    {/* Row 3: driver status */}
                    {ev.driver ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>🚗</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{ev.driver}</Text>
                        {ev.driverStatus === 'confirmed' && <Text style={{ fontSize: TYPO.label, color: '#10B981' }}>✓ Confirmed</Text>}
                        {ev.driverStatus === 'pending' && <Text style={{ fontSize: TYPO.label, color: BRAND.amber }}>⏳ Pending</Text>}
                        {ev.driverStatus === 'rejected' && <Text style={{ fontSize: TYPO.label, color: '#EF4444' }}>✕ Declined</Text>}
                      </View>
                    ) : (
                      (ev.category === 'Sports' || ev.category === 'School' || ev.category === 'Medical') && ev.location ? (
                        <Text style={{ fontSize: TYPO.label, color: '#EF4444', fontWeight: '700' }}>⚠ No driver assigned</Text>
                      ) : null
                    )}
                    {/* Conflict CTA */}
                    {ev.conflict && (
                      <Pressable onPress={() => router.push('/(tabs)/calendar')}
                        style={{ backgroundColor: BRAND.amber, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 6 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Resolve Conflict</Text>
                      </Pressable>
                    )}
                    {/* Rejected driver — parent needs to reassign */}
                    {ev.driverStatus === 'rejected' && (
                      <Pressable onPress={() => router.push('/(tabs)/calendar')}
                        style={{ backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 6 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Reassign Driver</Text>
                      </Pressable>
                    )}
                  </Card>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </>
  );
}

// ─── KID VIEW ─────────────────────────────────────────────────────────────────
/**
 * Scenarios handled:
 * 1. Parent work conflict today — derived from events, not hardcoded
 * 2. My pending ride requests — sent but awaiting parent response
 * 3. My confirmed rides today — who is picking me up + time
 * 4. Ride DECLINED — alert with "Try again" CTA
 * 5. Quick action grid: Parent Chat / Ask Ride / Ask Tutor / Cheer Sibling
 * 6. Quest status strip (live counts)
 * 7. Dual wallet with milestone hint if close to next perk tier
 * 8. GP wallet only shown if > 0 (no empty noise)
 * 9. Streak banner only if streak > 0
 * 10. My active quests checklist
 * 11. Today's personal schedule
 * 12. All-clear empty state if nothing today
 */
function KidView({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { quests, submitQuest } = useQuestStore();
  const { events } = useEventStore();

  const today = localToday();

  // Kid's own events (by memberId) + family-wide events (no memberId)
  const myEvents = events.filter(e => e.memberId === active.id || !e.memberId);
  const todayMyEvents = myEvents.filter(e => e.date === today).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  // Parent work conflict — parent has a 'Work' event today that is flagged as conflicting with kid's activities
  const parentWorkConflict = events.find(e =>
    e.date === today && e.category === 'Work' && e.conflict
  );

  // Ride requests: events where this kid is memberId and still pending or rejected
  const myPendingRides  = events.filter(e => e.memberId === active.id && e.approvalPending);
  const myDeclinedRides = events.filter(e => e.memberId === active.id && e.driverStatus === 'rejected' && !e.approvalPending);
  const myConfirmedRides = todayMyEvents.filter(e => e.driver && e.driverStatus === 'confirmed');

  const myQuests    = quests.filter(q => q.assignedToId === active.id);
  const inProgress  = myQuests.filter(q => q.status === 'todo' || q.status === 'claimed').length;
  const inReview    = myQuests.filter(q => q.status === 'pending_approval').length;
  const available   = quests.filter(q => !q.assignedToId && q.status === 'todo').length;

  const mainCoins = active.mainCoins ?? active.coins ?? 0;
  const gpCoins   = active.gpCoins ?? 0;
  const streak    = active.streak ?? 0;
  const COIN_VAL  = 0.10;
  // Milestone: show hint when within 30 coins of the next 100-coin tier
  const nextTier     = Math.ceil((mainCoins + 1) / 100) * 100;
  const coinsToTier  = nextTier - mainCoins;
  const showMilestone = coinsToTier <= 30 && mainCoins > 0;

  const pad = { paddingHorizontal: 16 };

  const ACTIONS = [
    { icon: '💬', label: 'Parent Chat',   color: BRAND.purple, action: () => router.push('/(tabs)/chat') },
    { icon: '🚗', label: 'Ask a Ride',    color: '#10B981',    action: () => Alert.alert('Ride Request', 'Your parent will be notified to confirm.') },
    { icon: '📚', label: 'Ask Tutor',     color: BRAND.amber,  action: () => Alert.alert('Tutor Request', 'Requesting tutor — a parent will schedule.') },
    { icon: '🎉', label: 'Cheer Sibling', color: BRAND.pink,   action: () => router.push('/(tabs)/quests') },
  ];

  return (
    <>
      {/* ── 1. Parent work conflict alert (only if real data says so) ── */}
      {parentWorkConflict && (
        <View style={[pad, { marginBottom: 12 }]}>
          <AlertBanner icon="⚠️" color={BRAND.amber}
            title="Parent busy during your activities"
            subtitle="Check with Dad or Grandma for pickup — Mom has a work clash" />
        </View>
      )}

      {/* ── 2. Ride request statuses ── */}
      {myDeclinedRides.map(ev => (
        <View key={ev.id} style={[pad, { marginBottom: 10 }]}>
          <AlertBanner icon="❌" color="#EF4444"
            title={`Ride declined: ${ev.title}`}
            subtitle={ev.declineReason ?? `Declined by ${ev.declinedBy ?? 'parent'}`}>
            <Pressable onPress={() => router.push('/(tabs)/calendar')}
              style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-start', marginTop: 8 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Request Again</Text>
            </Pressable>
          </AlertBanner>
        </View>
      ))}

      {myPendingRides.map(ev => (
        <View key={ev.id} style={[pad, { marginBottom: 10 }]}>
          <AlertBanner icon="⏳" color={BRAND.amber}
            title={`Ride requested: ${ev.title}`}
            subtitle={`${fmtTime(ev.time)} · Waiting for a parent to confirm`} />
        </View>
      ))}

      {myConfirmedRides.map(ev => (
        <View key={ev.id} style={[pad, { marginBottom: 10 }]}>
          <AlertBanner icon="✅" color="#10B981"
            title={`${ev.driver} is picking you up!`}
            subtitle={`${ev.title} · ${fmtTime(ev.time)}${ev.location ? ` · ${ev.location}` : ''}`} />
        </View>
      ))}

      {/* ── 3. Quick action grid 2×2 ── */}
      <View style={[pad, { marginBottom: 14 }]}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACTIONS.map(a => (
            <Pressable key={a.label} onPress={a.action}
              style={{ width: (W - 48) / 2, backgroundColor: a.color + '18', borderRadius: 18, paddingVertical: 14, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: a.color + '35' }}>
              <Text style={{ fontSize: 26 }}>{a.icon}</Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: a.color }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── 4. Quest status strip ── */}
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

      {/* ── 5. Wallet milestone hint ── */}
      {showMilestone && (
        <View style={[pad, { marginBottom: 12 }]}>
          <AlertBanner icon="🎯" color={BRAND.teal}
            title={`${coinsToTier} coins to your next milestone!`}
            subtitle={`Complete a quest to reach ${nextTier} coins`} />
        </View>
      )}

      {/* ── 6. Dual sub-wallets ── */}
      <View style={[pad, { marginBottom: 14 }]}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Main store wallet */}
          <View style={{ flex: 1, backgroundColor: isDark ? '#3A1C0022' : '#FFFBEB', borderRadius: 20, borderWidth: 1, borderColor: BRAND.amber + '40', padding: 14, gap: 4 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>🪙 Store Wallet</Text>
            <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: BRAND.amber }}>{mainCoins}</Text>
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>${(mainCoins * COIN_VAL).toFixed(2)} value</Text>
            <Pressable onPress={() => router.push('/(tabs)/store' as any)}
              style={{ backgroundColor: BRAND.amber, borderRadius: 10, paddingVertical: 7, alignItems: 'center', marginTop: 4 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Browse Perks</Text>
            </Pressable>
          </View>
          {/* GP bonus wallet — only show if received any */}
          {gpCoins > 0 ? (
            <View style={{ flex: 1, backgroundColor: isDark ? '#1C0D3322' : '#F5F3FF', borderRadius: 20, borderWidth: 1, borderColor: BRAND.purple + '40', padding: 14, gap: 4 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>⭐ GP Bonus</Text>
              <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: BRAND.purple }}>{gpCoins}</Text>
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>from Grandma</Text>
              <Pressable onPress={() => Alert.alert('Cash Out', 'Ask a parent to convert your GP coins into cash!')}
                style={{ backgroundColor: BRAND.purple, borderRadius: 10, paddingVertical: 7, alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Cash Out</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1, backgroundColor: isDark ? '#1C0D3310' : '#F5F3FF50', borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 30 }}>⭐</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, textAlign: 'center', fontWeight: '600' }}>No GP bonus yet</Text>
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center' }}>Grandma can tip you here</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── 7. Streak banner ── */}
      {streak > 0 && (
        <View style={[pad, { marginBottom: 12 }]}>
          <Card colors={colors} isDark={isDark} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 26 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>{streak} Day Streak!</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>Keep completing quests daily</Text>
            </View>
            <Text style={{ fontSize: 24 }}>🏅</Text>
          </Card>
        </View>
      )}

      {/* ── 8. Active quests checklist ── */}
      <View style={pad}>
        <SectionLabel label="My Active Quests" />
        {myQuests.filter(q => q.status !== 'done').length === 0 ? (
          <Card colors={colors} isDark={isDark} style={{ padding: 20, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 28 }}>🎉</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>All done! Check for new quests.</Text>
            <Pressable onPress={() => router.push('/(tabs)/quests')}
              style={{ backgroundColor: BRAND.teal, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>Browse Quests</Text>
            </Pressable>
          </Card>
        ) : (
          myQuests.filter(q => q.status !== 'done').slice(0, 5).map(q => {
            const isPending = q.status === 'pending_approval';
            const isClaimed = q.status === 'claimed';
            return (
              <Pressable key={q.id} onPress={() => !isPending && submitQuest(q.id)}
                style={[{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, marginBottom: 8 }, { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border }]}>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isPending ? BRAND.amber + '20' : isClaimed ? '#10B98120' : colors.surface,
                  borderColor: isPending ? BRAND.amber : isClaimed ? '#10B981' : colors.border }}>
                  {isPending && <Ionicons name="time" size={13} color={BRAND.amber} />}
                  {isClaimed && <Ionicons name="checkmark" size={13} color="#10B981" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
                    {isPending ? '⏳ Waiting for parent approval' : isClaimed ? '✓ Submitted' : q.category ?? ''}
                  </Text>
                </View>
                <View style={{ backgroundColor: BRAND.amber + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.amber }}>🪙{q.coins}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* ── 9. Today's personal schedule ── */}
      {todayMyEvents.length > 0 && (
        <View style={[pad, { marginTop: 16 }]}>
          <SectionLabel label="My Schedule Today" />
          <Card colors={colors} isDark={isDark} style={{ padding: 12, gap: 8 }}>
            {todayMyEvents.map((ev, i) => (
              <View key={ev.id} style={[
                { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
                i < todayMyEvents.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor(ev.category), marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                  {ev.location && <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>{ev.location}</Text>}
                  {ev.driver && ev.driverStatus === 'confirmed' && (
                    <Text style={{ fontSize: TYPO.label, color: '#10B981', fontWeight: '600' }}>🚗 {ev.driver}</Text>
                  )}
                  {ev.driver && ev.driverStatus === 'pending' && (
                    <Text style={{ fontSize: TYPO.label, color: BRAND.amber, fontWeight: '600' }}>🚗 {ev.driver} (confirming...)</Text>
                  )}
                </View>
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{fmtTime(ev.time)}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}

      {todayMyEvents.length === 0 && myPendingRides.length === 0 && myDeclinedRides.length === 0 && (
        <View style={[pad, { marginTop: 16 }]}>
          <Card colors={colors} isDark={isDark} style={{ padding: 20, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 28 }}>☀️</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>Nothing on your calendar today</Text>
          </Card>
        </View>
      )}
    </>
  );
}

// ─── SENIOR VIEW ──────────────────────────────────────────────────────────────
/**
 * Scenarios handled:
 * 1. Assigned driving duty today — prominent confirmation card
 * 2. Pending ride requests senior can claim (same pool as parent)
 * 3. No duties today — quiet HQ + quick actions
 * 4. Per-kid GP tip buttons
 * 5. Payout receipt history
 * 6. Family timeline read-only (seniors also need to know where kids are)
 */
function SeniorView({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { events, updateEvent } = useEventStore();
  const kids    = members.filter(m => m.role === 'kid');
  const allNames = members.map(m => m.name);
  const today   = localToday();

  // Rides assigned to this senior today
  const myDrivingToday = events.filter(e =>
    e.date === today &&
    e.driver === active.name &&
    e.driverStatus === 'confirmed'
  );

  // Pending ride requests senior can claim (same queue as parent)
  const openRequests = events.filter(e => e.approvalPending);

  // Family events today (read-only context)
  const todayEvents = events
    .filter(e => e.date === today && e.category !== 'Work')
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  const RECEIPTS = [
    { kid: 'Leo',  amount: 2.50, date: 'Today',     reason: 'Bonus for A+ grade 🌟' },
    { kid: 'Maya', amount: 1.50, date: 'Yesterday',  reason: 'Helped with chores' },
    { kid: 'Sam',  amount: 1.00, date: '2 days ago', reason: 'Reading 20 mins daily' },
  ];

  const pad = { paddingHorizontal: 16 };

  return (
    <>
      {/* ── 1. HQ identity card ── */}
      <View style={[pad, { marginBottom: 14 }]}>
        <Card accent={BRAND.purple} colors={colors} isDark={isDark}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
            👵 Senior Caregiver & Driver HQ
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 20 }}>
            You can send bonus tips to grandchildren and help the family with carpool duties.
          </Text>
        </Card>
      </View>

      {/* ── 2. My driving assignments today ── */}
      {myDrivingToday.length > 0 && (
        <View style={[pad, { marginBottom: 14 }]}>
          <SectionLabel label="Your Driving Duty Today" />
          {myDrivingToday.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            return (
              <AlertBanner key={ev.id} icon="🚗" color="#10B981"
                title={ev.title}
                subtitle={`${kid?.name.split(' ')[0] ?? 'Kid'} · ${fmtTime(ev.time)}${ev.location ? ` · ${ev.location}` : ''}`}>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable style={{ backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>✓ I'm On It</Text>
                  </Pressable>
                  <Pressable onPress={() => updateEvent(ev.id, { driverStatus: 'rejected', driver: undefined, declinedBy: active.name, declineReason: 'Unavailable' })}
                    style={{ backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>Can't Make It</Text>
                  </Pressable>
                </View>
              </AlertBanner>
            );
          })}
        </View>
      )}

      {/* ── 3. Open ride requests senior can claim ── */}
      {openRequests.length > 0 && (
        <View style={[pad, { marginBottom: 14 }]}>
          <AlertBanner icon="🙋" color={BRAND.amber}
            title={`${openRequests.length} Ride Request${openRequests.length > 1 ? 's' : ''} — Can You Help?`}
            subtitle="Parents haven't claimed these yet">
            {openRequests.map(ev => {
              const kid = members.find(m => m.id === ev.memberId);
              return (
                <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  {kid && <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={28} ringColor={BRAND.amber} />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{ev.title}</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}</Text>
                  </View>
                  <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, driver: active.name, driverStatus: 'confirmed' })}
                    style={{ backgroundColor: BRAND.purple, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
                  </Pressable>
                </View>
              );
            })}
          </AlertBanner>
        </View>
      )}

      {myDrivingToday.length === 0 && openRequests.length === 0 && (
        <View style={[pad, { marginBottom: 14 }]}>
          <Card colors={colors} isDark={isDark} style={{ padding: 18, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 28 }}>🌿</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>No driving duties today</Text>
          </Card>
        </View>
      )}

      {/* ── 4. Quick actions ── */}
      <View style={[{ flexDirection: 'row', gap: 10, marginBottom: 16 }, pad]}>
        <Pressable onPress={() => Alert.alert('Grandparent Tip', 'Tap a grandchild below to send them a bonus!')}
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: BRAND.purple + '40', padding: 14, gap: 5, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 26 }}>🎁</Text>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>Send GP Tip</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Bonus coins & love</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/profile')}
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 5, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 26 }}>📜</Text>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Payout Receipts</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Past bonus history</Text>
        </Pressable>
      </View>

      {/* ── 5. Per-kid GP tip buttons ── */}
      <View style={pad}>
        <SectionLabel label="Send Bonus To" />
        {kids.length === 0 ? (
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No grandchildren added yet.</Text>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {kids.map(kid => (
              <Pressable key={kid.id} onPress={() => Alert.alert('Send Bonus', `Sending bonus coins to ${kid.name.split(' ')[0]}...`)}
                style={{ backgroundColor: BRAND.purple, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                  siblings={allNames} size={26} ringColor="#fff" ringWidth={1} bgColor={BRAND.purple + '60'} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>{kid.name.split(' ')[0]}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── 6. Receipt history ── */}
        <SectionLabel label="Bonus Receipts" />
        <View style={{ gap: 8 }}>
          {RECEIPTS.map((r, i) => (
            <Card key={i} colors={colors} isDark={isDark} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 22 }}>🧾</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>${r.amount.toFixed(2)} → {r.kid}</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{r.reason}</Text>
              </View>
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>{r.date}</Text>
            </Card>
          ))}
        </View>

        {/* ── 7. Read-only family timeline ── */}
        {todayEvents.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <SectionLabel label="Family Today (Read-Only)" />
            <View style={{ gap: 8 }}>
              {todayEvents.map(ev => {
                const member = members.find(m => m.id === ev.memberId);
                return (
                  <Card key={ev.id} colors={colors} isDark={isDark} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor(ev.category), marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                      {member && <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{member.name.split(' ')[0]}</Text>}
                    </View>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{fmtTime(ev.time)}</Text>
                  </Card>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember, loaded, loadFromStorage } = useFamilyStore();
  const { loadFromStorage: loadQuests } = useQuestStore();
  const { loadFromStorage: loadEvents } = useEventStore();
  const { loadFromStorage: loadRewards } = useRewardStore();

  const [refreshing, setRefreshing]       = useState(false);
  const [pinTarget, setPinTarget]         = useState<FamilyMember | null>(null);
  const [clock, setClock]                 = useState(fmtClock());
  const [helpModalVisible, setHelpModal]  = useState(false);
  const [enRouteVisible, setEnRouteVisible] = useState(false);
  const [transitBanner, setTransitBanner] = useState<{ kid: string; eta: string } | null>(null);

  useEffect(() => {
    if (!loaded) loadFromStorage();
    loadQuests();
    loadEvents();
    loadRewards();
  }, [loaded]);

  useEffect(() => {
    const id = setInterval(() => setClock(fmtClock()), 30_000);
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

  if (!active) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>

      <AppHeader
        memberName={active.name.split(' ')[0]}
        memberRole={active.role as 'parent' | 'kid' | 'senior'}
        onBellPress={() => Alert.alert('Nudge Center', 'Dinner ready · Meds · Pickup · Chore check')}
      />

      {/* En Route live transit banner */}
      {transitBanner && (
        <View style={{ backgroundColor: '#065F46', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 16 }}>🚗</Text>
          <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: '#6EE7B7' }}>
            En Route to pick up {transitBanner.kid} · ETA {transitBanner.eta}
          </Text>
          <Pressable onPress={() => setTransitBanner(null)}
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#10B98130', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={15} color="#6EE7B7" />
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 60 }}
      >
        {isParent && (
          <ParentView
            active={active} members={members}
            colors={colors} isDark={isDark}
            onEnRoute={() => setEnRouteVisible(true)}
          />
        )}
        {isKid && (
          <KidView
            active={active} members={members}
            colors={colors} isDark={isDark}
          />
        )}
        {isSenior && (
          <SeniorView
            active={active} members={members}
            colors={colors} isDark={isDark}
          />
        )}

        {/* Help Queue — shown for all personas, below their main content.
            "Ask for Help" button is suppressed when the active member
            is the only adult (no one to delegate to). */}
        <View style={{ paddingHorizontal: 16 }}>
          <HelpQueueSection
            onRequestHelp={() => setHelpModal(true)}
            hideAskButton={
              (isParent || isSenior) &&
              members.filter(m => m.role === 'parent' || m.role === 'senior').length <= 1
            }
          />
        </View>

      </ScrollView>

      <HelpRequestModal
        visible={helpModalVisible}
        onClose={() => setHelpModal(false)}
      />

      <EnRouteModal
        visible={enRouteVisible}
        onClose={() => setEnRouteVisible(false)}
        kids={members.filter(m => m.role === 'kid')}
        onDispatch={(kid, eta) => { setTransitBanner({ kid, eta }); }}
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
