/**
 * VoiceIntakeReviewSheet — confirm screen for family-ai's extract_responsibility
 * result. One free-text/voice input can produce an event-shaped task, a
 * quest-shaped task, and/or an errand — this shows whatever was extracted,
 * lets the user edit the essentials before anything is created (never
 * auto-applies, matching every other AI-assist surface in this app), and
 * routes to the right store (addEvent vs addQuest) based on task.kind.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Calendar, ClipboardList, ShoppingCart, AlertTriangle, PenLine } from 'lucide-react-native';
import AppBottomSheet from './AppBottomSheet';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { useEventStore } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { eventCategoryFromDomain } from '@/lib/responsibilityCategories';
import type { ExtractResponsibilityResult } from '@/lib/familyAiService';
import type { FamilyMember } from '@/store/familyStore';

export default function VoiceIntakeReviewSheet({
  visible, result, members, activeMemberId, onClose, onCreated, onEditInFullForm,
}: {
  visible: boolean;
  result: ExtractResponsibilityResult | null;
  members: FamilyMember[];
  activeMemberId: string;
  onClose: () => void;
  onCreated?: (kind: 'event' | 'quest') => void;
  // AI got most of it right but something needs a change the quick-edit
  // fields here don't cover (e.g. recurrence, a specific chore category,
  // location) — hands off to the real AddEventModal/AddQuestModal, pre-
  // filled with whatever was extracted, instead of discarding and starting
  // over from a blank form.
  onEditInFullForm?: (kind: 'event' | 'quest', prefill: {
    title: string; category?: string; memberId?: string; startAt?: string;
    notes?: string; coins?: number; photoRequired?: boolean;
  }) => void;
}) {
  const { colors, isDark } = useTheme();
  const addEvent = useEventStore(s => s.addEvent);
  // choreAdapter's useQuestStore is a plain function returning a fresh
  // object each call (not a Zustand selector hook like useEventStore) — it
  // wraps useChoreStore() internally, so no selector argument here.
  const { addQuest } = useQuestStore();

  const [title, setTitle] = useState(result?.task?.title ?? '');
  const [forMemberId, setForMemberId] = useState<string | undefined>(
    () => members.find(m => m.name === result?.task?.forMemberName)?.id
  );
  // Quest-only — coins aren't a concept an event has, so this is optional
  // and only shown/used when task.kind === 'quest'.
  const [coinsStr, setCoinsStr] = useState('20');
  // Matches AddQuestModal's own default (false) — only relevant for a quest
  // assigned to a kid/teen, same as the manual form's toggle.
  const [photoRequired, setPhotoRequired] = useState(false);

  if (!result?.task) return null;
  const task = result.task;
  const isEvent = task.kind === 'event';
  const eventCategory = eventCategoryFromDomain(task.category) ?? 'Other';
  // Same rule as AddQuestModal's assignedToAdultsOnly — coins/XP don't make
  // sense for a parent/senior assignee, so zero them out rather than
  // rewarding an adult for their own chore.
  const forMember = members.find(m => m.id === forMemberId);
  const assignedToAdult = !!forMember && (forMember.role === 'parent' || forMember.role === 'senior');

  const create = () => {
    const finalTitle = title.trim() || task.title;
    if (isEvent) {
      const dt = task.startAt ? new Date(task.startAt) : new Date();
      addEvent({
        title: finalTitle,
        date: dt.toISOString().slice(0, 10),
        time: task.startAt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : undefined,
        type: 'event',
        category: eventCategory,
        allDay: !task.startAt,
        memberId: forMemberId,
        notes: task.requirements.length ? task.requirements.join(', ') : undefined,
        approvalPending: false,
        conflict: false,
      });
      onCreated?.('event');
    } else {
      const coins = parseInt(coinsStr, 10);
      addQuest({
        title: finalTitle,
        category: 'Other',
        priority: 'medium',
        coins: assignedToAdult ? 0 : (Number.isFinite(coins) && coins >= 0 ? coins : 20),
        xpReward: assignedToAdult ? 0 : 15,
        isPool: !forMemberId,
        isDaily: false,
        recurrence: 'once',
        status: 'todo',
        assignedToIds: forMemberId ? [forMemberId] : [],
        isAdultTask: assignedToAdult,
        dueDate: task.startAt ? new Date(task.startAt).toISOString().slice(0, 10) : undefined,
        photoRequired,
        createdById: activeMemberId,
      });
      onCreated?.('quest');
    }
    onClose();
  };

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Confirm before creating">
      <ScrollView contentContainerStyle={{ gap: 14 }}>
        {result.ambiguous && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.warning + '18', borderRadius: 12, padding: 12,
            borderWidth: 1, borderColor: colors.warning + '40' }}>
            <AlertTriangle size={16} color={colors.warningDark} />
            <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.warningDark }}>
              This one wasn't totally clear — double-check the details below.
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isEvent ? <Calendar size={16} color={colors.primary} /> : <ClipboardList size={16} color={colors.primary} />}
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {isEvent ? `Event · ${eventCategory}` : 'Quest'}
          </Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Title</Text>
          <TextInput
            value={title} onChangeText={setTitle}
            style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
              backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: 12,
              paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}
          />
        </View>

        {task.forMemberName && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>For</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {members.map(m => {
                const sel = forMemberId === m.id;
                return (
                  <Pressable key={m.id} onPress={() => setForMemberId(sel ? undefined : m.id)}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                      backgroundColor: sel ? colors.primary + '18' : (isDark ? colors.surface : colors.inputBg),
                      borderColor: sel ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: sel ? colors.primary : colors.textSecondary }}>
                      {m.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {!isEvent && (
          assignedToAdult ? (
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Coins</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textTertiary, fontStyle: 'italic' }}>
                No coins — assigned to a parent/grandparent
              </Text>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Coins (optional)</Text>
              <TextInput
                value={coinsStr} onChangeText={setCoinsStr} keyboardType="number-pad" placeholder="20"
                placeholderTextColor={colors.placeholder}
                style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                  backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, width: 100 }}
              />
            </View>
          )
        )}

        {!isEvent && !assignedToAdult && (
          <Pressable onPress={() => setPhotoRequired(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: photoRequired ? colors.primary + '14' : (isDark ? colors.surface : colors.inputBg),
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
              borderWidth: 1, borderColor: photoRequired ? colors.primary + '50' : colors.border }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: photoRequired ? colors.primary : colors.textPrimary }}>
              📷 Photo proof {photoRequired ? 'required' : 'optional'}
            </Text>
            <View style={{ width: 38, height: 22, borderRadius: 11,
              backgroundColor: photoRequired ? colors.primary : colors.border,
              justifyContent: 'center', paddingHorizontal: 2 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                alignSelf: photoRequired ? 'flex-end' : 'flex-start' }} />
            </View>
          </Pressable>
        )}

        {task.startAt && (
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>When</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
              {new Date(task.startAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Text>
          </View>
        )}

        {task.requirements.length > 0 && (
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Notes</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary }}>{task.requirements.join(', ')}</Text>
          </View>
        )}

        {result.errand && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: 12, padding: 12 }}>
            <ShoppingCart size={14} color={colors.textSecondary} />
            <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textSecondary }}>
              Also mentioned an errand ({result.errand.storeName ?? result.errand.category}) —
              not created here; add it from Grocery.
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Pressable onPress={onClose}
            style={{ flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center',
              borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Discard</Text>
          </Pressable>
          <Pressable onPress={create} disabled={!title.trim() && !task.title}
            style={{ flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: colors.primary }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
              Create {isEvent ? 'Event' : 'Quest'}
            </Text>
          </Pressable>
        </View>

        {onEditInFullForm && (
          <Pressable
            onPress={() => onEditInFullForm(task.kind, {
              title: title.trim() || task.title,
              category: isEvent ? eventCategory : undefined,
              memberId: forMemberId,
              startAt: task.startAt ?? undefined,
              notes: task.requirements.length ? task.requirements.join(', ') : undefined,
              coins: !isEvent ? (parseInt(coinsStr, 10) || undefined) : undefined,
              photoRequired: !isEvent ? photoRequired : undefined,
            })}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
            <PenLine size={13} color={colors.textSecondary} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>
              Adjust in full form instead
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </AppBottomSheet>
  );
}
