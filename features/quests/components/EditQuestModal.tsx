import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, Platform,
  Keyboard, StyleSheet, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
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
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);

  const parseDue = () => {
    if (quest.dueDate) {
      // dueDate may be a full ISO timestamp — normalise to YYYY-MM-DD before parsing
      const datePart = quest.dueDate.includes('T') ? quest.dueDate.split('T')[0] : quest.dueDate;
      const d = parseLocalDate(datePart);
      if (isNaN(d.getTime())) {
        // fallback: parse ISO directly
        const iso = new Date(quest.dueDate);
        if (!isNaN(iso.getTime())) { d.setTime(iso.getTime()); }
      }
      if (quest.dueTime) {
        // dueTime may also be an ISO string or HH:MM
        if (quest.dueTime.includes('T') || quest.dueTime.length > 5) {
          const iso = new Date(quest.dueTime);
          if (!isNaN(iso.getTime())) d.setHours(iso.getHours(), iso.getMinutes(), 0, 0);
        } else {
          const parsed = parseTimeInput(quest.dueTime);
          if (parsed) {
            const [h, m] = parsed.split(':').map(Number);
            d.setHours(h, m || 0, 0, 0);
          }
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
  const [weekDays, setWeekDays] = useState<number[]>((quest as any).weekDays ?? []);
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
  const canvas = isDark ? '#0E0C13' : '#FFFFFF';

  // Figma section card — floating white card with shadow
  const sectionCard = {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#2C3244',
    shadowOffset: { width: 0, height: 5 } as const,
    shadowOpacity: isDark ? 0 : 0.045,
    shadowRadius: 18,
  };

  // Overline heading style (10px 700 letter-spaced)
  const overline = (color: string) => ({
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.09 * 10,
    color,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  });

  // Figma input style — 48px, borderRadius 14, white bg
  const figmaInput = {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.textPrimary,
  };
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
        ...(routineFreq === 'weekly' && weekDays.length > 0 ? { weekDays } : {}),
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
        ...(routineFreq === 'weekly' && weekDays.length > 0 ? { weekDays } : {}),
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

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* ── Top bar: ‹ back + title ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 8 }}>
            <TouchableOpacity onPress={dismiss} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 22, color: colors.pink, fontWeight: '400', lineHeight: 26, marginTop: -1 }}>‹</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.pink }}>Back</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>
                {locked ? 'Adjust Chore' : 'Edit Chore'}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                {locked ? 'Date & description locked (in progress)' : 'Edit title, assignment & more'}
              </Text>
            </View>
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

            <ScrollView
              keyboardShouldPersistTaps="always"
              onScrollBeginDrag={Keyboard.dismiss}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
              style={{ backgroundColor: canvas }}
            >

              {/* ── WHAT section ── */}
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.pink, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
                What's the chore?
              </Text>

              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700', marginBottom: 8 }}>Chore title *</Text>
              <TextInput
                style={{
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
                  fontSize: 17, fontWeight: '600',
                  backgroundColor: colors.card, color: colors.textPrimary,
                  borderWidth: 1.5, borderColor: title.trim() ? colors.pink : '#EF444480',
                  marginBottom: 10,
                }}
                value={title} onChangeText={setTitle} returnKeyType="next"
                placeholder="e.g. Water the plants, Do homework…" placeholderTextColor={colors.textTertiary}
              />

              {editSuggestions.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 6, fontWeight: '600' }}>
                    {title.trim() ? 'Matching suggestions' : 'Quick picks — tap to fill'}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {editSuggestions.map((s, i) => (
                        <TouchableOpacity key={i}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                            backgroundColor: title.toLowerCase() === s.title.toLowerCase() ? colors.pinkLight : colors.card,
                            borderColor: title.toLowerCase() === s.title.toLowerCase() ? colors.pink : colors.border,
                          }}
                          onPress={() => applyEditSuggestion(s)}>
                          <Text style={{ fontSize: 12, color: title.toLowerCase() === s.title.toLowerCase() ? colors.pink : colors.textSecondary, fontWeight: '700' }} numberOfLines={1}>{s.title}</Text>
                          <Text style={{ fontSize: 12, color: colors.amber, fontWeight: '700' }}>+{s.coins}🪙</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700', marginBottom: 8, marginTop: 16 }}>
                What does done look like?{locked ? '' : ' *'}
              </Text>
              {locked ? (
                <View style={{ borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 24 }}>
                  <Text style={{ fontSize: 14, color: quest.description ? colors.textPrimary : colors.textTertiary, lineHeight: 20 }}>
                    {quest.description || 'No description — locked while in progress'}
                  </Text>
                </View>
              ) : (
                <>
                  <TextInput
                    style={{
                      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                      fontSize: 15, fontWeight: '400', lineHeight: 22,
                      backgroundColor: colors.card, color: colors.textPrimary,
                      borderWidth: 1, borderColor: colors.border,
                      minHeight: 80, textAlignVertical: 'top', marginBottom: 4,
                    }}
                    value={desc} onChangeText={t => setDesc(t.slice(0, 150))}
                    multiline numberOfLines={3}
                    placeholder="Describe exactly what's expected…" placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={{ fontSize: 11, color: desc.length > 130 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginBottom: 20 }}>
                    {desc.length}/150
                  </Text>
                </>
              )}

              {/* ── WHEN section ── */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 28 }} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.teal, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
                When &amp; how often?
              </Text>

              {!locked && (
                <>
                  <DueDateTimePicker
                    value={dueDate} setValue={setDueDate}
                    showDatePick={showDatePick} setShowDatePick={setShowDatePick}
                    showTimePick={showTimePick} setShowTimePick={setShowTimePick}
                    fmtDateLabel={fmtDateLabel} fmtTimeLabel={fmtTimeLabel}
                    accentColor={colors.teal} colors={colors} isDark={isDark}
                    pillStyle={aq.datePill} overlayStyle={aq.pickerOverlay} cardStyle={aq.pickerCard}
                  />
                </>
              )}

              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700', marginBottom: 10, marginTop: locked ? 0 : 16 }}>Repeat</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {([
                  { key: 'once', label: 'Once' },
                  { key: 'daily', label: '📅 Daily' },
                  { key: 'weekly', label: '🗓 Weekly' },
                  { key: 'monthly', label: '📆 Monthly' },
                ] as const).map(({ key, label }) => (
                  <TouchableOpacity key={key} onPress={() => setRoutineFreq(key)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                      backgroundColor: routineFreq === key ? colors.teal : colors.card,
                      borderWidth: 1.5, borderColor: routineFreq === key ? colors.teal : colors.border,
                    }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: routineFreq === key ? '#fff' : colors.teal }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Weekly day picker */}
              {routineFreq === 'weekly' && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginBottom: 8 }}>Repeats on</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((day, idx) => {
                      const dayNum = idx === 6 ? 0 : idx + 1; // 0=Sun, 1=Mon … 6=Sat
                      const active = (weekDays ?? []).includes(dayNum);
                      return (
                        <TouchableOpacity key={day}
                          onPress={() => {
                            const cur = weekDays ?? [];
                            setWeekDays(active ? cur.filter(d => d !== dayNum) : [...cur, dayNum]);
                          }}
                          style={{
                            flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                            backgroundColor: active ? colors.teal : colors.card,
                            borderWidth: 1.5, borderColor: active ? colors.teal : colors.border,
                          }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : colors.textSecondary }}>{day}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {(weekDays ?? []).length === 0 && (
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 6 }}>Pick at least one day</Text>
                  )}
                </View>
              )}

              {routineFreq !== (quest.recurrence ?? 'once') && (
                <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: -4, marginBottom: 12 }}>
                  {routineFreq === 'once' ? "Turns off repeating — future occurrences won't be generated."
                    : `Will repeat ${routineFreq} going forward. Today's task stays as-is.`}
                </Text>
              )}

              {!locked && (
                <View style={{ marginBottom: 20 }}>
                  <CallReminderToggle
                    alertCall={alertCall} setAlertCall={setAlertCall}
                    alertCallLeadMinutes={alertCallLeadMinutes} setAlertCallLeadMinutes={setAlertCallLeadMinutes}
                    accentColor={colors.teal} colors={colors} isDark={isDark}
                    variant="icon" pillStyle={aq.datePill}
                  />
                </View>
              )}

              {/* ── REWARD section ── */}
              {!isAdultTask && (
                <>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 28 }} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.pink, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16, marginTop: 0 }}>
                    Reward
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12, opacity: coinsDisabled ? 0.4 : 1 }}>
                    {[10, 20, 30, 50, 75, 100].map(c => {
                      const coinNum = parseInt(coins) || 0;
                      const isActive = coinNum === c;
                      return (
                        <TouchableOpacity key={c} onPress={() => !coinsDisabled && setCoins(String(c))}
                          style={{
                            width: '30%', flexGrow: 1,
                            paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                            backgroundColor: isActive && !coinsDisabled ? colors.pink : colors.pinkLight,
                            borderWidth: 1.5, borderColor: isActive && !coinsDisabled ? colors.pink : colors.border,
                          }}>
                          <Text style={{ fontSize: 17, fontWeight: '800', color: isActive && !coinsDisabled ? '#fff' : colors.pink }}>
                            {c}
                          </Text>
                          <Text style={{ fontSize: 11, color: isActive && !coinsDisabled ? 'rgba(255,255,255,0.8)' : colors.textTertiary, marginTop: 2 }}>
                            coins
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, opacity: coinsDisabled ? 0.4 : 1 }}>
                    <TextInput
                      editable={!coinsDisabled}
                      value={coinsDisabled ? '' : coins}
                      onChangeText={v => { const n = v.replace(/[^0-9]/g, ''); setCoins(n); }}
                      placeholder="Custom coins…"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="number-pad"
                      style={{
                        flex: 1, height: 44, borderRadius: 10, paddingHorizontal: 14,
                        fontSize: 15, fontWeight: '600', color: colors.textPrimary,
                        backgroundColor: colors.card,
                        borderWidth: 1.5, borderColor: coins && !coinsDisabled ? colors.pink : colors.border,
                      }}
                    />
                    {coins && !coinsDisabled ? (
                      <View style={{ backgroundColor: colors.pinkLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.pink }}>{coins} 🪙</Text>
                      </View>
                    ) : null}
                  </View>
                  {/* Bonus coins */}
                  <View style={{
                    borderRadius: 14, padding: 16, marginBottom: 24,
                    backgroundColor: bonusCoins && !coinsDisabled ? colors.amberLight : (isDark ? colors.surface : '#FAFAFA'),
                    borderWidth: 1.5, borderColor: bonusCoins && !coinsDisabled ? colors.amber : colors.border,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Text style={{ fontSize: 14 }}>⚡</Text>
                      <Text style={{ fontSize: 12, color: bonusCoins && !coinsDisabled ? colors.amber : colors.textSecondary, fontWeight: '700' }}>Bonus coins (optional)</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TextInput
                        editable={!coinsDisabled}
                        value={coinsDisabled ? '' : bonusCoins}
                        onChangeText={t => !coinsDisabled && setBonusCoins(t.replace(/[^0-9]/g, ''))}
                        placeholder="+coins"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="number-pad"
                        style={{
                          flex: 1, height: 40, borderRadius: 10, paddingHorizontal: 12,
                          fontSize: 15, fontWeight: '600', color: colors.textPrimary,
                          backgroundColor: colors.card,
                          borderWidth: 1, borderColor: bonusCoins && !coinsDisabled ? colors.amber : colors.border,
                        }}
                      />
                      {bonusCoins && !coinsDisabled ? (
                        <View style={{ backgroundColor: colors.amberLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.amber }}>+{bonusCoins} 🎉</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 6 }}>Extra reward · expires in 24h after posting</Text>
                  </View>
                  {coinsDisabled && inviteGrandparent && (
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: -16, marginBottom: 14 }}>
                      Grandparents aren't paid coins — this is logged and thanked instead.
                    </Text>
                  )}
                </>
              )}

              {/* ── WHO section ── */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 28 }} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.amber, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
                Who's doing it?
              </Text>

              {/* Assignment AI suggestion */}
              {familyId && (
                <View style={{ marginBottom: 12 }}>
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
                      borderRadius: 12, paddingVertical: 12, borderWidth: 1.5, borderStyle: 'dashed',
                      borderColor: colors.pink + '60', backgroundColor: colors.pinkLight,
                      opacity: loadingSuggestion ? 0.6 : 1,
                    }}
                  >
                    {loadingSuggestion
                      ? <ActivityIndicator size="small" color={colors.pink} />
                      : <Text style={{ fontSize: 14, fontWeight: '700', color: colors.pink }}>✨ Who should do this?</Text>
                    }
                  </TouchableOpacity>
                  {assignmentSuggestion && (
                    <View style={{ borderRadius: 12, padding: 12, marginTop: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                      {assignmentSuggestion.error ? (
                        <Text style={{ fontSize: 13, color: colors.textTertiary }}>{assignmentSuggestion.error}</Text>
                      ) : assignmentSuggestion.decisionType === 'blocked' ? (
                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>{assignmentSuggestion.reason ?? 'No eligible member found.'}</Text>
                      ) : (
                        <>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                            {assignmentSuggestion.decisionType === 'auto' ? '✅ Auto-assign to ' :
                             assignmentSuggestion.decisionType === 'suggest' ? '💡 Suggested: ' : '🤔 Close call — '}
                            {assignmentSuggestion.explanation.selected ?? '—'}
                          </Text>
                          {assignmentSuggestion.candidates.filter(c => !c.excluded).length > 1 && (
                            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>
                              {assignmentSuggestion.candidates.filter(c => !c.excluded).map(c => `${c.memberName} (${Math.round(c.score)})`).join(' · ')}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Avatar chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                {!isAdultTask && (
                  <TouchableOpacity onPress={() => { setIsPool(true); setAssignIds([]); }} activeOpacity={0.75} style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{
                      width: 52, height: 52, borderRadius: 26,
                      backgroundColor: isPool ? colors.amber : colors.amberLight,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2.5, borderColor: isPool ? colors.amber : colors.border,
                    }}>
                      <Text style={{ fontSize: 20 }}>⚡</Text>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: isPool ? '700' : '500', color: isPool ? colors.amber : colors.textSecondary }}>Pool</Text>
                  </TouchableOpacity>
                )}
                {members.filter(m => {
                  if (isAdultTask) {
                    if (m.role === 'parent') return true;
                    if (m.role === 'senior') return inviteGrandparent;
                    return false;
                  }
                  if (teensOnly && m.role === 'kid') return false;
                  return m.role === 'kid' || m.role === 'teen' || m.role === 'parent' || m.role === 'senior';
                }).map(m => {
                  const sel = assignIds.includes(m.id) && !isPool;
                  const chipColor = m.role === 'parent' ? colors.teal : colors.amber;
                  const chipLight = m.role === 'parent' ? colors.tealLight : colors.amberLight;
                  return (
                    <TouchableOpacity key={m.id}
                      onPress={() => { setIsPool(false); const next = assignIds.includes(m.id) ? assignIds.filter(id => id !== m.id) : [...assignIds, m.id]; setAssignIds(next); }}
                      activeOpacity={0.75} style={{ alignItems: 'center', gap: 4 }}>
                      <View style={{
                        width: 52, height: 52, borderRadius: 26,
                        backgroundColor: sel ? chipColor : chipLight,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 2.5, borderColor: sel ? chipColor : colors.border,
                      }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: sel ? '#fff' : chipColor }}>
                          {m.name[0].toUpperCase()}
                        </Text>
                        {sel && (
                          <View style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 9, color: '#fff', fontWeight: '800' }}>✓</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 10, fontWeight: sel ? '700' : '500', color: sel ? chipColor : colors.textSecondary }} numberOfLines={1}>
                        {m.id === activeMemberId ? 'Me' : m.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Role toggles */}
              <View style={{ gap: 8, marginTop: 8, marginBottom: 24 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
                    backgroundColor: isAdultTask ? colors.pinkLight : colors.card,
                    borderWidth: 1.5, borderColor: isAdultTask ? colors.pink : colors.border }}
                  onPress={() => { setIsAdultTask(p => !p); if (!isAdultTask) { setIsPool(false); setAssignIds([]); setInviteGrandparent(false); } }}
                  activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isAdultTask ? colors.pink : colors.textPrimary }}>👨‍👩 Adult-Only Task</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>Hidden from kids — parents & GP only</Text>
                  </View>
                  <View style={{ width: 40, height: 24, borderRadius: 12, backgroundColor: isAdultTask ? colors.pink : (isDark ? '#334155' : '#CBD5E1'), justifyContent: 'center', padding: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: isAdultTask ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>

                {isAdultTask && members.some(m => m.role === 'senior') && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
                      backgroundColor: inviteGrandparent ? colors.amberLight : colors.card,
                      borderWidth: 1.5, borderColor: inviteGrandparent ? colors.amber : colors.border }}
                    onPress={() => setInviteGrandparent(p => !p)} activeOpacity={0.8}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: inviteGrandparent ? colors.amber : colors.textPrimary }}>
                        {inviteGrandparent ? '👴 Grandparents included' : '👴 Invite Grandparents?'}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>Grandparents can see & claim this task</Text>
                    </View>
                    <View style={{ width: 40, height: 24, borderRadius: 12, backgroundColor: inviteGrandparent ? colors.amber : (isDark ? '#334155' : '#CBD5E1'), justifyContent: 'center', padding: 2 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: inviteGrandparent ? 'flex-end' : 'flex-start' }} />
                    </View>
                  </TouchableOpacity>
                )}

                {!isAdultTask && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
                      backgroundColor: teensOnly ? colors.pinkLight : colors.card,
                      borderWidth: 1.5, borderColor: teensOnly ? colors.pink : colors.border }}
                    onPress={() => { const v = !teensOnly; setTeensOnly(v); if (v) setAssignIds(prev => prev.filter(id => members.find((m: any) => m.id === id)?.role !== 'kid')); }}
                    activeOpacity={0.8}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: teensOnly ? colors.pink : colors.textPrimary }}>🚗 {teensOnly ? 'Teens only' : 'Teens Only?'}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>{teensOnly ? 'Hidden from kids' : 'Any kid can claim'}</Text>
                    </View>
                    <View style={{ width: 40, height: 24, borderRadius: 12, backgroundColor: teensOnly ? colors.pink : (isDark ? '#334155' : '#CBD5E1'), justifyContent: 'center', padding: 2 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: teensOnly ? 'flex-end' : 'flex-start' }} />
                    </View>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
                    backgroundColor: photoReq ? colors.tealLight : colors.card,
                    borderWidth: 1.5, borderColor: photoReq ? colors.teal : colors.border }}
                  onPress={() => setPhotoReq(p => !p)} activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: photoReq ? colors.teal : colors.textPrimary }}>📸 Photo Required</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>Kid must attach proof when submitting</Text>
                  </View>
                  <View style={{ width: 40, height: 24, borderRadius: 12, backgroundColor: photoReq ? colors.teal : (isDark ? '#334155' : '#CBD5E1'), justifyContent: 'center', padding: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: photoReq ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* ── Category + Difficulty ── */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 28 }} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.pink, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
                Category &amp; difficulty
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700', marginBottom: 8 }}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[...ALL_CATEGORIES, ...customCategories.filter(cc => !ALL_CATEGORIES.includes(cc.key as QuestCategory)).map(cc => cc.key as QuestCategory)].map(c => (
                    <TouchableOpacity key={c}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: category === c ? colors.pink : colors.card,
                        borderWidth: 1.5, borderColor: category === c ? colors.pink : colors.border,
                      }}
                      onPress={() => setCategory(c)}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: category === c ? '#fff' : colors.textSecondary }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {subcategoryOptions.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 }}>More specifically… (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {subcategoryOptions.map(sc => {
                        const active = subcategoryId === sc.id;
                        return (
                          <TouchableOpacity key={sc.id} onPress={() => setSubcategoryId(active ? null : sc.id)}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                              backgroundColor: active ? colors.pink : colors.card,
                              borderWidth: 1.5, borderColor: active ? colors.pink : colors.border,
                            }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.textSecondary }}>{sc.subcategoryLabel}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700', marginBottom: 10, marginTop: 16 }}>Difficulty (optional)</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
                {([
                  { key: 'easy',   label: '😊 Easy',   color: '#10B981' },
                  { key: 'medium', label: '💪 Medium',  color: colors.amber },
                  { key: 'hard',   label: '🔥 Hard',   color: '#EF4444' },
                  { key: 'hero',   label: '⚡ Hero',   color: colors.pink },
                ] as { key: QuestDifficulty; label: string; color: string }[]).map(d => (
                  <TouchableOpacity key={d.key}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                      backgroundColor: difficulty === d.key ? d.color : colors.card,
                      borderWidth: 1.5, borderColor: difficulty === d.key ? d.color : colors.border,
                    }}
                    onPress={() => setDifficulty(p => p === d.key ? '' : d.key)}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: difficulty === d.key ? '#fff' : colors.textSecondary }}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── Linked Event (optional) ── */}
              {(() => {
                const upcomingEvents = useEventStore.getState().events
                  .filter(e => e.date >= localDateStr(new Date()))
                  .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
                  .slice(0, 30);
                const linkedEvent = linkedEventId ? upcomingEvents.find(e => e.id === linkedEventId) : undefined;
                return (
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 }}>Link to event (optional)</Text>
                    <TouchableOpacity
                      style={[aq.datePill, { alignSelf: 'flex-start', backgroundColor: showEventPicker ? colors.tealLight : colors.card, borderColor: showEventPicker ? colors.teal : colors.border }]}
                      onPress={() => setShowEventPicker(p => !p)}
                    >
                      <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>🔗</Text>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showEventPicker ? colors.teal : colors.textPrimary }} numberOfLines={1}>
                        {linkedEvent ? linkedEvent.title : 'None'}
                      </Text>
                    </TouchableOpacity>
                    {showEventPicker && (
                      <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, maxHeight: 220, overflow: 'hidden' }}>
                        <ScrollView keyboardShouldPersistTaps="always">
                          <TouchableOpacity
                            style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
                            onPress={() => { setLinkedEventId(undefined); setShowEventPicker(false); }}
                          >
                            <Text style={{ fontSize: TYPO.label, fontWeight: !linkedEventId ? '800' : '600', color: !linkedEventId ? colors.teal : colors.textSecondary }}>None</Text>
                          </TouchableOpacity>
                          {upcomingEvents.length === 0 ? (
                            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, padding: 14 }}>No upcoming events</Text>
                          ) : upcomingEvents.map(ev => (
                            <TouchableOpacity
                              key={ev.id}
                              style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
                              onPress={() => { setLinkedEventId(ev.id); setShowEventPicker(false); }}
                            >
                              <Text style={{ fontSize: TYPO.label, fontWeight: linkedEventId === ev.id ? '800' : '600', color: linkedEventId === ev.id ? colors.teal : colors.textPrimary }} numberOfLines={1}>
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

            </ScrollView>

            {/* Sticky footer — Save + Delete was inside the ScrollView,
                could scroll out of view on this form's many sections
                (title/description/coins/bonus/category/difficulty/due-date/
                repeats/assignment) or end up below the keyboard. */}
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 14,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
              backgroundColor: canvas }}>
              {onDelete && (
                <TouchableOpacity
                  style={{ width: 52, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A560', backgroundColor: isDark ? '#2D1515' : '#FEF2F2' }}
                  onPress={() => {
                    if (locked) {
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
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={{ flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: title.trim() ? colors.teal : colors.border, opacity: saving ? 0.6 : 1 }}
                onPress={save} disabled={saving || !title.trim()}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Save Changes</Text>
                      {!locked && <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 }}>Due {fmtDateLabel(dueDate)} · {fmtTimeLabel(dueDate)}</Text>}
                    </>}
              </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
