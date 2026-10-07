/**
 * ReviewInboxScreen — "Notice the effort"
 *
 * Pixel-faithful port of Figma node 90:8860, re-skinned in the Kinfolk palette.
 * Shows the parent's pending chore-submission review deck with filter pills,
 * a primary CTA that deep-links into the Quests tab, and supporting context cards.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterKey = 'pending' | 'decided' | 'all';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberFirstName(memberId: string | undefined, members: FamilyMember[]): string {
  if (!memberId) return 'Someone';
  const m = members.find((m: FamilyMember) => m.id === memberId);
  if (!m) return 'Someone';
  return m.name.split(' ')[0] ?? m.name;
}

function choreTypeLabel(categoryType: string): string {
  switch (categoryType) {
    case 'bounty':             return 'Quest';
    case 'grandparent_quest':  return 'GP Quest';
    case 'parent_only_quest':  return 'Task';
    case 'shopping':           return 'Shopping';
    case 'routine':            return 'Chore';
    case 'citizenship':        return 'Chore';
    default:                   return 'Chore';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FilterPillsProps {
  active: FilterKey;
  pendingCount: number;
  onSelect: (key: FilterKey) => void;
  colors: any;
}

function FilterPills({ active, pendingCount, onSelect, colors }: FilterPillsProps) {
  const pills: { key: FilterKey; label: string }[] = [
    { key: 'pending', label: `Pending · ${pendingCount}` },
    { key: 'decided', label: 'Decided' },
    { key: 'all',     label: 'All' },
  ];

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: colors.amberLight,
      borderRadius: 14,
      padding: 4,
      gap: 4,
      alignSelf: 'flex-start',
    }}>
      {pills.map(pill => {
        const isActive = pill.key === active;
        return (
          <Pressable
            key={pill.key}
            onPress={() => onSelect(pill.key)}
            style={({ pressed }) => ({
              borderRadius: 11,
              paddingVertical: 5,
              paddingHorizontal: 12,
              backgroundColor: isActive ? '#FFFFFF' : 'transparent',
              opacity: pressed ? 0.75 : 1,
              ...(isActive && Platform.OS === 'ios' ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.08,
                shadowRadius: 3,
              } : {}),
              ...(isActive && Platform.OS === 'android' ? { elevation: 1 } : {}),
            })}
          >
            <Text style={{
              fontSize: 13,
              fontWeight: '400',
              color: isActive ? colors.primary : colors.textSecondary,
            }}>
              {pill.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReviewInboxScreen({ onSelectItem }: {
  onSelectItem?: (choreId: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const { getParentReviewDeck, chores } = useChoreStore();
  const { members } = useFamilyStore();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('pending');

  // Pending = pending_approval
  const pendingReviews = useMemo(() => getParentReviewDeck(), [chores]);

  // Decided = approved / auto_approved / completed / declined / redo_requested
  const decidedReviews = useMemo(() =>
    chores.filter(c =>
      ['approved', 'auto_approved', 'completed', 'declined', 'redo_requested'].includes(c.status)
    ).slice(0, 10), // cap for display
  [chores]);

  const visibleItems = useMemo(() => {
    if (activeFilter === 'pending') return pendingReviews;
    if (activeFilter === 'decided') return decidedReviews;
    return [...pendingReviews, ...decidedReviews];
  }, [activeFilter, pendingReviews, decidedReviews]);

  const firstItem = pendingReviews[0];
  const firstItemTitle = firstItem?.title ?? 'the first submission';

  const navigateToQuests = () => {
    router.push('/(tabs)/quests' as any);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Page intro ─────────────────────────────────────────────── */}
      <View style={{ gap: 6 }}>
        <Pressable
          onPress={navigateToQuests}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, alignSelf: 'flex-start' })}
          accessibilityRole="link"
          accessibilityLabel="Back to quests"
        >
          <Text style={{
            fontSize: 13,
            fontWeight: '500',
            color: colors.teal,
            letterSpacing: 0.3,
          }}>
            REVIEW / PARENT DECISIONS
          </Text>
        </Pressable>

        <Text style={{
          fontSize: 29,
          fontWeight: '700',
          lineHeight: 40.6,
          color: colors.textPrimary,
          marginTop: 2,
        }}>
          Notice the effort
        </Text>
      </View>

      {/* ── Supporting text ─────────────────────────────────────────── */}
      <Text style={{
        fontSize: 13,
        fontWeight: '500',
        color: colors.textPrimary,
        lineHeight: 18.2,
        marginTop: -8,
      }}>
        {pendingReviews.length} submission{pendingReviews.length !== 1 ? 's' : ''} awaiting a decision.
      </Text>

      {/* ── Filter pills + sort chip row ────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: -4 }}>
        <FilterPills
          active={activeFilter}
          pendingCount={pendingReviews.length}
          onSelect={setActiveFilter}
          colors={colors}
        />

        <Pressable
          style={({ pressed }) => ({
            borderRadius: 100,
            paddingVertical: 5,
            paddingHorizontal: 10,
            backgroundColor: colors.primaryLight,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.primary,
          }}>
            All members · all categories
          </Text>
        </Pressable>
      </View>

      {/* ── "Ready for your review" card ────────────────────────────── */}
      <View style={{
        backgroundColor: isDark ? colors.card : '#FFFFFF',
        borderRadius: 22,
        padding: 18,
        gap: 12,
        ...Platform.select({
          ios: {
            shadowColor: isDark ? '#000' : '#2C2722',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.18 : 0.07,
            shadowRadius: 8,
          },
          android: { elevation: 2 },
        }),
      }}>
        <Text style={{
          fontSize: 20,
          fontWeight: '600',
          color: colors.textPrimary,
        }}>
          Ready for your review
        </Text>

        {visibleItems.length === 0 ? (
          <Text style={{
            fontSize: 13,
            fontWeight: '400',
            color: colors.textSecondary,
            lineHeight: 18.2,
          }}>
            {activeFilter === 'pending'
              ? 'No pending submissions right now. Check back when the kids finish something!'
              : 'Nothing to show here yet.'}
          </Text>
        ) : (
          visibleItems.map((chore, index) => {
            const assigneeName = memberFirstName(chore.assignedToId, members);
            const typeLabel = choreTypeLabel(chore.categoryType);
            const reviewLinkLabel = `${typeLabel} review →`;
            const isLast = index === visibleItems.length - 1;

            return (
              <React.Fragment key={chore.id}>
                <Pressable
                  onPress={() => {
                    if (onSelectItem) {
                      onSelectItem(chore.id);
                    } else {
                      navigateToQuests();
                    }
                  }}
                  style={({ pressed }) => ({
                    gap: 2,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={`Review ${chore.title}`}
                >
                  {/* Line 1: title */}
                  <Text style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.textPrimary,
                    lineHeight: 18.2,
                  }}>
                    {chore.title}
                  </Text>

                  {/* Line 2: assignee · category · coins */}
                  <Text style={{
                    fontSize: 13,
                    fontWeight: '400',
                    color: colors.textSecondary,
                    lineHeight: 18.2,
                  }}>
                    {assigneeName} · {typeLabel} · {chore.coinsReward} coins
                  </Text>

                  {/* Line 3: review link */}
                  <Text style={{
                    fontSize: 13,
                    fontWeight: '500',
                    color: colors.teal,
                    lineHeight: 18.2,
                  }}>
                    {reviewLinkLabel}
                  </Text>
                </Pressable>

                {!isLast && (
                  <View style={{
                    height: 1,
                    backgroundColor: colors.border,
                    marginVertical: 2,
                  }} />
                )}
              </React.Fragment>
            );
          })
        )}
      </View>

      {/* ── "Separate from new submissions" info card ───────────────── */}
      <View style={{
        backgroundColor: colors.tealLight,
        borderRadius: 22,
        padding: 18,
        gap: 12,
      }}>
        <Text style={{
          fontSize: 20,
          fontWeight: '600',
          color: colors.textPrimary,
        }}>
          Separate from new submissions
        </Text>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{
              fontSize: 13,
              fontWeight: '400',
              color: colors.textSecondary,
              lineHeight: 18.2,
              flex: 1,
            }}>
              Each submission here is a completed task waiting on your approval or a redo request.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{
              fontSize: 13,
              fontWeight: '400',
              color: colors.textSecondary,
              lineHeight: 18.2,
              flex: 1,
            }}>
              Coins are awarded immediately on approval — a quick tap keeps momentum going for everyone.
            </Text>
          </View>
        </View>
      </View>

      {/* ── Primary CTA ─────────────────────────────────────────────── */}
      {pendingReviews.length > 0 && (
        <Pressable
          onPress={navigateToQuests}
          style={({ pressed }) => ({
            borderRadius: 14,
            paddingVertical: 16,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel={`Start with ${firstItemTitle}`}
        >
          <Text style={{
            fontSize: 15,
            fontWeight: '600',
            color: '#FFFFFF',
          }}>
            Start with {firstItemTitle} →
          </Text>
        </Pressable>
      )}

      {pendingReviews.length === 0 && (
        <Pressable
          onPress={navigateToQuests}
          style={({ pressed }) => ({
            borderRadius: 14,
            paddingVertical: 16,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel="Go to Quests"
        >
          <Text style={{
            fontSize: 15,
            fontWeight: '600',
            color: colors.textSecondary,
          }}>
            Go to Quests
          </Text>
        </Pressable>
      )}

      {/* ── Footer text ─────────────────────────────────────────────── */}
      <Text style={{
        fontSize: 13,
        fontWeight: '500',
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 18.2,
        marginTop: 4,
      }}>
        Approvals are permanent — take a moment before you decide.
      </Text>

      {/* ── Signature ───────────────────────────────────────────────── */}
      <Text style={{
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
        textAlign: 'center',
        letterSpacing: 0.5,
        marginTop: -8,
      }}>
        Connect. Organize. Care. Grow.
      </Text>
    </ScrollView>
  );
}
