import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/questStore';
import { useEventStore } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';

// ─── MemberPill ───────────────────────────────────────────────────────────────

function MemberPill({ member, colors, onPress }: {
  member?: FamilyMember; colors: any; onPress: () => void;
}) {
  if (!member) return null;
  const roleLabel = member.role === 'parent' ? 'PARENT MODE' : member.role === 'kid' ? 'KID HQ' : 'SENIOR CAREGIVER';
  const roleColor = member.role === 'parent' ? colors.teal : member.role === 'kid' ? colors.amber : colors.primary;
  return (
    <Pressable onPress={onPress} style={[s.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.pillAvatar, { backgroundColor: colors.primary + '30' }]}>
        <Text style={{ fontSize: 14 }}>{member.emoji ?? '👤'}</Text>
      </View>
      <View>
        <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textPrimary, maxWidth: 90 }} numberOfLines={1}>
          {member.name}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '800', color: roleColor }}>{roleLabel}</Text>
      </View>
      <Ionicons name="chevron-down" size={12} color={colors.textTertiary} />
    </Pressable>
  );
}

// ─── ActionBar ────────────────────────────────────────────────────────────────

function ActionBar({ colors, isDark, onQuest, onEvent }: {
  colors: any; isDark: boolean; onQuest: () => void; onEvent: () => void;
}) {
  return (
    <View style={[s.glassCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row', gap: 6 }]}>
      <Pressable style={[s.actionBtn, { flex: 1, backgroundColor: colors.primary }]}>
        <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>✨ Scan Flyer</Text>
      </Pressable>
      <Pressable onPress={onQuest} style={[s.actionBtn, { flex: 1, backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary }}>➕ Quest</Text>
      </Pressable>
      <Pressable onPress={onEvent} style={[s.actionBtn, { flex: 1, backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary }}>📅 Event</Text>
      </Pressable>
    </View>
  );
}

// ─── KidRequestBanner ────────────────────────────────────────────────────────

function KidRequestBanner({ events, colors, onApprove }: {
  events: { id: string; title: string; time?: string; category?: string }[];
  colors: any; onApprove: (id: string) => void;
}) {
  if (events.length === 0) return null;
  return (
    <View style={[s.amberBanner, { borderColor: colors.amber + '80' }]}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amber }}>🙋 Kid Schedule / Tutor Request</Text>
        <View style={s.needsBadge}><Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>Needs Approval</Text></View>
      </View>
      {events.map(ev => (
        <View key={ev.id} style={s.amberRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }} numberOfLines={1}>{ev.title}</Text>
            <Text style={{ fontSize: 10, color: colors.amber + 'DD' }}>Time: {ev.time ?? ''} ({ev.category ?? ''})</Text>
          </View>
          <Pressable onPress={() => onApprove(ev.id)} style={s.claimBtn}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#000' }}>✓ Claim Duty</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// ─── WalletCard ───────────────────────────────────────────────────────────────

function WalletCard({ kids, colors }: { kids: FamilyMember[]; colors: any }) {
  return (
    <View style={[s.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[s.row, { justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border, paddingBottom: 8, marginBottom: 8 }]}>
        <View style={s.row}>
          <Ionicons name="wallet" size={14} color={colors.teal} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginLeft: 6 }}>Family Wallet Balances</Text>
        </View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>Full Ledger →</Text>
      </View>
      {kids.slice(0, 3).map(k => (
        <View key={k.id} style={[s.walletRow, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 6 }]}>
          <View style={s.row}>
            <Text style={{ fontSize: 14, marginRight: 6 }}>{k.emoji ?? '👦'}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>{k.name.split(' ')[0]}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: colors.amber }}>
              Store Wallet: {(k as any).mainCoins ?? 0}🪙 (${(((k as any).mainCoins ?? 0) * 0.1).toFixed(2)})
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>
              GP Gift Bonus: {(k as any).gpCoins ?? 0}🪙 (${(((k as any).gpCoins ?? 0) * 0.1).toFixed(2)})
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── EnRouteLauncher ─────────────────────────────────────────────────────────

function EnRouteLauncher({ colors }: { colors: any }) {
  return (
    <View style={[s.enRouteBanner, { borderColor: colors.teal + '60' }]}>
      <View style={s.row}>
        <View style={[s.enRouteIcon, { backgroundColor: colors.teal + '30' }]}>
          <Ionicons name="navigate" size={18} color={colors.teal} />
        </View>
        <View style={{ marginLeft: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.teal }}>Start Pickup / Trip</Text>
          <Text style={{ fontSize: 10, color: colors.teal + 'AA' }}>Tap to alert kids you are en route with ETA</Text>
        </View>
      </View>
      <Pressable onPress={() => Alert.alert('En Route', 'En Route Alert dispatched!')}
        style={[s.enRouteBtn, { backgroundColor: colors.teal }]}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>En Route</Text>
      </Pressable>
    </View>
  );
}

// ─── ReviewBanner ─────────────────────────────────────────────────────────────

function ReviewBanner({ count, colors }: { count: number; colors: any }) {
  if (count === 0) return null;
  return (
    <View style={[s.reviewBanner, { borderColor: colors.teal + '50' }]}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
        <Text style={{ fontSize: 10, fontWeight: '900', color: colors.teal, letterSpacing: 0.5 }}>
          ACTION CENTER: APPROVALS
        </Text>
        <View style={s.needsBadge}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{count} Awaiting Clearance</Text>
        </View>
      </View>
      <View style={s.reviewRow}>
        <View style={[s.reviewThumb, { backgroundColor: colors.border }]}>
          <Text style={{ fontSize: 18 }}>🧹</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Leo submitted:</Text>
          <Text style={{ fontSize: 11, color: colors.teal }}>Clean Backyard Patio</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.amber }}>+35 🪙 ($3.50)</Text>
        </View>
        <Pressable onPress={() => Alert.alert('Approved!', 'Quest approved & coins paid')}
          style={[s.payBtn, { backgroundColor: '#fff' }]}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: '#065F46' }}>✓ Pay 35🪙</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── TodayTimeline ────────────────────────────────────────────────────────────

function TodayTimeline({ events, colors }: {
  events: { id: string; title: string; time?: string; conflict?: boolean; driver?: string }[];
  colors: any;
}) {
  return (
    <View style={[s.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[s.row, { justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border, paddingBottom: 8, marginBottom: 8 }]}>
        <View style={s.row}>
          <Ionicons name="time-outline" size={14} color={colors.primary} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginLeft: 6 }}>Today's Family Timeline</Text>
        </View>
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Full Timeline →</Text>
      </View>
      {events.map(ev => (
        <View key={ev.id} style={[s.timelineRow, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 6 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, marginRight: 6 }}>{ev.time}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, flex: 1 }} numberOfLines={1}>
              {ev.title}
            </Text>
          </View>
          <View style={[s.driverTag, { backgroundColor: ev.conflict ? colors.amber + '25' : colors.border }]}>
            <Text style={{ fontSize: 10, fontWeight: ev.conflict ? '800' : '500',
              color: ev.conflict ? colors.amber : colors.textTertiary }}>
              {ev.driver ?? 'No Driver'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Parent Hub View ──────────────────────────────────────────────────────────

function ParentHubView({ members, colors, isDark }: { members: FamilyMember[]; colors: any; isDark: boolean }) {
  const { quests } = useQuestStore();
  const { events } = useEventStore();
  const kids = members.filter(m => m.role === 'kid');
  const pendingReviews = quests.filter(q => q.status === 'pending_approval');
  const today = new Date().toISOString().split('T')[0];
  const todayEvents = events.filter(e => e.date === today && e.category !== 'Work');
  const pendingKidReqs = events.filter(e => e.approvalPending);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 40 }}>
      <ActionBar colors={colors} isDark={isDark} onQuest={() => Alert.alert('New Quest')} onEvent={() => Alert.alert('New Event')} />

      <KidRequestBanner
        events={pendingKidReqs.map(e => ({ id: e.id, title: e.title, time: e.time, category: e.category }))}
        colors={colors}
        onApprove={id => Alert.alert('Approved', `Event ${id} approved`)}
      />

      <WalletCard kids={kids} colors={colors} />

      <EnRouteLauncher colors={colors} />

      <ReviewBanner count={pendingReviews.length} colors={colors} />

      {todayEvents.length > 0 && (
        <TodayTimeline
          events={todayEvents.map(e => ({ id: e.id, title: e.title, time: e.time, conflict: e.conflict, driver: e.driver }))}
          colors={colors}
        />
      )}
    </ScrollView>
  );
}

// ─── Quick Action Grid (Kid) ──────────────────────────────────────────────────

function QuickGrid({ colors }: { colors: any }) {
  const ACTIONS = [
    { emoji: '💬', label: 'Parent Chat' },
    { emoji: '🚗', label: 'Ask Ride' },
    { emoji: '🎒', label: 'Ask Tutor' },
    { emoji: '✋', label: 'Cheer' },
  ];
  return (
    <View style={[s.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[s.row, { marginBottom: 10 }]}>
        <Ionicons name="flash" size={14} color={colors.amber} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginLeft: 6 }}>Quick Actions</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {ACTIONS.map(a => (
          <Pressable key={a.label} onPress={() => Alert.alert(a.label)}
            style={[s.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 18 }}>{a.emoji}</Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary, marginTop: 4, textAlign: 'center' }}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Stat Tiles (Kid) ────────────────────────────────────────────────────────

function StatTiles({ inProgress, pendingReview, openBounties, colors }: {
  inProgress: number; pendingReview: number; openBounties: number; colors: any;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={[s.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ fontSize: 9, color: colors.textTertiary, fontWeight: '800' }}>IN PROGRESS</Text>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.amber }}>{inProgress} Tasks</Text>
      </View>
      <View style={[s.statTile, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
        <Text style={{ fontSize: 9, color: colors.primary, fontWeight: '800' }}>PENDING REVIEW</Text>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.primary }}>{pendingReview} Waiting</Text>
      </View>
      <View style={[s.statTile, { backgroundColor: colors.teal + '18', borderColor: colors.teal + '40' }]}>
        <Text style={{ fontSize: 9, color: colors.teal, fontWeight: '800' }}>OPEN BOUNTIES</Text>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.teal }}>{openBounties} Claim</Text>
      </View>
    </View>
  );
}

// ─── Kid Hub View ─────────────────────────────────────────────────────────────

function KidHubView({ activeMember, colors }: { activeMember: FamilyMember; colors: any }) {
  const { quests } = useQuestStore();
  const { events } = useEventStore();
  const today = new Date().toISOString().split('T')[0];
  const myQuests = quests.filter(q => q.assignedToId === activeMember.id);
  const inProgress   = myQuests.filter(q => q.status === 'todo' || q.status === 'claimed').length;
  const pendingReview = myQuests.filter(q => q.status === 'pending_approval').length;
  const openBounties  = quests.filter(q => !q.assignedToId && q.status === 'todo').length;
  const todayEvents   = events.filter(e => e.date === today && (e.memberId === activeMember.id || !e.memberId));
  const parentConflicts = events.filter(e => e.date === today && e.conflict && !e.approvalPending);
  const mem = activeMember as any;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 40 }}>
      {parentConflicts.length > 0 && (
        <View style={[s.amberBanner, { borderColor: colors.amber + '80' }]}>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amber }}>⚠️ Parent Schedule Conflict Alert</Text>
            <View style={s.needsBadge}><Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>Parent Busy</Text></View>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.amber + 'DD' }}>
            Mom has a work call during afternoon activities. Dad or Grandma is covering pickups!
          </Text>
        </View>
      )}

      <QuickGrid colors={colors} />

      <StatTiles inProgress={inProgress} pendingReview={pendingReview} openBounties={openBounties} colors={colors} />

      <View style={[s.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[s.row, { justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border, paddingBottom: 8, marginBottom: 8 }]}>
          <View style={s.row}>
            <Ionicons name="calendar" size={14} color={colors.primary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginLeft: 6 }}>My Today's Schedule Glance</Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>Full Schedule →</Text>
        </View>
        {todayEvents.length === 0 ? (
          <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center', paddingVertical: 8 }}>
            No personal events scheduled today.
          </Text>
        ) : todayEvents.map(e => (
          <View key={e.id} style={[s.timelineRow, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 6 }]}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, flex: 1 }} numberOfLines={1}>
              {e.time}: {e.title}
            </Text>
            <View style={[s.driverTag, { backgroundColor: colors.border }]}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary }}>{e.driver ?? 'Scheduled'}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[s.glassCard, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '800' }}>MAIN STORE WALLET</Text>
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.amber, marginTop: 2 }}>{mem.mainCoins ?? 0} Coins</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Used in Perks Store</Text>
        </View>
        <View style={[s.glassCard, { flex: 1, backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
          <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '800' }}>GRANDPARENT BONUS</Text>
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.primary, marginTop: 2 }}>{mem.gpCoins ?? 0} Coins</Text>
          <Pressable onPress={() => Alert.alert('Cash Out', 'Request sent to parents')}
            style={[s.gpCashBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>💰 Cash Out From Parents</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Senior Hub View ──────────────────────────────────────────────────────────

function SeniorHubView({ colors }: { colors: any }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 40 }}>
      <View style={[s.glassCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, marginBottom: 6 }}>
          👵 Senior Caregiver &amp; Driver HQ
        </Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Grandparents have exclusive rights to send bonus tips into the Grandparent Sub-Wallet.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => Alert.alert('Grandparent Tip')}
          style={[s.glassCard, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 24, marginBottom: 4 }}>🎁</Text>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>Grandparent Tip</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>Send bonus coins &amp; love</Text>
        </Pressable>
        <Pressable onPress={() => Alert.alert('Payout Receipts')}
          style={[s.glassCard, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 24, marginBottom: 4 }}>📜</Text>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>Payout Receipts</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>View confirmed receipts</Text>
        </Pressable>
      </View>

      <EnRouteLauncher colors={colors} />
    </ScrollView>
  );
}

