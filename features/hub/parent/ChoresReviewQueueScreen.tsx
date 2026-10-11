/**
 * ChoresReviewQueueScreen — the Chores & Quests category's own queue,
 * opened from ReviewInboxScreen's "Chores & Quests" landing card.
 *
 * Live direction: "do more sensible and more intelligent ... more
 * descriptive way ... especially chores" — ReviewCategoryQueueScreen's
 * generic row (title + "assignee · coins") gave a parent nothing to go on
 * before opening each item. This surfaces the real signal that actually
 * drives an approve/decline decision at a glance:
 *   - a photo thumbnail when proof was submitted (photoRequired chores),
 *     or a flagged "No photo attached" state when one was required but
 *     missing — visible before tapping in, not after
 *   - how long it's been waiting (relative time, color-escalates past 24h
 *     — a stale submission is a different kind of urgent than a fresh one)
 *   - the submission note, previewed inline, not hidden behind a tap
 *   - a type-specific icon/accent (quest vs. GP quest vs. task vs. chore)
 *     instead of one flat list with no visual distinction between kinds
 * Rows sorted oldest-submitted-first, so the thing that's been waiting
 * longest surfaces at the top — not insertion order.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Image, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageOff, Sparkles, Heart, Briefcase, ClipboardCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function categoryMeta(categoryType: string, colors: any): { label: string; icon: typeof ClipboardCheck; color: string; bg: string } {
  switch (categoryType) {
    case 'bounty':            return { label: 'Quest',    icon: Sparkles,       color: colors.pink,   bg: colors.pinkLight };
    case 'grandparent_quest': return { label: 'GP Quest',  icon: Heart,          color: colors.pink,   bg: colors.pinkLight };
    case 'parent_only_quest': return { label: 'Task',      icon: Briefcase,      color: colors.amber,  bg: colors.amberLight };
    default:                  return { label: 'Chore',     icon: ClipboardCheck, color: colors.teal,   bg: colors.tealLight };
  }
}

export function ChoresReviewQueueScreen({ onSelectRow, onClose }: {
  onSelectRow: (choreId: string, isQuest: boolean) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const getParentReviewDeck = useChoreStore(s => s.getParentReviewDeck);
  const chores = useChoreStore(s => s.chores); // subscribe so the deck recomputes on change
  const { members } = useFamilyStore();
  const [filter, setFilter] = useState<'pending' | 'completed' | 'rejected' | 'all'>('pending');

  const pendingRows: ChoreTask[] = React.useMemo(() => {
    return [...getParentReviewDeck()].sort((a, b) =>
      (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')
    );
  }, [chores]);

  // "Completed" — the review decision has landed and the chore paid out.
  // "Rejected" — sent back for a redo, not a terminal state, but it's the
  // closest analog to "rejected" a parent-facing filter needs here.
  const completedRows: ChoreTask[] = React.useMemo(() => {
    return chores
      .filter(c => c.status === 'approved' || c.status === 'auto_approved' || c.status === 'completed')
      .sort((a, b) => (b.reviewedAt ?? b.approvedAt ?? '').localeCompare(a.reviewedAt ?? a.approvedAt ?? ''));
  }, [chores]);

  const rejectedRows: ChoreTask[] = React.useMemo(() => {
    return chores
      .filter(c => c.status === 'redo_requested' || c.status === 'declined')
      .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''));
  }, [chores]);

  const allRows: ChoreTask[] = React.useMemo(() => {
    return [...chores].sort((a, b) =>
      (b.submittedAt ?? b.reviewedAt ?? b.createdAt ?? '').localeCompare(a.submittedAt ?? a.reviewedAt ?? a.createdAt ?? '')
    );
  }, [chores]);

  const rows: ChoreTask[] =
    filter === 'pending' ? pendingRows :
    filter === 'completed' ? completedRows :
    filter === 'rejected' ? rejectedRows :
    allRows;

  const canvas = isDark ? '#0E0C13' : GEMINI.canvas;
  const cardWhiteBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const rowShadow = isDark
    ? { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 6 }
    : GEMINI.cardShadow;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas, paddingBottom: 8 }}>
        <PageHeading
          title="Chores & Quests"
          subtitle={pendingRows.length > 0 ? `${pendingRows.length} chore${pendingRows.length !== 1 ? 's' : ''} need${pendingRows.length === 1 ? 's' : ''} your review` : 'All chores reviewed'}
          onTitlePress={onClose}
          topInset={insets.top}
        />

        <View style={{ marginHorizontal: 20, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, gap: 4 }}>
          {([
            { key: 'pending', label: `Pending · ${pendingRows.length}` },
            { key: 'completed', label: 'Completed' },
            { key: 'rejected', label: 'Rejected' },
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
                <Text style={{ fontSize: 13, fontWeight: active ? '700' : '400', color: active ? colors.teal : (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
                  {seg.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {rows.length === 0 ? (
          <View style={{
            backgroundColor: cardWhiteBg, borderRadius: 16, padding: 16,
            ...cardShadow,
          }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: (isDark ? colors.textSecondary : GEMINI.bodyColor), lineHeight: 25 }}>
              {filter === 'pending' ? 'Nothing pending right now.'
                : filter === 'completed' ? 'Nothing completed yet.'
                : filter === 'rejected' ? 'Nothing rejected.'
                : 'No chores yet.'}
            </Text>
          </View>
        ) : (
          rows.map(chore => {
            const meta = categoryMeta(chore.categoryType, colors);
            const Icon = meta.icon;
            const assignee = members.find(m => m.id === chore.assignedToId);
            const waitingLabel = relativeTime(chore.submittedAt);
            // Escalate color past 24h waiting — a submission that's sat for
            // a full day is a different kind of urgent than one from 10
            // minutes ago, and the old flat row gave no way to tell them
            // apart without opening each one.
            const waitingMs = chore.submittedAt ? Date.now() - new Date(chore.submittedAt).getTime() : 0;
            const isStale = waitingMs > 24 * 60 * 60 * 1000;
            const missingRequiredPhoto = chore.requiresPhotoProof && !chore.submissionPhotoUrl;

            return (
              <Pressable
                key={chore.id}
                onPress={() => onSelectRow(chore.id, chore.categoryType === 'bounty')}
                style={({ pressed }) => ({
                  flexDirection: 'row', gap: 12,
                  backgroundColor: cardWhiteBg, borderRadius: 16, padding: 14,
                  opacity: pressed ? 0.8 : 1,
                  ...rowShadow,
                })}
              >
                {/* Photo thumbnail, or a flagged empty state when one was
                    required but never attached. */}
                {chore.submissionPhotoUrl ? (
                  <Image source={{ uri: chore.submissionPhotoUrl }}
                    style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.surface }} />
                ) : chore.requiresPhotoProof ? (
                  <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.danger + '14',
                    alignItems: 'center', justifyContent: 'center' }}>
                    <ImageOff size={20} color={colors.danger} strokeWidth={1.8} />
                  </View>
                ) : (
                  <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: meta.bg,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={22} color={meta.color} strokeWidth={1.8} />
                  </View>
                )}

                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, backgroundColor: meta.bg }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: meta.color, letterSpacing: 0.3 }}>
                        {meta.label.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }} numberOfLines={1}>
                      {chore.title}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 12, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }} numberOfLines={1}>
                    {assignee?.name?.split(' ')[0] ?? 'Someone'} · {chore.coinsReward ?? 0} coins
                    {waitingLabel ? ` · ${waitingLabel}` : ''}
                  </Text>

                  {missingRequiredPhoto && (
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.danger }}>
                      ⚠ Photo required — none attached
                    </Text>
                  )}

                  {chore.submissionNote ? (
                    <Text style={{ fontSize: 12, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), fontStyle: 'italic' }} numberOfLines={2}>
                      "{chore.submissionNote}"
                    </Text>
                  ) : null}

                  {isStale && (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger, marginTop: 1 }}>
                      Waiting over a day
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
