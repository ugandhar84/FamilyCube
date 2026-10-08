/**
 * ReviewInboxScreen — "Notice the effort"
 *
 * Pixel-faithful port of the Figma review-inbox spec:
 *   • White card — "Ready for your review" list
 *   • Mint card — workflow status pill + explanation + secondary nav
 *   • Peach card — primary + secondary CTA buttons
 *   • White card — recently decided items
 *   • Full-width primary CTA
 *   • Mint domain-module footer
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';

export type ReviewItemType = 'chore' | 'quest';

// ─── helpers ──────────────────────────────────────────────────────────────────

function firstName(memberId: string | undefined, members: FamilyMember[]): string {
  if (!memberId) return 'Someone';
  const m = members.find(m => m.id === memberId);
  return m ? (m.name.split(' ')[0] ?? m.name) : 'Someone';
}

function typeLabel(categoryType: string): string {
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

// ─── main ─────────────────────────────────────────────────────────────────────

export function ReviewInboxScreen({ onSelectItem, onClose }: {
  onSelectItem?: (choreId: string, type: ReviewItemType) => void;
  onClose?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { getParentReviewDeck, chores } = useChoreStore();
  const { members, activeMemberId, familyName } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId);
  const insets = useSafeAreaInsets();

  const pendingReviews = useMemo(() => getParentReviewDeck(), [chores]);
  const decidedReviews = useMemo(() =>
    chores.filter(c =>
      ['approved', 'auto_approved', 'completed', 'declined', 'redo_requested'].includes(c.status)
    ).slice(0, 6),
  [chores]);

  const firstItem = pendingReviews[0];

  const open = (id: string, cat: string) => {
    const t: ReviewItemType = cat === 'bounty' ? 'quest' : 'chore';
    onSelectItem?.(id, t);
  };

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';

  // Figma tones → brand tokens
  const cardWhiteBg   = isDark ? colors.card    : '#FFFFFF';
  const cardMintBg    = isDark ? '#0D1F18'      : '#DDF5EC';  // tealLight equivalent
  const cardPeachBg   = isDark ? '#1E1210'      : '#FFE8E3';  // primaryLight equivalent
  const mintText      = isDark ? colors.teal    : '#16705F';
  const mintPillBg    = isDark ? '#133328'      : '#C8EEE1';
  const linkBlue      = isDark ? colors.teal    : colors.teal;
  const primaryBtnBg  = colors.primary;
  const secondaryBtnBg  = isDark ? colors.surface : '#FFFFFF';
  const secondaryBorder = isDark ? colors.border  : '#DFE5EF';

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
        {/* Household chrome */}
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

        {/* Page introduction */}
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
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Card 1: white — "Ready for your review" ── */}
        <View style={{
          backgroundColor: cardWhiteBg, borderRadius: 22, padding: 18, gap: 12,
          ...Platform.select({
            ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
            android: { elevation: 2 },
          }),
        }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            Ready for your review
          </Text>

          {pendingReviews.length === 0 ? (
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary, lineHeight: 25 }}>
              Nothing pending right now. Check back when the kids finish something!
            </Text>
          ) : (
            pendingReviews.map((chore, i) => {
              const assignee = firstName(chore.assignedToId, members);
              const tl = typeLabel(chore.categoryType);
              return (
                <Pressable
                  key={chore.id}
                  onPress={() => open(chore.id, chore.categoryType)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 1 })}
                >
                  {/* Item title + detail + link all in one text block per Figma */}
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 25 }}>
                    {chore.title}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                    {assignee} · {tl} · {chore.coinsReward ?? 0} coins
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>
                    Open for review →
                  </Text>
                  {i < pendingReviews.length - 1 && (
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 10 }} />
                  )}
                </Pressable>
              );
            })
          )}
        </View>

        {/* ── Card 2: mint — workflow status + explanation + secondary nav ── */}
        <View style={{ backgroundColor: cardMintBg, borderRadius: 22, padding: 18, gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            How approvals work
          </Text>

          {/* Workflow status pill */}
          <View style={{
            alignSelf: 'flex-start',
            backgroundColor: mintPillBg,
            borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: mintText, lineHeight: 15 }}>
              Instant payout
            </Text>
          </View>

          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            Coins land in the kid's wallet the moment you approve — no extra steps needed.
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            If the work doesn't meet the standard, request a redo with a note. The quest goes back to the kid's queue.
          </Text>

          {/* Secondary destination button */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
              paddingHorizontal: 16, height: 48,
              backgroundColor: secondaryBtnBg,
              borderWidth: 1, borderColor: secondaryBorder,
              borderRadius: 14, opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: linkBlue }}>
              Back to Hub
            </Text>
          </Pressable>
        </View>

        {/* ── Card 3: peach — primary + secondary CTAs ── */}
        <View style={{ backgroundColor: cardPeachBg, borderRadius: 22, padding: 18, gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
            {pendingReviews.length > 0
              ? `Start with "${firstItem?.title ?? 'first submission'}"`
              : 'All caught up'}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
            {pendingReviews.length > 0
              ? `${pendingReviews.length} submission${pendingReviews.length !== 1 ? 's' : ''} waiting. A quick decision keeps the momentum going.`
              : 'No pending reviews right now. Great work staying on top of it!'}
          </Text>

          {/* Primary destination */}
          {pendingReviews.length > 0 && firstItem && (
            <Pressable
              onPress={() => open(firstItem.id, firstItem.categoryType)}
              style={({ pressed }) => ({
                flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
                paddingHorizontal: 16, height: 48, backgroundColor: primaryBtnBg,
                borderRadius: 14, opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
                Review now →
              </Text>
            </Pressable>
          )}

          {/* Secondary destination */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
              paddingHorizontal: 16, height: 48,
              backgroundColor: secondaryBtnBg,
              borderWidth: 1, borderColor: secondaryBorder,
              borderRadius: 14, opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: linkBlue }}>
              {pendingReviews.length > 0 ? 'Maybe later' : 'Go to Quests'}
            </Text>
          </Pressable>

          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
            Approvals are permanent — take a moment before you decide.
          </Text>
        </View>

        {/* ── Card 4: white — recently decided ── */}
        {decidedReviews.length > 0 && (
          <View style={{
            backgroundColor: cardWhiteBg, borderRadius: 22, padding: 18, gap: 12,
            ...Platform.select({
              ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
              android: { elevation: 2 },
            }),
          }}>
            <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
              Recently decided
            </Text>
            {decidedReviews.map((chore, i) => {
              const assignee = firstName(chore.assignedToId, members);
              const tl = typeLabel(chore.categoryType);
              const sl = statusLabel(chore.status);
              return (
                <Pressable
                  key={chore.id}
                  onPress={() => open(chore.id, chore.categoryType)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 1 })}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 25 }}>
                    {chore.title}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                    {assignee} · {tl} · {sl}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue, lineHeight: 18 }}>
                    View details →
                  </Text>
                  {i < decidedReviews.length - 1 && (
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 10 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Full-width primary CTA ── */}
        {pendingReviews.length > 0 && firstItem && (
          <Pressable
            onPress={() => open(firstItem.id, firstItem.categoryType)}
            style={({ pressed }) => ({
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
              height: 48, backgroundColor: primaryBtnBg,
              borderRadius: 14, opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
              Start with {firstItem.title} →
            </Text>
          </Pressable>
        )}

        {/* ── Domain module footer (mint) ── */}
        <View style={{ backgroundColor: cardMintBg, borderRadius: 22, padding: 20, minHeight: 134, justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '500', color: mintText, lineHeight: 26 }}>
            Every approval is a signal to the family.{'\n'}
            It shows that effort is seen, work is valued, and trust is being built — one task at a time.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}
