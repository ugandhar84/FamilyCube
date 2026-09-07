/**
 * KioskQuestEditor — edit or delete an existing chore from kiosk mode.
 * Writes through the exact same choreStore.updateChore/deleteChore/
 * addParentQuest the phone's real EditQuestModal ultimately calls (via
 * choreAdapter.ts's Quest->ChoreTask translation) — this file skips that
 * translation layer entirely and calls updateChore directly with native
 * ChoreTask field names, since kiosk never routes through the Quest shim
 * the way QuestsScreen.tsx does.
 *
 * ── Real parity, not a re-design ─────────────────────────────────────────
 * Live-requested ("make same logic as the mobile app while designing
 * similar to the overview cards styles and buttons"): the PRIOR version of
 * this file only let a parent change title and coin reward — 2 of ~19 real
 * editable fields EditQuestModal.tsx actually exposes. Every field, toggle,
 * and cascading rule below was confirmed by reading EditQuestModal.tsx,
 * AddQuestModal.tsx, choreAdapter.ts's translation table, and choreStore
 * .ts's real updateChore/deleteChore/addParentQuest bodies in full — this
 * matches the phone's real edit form exactly, INCLUDING its own real gaps
 * (confirmed, not accidental):
 *   - No multi-assignee editing: choreAdapter.ts's updateQuest has no
 *     branch for assignedToIds at all, so re-assigning to multiple kids via
 *     Edit doesn't actually persist on the phone either — single-assignee
 *     + pool/bounty only, matching what actually works upstream.
 *   - No weekday/day-of-month recurrence grid: EditQuestModal's own
 *     recurrence UI is a bare 4-chip frequency row (One-time/Daily/Weekly/
 *     Monthly) with no day picker at all — AddQuestRecurrenceSection's
 *     WeekdayChips/DayOfMonthGrid are AddQuestModal-only, never reachable
 *     from Edit.
 *   - No bounty claimant-cap editing: maxClaimants is create-only on the
 *     phone too (set via AddQuestAssignSection at creation), no control in
 *     EditQuestModal at all.
 *   - No shopping/grocery item editing: EditQuestModal has zero import of
 *     AddQuestGrocerySection — shopping items are creation-only there too.
 *
 * ── Shell ─────────────────────────────────────────────────────────────────
 * Rebuilt from a hand-rolled centered Modal (raw `colors` prop, its own
 * overlay/card/header/footer) onto KioskFormDrawer's real drawer shell and
 * kiosk's own useKioskColors()/k.* palette — matching KioskEventEditor's
 * own prior rebuild, not a one-off shape.
 *
 * RBAC: re-checks deriveQuestActions' canEdit/canDelete at the point of the
 * actual write, not only where the editor is opened from — same belt-and-
 * suspenders reasoning KioskEventEditor's deriveEventEditPermission fix
 * already established for the calendar editor.
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, Switch, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Trash2, Lock, ListTodo, Link2, X } from 'lucide-react-native';

import { useChoreStore, type ChoreCategoryType } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { useEventStore } from '@/store/eventStore';
import { showToast } from '@/components/AppToast';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { CallReminderToggle } from '@/features/tasks/components/forms/CallReminderToggle';
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';
import MemberPicker from '@/features/calendar/components/eventForm/MemberPicker';
import { ALL_CATEGORIES, CATEGORY_META } from '@/features/quests/components/questFormShared';
import {
  resolveDomainFromLooseLabel, fetchSubcategoriesForDomain, previewAssignment, previewKidChoreAssignment,
  type AssignmentSuggestion, type ResponsibilityCategory,
} from '@/lib/responsibilityCategories';
import { fmtDate, fmtTime, localDateStr } from '@/lib/dates';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';

const DIFFICULTIES: { key: 'easy' | 'medium' | 'hard' | 'hero'; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'hero', label: 'Hero' },
];
const RECUR_OPTIONS: { key: 'once' | 'daily' | 'weekly' | 'monthly'; label: string }[] = [
  { key: 'once', label: 'One-time' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

function timeStrToDate(t: string | undefined): Date | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function KioskQuestEditor({ quest, active, members, isActiveApprover, onClose, colors, isDark }: {
  quest: Quest | null; active: FamilyMember; members: FamilyMember[]; isActiveApprover?: boolean; onClose: () => void;
  colors: any; isDark: boolean;
}) {
  const { k } = useKioskColors();
  const updateChore = useChoreStore(s => s.updateChore);
  const deleteChore = useChoreStore(s => s.deleteChore);
  const addParentQuest = useChoreStore(s => s.addParentQuest);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coins, setCoins] = useState('0');
  const [bonusCoins, setBonusCoins] = useState('0');
  const [category, setCategory] = useState<string>('Other');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'hero' | undefined>(undefined);
  const [dueDateValue, setDueDateValue] = useState<Date | null>(null);
  const [showDuePicker, setShowDuePicker] = useState<'date' | 'time' | null>(null);
  const [linkedEventId, setLinkedEventId] = useState<string | undefined>(undefined);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [alertCall, setAlertCall] = useState(false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(10);
  const [recurrence, setRecurrence] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [isAdultTask, setIsAdultTask] = useState(false);
  const [inviteGrandparents, setInviteGrandparents] = useState(false);
  const [teensOnly, setTeensOnly] = useState(false);
  const [requiresPhotoProof, setRequiresPhotoProof] = useState(false);
  const [isPool, setIsPool] = useState(false);
  const [assignId, setAssignId] = useState<string | undefined>(undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Responsibility Engine preview — real gap the Chores-tab mobile-parity
  // audit found (D1): this file had zero trace of the same "who should
  // this go to" auto-assignment engine EditQuestModal.tsx's own edit form
  // offers (its lines 430-499, read in full before writing this). Preview
  // only, same as the phone's own button — nothing is written until the
  // parent actually saves changes via the real Assign To picker below.
  const [assignmentSuggestion, setAssignmentSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  // Optional subcategory refinement — real EditQuestModal.tsx field
  // [fresh-audit gap], absent from kiosk entirely before this. Lets the
  // Responsibility Engine preview target a specific subcategory
  // (e.g. "Doctor visit" within Medical) instead of only the coarse
  // top-level category. Verbatim EditQuestModal.tsx lines 128-138 —
  // refetches and resets to null every time `category` changes, same
  // real reasoning: a subcategory pick from the PREVIOUS category would
  // be meaningless once the category itself changed.
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [subcategoryOptions, setSubcategoryOptions] = useState<ResponsibilityCategory[]>([]);
  useEffect(() => {
    setSubcategoryId(null);
    setAssignmentSuggestion(null);
    const domain = resolveDomainFromLooseLabel(category);
    fetchSubcategoriesForDomain(domain).then(setSubcategoryOptions);
  }, [category]);

  useEffect(() => {
    if (quest) {
      setTitle(quest.title);
      setDescription(quest.description ?? '');
      setCoins(String(quest.coins));
      setBonusCoins(String(quest.bonusCoins ?? 0));
      setCategory(quest.category ?? 'Other');
      setDifficulty(quest.difficulty);
      setDueDateValue(quest.dueDate ? new Date(`${quest.dueDate}T00:00:00`) : null);
      setShowDuePicker(null);
      setLinkedEventId(quest.linkedEventId);
      setShowEventPicker(false);
      setAlertCall(quest.alertCall ?? false);
      setAlertCallLeadMinutes(quest.alertCallLeadMinutes ?? 10);
      // Same real coercion EditQuestModal.tsx's own prefill uses: a chore
      // whose recurrence isn't one of these 4 basic values (e.g.
      // 'biweekly'/'custom', reachable only from AddQuestModal's fuller
      // recurrence UI, or a stale prior-bug default) falls back to
      // 'once' rather than crashing the chip row on an unrecognized value.
      setRecurrence(RECUR_OPTIONS.some(o => o.key === quest.recurrence) ? (quest.recurrence as any) : 'once');
      setIsAdultTask(!!quest.isAdultTask);
      setInviteGrandparents(!!quest.inviteGrandparents);
      setTeensOnly(!!quest.isOpenToTeens);
      setRequiresPhotoProof(!!(quest as any).requiresPhotoProof);
      setIsPool(!!quest.isPool);
      setAssignId(quest.assignedToId ?? (quest.assignedToIds?.[0]));
      setConfirmingDelete(false);
      setAssignmentSuggestion(null);
      setLoadingSuggestion(false);
    }
  }, [quest?.id]);

  if (!quest) return null;

  const actions = deriveQuestActions(quest, { id: active.id, role: active.role, isActiveApprover });
  const canEdit = actions.canEdit;
  const canDelete = actions.canDelete;
  // Same real "full vs restricted" split QuestsScreen.tsx computes at the
  // call site (editMode={editTarget.status === 'todo' ? 'full' : ...}) —
  // once a chore is claimed/in-progress/submitted, description and due
  // date/time lock (EditQuestModal.tsx's own gate), matching a real
  // committed chore's terms not silently shifting under whoever claimed it.
  const isFull = quest.status === 'todo';

  // PARITY FIX (unchanged from the prior version — confirmed accurate
  // against EditQuestModal.tsx's own 2-condition rule, not AddQuestModal's
  // 3-condition create-time version, which adds a since-inapplicable
  // assignedToAdultsOnly check EditQuestModal's own comment explicitly
  // says doesn't apply to an edit form).
  const coinsDisabled = isAdultTask || inviteGrandparents;

  // Same real eligibility filter EditQuestModal.tsx's own assign row uses
  // (confirmed: not AddQuestAssignSection, which EditQuestModal never
  // imports — it hand-rolls this same logic inline instead).
  const eligibleMembers = members.filter(m => {
    if (isAdultTask) {
      if (m.role === 'parent') return true;
      if (m.role === 'senior') return inviteGrandparents;
      return false;
    }
    if (teensOnly && m.role === 'kid') return false;
    return true;
  });

  const save = () => {
    if (!canEdit || !title.trim()) return;

    // Same cascading Adult-Only categoryType write choreAdapter.ts's own
    // updateQuest branch does (read in full: only sets parent_only_quest
    // when NOT already 'shopping', only resets to 'routine' when it WAS
    // parent_only_quest — never stomps a shopping/grandparent_quest
    // category this toggle didn't itself set).
    const prevCategoryType = (quest as any).categoryType as ChoreCategoryType | undefined;
    const categoryType: ChoreCategoryType | undefined = isAdultTask
      ? (prevCategoryType !== 'shopping' ? 'parent_only_quest' : prevCategoryType)
      : (prevCategoryType === 'parent_only_quest' ? 'routine' : prevCategoryType);

    // Same real isPool fallback EditQuestModal.tsx computes — branches on
    // isAdultTask specifically (a fix for a real prior bug: an adult task
    // with nobody picked used to wrongly fall into the kid-claimable pool,
    // which doesn't exist for adult work at all).
    const resolvedIsPool = isAdultTask ? isPool : (isPool || !assignId);

    // Adult-to-adult reassignment is a real, separate negotiation path
    // (parent_quest_assignments PENDING/Accept), not a blind field write —
    // same real branch EditQuestModal.tsx computes before deciding whether
    // assignedToId even changes in the patch.
    const reassigningAdultTask = isAdultTask && !isPool && !!assignId
      && assignId !== quest.assignedToId && assignId !== active.id;

    updateChore(quest.id, {
      title: title.trim(),
      ...(isFull ? { description: description.trim() || undefined } : {}),
      coinsReward: coinsDisabled ? 0 : Math.max(0, parseInt(coins, 10) || 0),
      basePoints: coinsDisabled ? 0 : Math.max(0, parseInt(coins, 10) || 0),
      bonusCoins: coinsDisabled ? 0 : Math.max(0, parseInt(bonusCoins, 10) || 0),
      category,
      difficulty,
      ...(isFull ? {
        dueDate: dueDateValue ? localDateStr(dueDateValue) : undefined,
        dueTime: dueDateValue ? `${String(dueDateValue.getHours()).padStart(2, '0')}:${String(dueDateValue.getMinutes()).padStart(2, '0')}` : undefined,
      } : {}),
      linkedEventId,
      alertCall,
      alertCallLeadMinutes,
      recurrenceRule: { frequency: recurrence },
      categoryType,
      inviteGrandparents: isAdultTask ? inviteGrandparents : false,
      isOpenToTeens: isAdultTask ? false : teensOnly,
      requiresPhotoProof,
      assignedToId: reassigningAdultTask ? quest.assignedToId : (!resolvedIsPool ? assignId : undefined),
      isPool: resolvedIsPool,
    });

    // Same real System-A negotiation EditQuestModal.tsx fires AFTER onSave
    // for this specific case, rather than folding it into the plain patch
    // above — addParentQuest starts a PENDING Accept/Decline for the new
    // assignee instead of silently handing them an already-committed task.
    if (reassigningAdultTask && assignId) {
      addParentQuest(quest.id, active.id, assignId, 'DIRECT');
    }

    showToast('Chore updated');
    onClose();
  };

  const handleDeletePress = () => {
    if (!canDelete) return;
    if (!isFull) {
      // Same real Alert.prompt EditQuestModal.tsx uses for a claimed/in-
      // progress chore — a note is required before Delete proceeds
      // (confirmed against the real deleteChore body: the note text
      // itself isn't actually persisted anywhere today, same as the
      // phone's own current behavior — this matches that real gap rather
      // than inventing a persistence path the phone doesn't have).
      Alert.prompt(
        'Delete Active Chore',
        `"${quest.title}" is in progress. Add a note for the assignee (required):`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive', onPress: (note?: string) => {
              if (!note?.trim()) {
                Alert.alert('Note required', 'Please add a reason so the assignee knows why this was removed.');
                return;
              }
              deleteChore(quest.id);
              showToast('Chore deleted');
              onClose();
            },
          },
        ],
        'plain-text',
      );
      return;
    }
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    deleteChore(quest.id);
    showToast('Chore deleted');
    onClose();
  };

  const readOnly = !canEdit;
  const input = kioskInputStyle(k);
  const catMeta = CATEGORY_META[category] ?? { emoji: '📋', color: k.textFaint };

  if (readOnly) {
    return (
      <KioskFormDrawer
        visible={!!quest}
        variant="dialog"
        title={quest.title}
        subtitle="Read-only"
        accent={k.primary}
        Icon={Lock}
        k={k}
        onClose={onClose}
      >
        <DetailRow label="Reward" value={`${quest.coins} coins`} k={k} />
        {!!quest.description && <DetailRow label="Description" value={quest.description} k={k} />}
      </KioskFormDrawer>
    );
  }

  const upcomingEvents = useEventStore.getState().events
    .filter(e => e.date >= localDateStr(new Date()))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    .slice(0, 30);
  const linkedEvent = linkedEventId ? upcomingEvents.find(e => e.id === linkedEventId) : undefined;

  return (
    <KioskFormDrawer
      visible={!!quest}
      variant="drawer"
      title="Edit Chore"
      accent={catMeta.color}
      Icon={ListTodo}
      k={k}
      onClose={onClose}
      onSubmit={save}
      canSubmit={!!title.trim()}
      submitLabel="Save Changes"
      headerRight={canDelete ? (
        <Pressable
          onPress={handleDeletePress}
          style={({ pressed }) => [
            s.deleteBtn,
            {
              backgroundColor: confirmingDelete ? k.danger : (pressed ? k.cardHover : k.well),
              borderColor: confirmingDelete ? k.danger : k.cardBorder,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={confirmingDelete ? 'Confirm delete chore' : `Delete chore ${quest.title}`}
          accessibilityHint={confirmingDelete ? 'Tap again to permanently remove this chore' : undefined}
        >
          <Trash2 size={18} color={confirmingDelete ? k.onAccent : k.textMuted} />
          {confirmingDelete && (
            <Text style={[s.deleteConfirmText, { color: k.onAccent }]} numberOfLines={1}>Confirm?</Text>
          )}
        </Pressable>
      ) : undefined}
    >
      <View style={s.section}>
        <KioskFieldLabel k={k}>TITLE</KioskFieldLabel>
        <TextInput value={title} onChangeText={setTitle} accessibilityLabel="Chore title" maxLength={120} style={input} placeholderTextColor={k.textFaint} />
      </View>

      {isFull && (
        <View style={s.section}>
          <KioskFieldLabel k={k}>DESCRIPTION</KioskFieldLabel>
          <TextInput
            value={description} onChangeText={t => setDescription(t.slice(0, 150))}
            multiline maxLength={150}
            style={[input, s.notesInput]} placeholderTextColor={k.textFaint}
          />
        </View>
      )}

      <View style={s.section}>
        <KioskFieldLabel k={k}>CATEGORY</KioskFieldLabel>
        <View style={s.pillWrap}>
          {ALL_CATEGORIES.map(cat => (
            <KioskPill key={cat} label={cat} selected={category === cat} onPress={() => setCategory(cat)} accent={CATEGORY_META[cat]?.color ?? k.primary} k={k} />
          ))}
        </View>
      </View>

      {/* Optional subcategory refinement — real EditQuestModal.tsx field
          [fresh-audit gap]. Purely a Responsibility Engine input; doesn't
          change the chore's own stored category. */}
      {subcategoryOptions.length > 0 && (
        <View style={s.section}>
          <KioskFieldLabel k={k}>SPECIFICALLY… (OPTIONAL)</KioskFieldLabel>
          <View style={s.pillWrap}>
            {subcategoryOptions.map(sc => (
              <KioskPill
                key={sc.id} label={sc.subcategoryLabel}
                selected={subcategoryId === sc.id}
                onPress={() => setSubcategoryId(subcategoryId === sc.id ? null : sc.id)}
                accent={k.purple} k={k}
              />
            ))}
          </View>
        </View>
      )}

      {/* Responsibility Engine — "who would this go to" preview. Real
          server-side scoring (process-task-assignment / process-kid-
          chore-assignment, same dryRun RPCs the phone calls), not local
          heuristics. Adult tasks preview by category; a kid/teen chore
          previews against the real, already-existing row (age/skill/
          rotation/effort signals process-kid-chore-assignment reads can
          only come from a row that already exists, matching why
          EditQuestModal.tsx itself only offers this in edit mode, never
          in AddQuestModal's create flow). */}
      {!!active.familyId && (
        <View style={s.section}>
          <Pressable
            onPress={async () => {
              setLoadingSuggestion(true);
              setAssignmentSuggestion(null);
              const familyId = active.familyId!;
              const result = isAdultTask
                ? await previewAssignment({ taskId: quest.id, taskType: 'chore', familyId, category: subcategoryId ?? resolveDomainFromLooseLabel(category) })
                : await previewKidChoreAssignment({ choreId: quest.id, familyId });
              setAssignmentSuggestion(result);
              setLoadingSuggestion(false);
            }}
            disabled={loadingSuggestion}
            style={[s.suggestBtn, { borderColor: k.purpleEdge, backgroundColor: k.purpleSoft, opacity: loadingSuggestion ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Who would this go to?"
          >
            {loadingSuggestion ? (
              <ActivityIndicator size="small" color={k.purple} />
            ) : (
              <Text style={[s.suggestBtnText, { color: k.purple }]}>✨ Who would this go to?</Text>
            )}
          </Pressable>
          {!!assignmentSuggestion && (
            <View style={[s.suggestResult, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
              {assignmentSuggestion.error ? (
                <Text style={[s.suggestResultText, { color: k.textFaint }]}>{assignmentSuggestion.error}</Text>
              ) : assignmentSuggestion.decisionType === 'blocked' ? (
                <Text style={[s.suggestResultText, { color: k.textMuted }]}>
                  {assignmentSuggestion.reason ?? 'No eligible family member found for this.'}
                </Text>
              ) : (
                <>
                  <Text style={[s.suggestResultTitle, { color: k.text }]}>
                    {assignmentSuggestion.decisionType === 'auto' ? '✅ Would auto-assign to '
                      : assignmentSuggestion.decisionType === 'suggest' ? '💡 Suggested: '
                      : '🤔 Close call — '}
                    {assignmentSuggestion.explanation.selected ?? '—'}
                  </Text>
                  {assignmentSuggestion.candidates.filter(c => !c.excluded).length > 1 && (
                    <Text style={[s.suggestResultText, { color: k.textFaint }]}>
                      {assignmentSuggestion.candidates.filter(c => !c.excluded).map(c => `${c.memberName} (${Math.round(c.score)})`).join(' · ')}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      )}

      <View style={s.section}>
        <KioskFieldLabel k={k}>DIFFICULTY</KioskFieldLabel>
        <View style={s.pillWrap}>
          {DIFFICULTIES.map(d => (
            <KioskPill key={d.key} label={d.label} selected={difficulty === d.key} onPress={() => setDifficulty(p => p === d.key ? undefined : d.key)} accent={k.primary} k={k} />
          ))}
        </View>
      </View>

      {/* Coins/bonus row entirely hidden for an Adult-Only task, not just
          disabled — same real EditQuestModal.tsx gate (its own
          `!isAdultTask && (...)`), distinct from coinsDisabled's grayed-
          out-but-visible treatment for the GP-invite-only case. */}
      {!isAdultTask && (
        <View style={s.section}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <KioskFieldLabel k={k}>COINS</KioskFieldLabel>
              <TextInput
                value={coinsDisabled ? '0' : coins}
                onChangeText={coinsDisabled ? undefined : (t => setCoins(t.replace(/[^0-9]/g, '')))}
                editable={!coinsDisabled} keyboardType="number-pad" maxLength={4}
                style={[input, { opacity: coinsDisabled ? 0.4 : 1 }]} placeholderTextColor={k.textFaint}
              />
            </View>
            <View style={{ flex: 1 }}>
              <KioskFieldLabel k={k}>BONUS</KioskFieldLabel>
              <TextInput
                value={coinsDisabled ? '0' : bonusCoins}
                onChangeText={coinsDisabled ? undefined : (t => setBonusCoins(t.replace(/[^0-9]/g, '')))}
                editable={!coinsDisabled} keyboardType="number-pad" maxLength={4}
                style={[input, { opacity: coinsDisabled ? 0.4 : 1 }]} placeholderTextColor={k.textFaint}
              />
            </View>
          </View>
          {coinsDisabled && (
            <Text style={[s.hint, { color: k.textFaint }]}>
              {isAdultTask ? 'Adult chores have no coin reward.' : 'Grandparent chores have no coin reward.'}
            </Text>
          )}
        </View>
      )}

      {isFull && (
        <View style={s.section}>
          <KioskFieldLabel k={k}>DUE DATE &amp; TIME</KioskFieldLabel>
          <View style={s.row}>
            <Pressable
              onPress={() => setShowDuePicker('date')}
              style={[input, s.timeBtn, { flex: 3, backgroundColor: showDuePicker === 'date' ? k.primary + '18' : k.well, borderColor: showDuePicker === 'date' ? k.primary : k.cardBorder }]}
            >
              <Text style={[s.timeBtnText, { color: dueDateValue ? k.text : k.textFaint }]}>{dueDateValue ? fmtDate(localDateStr(dueDateValue)) : 'No due date'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDuePicker('time')}
              style={[input, s.timeBtn, { flex: 2, backgroundColor: showDuePicker === 'time' ? k.primary + '18' : k.well, borderColor: showDuePicker === 'time' ? k.primary : k.cardBorder }]}
            >
              <Text style={[s.timeBtnText, { color: dueDateValue ? k.text : k.textFaint }]}>
                {dueDateValue ? fmtTime(`${String(dueDateValue.getHours()).padStart(2, '0')}:${String(dueDateValue.getMinutes()).padStart(2, '0')}`) : 'No time'}
              </Text>
            </Pressable>
            {!!dueDateValue && (
              <Pressable onPress={() => setDueDateValue(null)} hitSlop={10} style={s.clearBtn} accessibilityRole="button" accessibilityLabel="Clear due date">
                <X size={16} color={k.textFaint} />
              </Pressable>
            )}
          </View>
          <PickerOverlay
            showDate={showDuePicker === 'date'} showTime={showDuePicker === 'time'}
            value={dueDateValue ?? new Date()}
            onChangeDate={setDueDateValue}
            onChangeTime={setDueDateValue}
            onDone={() => setShowDuePicker(null)}
            accentColor={k.primary} colors={colors}
            dateLabel="📅 Due Date" timeLabel="🕐 Due Time"
          />
        </View>
      )}

      <View style={s.section}>
        <KioskFieldLabel k={k}>LINK TO EVENT (OPTIONAL)</KioskFieldLabel>
        <Pressable
          onPress={() => setShowEventPicker(p => !p)}
          style={[input, s.timeBtn, { alignSelf: 'flex-start', backgroundColor: showEventPicker ? k.primary + '18' : k.well, borderColor: showEventPicker ? k.primary : k.cardBorder }]}
        >
          <Link2 size={14} color={showEventPicker ? k.primary : k.textFaint} />
          <Text style={[s.timeBtnText, { color: linkedEvent ? k.text : k.textFaint }]} numberOfLines={1}>{linkedEvent ? linkedEvent.title : 'None'}</Text>
        </Pressable>
        {showEventPicker && (
          <View style={[s.eventList, { borderColor: k.cardBorder, backgroundColor: k.card }]}>
            <ScrollView keyboardShouldPersistTaps="always">
              <Pressable style={[s.eventRow, { borderBottomColor: k.cardBorder }]} onPress={() => { setLinkedEventId(undefined); setShowEventPicker(false); }}>
                <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: !linkedEventId ? '800' : '600', color: !linkedEventId ? k.primary : k.textMuted }}>None</Text>
              </Pressable>
              {upcomingEvents.length === 0 ? (
                <Text style={{ fontSize: KIOSK_TYPO.body, color: k.textFaint, padding: KIOSK_SPACE.md }}>No upcoming events</Text>
              ) : upcomingEvents.map(ev => (
                <Pressable key={ev.id} style={[s.eventRow, { borderBottomColor: k.cardBorder }]} onPress={() => { setLinkedEventId(ev.id); setShowEventPicker(false); }}>
                  <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: linkedEventId === ev.id ? '800' : '600', color: linkedEventId === ev.id ? k.primary : k.text }} numberOfLines={1}>{ev.title}</Text>
                  <Text style={{ fontSize: KIOSK_TYPO.label, color: k.textFaint, marginTop: 1 }}>{fmtDate(ev.date)}{ev.time ? ` · ${fmtTime(ev.time)}` : ''}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={s.section}>
        <KioskFieldLabel k={k}>REPEATS</KioskFieldLabel>
        <View style={s.pillWrap}>
          {RECUR_OPTIONS.map(r => (
            <KioskPill key={r.key} label={r.label} selected={recurrence === r.key} onPress={() => setRecurrence(r.key)} accent={k.primary} k={k} />
          ))}
        </View>
      </View>

      <View style={s.section}>
        <CallReminderToggle
          alertCall={alertCall} setAlertCall={setAlertCall}
          alertCallLeadMinutes={alertCallLeadMinutes} setAlertCallLeadMinutes={setAlertCallLeadMinutes}
          accentColor={k.primary} colors={colors} isDark={isDark}
          variant="icon"
        />
      </View>

      <View style={s.switchRow}>
        <Text style={[s.switchLabel, { color: k.text }]}>Photo required</Text>
        <Switch value={requiresPhotoProof} onValueChange={setRequiresPhotoProof} trackColor={{ false: k.cardBorder, true: k.primary + '80' }} thumbColor={requiresPhotoProof ? k.primary : k.textFaint} />
      </View>

      <View style={s.switchRow}>
        <Text style={[s.switchLabel, { color: k.text }]}>Adult-Only Task</Text>
        <Switch
          value={isAdultTask}
          // Same real cascading reset EditQuestModal.tsx's own toggle-on
          // handler does — force-clears isPool/assignId/inviteGrandparents,
          // since none of those concepts (kid-claimable pool, GP invite)
          // apply once a chore becomes adult logistics.
          onValueChange={(v) => { setIsAdultTask(v); if (v) { setIsPool(false); setAssignId(undefined); setInviteGrandparents(false); } }}
          trackColor={{ false: k.cardBorder, true: k.primary + '80' }} thumbColor={isAdultTask ? k.primary : k.textFaint}
        />
      </View>

      {/* Only shown when Adult-Only is on AND the family actually has a
          registered senior/GP member — same real gate EditQuestModal.tsx
          uses, fixing a live bug where the toggle appeared with nobody it
          could ever apply to. */}
      {isAdultTask && members.some(m => m.role === 'senior') && (
        <View style={s.switchRow}>
          <Text style={[s.switchLabel, { color: k.text }]}>Invite Grandparents</Text>
          <Switch value={inviteGrandparents} onValueChange={setInviteGrandparents} trackColor={{ false: k.cardBorder, true: k.primary + '80' }} thumbColor={inviteGrandparents ? k.primary : k.textFaint} />
        </View>
      )}

      {/* Mutually exclusive with Adult-Only — never both shown, same real
          gate EditQuestModal.tsx uses. */}
      {!isAdultTask && (
        <View style={s.switchRow}>
          <Text style={[s.switchLabel, { color: k.text }]}>Teens Only</Text>
          <Switch
            value={teensOnly}
            // Same real cascading filter EditQuestModal.tsx's own toggle-on
            // handler applies — an already-picked kid assignee directly
            // contradicts "teens only" the moment this turns on.
            onValueChange={(v) => { setTeensOnly(v); if (v && assignId) { const m = members.find(x => x.id === assignId); if (m?.role === 'kid') setAssignId(undefined); } }}
            trackColor={{ false: k.cardBorder, true: k.primary + '80' }} thumbColor={teensOnly ? k.primary : k.textFaint}
          />
        </View>
      )}

      <View style={s.section}>
        {/* Bounty/open-pool option hidden entirely for Adult-Only tasks —
            no kid-claimable pool concept for adult work. */}
        {!isAdultTask && (
          <View style={{ marginBottom: KIOSK_SPACE.sm }}>
            <KioskPill label="⚡ Open bounty (anyone can claim)" selected={isPool} onPress={() => { setIsPool(p => !p); if (!isPool) setAssignId(undefined); }} accent={k.gold} k={k} />
          </View>
        )}
        {!isPool && (
          <MemberPicker
            label="ASSIGN TO"
            selectedIds={assignId ? [assignId] : []}
            members={eligibleMembers}
            onToggle={(id) => setAssignId(prev => prev === id ? undefined : id)}
            colors={colors} isDark={isDark} siblings={members.map(m => m.name)}
          />
        )}
      </View>
    </KioskFormDrawer>
  );
}

function DetailRow({ label, value, k }: { label: string; value: string; k: KioskColors }) {
  return (
    <View style={s.section}>
      <KioskFieldLabel k={k}>{label.toUpperCase()}</KioskFieldLabel>
      <Text style={[s.detailValue, { color: k.text }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
  row: { flexDirection: 'row', gap: KIOSK_SPACE.sm, alignItems: 'center' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  timeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs },
  timeBtnText: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  clearBtn: { padding: KIOSK_SPACE.xs },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  hint: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  eventList: { marginTop: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, maxHeight: 220, overflow: 'hidden' },
  eventRow: { paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: KIOSK_RADIUS.md, paddingVertical: KIOSK_SPACE.sm, borderWidth: 1.5, borderStyle: 'dashed' },
  suggestBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  suggestResult: { marginTop: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.md, borderWidth: 1, padding: KIOSK_SPACE.sm },
  suggestResultTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  suggestResultText: { fontSize: KIOSK_TYPO.label, marginTop: 3 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  detailValue: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
  },
  deleteConfirmText: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
});
