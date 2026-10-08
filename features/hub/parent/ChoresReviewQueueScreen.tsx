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
import React from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, Image, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Camera, ImageOff, Sparkles, Heart, Briefcase, ClipboardCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';

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

  const rows: ChoreTask[] = React.useMemo(() => {
    return [...getParentReviewDeck()].sort((a, b) =>
      (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')
    );
  }, [chores]);

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardWhiteBg = isDark ? colors.card : '#FFFFFF';
  const accentColor = colors.teal;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{
        paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas, gap: 8,
      }}>
        <View style={{ gap: 4 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: accentColor, lineHeight: 18 }}>← Review inbox</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
              Chores & Quests
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
        contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {rows.length === 0 ? (
          <View style={{
            backgroundColor: cardWhiteBg, borderRadius: 16, padding: 16,
            ...Platform.select({
              ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
              android: { elevation: 2 },
            }),
          }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary, lineHeight: 25 }}>
              Nothing pending right now.
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
                  ...Platform.select({
                    ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.14 : 0.06, shadowRadius: 6 },
                    android: { elevation: 1 },
                  }),
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
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                      {chore.title}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                    {assignee?.name?.split(' ')[0] ?? 'Someone'} · {chore.coinsReward ?? 0} coins
                    {waitingLabel ? ` · ${waitingLabel}` : ''}
                  </Text>

                  {missingRequiredPhoto && (
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.danger }}>
                      ⚠ Photo required — none attached
                    </Text>
                  )}

                  {chore.submissionNote ? (
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' }} numberOfLines={2}>
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