// ─── HubScreen ────────────────────────────────────────────────────────────────

export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const [showSwitcher, setShowSwitcher] = useState(false);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  const isKid    = activeMember?.role === 'kid';
  const bg       = isDark ? '#0B0F1A' : colors.background;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top']}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={s.row}>
          <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textPrimary, marginRight: 6 }}>
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <View style={[s.cubeBadge, { backgroundColor: colors.primary + '25', borderColor: colors.primary + '50' }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal, marginRight: 4 }} />
            <Text style={{ fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 0.8 }}>CUBE OS</Text>
          </View>
        </View>

        <MemberPill member={activeMember} colors={colors} onPress={() => setShowSwitcher(true)} />

        <Pressable style={[s.bellBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => Alert.alert('Nudge Center')}>
          <Ionicons name="notifications" size={16} color={colors.textSecondary} />
          <View style={[s.bellDot, { backgroundColor: colors.danger }]} />
        </Pressable>
      </View>

      {/* ── Content ── */}
      {isParent && <ParentHubView members={members} colors={colors} isDark={isDark} />}
      {isKid    && <KidHubView activeMember={activeMember!} colors={colors} />}
      {!isParent && !isKid && <SeniorHubView colors={colors} />}

      {/* ── Member Switcher Sheet ── */}
      {showSwitcher && (
        <Pressable style={s.overlay} onPress={() => setShowSwitcher(false)}>
          <Pressable style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={e => e.stopPropagation()}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>Switch Active Profile</Text>
              <Pressable onPress={() => setShowSwitcher(false)}>
                <Ionicons name="close" size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {[
                { label: 'Parents (Executive Approvers & Drivers)', role: 'parent', ringColor: colors.teal },
                { label: 'Kids (Quest HQ)', role: 'kid', ringColor: colors.amber },
                { label: 'Grandparents / Seniors', role: 'senior', ringColor: colors.primary },
              ].map(group => (
                <View key={group.role}>
                  <Text style={[s.groupLabel, { color: colors.textTertiary }]}>{group.label.toUpperCase()}</Text>
                  {members.filter(m => m.role === group.role).map(m => (
                    <Pressable key={m.id} onPress={() => setShowSwitcher(false)}
                      style={[s.memberRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[s.avatarCircle, { borderColor: group.ringColor, backgroundColor: colors.card }]}>
                        <Text style={{ fontSize: 18 }}>{m.emoji ?? '👤'}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
                        <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                          {m.role === 'parent' ? 'Approvals, Driver & Cash' : m.role === 'kid' ? `Age ${(m as any).age ?? ''}` : 'Grandparent'}
                        </Text>
                      </View>
                      <View style={[s.roleBadge, { backgroundColor: group.ringColor + '25', borderColor: group.ringColor + '50' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: group.ringColor }}>
                          {m.role === 'parent' ? 'Parent' : m.role === 'kid' ? 'Kid' : 'Senior'}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 14, paddingVertical: 10,
                 borderBottomWidth: StyleSheet.hairlineWidth },
  row:         { flexDirection: 'row', alignItems: 'center' },
  cubeBadge:   { flexDirection: 'row', alignItems: 'center', borderRadius: 99,
                 paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  pill:        { flexDirection: 'row', alignItems: 'center', gap: 6,
                 borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  pillAvatar:  { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bellBtn:     { padding: 8, borderRadius: 18, borderWidth: 1 },
  bellDot:     { position: 'absolute', top: 4, right: 4, width: 9, height: 9, borderRadius: 99 },
  glassCard:   { borderRadius: 20, borderWidth: 1, padding: 14 },
  actionBtn:   { borderRadius: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  amberBanner: { backgroundColor: '#92400E', borderRadius: 20, padding: 14, borderWidth: 1 },
  amberRow:    { backgroundColor: '#0F172A80', borderRadius: 14, padding: 10,
                 flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 borderWidth: 1, borderColor: '#FFFFFF20', marginTop: 6 },
  needsBadge:  { backgroundColor: '#FFFFFF30', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  claimBtn:    { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  walletRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1 },
  enRouteBanner: { backgroundColor: '#064E3B', borderRadius: 20, padding: 14,
                   flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1 },
  enRouteIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  enRouteBtn:  { borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  reviewBanner:{ backgroundColor: '#065F46', borderRadius: 20, padding: 14, borderWidth: 1 },
  reviewRow:   { backgroundColor: '#0F172A40', borderRadius: 14, padding: 10,
                 flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#FFFFFF18' },
  reviewThumb: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  payBtn:      { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1 },
  driverTag:   { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  statTile:    { flex: 1, borderRadius: 16, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  quickBtn:    { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  gpCashBtn:   { marginTop: 6, borderRadius: 8, paddingVertical: 4, alignItems: 'center' },
  overlay:     { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28,
                 borderTopWidth: 1, padding: 20, paddingBottom: 40 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  groupLabel:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.8,
                 paddingHorizontal: 4, paddingTop: 10, paddingBottom: 6 },
  memberRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 16,
                 padding: 10, marginBottom: 8, borderWidth: 1 },
  avatarCircle:{ width: 40, height: 40, borderRadius: 20, borderWidth: 2,
                 alignItems: 'center', justifyContent: 'center' },
  roleBadge:   { borderRadius: 99, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
});
