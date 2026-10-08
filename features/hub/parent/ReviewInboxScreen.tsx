/**
 * ReviewInboxScreen — landing page of high-level review categories.
 *
 * Live direction: "review inbox should contain the high-level cards, land
 * then open those chore box, schedule box ... why are we directly adding
 * the review inbox with real content?" — an earlier pass flattened every
 * pending chore/quest/redemption/kid-request into one combined list on
 * this screen directly. This is now a landing page: one card per category
 * with a live count, each opening that category's own queue (either
 * ReviewCategoryQueueScreen for chores/quests/redemptions, or
 * HelpDispatchQueue for kid requests, which already has its own real
 * decline-reason/helper-assignment UI per request).
 *
 * "Recently decided" stays here as a lightweight glance-back list (not its
 * own category card) since it's read-only history, not something to land
 * on and act within.
 */
import React, { useMemo } from 'react';
import { router } from 'expo-router';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ClipboardCheck, Gift, HelpCircle, ChevronRight, Scale } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore } from '@/store/kidRequestStore';

export type ReviewCategory = 'chores' | 'redemptions' | 'requests' | 'disputes';

function firstName(memberId: string | undefined, members: FamilyMember[]): string {
  if (!memberId) return 'Someone';
  const m = members.find(m => m.id === memberId);
  return m ? (m.name.split(' ')[0] ?? m.name) : 'Someone';
}

function choreTypeLabel(categoryType: string): string {
  switch (categoryType) {
    case 'bounty':            return 'Quest';
    case 'grandparent_quest': return 'GP Quest';
    case 'parent_only_quest': return 'Task';
    case 'shopping':          return 'Shopping';
    default:                  return 'Chore';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending_approval': return 'Awaiting review';
    case 'approved':         return 'Approved';
    case 'auto_approved':    return 'Auto-approved';
    case 'declined':         return 'Declined';
    case 'redo_requested':   return 'Redo requested';
    case 'completed':        return 'Completed';
    default:                 return status;
  }
}

