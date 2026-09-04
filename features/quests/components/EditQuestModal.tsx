import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, Platform,
  KeyboardAvoidingView, Keyboard, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { useChoreStore } from '@/store/choreStore';
import { useEventStore } from '@/store/eventStore';
import type { Quest, QuestCategory, QuestDifficulty } from '@/store/questStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { localDateStr, parseLocalDate, parseTimeInput, fmtDate, fmtTime } from '@/lib/dates';
import { I } from './icons';
import { QUEST_SUGGESTIONS, ALL_CATEGORIES, fmtDateLabel, fmtTimeLabel } from './questFormShared';
import { fetchCustomCategories, CustomCategory } from '@/lib/familyCustomCategories';
import { aq } from './AddQuestModal';
// Shared with AddQuestModal / AddEventModal — this file used to hand-
// duplicate both of these blocks inline.
import { CallReminderToggle } from '@/features/tasks/components/forms/CallReminderToggle';
import { DueDateTimePicker } from '@/features/tasks/components/forms/DueDateTimePicker';
import {
  resolveDomainFromLooseLabel, fetchSubcategoriesForDomain, previewAssignment, previewKidChoreAssignment,
  type ResponsibilityCategory, type AssignmentSuggestion,
} from '@/lib/responsibilityCategories';

