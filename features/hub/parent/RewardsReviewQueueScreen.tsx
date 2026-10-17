/**
 * RewardsReviewQueueScreen — the Rewards category's own queue, opened from
 * ReviewInboxScreen's "Rewards" landing card.
 *
 * Pulled out of the generic ReviewCategoryQueueScreen the same way Chores
 * was (see ChoresReviewQueueScreen.tsx's header) so it can own a
 * Pending/Approved/All segmented filter — the generic screen only ever
 * showed pending redemptions with no way to look back at history.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useRewardStore, type Redemption } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';

// Switches from a relative "Xh ago" to the actual date once a request
// crosses a day old — live-requested: "on this Xago if it crosses a day
// then put the actual date". Also guards invalid/missing timestamps
// (redeemedAt can be unset on some rows) which previously produced
// "NaNd ago" instead of blanking out.
function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function RewardsReviewQueueScreen({ onSelectRow, onClose }: {
  onSelectRow: (redemptionId: string) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const redemptions = useRewardStore(s => s.redemptions);
  const rewards = useRewardStore(s => s.rewards);
  const { members } = useFamilyStore();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending');

  const pendingRows = React.useMemo(() =>
    redemptions.filter(r => r.status === 'pending')
      .sort((a, b) => (a.redeemedAt ?? '').localeCompare(b.redeemedAt ?? '')),
    [redemptions]);

  // "Approved" here also covers rejected — both are resolved decisions, the
  // opposite of "pending"; rejections are rare enough not to need their own
  // third tab, and the row detail line already states the outcome.
  const approvedRows = React.useMemo(() =>
    redemptions.filter(r => r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled')
      .sort((a, b) => (b.respondedAt ?? b.redeemedAt ?? '').localeCompare(a.respondedAt ?? a.redeemedAt ?? '')),
    [redemptions]);

  const allRows = React.useMemo(() =>
    [...redemptions].sort((a, b) => (b.redeemedAt ?? '').localeCompare(a.redeemedAt ?? '')),
    [redemptions]);

  const rows: Redemption[] =
    filter === 'pending' ? pendingRows :
    filter === 'approved' ? approvedRows :
    allRows;

  const canvas = isDark ? '#0E0C13' : GEMINI.canvas;
  const cardWhiteBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const linkColor = colors.amber;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas, paddingBottom: 8 }}>
        <PageHeading
          title="Rewards"
          subtitle={pendingRows.length > 0 ? `${pendingRows.length} redemption${pendingRows.length !== 1 ? 's' : ''} waiting on you` : 'No reward requests waiting'}
          onTitlePress={onClose}
          topInset={insets.top}
        />

        <View style={{ marginHorizontal: 20, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, gap: 4 }}>
          {([
            { key: 'pending', label: `Pending · ${pendingRows.length}` },
            { key: 'approved', label: 'Approved' },
            { key: 'all', label: 'All' },
          ] as const).map(seg => {
            const active = filter === seg.key;
            return (
              <Pressable
                key={seg.key}
                onPress={() => setFilter(seg.key)}
                style={{ flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? cardWhiteBg : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontWeight: active ? '700' : '400', color: active ? linkColor : (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
                  {seg.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 12, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{
          backgroundColor: cardWhiteBg, borderRadius: 16, padding: 16, gap: 12,
          ...cardShadow,
        }}>
          {rows.length === 0 ? (
            <Text style={{ fontSize: 15, fontWeight: '500', color: (isDark ? colors.textSecondary : GEMINI.bodyColor), lineHeight: 25 }}>
              {filter === 'pending' ? 'No reward requests waiting.'
                : filter === 'approved' ? 'Nothing decided yet.'
                : 'No redemptions yet.'}
            </Text>
          ) : (
            rows.map((r, i) => {
              const title = r.rewardTitle ?? rewards.find(rw => rw.id === r.rewardId)?.title ?? 'Reward';
              const memberName = r.memberName ?? members.find(m => m.id === r.memberId)?.name?.split(' ')[0] ?? 'Someone';
              const statusLabel =
                r.status === 'pending' ? `redeemed ${relativeTime(r.redeemedAt)}` :
                r.status === 'approved' ? `approved ${relativeTime(r.respondedAt)}` :
                r.status === 'rejected' ? `rejected ${relativeTime(r.respondedAt)}` :
                `cancelled`;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => onSelectRow(r.id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 4 })}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor), lineHeight: 21 }} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: (isDark ? colors.textSecondary : GEMINI.bodyColor), lineHeight: 18 }}>
                    {memberName} · {r.deductedCoins} coins · {statusLabel}
                  </Text>
                  {r.status === 'pending' && (
                    <Text style={{ fontSize: 13, fontWeight: '500', color: linkColor, lineHeight: 18 }}>
                      Open for review →
                    </Text>
                  )}
                  {i < rows.length - 1 && (
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 6 }} />
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