export function ReviewInboxScreen({ onSelectCategory, onClose }: {
  onSelectCategory?: (category: ReviewCategory) => void;
  onClose?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { getParentReviewDeck, chores } = useChoreStore();
  const { members, activeMemberId, familyName } = useFamilyStore();
  const redemptions = useRewardStore(s => s.redemptions);
  const kidRequests = useKidRequestStore(s => s.requests);
  const activeMember = members.find(m => m.id === activeMemberId);
  const insets = useSafeAreaInsets();

  const pendingChoresCount = useMemo(() => getParentReviewDeck().length, [chores]);
  const pendingRedemptionsCount = useMemo(() => redemptions.filter(r => r.status === 'pending').length, [redemptions]);
  const pendingRequestsCount = useMemo(() => kidRequests.filter(r => r.status === 'pending').length, [kidRequests]);
  // Two dispute mechanisms, both previously unreachable from anywhere on
  // the Hub — 'kid_disputed_redo' status (a kid disputing a redo request)
  // and disputeStatus: 'reversal_requested' (one parent asking to reverse
  // another's approval). Folded in as their own category card rather than
  // into "Chores & Quests," since neither is a normal pending-approval
  // item — both need their own dedicated resolution screen
  // (RedoDisputeReviewScreen/ReversalCoSignReviewScreen) via DisputesInboxScreen.
  const pendingDisputesCount = useMemo(() =>
    chores.filter(c => c.status === 'kid_disputed_redo' || c.disputeStatus === 'reversal_requested').length,
  [chores]);
  const totalPending = pendingChoresCount + pendingRedemptionsCount + pendingRequestsCount + pendingDisputesCount;

  const decidedChores = useMemo(() =>
    chores.filter(c =>
      ['approved', 'auto_approved', 'completed', 'declined', 'redo_requested'].includes(c.status)
    ).slice(0, 5),
  [chores]);

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardWhiteBg = isDark ? colors.card : '#FFFFFF';
  const linkBlue = colors.teal;
  const RADIUS = 16;
  const sectionLabel = { fontSize: 11 as const, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.textTertiary };

  const categories: {
    key: ReviewCategory; title: string; subtitle: string; count: number;
    icon: typeof ClipboardCheck; color: string; bg: string;
  }[] = [
    {
      key: 'chores', title: 'Chores & Quests', icon: ClipboardCheck,
      color: colors.teal, bg: colors.tealLight, count: pendingChoresCount,
      subtitle: pendingChoresCount > 0 ? `${pendingChoresCount} waiting on you` : 'All caught up',
    },
    {
      key: 'redemptions', title: 'Rewards', icon: Gift,
      color: colors.amber, bg: colors.amberLight, count: pendingRedemptionsCount,
      subtitle: pendingRedemptionsCount > 0 ? `${pendingRedemptionsCount} waiting on you` : 'All caught up',
    },
    {
      key: 'requests', title: 'Kid requests', icon: HelpCircle,
      color: colors.pink, bg: colors.pinkLight, count: pendingRequestsCount,
      subtitle: pendingRequestsCount > 0 ? `${pendingRequestsCount} waiting on you` : 'All caught up',
    },
    {
      key: 'disputes', title: 'Disputes', icon: Scale,
      color: colors.danger, bg: isDark ? colors.danger + '22' : '#FFE8E3', count: pendingDisputesCount,
      subtitle: pendingDisputesCount > 0 ? `${pendingDisputesCount} need a second look` : 'No open disputes',
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>

      {/* ── Header ── */}
      <View style={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas,
        gap: 8,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary, lineHeight: 15 }}>
            {familyName?.toUpperCase() ?? 'FAMILY SPACE'}
          </Text>
          {activeMember && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>
              {activeMember.name}
            </Text>
          )}
        </View>

        <View style={{ gap: 4 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>← Hub</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
              Review inbox
            </Text>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >

        {totalPending === 0 && (
          <View style={{
            backgroundColor: cardWhiteBg, borderRadius: RADIUS, padding: 16,
            ...Platform.select({
              ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
              android: { elevation: 2 },
            }),
          }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary, lineHeight: 25 }}>
              Nothing pending right now. Check back when the family needs you!
            </Text>
            <Pressable onPress={() => { onClose?.(); router.push('/(tabs)/quests' as any); }} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: linkBlue }}>Go to Quests →</Text>
            </Pressable>
          </View>
        )}

        {/* ── Category landing cards ── */}
        {categories.map(cat => {
          const Icon = cat.icon;
          return (
            <Pressable
              key={cat.key}
              onPress={() => onSelectCategory?.(cat.key)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: cat.bg, borderRadius: RADIUS, padding: 16,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 14, backgroundColor: cardWhiteBg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={22} color={cat.color} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  {cat.title}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 2 }}>
                  {cat.subtitle}
                </Text>
              </View>
              {cat.count > 0 && (
                <View style={{ minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7,
                  backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{cat.count}</Text>
                </View>
              )}
              <ChevronRight size={18} color={colors.textTertiary} />
            </Pressable>
          );
        })}

        {/* ── Recently decided — glance-back history, not a landing card
            (read-only, nothing to act on, so it doesn't need its own
            queue screen the way the pending categories do). ── */}
        {decidedChores.length > 0 && (
          <View style={{
            backgroundColor: cardWhiteBg, borderRadius: RADIUS, padding: 16, gap: 12,
            ...Platform.select({
              ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
              android: { elevation: 2 },
            }),
          }}>
            <Text style={sectionLabel}>RECENTLY DECIDED</Text>
            {decidedChores.map((chore, i) => {
              const assignee = firstName(chore.assignedToId, members);
              const tl = choreTypeLabel(chore.categoryType);
              const sl = statusLabel(chore.status);
              return (
                <View key={chore.id} style={{ gap: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 25 }}>
                    {chore.title}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                    {assignee} · {tl} · {sl}
                  </Text>
                  {i < decidedChores.length - 1 && (
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 10 }} />
                  )}
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
    </View>
  );
}