// ─── Edit Quest Modal (parent, unclaimed quests only) ────────────────────────
export function EditQuestModal({ quest, activeMemberId, onClose, onSave, onDelete, editMode = 'full' }: {
  quest: Quest;
  activeMemberId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Quest>) => void;
  onDelete?: (id: string) => void;
  editMode?: 'full' | 'restricted';
}) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);

  const parseDue = () => {
    if (quest.dueDate) {
      const d = parseLocalDate(quest.dueDate);
      if (quest.dueTime) {
        const parsed = parseTimeInput(quest.dueTime);
        if (parsed) {
          const [h, m] = parsed.split(':').map(Number);
          d.setHours(h, m || 0, 0, 0);
        }
      }
      return d;
    }
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d;
  };

  const [title,        setTitle]        = useState(quest.title);
  const [desc,         setDesc]         = useState(quest.description ?? '');
  const [coins,        setCoins]        = useState(String(quest.coins));
  const [bonusCoins,   setBonusCoins]   = useState(quest.bonusCoins > 0 ? String(quest.bonusCoins) : '');
  const [category,     setCategory]     = useState<QuestCategory>(quest.category);
  const [difficulty,   setDifficulty]   = useState<QuestDifficulty | ''>(quest.difficulty ?? '');
  const [isPool,       setIsPool]       = useState(quest.isPool ?? false);
  const [assignIds,         setAssignIds]         = useState<string[]>(quest.assignedToId ? [quest.assignedToId] : (quest.assignedToIds ?? []));
  const [photoReq,          setPhotoReq]          = useState(quest.photoRequired ?? false);
  const [isAdultTask,       setIsAdultTask]        = useState(quest.isAdultTask ?? false);
  const [inviteGrandparent, setInviteGrandparent] = useState(quest.inviteGrandparents ?? false);
  // Live QA finding (docs/qa_form_combinations_audit.html, High): this
  // edit form had ZERO trace of isOpenToTeens at all — no state, no UI,
  // no patch field — despite the store/RPC layer fully supporting it and
  // AddQuestModal offering it at create time (its own "Teens Only" chip,
  // AddQuestRecurrenceSection.tsx). A chore's isOpenToTeens flag became
  // permanently create-only: there was no way to add or remove the
  // restriction after the fact, and — separately — the assign-member
  // picker had no teens-only eligibility filter to match it, so a kid
  // could still be picked as assignee on a chore flagged teens-only,
  // directly contradicting the flag.
  const [teensOnly, setTeensOnly] = useState(quest.isOpenToTeens ?? false);
  // Master-flow spec: grandparent-done work has NO coin field, ever — not
  // zeroed, absent. AddQuestModal.tsx's coinsDisabled already enforces this
  // at CREATE time; this edit form had no equivalent, so toggling Invite
  // Grandparents on for an EXISTING chore left whatever coin amount was
  // already there in place, and approveChore has no assignee-role check —
  // a real, live path for a grandparent to be paid coins. Mirrors
  // AddQuestModal's isAdultTask||inviteGrandparent||assignedToAdultsOnly
  // shape (no assignedToAdultsOnly concept in this edit form, so just the
  // two that apply here).
  const coinsDisabled = isAdultTask || inviteGrandparent;
  const [dueDate,           setDueDate]           = useState<Date>(parseDue);
  // Spec 8.2 — optional tie to a calendar event this quest logistically
  // supports. Display-only, no cascading behavior.
  const [linkedEventId, setLinkedEventId] = useState<string | undefined>((quest as any).linkedEventId);
  const [showEventPicker, setShowEventPicker] = useState(false);
  // Always shown regardless of whether recurrence was ever set — a chore
  // can silently carry a recurrence_rule (e.g. from a prior form default
  // bug) with no way to see or clear it otherwise.
  const [routineFreq,       setRoutineFreq]        = useState<'once' | 'daily' | 'weekly' | 'monthly'>(
    (['once', 'daily', 'weekly', 'monthly'] as const).includes(quest.recurrence as any) ? (quest.recurrence as any) : 'once'
  );
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [alertCall,           setAlertCall]           = useState(quest.alertCall ?? false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(quest.alertCallLeadMinutes ?? 10);

  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';
  const siblings = members.map(m => m.name);
  const locked = editMode === 'restricted';
  const familyId = members.find(m => m.id === activeMemberId)?.familyId ?? '';

  // Live QA finding (docs/qa_form_combinations_audit.html, Medium):
  // AddQuestModal merges the family's own custom categories into its chip
  // row (ALL_CATEGORIES + customCategories) — this edit form only ever
  // rendered ALL_CATEGORIES, so a chore already saved under a custom
  // category reopened with NO chip showing as active at all.
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  React.useEffect(() => {
    if (!familyId) return;
    fetchCustomCategories(familyId, 'quest').then(setCustomCategories);
  }, [familyId]);

  // Responsibility Engine — optional subcategory refinement + live
  // assignment preview. Unlike AddQuestModal, this quest already has a real
  // id, so the kid-chore preview (which needs an existing row to read
  // age/skill/rotation/effort from) actually works here.
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [subcategoryOptions, setSubcategoryOptions] = useState<ResponsibilityCategory[]>([]);
  const [assignmentSuggestion, setAssignmentSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  React.useEffect(() => {
    setSubcategoryId(null);
    setAssignmentSuggestion(null);
    const domain = resolveDomainFromLooseLabel(category);
    fetchSubcategoriesForDomain(domain).then(setSubcategoryOptions);
  }, [category]);

  const editSuggestions = useMemo(() => {
    const q = title.toLowerCase().trim();
    if (!q) return QUEST_SUGGESTIONS.filter(s => s.category === category).slice(0, 8);
    return QUEST_SUGGESTIONS.filter(s => s.title.toLowerCase().includes(q)).slice(0, 6);
  }, [title, category]);

  const applyEditSuggestion = (s: typeof QUEST_SUGGESTIONS[0]) => {
    setTitle(s.title);
    setDesc(s.desc);
    setCoins(String(s.coins));
    setCategory(s.category);
  };


  const save = async () => {
    setSaving(true);

    // Reassigning an adult task to a different co-parent has to go through
    // the same PENDING/Accept negotiation a brand-new assignment gets
    // (addParentQuest), not a direct assignedToId write — otherwise the new
    // assignee lands pre-accepted with only Done/Reassign, and if this
    // chore already had a live System-A row (pending/locked), that row is
    // left dangling and unreferenced while the chore quietly points
    // somewhere else.
    const reassigningAdultTask = isAdultTask && !isPool && assignIds.length === 1
      && assignIds[0] !== quest.assignedToId && assignIds[0] !== activeMemberId;

    let patch: Partial<Quest>;
    if (locked) {
      // Restricted: everything full-edit sends EXCEPT due date/time and
      // description — those two stay untouched (never sent) once a chore
      // is claimed/in-progress, per explicit product decision. Title,
      // coins, category, difficulty, photoRequired, recurrence, the
      // Assign-To picker, and the Adult-Only/Invite-Grandparents toggles
      // ARE all adjustable here. See reassigningAdultTask above for why a
      // real System-A negotiation is used instead of a bare assignedToId
      // write when reassigning an adult task to a co-parent/GP.
      if (!title.trim()) { setSaving(false); return; }
      patch = {
        title: title.trim(),
        // coinsDisabled (adult task, or Invite Grandparents is on) always
        // wins on submit, regardless of whatever the coins/bonusCoins
        // state vars still hold from before the toggle was flipped — the
        // input being visually disabled only stops NEW typing, it doesn't
        // retroactively clear a value entered before the toggle changed.
        coins: coinsDisabled ? 0 : (parseInt(coins) || quest.coins),
        bonusCoins: coinsDisabled ? 0 : (parseInt(bonusCoins) || 0),
        category,
        difficulty: difficulty || undefined,
        assignedToId: reassigningAdultTask ? quest.assignedToId : (!isPool && assignIds.length === 1 ? assignIds[0] : undefined),
        assignedToIds: !isPool && assignIds.length > 1 ? assignIds : [],
        // Live-reported bug: this used to fall back to isPool:true
        // whenever nobody was explicitly picked — correct for an ordinary
        // kid chore (no assignee = open to the kid pool), but wrong for an
        // Adult Only task, which has no kid-claimable pool at all. Toggling
        // Adult Only on (which also clears assignIds via setIsAdultTask's
        // own handler) immediately re-triggered this same fallback and
        // silently forced isPool back to true, so the chore kept rendering
        // as "Waiting for a kid to claim" even though category_type had
        // correctly changed to parent_only_quest server-side.
        isPool: isAdultTask ? isPool : (isPool || assignIds.length === 0),
        photoRequired: photoReq,
        isAdultTask,
        inviteGrandparents: inviteGrandparent,
        isOpenToTeens: teensOnly,
        recurrence: routineFreq,
        alertCall, alertCallLeadMinutes,
        linkedEventId,
      };
    } else {
      if (!title.trim()) { setSaving(false); return; }
      patch = {
        title: title.trim(),
        description: desc.trim() || undefined,
        coins: coinsDisabled ? 0 : (parseInt(coins) || quest.coins),
        bonusCoins: coinsDisabled ? 0 : (parseInt(bonusCoins) || 0),
        category,
        difficulty: difficulty || undefined,
        assignedToId: reassigningAdultTask ? quest.assignedToId : (!isPool && assignIds.length === 1 ? assignIds[0] : undefined),
        assignedToIds: !isPool && assignIds.length > 1 ? assignIds : [],
        // Live-reported bug: this used to fall back to isPool:true
        // whenever nobody was explicitly picked — correct for an ordinary
        // kid chore (no assignee = open to the kid pool), but wrong for an
        // Adult Only task, which has no kid-claimable pool at all. Toggling
        // Adult Only on (which also clears assignIds via setIsAdultTask's
        // own handler) immediately re-triggered this same fallback and
        // silently forced isPool back to true, so the chore kept rendering
        // as "Waiting for a kid to claim" even though category_type had
        // correctly changed to parent_only_quest server-side.
        isPool: isAdultTask ? isPool : (isPool || assignIds.length === 0),
        photoRequired: photoReq,
        isAdultTask,
        inviteGrandparents: inviteGrandparent,
        isOpenToTeens: teensOnly,
        dueDate: localDateStr(dueDate),
        dueTime: fmtTimeLabel(dueDate),
        recurrence: routineFreq,
        alertCall, alertCallLeadMinutes,
        linkedEventId,
      };
    }
    onSave(quest.id, patch);
    if (reassigningAdultTask) {
      await useChoreStore.getState().addParentQuest(quest.id, activeMemberId, assignIds[0], 'DIRECT');
    }
    setSaving(false);
  };

  const dismiss = () => { Keyboard.dismiss(); onClose(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '90%', backgroundColor: colors.card }}>

            {/* Drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            {/* Fixed header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>
                  {locked ? 'Adjust Chore' : 'Edit Chore'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: colors.primary ?? BRAND.purple }}>
                  {locked ? 'Edit everything except due date & description' : 'Edit title, assignment & more'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrollable body — no `flex: 1` here: the sheet container above
                isn't itself flex-laid-out (just a maxHeight cap, matching
                EventFormModal's proven pattern), so flex:1 on this ScrollView
                has nothing to grow into and collapses to zero height instead. */}
            <ScrollView
              keyboardShouldPersistTaps="always"
              onScrollBeginDrag={Keyboard.dismiss}
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>

              {/* Title — editable in both modes; only due date/time and
                  description stay locked once a chore is claimed/in-progress. */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>Chore Title *</Text>
              <TextInput
                style={[aq.input, { color: colors.textPrimary, borderColor: title.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
                value={title} onChangeText={setTitle} returnKeyType="next"
                placeholder="e.g. Wash the dishes, Take out trash…" placeholderTextColor={colors.textTertiary}
              />
              {editSuggestions.length > 0 && (
                <View style={{ marginTop: -6, marginBottom: 12 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginBottom: 8, fontWeight: '700', letterSpacing: 0.4 }}>
                    {title.trim() ? 'Matching suggestions' : 'Quick picks — tap to fill'}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {editSuggestions.map((s, i) => (
                        <TouchableOpacity key={i}
                          style={[aq.suggPill, {
                            backgroundColor: title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple + '25' : colors.surface,
                            borderColor: title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple : colors.border,
                          }]}
                          onPress={() => applyEditSuggestion(s)}>
                          <Text style={{ fontSize: TYPO.micro, color: title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple : colors.textSecondary, fontWeight: '700' }} numberOfLines={1}>{s.title}</Text>
                          <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginLeft: 5 }}>+{s.coins}🪙</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Description — stays read-only once claimed/in-progress
                  (never sent from the locked patch), per explicit product
                  decision. */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>
                Description {!locked && '*'}{'  '}<Text style={{ fontWeight: '400', color: colors.textTertiary }}>what needs to be done</Text>
              </Text>
              {locked ? (
                <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12,
                  borderColor: isDark ? '#1E293B' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
                  <Text style={{ fontSize: TYPO.label, color: quest.description ? colors.textPrimary : colors.textTertiary }}>
                    {quest.description || 'No description'}
                  </Text>
                </View>
              ) : (
                <>
                  <TextInput
                    style={[aq.input, aq.descInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                    value={desc} onChangeText={t => setDesc(t.slice(0, 150))}
                    multiline numberOfLines={3} textAlignVertical="top"
                    placeholder="Describe exactly what's expected…" placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={{ fontSize: TYPO.micro, color: desc.length > 130 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 12 }}>
                    {desc.length}/150
                  </Text>
                </>
              )}

              {/* Coins + Bonus — editable in both modes, unless a grandparent
                  is (or becomes) eligible to do this work — see
                  coinsDisabled above. */}
              {!isAdultTask && (
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1, opacity: coinsDisabled ? 0.4 : 1 }}>
                  <Text style={[aq.label, { color: colors.textSecondary }]}>Coins 🪙</Text>
                  <TextInput
                    editable={!coinsDisabled}
                    style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: coinsDisabled ? (isDark ? '#1F2937' : '#F3F4F6') : colors.surface, marginBottom: 0 }]}
                    keyboardType="number-pad" value={coinsDisabled ? '0' : coins} onChangeText={coinsDisabled ? undefined : setCoins}
                  />
                </View>
                <View style={{ width: 90, opacity: coinsDisabled ? 0.4 : 1 }}>
                  <Text style={[aq.label, { color: colors.textSecondary }]}>Bonus 🎉</Text>
                  <TextInput
                    editable={!coinsDisabled}
                    style={[aq.input, { color: colors.textPrimary, borderColor: bonusCoins ? BRAND.amber : colors.border, backgroundColor: coinsDisabled ? (isDark ? '#1F2937' : '#F3F4F6') : colors.surface, marginBottom: 0 }]}
                    keyboardType="number-pad" placeholder="+coins" placeholderTextColor={colors.textTertiary}
                    value={coinsDisabled ? '' : bonusCoins} onChangeText={coinsDisabled ? undefined : (t => setBonusCoins(t.replace(/[^0-9]/g, '')))}
                  />
                </View>
              </View>
              )}
              {coinsDisabled && inviteGrandparent && !isAdultTask && (
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: -10, marginBottom: 14 }}>
                  Grandparents aren't paid coins — this is logged and thanked instead.
                </Text>
              )}

              {/* Category — editable in both modes */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[...ALL_CATEGORIES, ...customCategories.filter(cc => !ALL_CATEGORIES.includes(cc.key as QuestCategory)).map(cc => cc.key as QuestCategory)].map(c => (
                    <TouchableOpacity key={c}
                      style={[aq.catChip, { borderColor: pillBdr, backgroundColor: pillBg },
                        category === c && { backgroundColor: BRAND.purple, borderColor: BRAND.purple }]}
                      onPress={() => setCategory(c)}>
                      <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '700', color: category === c ? '#fff' : colors.textSecondary }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* ── Optional subcategory refinement (Responsibility Engine taxonomy) ── */}
              {subcategoryOptions.length > 0 && (
                <View style={{ marginBottom: 14, marginTop: -6 }}>
                  <Text style={[aq.label, { color: colors.textSecondary, marginBottom: 6 }]}>
                    Specifically… <Text style={{ color: colors.textTertiary, fontWeight: '600' }}>(optional)</Text>
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {subcategoryOptions.map(sc => {
                        const active = subcategoryId === sc.id;
                        return (
                          <TouchableOpacity
                            key={sc.id}
                            onPress={() => setSubcategoryId(active ? null : sc.id)}
                            style={[aq.catChip, { borderColor: pillBdr, backgroundColor: pillBg },
                              active && { backgroundColor: BRAND.purple, borderColor: BRAND.purple }]}
                          >
                            <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '700', color: active ? '#fff' : colors.textSecondary }}>
                              {sc.subcategoryLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* ── Assignment suggestion — real preview since this quest
                   already exists. Adult tasks call process-task-assignment
                   directly from the category; kid tasks call
                   process-kid-chore-assignment against the real chore row
                   (only possible in edit mode, not in AddQuestModal). ── */}
              {familyId && (
                <View style={{ marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      setLoadingSuggestion(true);
                      setAssignmentSuggestion(null);
                      const result = isAdultTask
                        ? await previewAssignment({
                            taskId: quest.id, taskType: 'chore', familyId,
                            category: subcategoryId ?? resolveDomainFromLooseLabel(category),
                          })
                        : await previewKidChoreAssignment({ choreId: quest.id, familyId });
                      setAssignmentSuggestion(result);
                      setLoadingSuggestion(false);
                    }}
                    disabled={loadingSuggestion}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      borderRadius: 14, paddingVertical: 11, borderWidth: 1.5, borderStyle: 'dashed',
                      borderColor: BRAND.purple + '60', backgroundColor: isDark ? colors.surface : '#F8F5FF',
                      opacity: loadingSuggestion ? 0.6 : 1, marginBottom: 8,
                    }}
                  >
                    {loadingSuggestion
                      ? <ActivityIndicator size="small" color={BRAND.purple} />
                      : <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
                          ✨ Who would this go to?
                        </Text>
                    }
                  </TouchableOpacity>

                  {assignmentSuggestion && (
                    <View style={{
                      borderRadius: 14, padding: 12,
                      backgroundColor: isDark ? colors.surface : '#F8FAFC',
                      borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
                    }}>
                      {assignmentSuggestion.error ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
                          {assignmentSuggestion.error}
                        </Text>
                      ) : assignmentSuggestion.decisionType === 'blocked' ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                          {assignmentSuggestion.reason ?? 'No eligible family member found for this.'}
                        </Text>
                      ) : (
                        <>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                            {assignmentSuggestion.decisionType === 'auto' ? '✅ Would auto-assign to ' :
                             assignmentSuggestion.decisionType === 'suggest' ? '💡 Suggested: ' : '🤔 Close call — '}
                            {assignmentSuggestion.explanation.selected ?? '—'}
                          </Text>
                          {assignmentSuggestion.candidates.filter(c => !c.excluded).length > 1 && (
                            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 3 }}>
                              {assignmentSuggestion.candidates
                                .filter(c => !c.excluded)
                                .map(c => `${c.memberName} (${Math.round(c.score)})`)
                                .join(' · ')}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Difficulty */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>Difficulty <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {([
                  { key: 'easy',   label: '😊 Easy',   color: '#10B981' },
                  { key: 'medium', label: '💪 Medium',  color: BRAND.amber },
                  { key: 'hard',   label: '🔥 Hard',   color: '#EF4444' },
                  { key: 'hero',   label: '⚡ Hero',   color: BRAND.purple },
                ] as { key: QuestDifficulty; label: string; color: string }[]).map(d => (
                  <TouchableOpacity key={d.key}
                    style={[aq.diffChip, { borderColor: difficulty === d.key ? d.color : pillBdr, backgroundColor: difficulty === d.key ? d.color + '22' : pillBg }]}
                    onPress={() => setDifficulty(p => p === d.key ? '' : d.key)}>
                    <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: difficulty === d.key ? d.color : colors.textTertiary }}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Due Date & Time — same shared picker AddQuestModal uses
                  (see DueDateTimePicker); was a near-byte-identical inline
                  duplicate of that form's block. */}
              <DueDateTimePicker
                value={dueDate} setValue={setDueDate}
                showDatePick={showDatePick} setShowDatePick={setShowDatePick}
                showTimePick={showTimePick} setShowTimePick={setShowTimePick}
                fmtDateLabel={fmtDateLabel} fmtTimeLabel={fmtTimeLabel}
                accentColor={BRAND.purple} colors={colors} isDark={isDark}
                pillStyle={aq.datePill} overlayStyle={aq.pickerOverlay} cardStyle={aq.pickerCard}
              />

              {/* Linked event (spec 8.2) — optional tie to an upcoming
                  calendar event this quest logistically supports. */}
              {(() => {
                const upcomingEvents = useEventStore.getState().events
                  .filter(e => e.date >= localDateStr(new Date()))
                  .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
                  .slice(0, 30);
                const linkedEvent = linkedEventId ? upcomingEvents.find(e => e.id === linkedEventId) : undefined;
                return (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={[aq.label, { color: colors.textSecondary }]}>Link to Event (optional)</Text>
                    <TouchableOpacity
                      style={[aq.datePill, { alignSelf: 'flex-start', backgroundColor: showEventPicker ? BRAND.purple + '20' : pillBg, borderColor: showEventPicker ? BRAND.purple : pillBdr }]}
                      onPress={() => setShowEventPicker(p => !p)}
                    >
                      <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>🔗</Text>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showEventPicker ? BRAND.purple : colors.textPrimary }} numberOfLines={1}>
                        {linkedEvent ? linkedEvent.title : 'None'}
                      </Text>
                    </TouchableOpacity>
                    {showEventPicker && (
                      <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: pillBdr, backgroundColor: colors.card, maxHeight: 220, overflow: 'hidden' }}>
                        <ScrollView keyboardShouldPersistTaps="always">
                          <TouchableOpacity
                            style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
                            onPress={() => { setLinkedEventId(undefined); setShowEventPicker(false); }}
                          >
                            <Text style={{ fontSize: TYPO.label, fontWeight: !linkedEventId ? '800' : '600', color: !linkedEventId ? BRAND.purple : colors.textSecondary }}>None</Text>
                          </TouchableOpacity>
                          {upcomingEvents.length === 0 ? (
                            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, padding: 14 }}>No upcoming events</Text>
                          ) : upcomingEvents.map(ev => (
                            <TouchableOpacity
                              key={ev.id}
                              style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
                              onPress={() => { setLinkedEventId(ev.id); setShowEventPicker(false); }}
                            >
                              <Text style={{ fontSize: TYPO.label, fontWeight: linkedEventId === ev.id ? '800' : '600', color: linkedEventId === ev.id ? BRAND.purple : colors.textPrimary }} numberOfLines={1}>
                                {ev.title}
                              </Text>
                              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>{fmtDate(ev.date)}{ev.time ? ` · ${fmtTime(ev.time)}` : ''}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Call-style reminder — allowed even in restricted edit mode,
                  since it's not a sensitive field like title/coins. Shared
                  with AddQuestModal and the Schedule form (see
                  CallReminderToggle); this file previously kept its own
                  byte-identical copy of the block. */}
              <CallReminderToggle
                alertCall={alertCall} setAlertCall={setAlertCall}
                alertCallLeadMinutes={alertCallLeadMinutes} setAlertCallLeadMinutes={setAlertCallLeadMinutes}
                accentColor={BRAND.purple} colors={colors} isDark={isDark}
                variant="icon" pillStyle={aq.datePill}
              />

              {/* Repeats — always shown, even if recurrence was never
                  explicitly set (or was set by accident, e.g. a past form
                  default bug) so it's never invisible from this sheet. */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>Repeats</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                {([
                  { key: 'once',    label: 'One-time' },
                  { key: 'daily',   label: '📅 Daily' },
                  { key: 'weekly',  label: '🗓 Weekly' },
                  { key: 'monthly', label: '📆 Monthly' },
                ] as const).map(({ key, label }) => (
                  <TouchableOpacity key={key}
                    onPress={() => setRoutineFreq(key)}
                    style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
                      borderColor: routineFreq === key ? BRAND.purple : colors.border,
                      backgroundColor: routineFreq === key ? BRAND.purple + '18' : 'transparent' }}>
                    <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800',
                      color: routineFreq === key ? BRAND.purple : colors.textSecondary }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {routineFreq !== (quest.recurrence ?? 'once') && (
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: -8, marginBottom: 14 }}>
                  {routineFreq === 'once'
                    ? "This turns off repeating — future occurrences won't be generated."
                    : `This chore will repeat ${routineFreq} going forward. Only future occurrences are affected — today's task stays as-is.`}
                </Text>
              )}

              {/* Adult Task toggle — always visible so locked (Adjust) mode still shows the flags */}
              {(
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 10,
                    backgroundColor: isAdultTask ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? colors.surface : '#F8FAFC'),
                    borderWidth: 1.5, borderColor: isAdultTask ? BRAND.purple : colors.border }}
                  onPress={() => { setIsAdultTask(p => !p); if (!isAdultTask) { setIsPool(false); setAssignIds([]); setInviteGrandparent(false); } }}
                  activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isAdultTask ? BRAND.purple : colors.textPrimary }}>
                      👨‍👩 Adult-Only Task
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      Hidden from kids — assignable to parents & GP
                    </Text>
                  </View>
                  <View style={{ width: 40, height: 24, borderRadius: 12,
                    backgroundColor: isAdultTask ? BRAND.purple : (isDark ? '#334155' : '#CBD5E1'),
                    justifyContent: 'center', padding: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                      alignSelf: isAdultTask ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Invite Grandparents toggle — always visible when adult task is on */}
              {isAdultTask && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 10,
                    backgroundColor: inviteGrandparent ? (isDark ? '#1a0f00' : '#FFFBEB') : (isDark ? colors.surface : '#F8FAFC'),
                    borderWidth: 1.5, borderColor: inviteGrandparent ? BRAND.amber : colors.border }}
                  onPress={() => setInviteGrandparent(p => !p)}
                  activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: inviteGrandparent ? BRAND.amber : colors.textPrimary }}>
                      {inviteGrandparent ? '👴 Grandparents included' : '👴 Invite Grandparents?'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      Grandparents can see & claim this task
                    </Text>
                  </View>
                  <View style={{ width: 40, height: 24, borderRadius: 12,
                    backgroundColor: inviteGrandparent ? BRAND.amber : (isDark ? '#334155' : '#CBD5E1'),
                    justifyContent: 'center', padding: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                      alignSelf: inviteGrandparent ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Teens Only toggle — independent of Adult-Only Task, matching
                  AddQuestModal's own "Teens Only" chip (AddQuestRecurrenceSection.tsx):
                  restricts an ordinary KID-facing pool chore to teens
                  specifically, not an adult-delegation concept. Was entirely
                  absent from this edit form — a chore's isOpenToTeens flag
                  was permanently create-only, with no way to add or remove
                  the restriction after the fact (live QA finding, High). */}
              {!isAdultTask && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 10,
                    backgroundColor: teensOnly ? colors.pinkLight : (isDark ? colors.surface : '#F8FAFC'),
                    borderWidth: 1.5, borderColor: teensOnly ? colors.pink : colors.border }}
                  onPress={() => {
                    const v = !teensOnly;
                    setTeensOnly(v);
                    // Same cleanup the create form's toggle needs — a kid
                    // already picked as assignee directly contradicts
                    // "teens only" the moment this turns on.
                    if (v) setAssignIds(prev => prev.filter(id => members.find((m: any) => m.id === id)?.role !== 'kid'));
                  }}
                  activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: teensOnly ? colors.pink : colors.textPrimary }}>
                      🚗 {teensOnly ? 'Teens only' : 'Teens Only?'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {teensOnly ? 'Hidden from kids' : 'Any kid can claim'}
                    </Text>
                  </View>
                  <View style={{ width: 40, height: 24, borderRadius: 12,
                    backgroundColor: teensOnly ? colors.pink : (isDark ? '#334155' : '#CBD5E1'),
                    justifyContent: 'center', padding: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                      alignSelf: teensOnly ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Assign To */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>
                Assign To{'  '}
                <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
                  {isPool ? 'open bounty' : assignIds.length === 0 ? 'tap to select' : `${assignIds.length} selected`}
                </Text>
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ flexDirection: 'row', gap: 12, paddingRight: 4 }}>
                {/* Bounty only available for non-adult tasks */}
                {!isAdultTask && (
                  <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} onPress={() => { setIsPool(true); setAssignIds([]); }}>
                    <View style={{ position: 'relative' }}>
                      <FamilyAvatar name="Bounty" emoji="⚡" size={40} ringColor={BRAND.amber} ringWidth={isPool ? 2.5 : 1} bgColor={isPool ? BRAND.amber + '30' : pillBg} />
                      {isPool && <View style={[aq.avatarCheck, { backgroundColor: BRAND.amber }]}><Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text></View>}
                    </View>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: isPool ? BRAND.amber : colors.textTertiary }}>Bounty</Text>
                  </TouchableOpacity>
                )}
                {members.filter(m => {
                  if (isAdultTask) {
                    if (m.role === 'parent') return true;
                    if (m.role === 'senior') return inviteGrandparent; // only when GP invited
                    return false;
                  }
                  // Was missing the teensOnly gate entirely — a kid could be
                  // picked as assignee on a chore flagged isOpenToTeens,
                  // directly contradicting the flag (live QA finding, High).
                  if (teensOnly && m.role === 'kid') return false;
                  return m.role === 'kid' || m.role === 'teen' || m.role === 'parent' || m.role === 'senior';
                }).map(m => {
                  const sel = assignIds.includes(m.id) && !isPool;
                  const roleColor = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? '#0EA5E9' : '#10B981';
                  return (
                    <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 4 }}
                      onPress={() => { setIsPool(false); const next = assignIds.includes(m.id) ? assignIds.filter(id => id !== m.id) : [...assignIds, m.id]; setAssignIds(next); }}>
                      <View style={{ position: 'relative' }}>
                        <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={siblings} size={40} ringColor={roleColor} ringWidth={sel ? 2.5 : 1} bgColor={sel ? roleColor + '25' : pillBg} />
                        {sel && <View style={[aq.avatarCheck, { backgroundColor: roleColor }]}><Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text></View>}
                      </View>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? roleColor : colors.textTertiary }} numberOfLines={1}>{m.id === activeMemberId ? 'Me' : m.name.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Photo required toggle */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 14,
                  backgroundColor: photoReq ? (isDark ? '#0B2218' : '#F0FDF4') : (isDark ? colors.surface : '#F8FAFC'),
                  borderWidth: 1.5, borderColor: photoReq ? '#10B981' : colors.border }}
                onPress={() => setPhotoReq(p => !p)} activeOpacity={0.8}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: photoReq ? '#10B981' : colors.textPrimary }}>📸 Photo Required</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Kid must attach proof when submitting</Text>
                </View>
                <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: photoReq ? '#10B981' : (isDark ? '#334155' : '#CBD5E1'), justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: photoReq ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>

            </ScrollView>

            {/* Sticky footer — Save + Delete was inside the ScrollView,
                could scroll out of view on this form's many sections
                (title/description/coins/bonus/category/difficulty/due-date/
                repeats/assignment) or end up below the keyboard. */}
            <View style={{ flexDirection: 'row', gap: 10, padding: 20, paddingTop: 14,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              {onDelete && (
                <TouchableOpacity
                  style={{ paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A560', backgroundColor: isDark ? '#2D1515' : '#FEF2F2' }}
                  onPress={() => {
                    if (locked) {
                      // Active quest — prompt for reason before deleting
                      Alert.prompt(
                        'Delete Active Chore',
                        `"${quest.title}" is in progress. Add a note for the assignee (required):`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: (note: string | undefined) => {
                            if (!note?.trim()) { Alert.alert('Note required', 'Please add a reason so the assignee knows why this was removed.'); return; }
                            onDelete(quest.id);
                            onClose();
                          }},
                        ],
                        'plain-text',
                      );
                    } else {
                      Alert.alert('Delete Chore', `Remove "${quest.title}"? This cannot be undone.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => { onDelete(quest.id); onClose(); } },
                      ]);
                    }
                  }}>
                  <I.X c="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: TYPO.micro, fontWeight: '700', marginTop: 2 }}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[aq.submitBtn, { flex: 1, backgroundColor: title.trim() ? '#059669' : colors.border, opacity: saving ? 0.6 : 1 }]}
                onPress={save} disabled={saving || !title.trim()}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>Save Changes</Text>
                      <Text style={{ color: '#A7F3D0', fontSize: TYPO.label, marginTop: 2 }}>Due {fmtDateLabel(dueDate)} at {fmtTimeLabel(dueDate)}</Text>
                    </>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
