import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, Platform, KeyboardAvoidingView, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
// questStore commented out — chores system is the single source of truth
// import { useQuestStore } from '@/store/questStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import type { QuestCategory, QuestDifficulty, QuestType } from '@/store/questStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { localDateStr } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { fetchCustomCategories, fetchCustomSuggestions, recordCustomSuggestion, CustomCategory } from '@/lib/familyCustomCategories';
import { useGroceryStore } from '@/store/groceryStore';
import { QUEST_SUGGESTIONS, ALL_CATEGORIES, CATEGORY_META, fmtDateLabel, fmtTimeLabel } from './questFormShared';
import {
  resolveDomainFromLooseLabel, fetchSubcategoriesForDomain, previewAssignment, applyAssignment,
  type ResponsibilityCategory, type AssignmentSuggestion,
} from '@/lib/responsibilityCategories';
import { AddQuestGrocerySection } from './AddQuestGrocerySection';
import { AddQuestRecurrenceSection } from './AddQuestRecurrenceSection';
import { AddQuestAssignSection } from './AddQuestAssignSection';

// Word-boundary match, not bare substring containment — "load" must not
// match inside "unload". A plain .includes() let "Unload the dishwasher"
// show up as a suggestion right alongside the already-selected
// "Load the dishwasher", since "load" is a real substring of "unload".
function wordMatches(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}`, 'i').test(haystack);
}

// ─── Add Quest Modal ──────────────────────────────────────────────────────────
export function AddQuestModal({ visible, onClose, activeMemberId, defaultQuestType, prefill }: {
  visible: boolean; onClose: () => void; activeMemberId: string; defaultQuestType?: QuestType;
  // Seeds initial state from AI-extracted data (VoiceIntakeReviewSheet's
  // "Edit in full form" handoff) — only covers what the AI response
  // actually produces; every other field keeps its normal default so the
  // rest of the form behaves exactly as if a parent had started fresh.
  prefill?: { title?: string; coins?: number; assignedToId?: string; photoRequired?: boolean; dueDate?: string };
}) {
  const { colors, isDark } = useTheme();
  const { addQuest, createParticipants } = useQuestStore();
  const members = useFamilyStore(s => s.members);
  const kids    = members.filter(m => m.role === 'kid');

  const [title,        setTitle]        = useState(prefill?.title ?? '');
  const [coins,        setCoins]        = useState(prefill?.coins !== undefined ? String(prefill.coins) : '30');
  const [category,     setCategory]     = useState<QuestCategory>('Other');
  // category always has a real value (defaults to 'Kitchen'), but that
  // default was never a deliberate choice — process-task-assignment
  // requires category and scores off it directly, so submitting on the
  // unexamined default risks a quest going out with a category that
  // doesn't actually match what it is. Require an explicit tap.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [assignIds,    setAssignIds]    = useState<string[]>(prefill?.assignedToId ? [prefill.assignedToId] : []);
  const [isPool,       setIsPool]       = useState(false);
  const [maxClaimants, setMaxClaimants] = useState<number>(1); // pool: how many kids can claim
  const [photoReq,     setPhotoReq]     = useState(prefill?.photoRequired ?? false);
  const [desc,         setDesc]         = useState('');
  const [difficulty,   setDifficulty]   = useState<QuestDifficulty | ''>('');
  const [bonusCoins,   setBonusCoins]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [descTouched,  setDescTouched]  = useState(false);
  const [isAdultTask,       setIsAdultTask]       = useState(false);
  const [customCategories,  setCustomCategories]  = useState<CustomCategory[]>([]);
  const [customSuggestions, setCustomSuggestions] = useState<{ title: string; hint: string }[]>([]);

  // Responsibility Engine — optional subcategory refinement + live
  // assignment preview. Purely additive/informational: unlike
  // EventFormModal's GP/teen toggles, this form's inviteGrandparent has a
  // real side effect (zeroes coins), so it's deliberately NOT auto-toggled
  // from taxonomy defaults here — a parent decides that explicitly.
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [subcategoryOptions, setSubcategoryOptions] = useState<ResponsibilityCategory[]>([]);
  // applySuggestion sets both category and subcategoryId together — the
  // category-change effect below must not immediately null the subcategory
  // it just received, only when a category chip was tapped directly.
  const suggestionSetSubcategory = React.useRef(false);
  // Separate from the ref above (that one's specifically for the
  // subcategory-reset effect) — this guards the title-driven
  // category-fallback effect from re-triggering right after a suggestion
  // pill already set title+category together deliberately.
  const suggestionJustApplied = React.useRef(false);
  const [assignmentSuggestion, setAssignmentSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  // Routine chore setup
  const [isRoutine,    setIsRoutine]    = useState(false);
  const [routineType,  setRoutineType]  = useState<'citizenship' | 'routine' | 'bounty' | 'shopping'>('routine');
  // Defaults to 'once' — 'daily' must be an explicit tap on the Repeats
  // picker (only shown once Recurring Chore / an adult task's own Repeats
  // row is engaged). Defaulting this to 'daily' silently made every new
  // quest recurring even when the user never touched the recurrence UI at
  // all, since line ~347 below feeds routineFreq into `recurrence`
  // unconditionally regardless of whether isRoutine/isAdultTask ever showed
  // the picker.
  const [routineFreq,  setRoutineFreq]  = useState<'daily' | 'weekly' | 'monthly' | 'first_come' | 'once'>('once');

  // Shopping quest item list
  const [shoppingLines, setShoppingLines] = useState<string[]>(['']);
  const [shoppingStore, setShoppingStore] = useState('');
  const [shoppingBudget, setShoppingBudget] = useState('');
  const [shoppingItemsOpen, setShoppingItemsOpen] = useState(false);
  const addShoppingLine    = () => setShoppingLines(l => [...l, '']);
  const updateShoppingLine = (i: number, v: string) => setShoppingLines(l => l.map((x, idx) => idx === i ? v : x));
  const removeShoppingLine = (i: number) => setShoppingLines(l => l.filter((_, idx) => idx !== i));

  // Grandparent invitation (Workflow 2 — parent proposes, GP sees claimable invite)
  const [inviteGrandparent, setInviteGrandparent] = useState(false);

  // Grocery run attachment (Errand / Shopping categories)
  const [linkGroceries,    setLinkGroceries]    = useState(false);
  const [groceryItems,     setGroceryItems]     = useState<{ id: string; name: string; quantity?: string; storePreference?: string }[]>([]);
  const [groceryListOpen,  setGroceryListOpen]  = useState(false);
  const [expandedStores,   setExpandedStores]   = useState<Set<string>>(new Set());
  const [selectedItemIds,  setSelectedItemIds]  = useState<Set<string>>(new Set());
  const [newGroceryLines,  setNewGroceryLines]  = useState<{ name: string; qty: string; store: string }[]>([]);
  const [loadingGroceries, setLoadingGroceries] = useState(false);
  const [focusedLineIdx,   setFocusedLineIdx]   = useState<number | null>(null);
  const [focusedField,     setFocusedField]     = useState<'name' | 'store' | null>(null);
  const { pastStores: cachedStores, pastItemNames: cachedItemNames, appendToCache } = useGroceryStore();
  const suggPressing = React.useRef(false);

  const activeMember = members.find(m => m.id === activeMemberId);
  const familyId = activeMember?.familyId ?? '';

  useEffect(() => {
    if (!familyId) return;
    fetchCustomCategories(familyId, 'quest').then(setCustomCategories);
  }, [familyId]);

  useEffect(() => {
    if (!familyId || category !== 'Other') return;
    fetchCustomSuggestions(familyId, 'quest', 'Other').then(setCustomSuggestions);
  }, [familyId, category]);

  // Subcategory options for the current category's mapped taxonomy domain —
  // resets whenever the top-level category changes.
  useEffect(() => {
    if (suggestionSetSubcategory.current) {
      suggestionSetSubcategory.current = false;
    } else {
      setSubcategoryId(null);
    }
    setAssignmentSuggestion(null);
    const domain = resolveDomainFromLooseLabel(category);
    fetchSubcategoriesForDomain(domain).then(setSubcategoryOptions);
  }, [category]);

  const isGroceryCategory = category === 'Errand' || category === 'Shopping';

  // Coins/bonus only make sense for kids & teens — disable when all assignees are adults
  const assignedToAdultsOnly = assignIds.length > 0 &&
    assignIds.every(id => {
      const role = members.find(m => m.id === id)?.role;
      return role === 'parent' || role === 'senior';
    });

  useEffect(() => {
    if (!linkGroceries || !familyId) return;
    setLoadingGroceries(true);
    supabase.from('grocery_items')
      .select('id, name, quantity, store_preference')
      .eq('family_id', familyId).eq('is_bought', false).order('store_preference')
      .then(({ data }) => {
        setGroceryItems((data ?? []).map((r: any) => ({
          id: r.id, name: r.name, quantity: r.quantity ?? undefined, storePreference: r.store_preference ?? undefined,
        })));
        setLoadingGroceries(false);
      });
  }, [linkGroceries, familyId]);

  // Suggestions drive category now, not the other way around — this must
  // never filter by the currently selected category (that was the actual
  // bug: on a fresh form category defaults to 'Other', so filtering by it
  // meant real suggestions never showed at all, only the family's own
  // sparse custom bank). Search across the FULL cross-category bank by
  // title text; picking a result is what sets category, via applySuggestion.
  const suggestions = useMemo(() => {
    if (routineType === 'shopping') {
      const q = title.trim().toLowerCase();
      const pool = QUEST_SUGGESTIONS.filter(s => s.category === 'Shopping' || s.category === 'Errand');
      if (!q) return pool.slice(0, 8);
      return pool.filter(s => wordMatches(s.title, q)).slice(0, 8);
    }
    const q = title.trim().toLowerCase();
    if (!q) return QUEST_SUGGESTIONS.slice(0, 8);
    const words = q.split(/\s+/);
    const matches = QUEST_SUGGESTIONS.filter(s => words.every(w => wordMatches(s.title, w)));
    // Nothing in the built-in bank matches — fall back to this family's own
    // custom suggestions (things they've named before under "Other").
    if (matches.length > 0) return matches.slice(0, 8);
    return customSuggestions.filter(s => wordMatches(s.title, q)).slice(0, 8);
  }, [title, routineType, customSuggestions]);

  // If what's being typed matches nothing anywhere in the suggestion bank
  // (e.g. "Going for vacation" while "Yard" is selected — not a yard task,
  // not matched anywhere else either), the selected category no longer
  // reflects what this quest actually is — fall back to Other rather than
  // leaving a category selection that's now clearly wrong. Only fires once
  // there's real text (a couple characters) and skips while a category is
  // already Other/custom (nowhere further to fall back to), and skips
  // right after a suggestion pill set both together deliberately.
  useEffect(() => {
    if (suggestionJustApplied.current) { suggestionJustApplied.current = false; return; } // a suggestion tap just set title+category together
    const q = title.trim().toLowerCase();
    if (q.length < 3) return;
    if (customCategories.some(cc => cc.key === category)) return;
    // Already on Other (the default, possibly still unconfirmed) — real
    // typed text with nothing to match against anyway means Other genuinely
    // is correct, so this counts as a confirmed choice rather than leaving
    // Submit blocked forever for a task that's legitimately "Other".
    if (category === 'Other') {
      if (!categoryTouched) setCategoryTouched(true);
      return;
    }
    const anyMatchAnywhere = QUEST_SUGGESTIONS.some(s => wordMatches(s.title, q));
    if (!anyMatchAnywhere) {
      setCategory('Other');
      setCategoryTouched(true);
    }
  }, [title]);

  const applySuggestion = (s: typeof QUEST_SUGGESTIONS[0]) => {
    suggPressing.current = false;
    setTitle(s.title);
    // Carries the taxonomy signal along with the suggestion pick itself —
    // this is what replaced the separate "Specifically…" chip row. Falls
    // back to null (→ resolved domain) for the handful of suggestions with
    // no clean taxonomy match. Must be set before setCategory so the
    // category-change effect (which normally nulls subcategoryId on a
    // manual chip tap) knows to skip its reset this one time.
    suggestionSetSubcategory.current = true;
    suggestionJustApplied.current = true;
    setSubcategoryId(s.subcategoryId ?? null);
    setCategory(s.category);
    setCategoryTouched(true);
    setCoins(String(s.coins));
    setDesc(s.desc);
    setTitleFocused(false);
  };

  // Undoes exactly what applySuggestion set, so clearing the pill doesn't
  // leave a stale category/description/coins behind with an empty title.
  const clearSelectedSuggestion = () => {
    suggestionJustApplied.current = true; // don't let the auto-fallback-to-Other effect fire on this title change
    setTitle('');
    setDesc('');
    setCoins('30');
    setCategory('Other');
    setCategoryTouched(false);
    setSubcategoryId(null);
  };

  // Due date/time — default to tomorrow 6 PM, or the AI-extracted date if prefilled
  const defaultDue = () => { const d = new Date(); const m = d.getMinutes(); d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1); return d; };
  const [dueDate,      setDueDate]      = useState<Date>(() => prefill?.dueDate ? new Date(prefill.dueDate + 'T18:00:00') : defaultDue());
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);
  // Call-style reminder — opt-in, rings the assignee via CallKit/
  // ConnectionService this many minutes before dueTime.
  const [alertCall,           setAlertCall]           = useState(false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(10);

  const onDateChange = (_: any, selected?: Date) => {
    setShowDatePick(Platform.OS === 'ios'); // keep open on iOS (inline), close on Android
    if (selected) {
      const merged = new Date(selected);
      merged.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
      setDueDate(merged);
    }
  };

  const onTimeChange = (_: any, selected?: Date) => {
    setShowTimePick(Platform.OS === 'ios');
    if (selected) {
      const merged = new Date(dueDate);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setDueDate(merged);
    }
  };

  const reset = () => {
    setTitle(''); setDesc(''); setCoins('30'); setBonusCoins(''); setDifficulty('');
    setCategory('Other'); setCategoryTouched(false);
    setAssignIds([]); setIsPool(false); setMaxClaimants(1);
    setPhotoReq(false); setDueDate(defaultDue()); setIsAdultTask(false);
    setShowDatePick(false); setShowTimePick(false);
    setLinkGroceries(false); setGroceryItems([]); setSelectedItemIds(new Set()); setNewGroceryLines([]);
    setFocusedLineIdx(null); setFocusedField(null);
    setIsRoutine(false); setRoutineType('routine'); setRoutineFreq('once');
    setInviteGrandparent(false);
  };

  // Coins disabled when: adult task, GP invite, or all assignees are adults
  const coinsDisabled = isAdultTask || inviteGrandparent || assignedToAdultsOnly;

  // When adult task toggled on: clear kids from selection, disable pool, zero coins
  const toggleAdultTask = (val: boolean) => {
    setIsAdultTask(val);
    if (val) {
      setIsPool(false);
      setAssignIds(prev => prev.filter(id => members.find(m => m.id === id)?.role === 'parent'));
      setCoins('0');
      setBonusCoins('');
      // routineFreq defaults to 'daily' for the kid-chore path — reset to
      // one-time so switching into Parent Only doesn't silently inherit a
      // recurrence the user never actually chose for this task.
      setRoutineFreq('once');
    }
  };

  // When GP invite toggled: zero coins (GPs don't earn coins)
  const toggleGPInvite = (val: boolean) => {
    setInviteGrandparent(val);
    if (val) { setCoins('0'); setBonusCoins(''); }
  };

  const submit = async () => {
    if (!title.trim() || !desc.trim()) return;
    setSaving(true);
    const bonus       = parseInt(bonusCoins) || 0;
    const isMulti     = !isPool && assignIds.length > 1;
    const filledItems = shoppingLines.map(s => s.trim()).filter(Boolean);
    // Collect grocery-list selected item names to also store on the quest card
    const selectedGroceryNames = groceryItems
      .filter(i => selectedItemIds.has(i.id))
      .map(i => i.name.trim())
      .filter(Boolean);
    const newLineNames = newGroceryLines.map(l => l.name.trim()).filter(Boolean);
    const allItemNames = [
      ...filledItems,
      ...selectedGroceryNames,
      ...newLineNames,
    ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

    // Adult tasks stay parent_only regardless of GP invite — inviteGrandparents flag handles visibility
    const resolvedQuestType: QuestType = isAdultTask
      ? 'parent_only'
      : isRoutine
        ? (routineType as QuestType)
        : (defaultQuestType ?? 'general');
    // A parent directly assigning an adult task to a co-parent (not
    // themselves) goes through the existing PENDING/Accept negotiation
    // system (addParentQuest below) instead of landing pre-assigned — so
    // the chore itself is created unassigned here; addParentQuest sets the
    // assignee once the assignment row exists.
    const isDirectCoParentAssign = isAdultTask && !isPool && !isMulti
      && assignIds.length === 1 && assignIds[0] !== activeMemberId;
    const newQ = await addQuest({
      title: title.trim(), description: desc.trim(), category: routineType === 'shopping' ? 'Shopping' : category,
      priority: 'medium', difficulty: difficulty || undefined,
      coins: coinsDisabled ? 0 : (parseInt(coins) || 30), xpReward: 20,
      assignedToId: isPool || isMulti || isDirectCoParentAssign ? undefined : (assignIds[0] || undefined),
      assignedToIds: isMulti ? assignIds : [],
      isPool: !isAdultTask && (isPool || assignIds.length === 0), isDaily: false,
      recurrence: routineType === 'shopping' ? 'once' : (routineFreq === 'daily' ? 'daily' : routineFreq === 'weekly' ? 'weekly' : routineFreq === 'monthly' ? 'monthly' : 'once'),
      status: 'todo',
      dueDate: localDateStr(dueDate),
      dueTime: fmtTimeLabel(dueDate),
      alertCall, alertCallLeadMinutes,
      photoRequired: routineType === 'shopping' ? true : photoReq,
      createdById: activeMemberId,
      isAdultTask,
      questType: resolvedQuestType,
      // Shopping fields passed through to choreAdapter
      shoppingItems:  allItemNames.length > 0 ? allItemNames : undefined,
      shoppingStore:  shoppingStore.trim() || undefined,
      shoppingBudget: shoppingBudget.trim() ? parseFloat(shoppingBudget) : undefined,
      inviteGrandparents: inviteGrandparent || undefined,
    } as any);
    if (newQ?.id) {
      if (isDirectCoParentAssign) {
        useChoreStore.getState().addParentQuest(newQ.id, activeMemberId, assignIds[0], 'DIRECT');
      }
      if (bonus > 0) useQuestStore.getState().updateQuest(newQ.id, { bonusCoins: bonus });
      // Create participant rows: multi-assign → one per kid; pool → none (kids create on claim)
      if (isMulti && assignIds.length > 0) {
        await createParticipants(newQ.id, assignIds);
      }
      // Store maxClaimants for pool quests
      if (isPool) {
        useQuestStore.getState().updateQuest(newQ.id, { maxClaimants });
      }

      // Zero-touch auto-assignment: only when nobody was already explicitly
      // assigned (pool quests with no one picked yet) — an explicit pick or
      // multi-assign already has its answer. Fire-and-forget: the quest is
      // already saved above, a slow/failed engine call must never block or
      // fail the save. Adult tasks and kid chores both use a real row now
      // that newQ.id exists, so — unlike the preview button, which restricts
      // kid-chore preview to edit-mode only — both paths can run for real here.
      if (familyId && isPool && assignIds.length === 0) {
        const assignCategory = subcategoryId ?? resolveDomainFromLooseLabel(category);
        const applyPromise = isAdultTask
          ? applyAssignment({ taskId: newQ.id, taskType: 'chore', familyId, category: assignCategory })
          : supabase.functions.invoke('process-kid-chore-assignment', { body: { choreId: newQ.id, familyId, dryRun: false } })
              .then(({ data, error }) => (error || data?.error) ? null : (data as AssignmentSuggestion));
        applyPromise.then(res => {
          if (res?.decisionType !== 'auto' || !res.selectedMemberId) return;
          // An auto-assigned adult task needs the same Accept/Snooze/
          // Pushback opportunity a manually-picked assignee gets — writing
          // assignedToId directly here (as kid-chore auto-assign correctly
          // still does below) skipped the whole negotiation system for any
          // adult task the engine picked, landing pre-accepted with only a
          // Done/Reassign button.
          if (isAdultTask && res.selectedMemberId !== activeMemberId) {
            useChoreStore.getState().addParentQuest(newQ.id, activeMemberId, res.selectedMemberId, 'DIRECT');
          } else {
            useQuestStore.getState().updateQuest(newQ.id, { assignedToId: res.selectedMemberId, isPool: false });
          }
        });
      }
    }

    // Record custom suggestion for this family if it's a custom/Other category
    const isCustomCat = customCategories.some(cc => cc.key === category) || category === 'Other';
    if (isCustomCat && title.trim() && familyId) {
      recordCustomSuggestion(familyId, 'quest', category, title.trim());
    }

    // Create grocery run(s) if grocery list was linked
    if (isGroceryCategory && linkGroceries && familyId) {
      const validNewLines = newGroceryLines.filter(l => l.name.trim());
      const hasExisting = selectedItemIds.size > 0;
      if (hasExisting || validNewLines.length > 0) {
        try {
          const newItemsByStore: Record<string, string[]> = {};
          for (const line of validNewLines) {
            const store = line.store.trim() || 'Any store';
            const { data: inserted } = await supabase
              .from('grocery_items')
              .insert({ family_id: familyId, name: line.name.trim(), quantity: line.qty.trim() || null, store_preference: line.store.trim() || null, added_by: activeMemberId, is_bought: false, ai_generated: false })
              .select('id').single();
            if (inserted?.id) {
              if (!newItemsByStore[store]) newItemsByStore[store] = [];
              newItemsByStore[store].push(inserted.id);
            }
          }
          const existingByStore: Record<string, string[]> = {};
          for (const id of selectedItemIds) {
            const item = groceryItems.find(i => i.id === id);
            const store = item?.storePreference || 'Any store';
            if (!existingByStore[store]) existingByStore[store] = [];
            existingByStore[store].push(id);
          }
          const allStores = new Set([...Object.keys(existingByStore), ...Object.keys(newItemsByStore)]);
          for (const store of allStores) {
            const itemIds = [...(existingByStore[store] ?? []), ...(newItemsByStore[store] ?? [])];
            if (!itemIds.length) continue;
            const { data: runRow, error: runErr } = await supabase
              .from('grocery_runs')
              .insert({ family_id: familyId, name: title.trim(), store: store === 'Any store' ? 'Store' : store, status: 'draft', created_by: activeMemberId, planned_at: localDateStr(dueDate) })
              .select('id').single();
            if (!runErr && runRow?.id) {
              await supabase.from('grocery_run_items').insert(itemIds.map(itemId => ({ run_id: runRow.id, item_id: itemId, checked_in_run: false })));
            }
          }
          const newNames  = validNewLines.map(l => l.name.trim()).filter(Boolean);
          const newStores = [...allStores].filter(s => s !== 'Any store');
          if (newNames.length || newStores.length) appendToCache(newNames, newStores);
        } catch (e: any) {
          console.warn('[AddQuestModal] grocery run creation failed', e?.message);
        }
      }
    }

    setSaving(false);
    reset();
    onClose();
  };

  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={aq.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={[aq.sheet, { backgroundColor: colors.card }]}>
            {/* Drag handle */}
            <View style={[aq.handle, { backgroundColor: colors.border }]} />

            {/* ── Fixed header ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[aq.title, { color: colors.textPrimary }]}>
                  {defaultQuestType === 'grandparent_quest' ? '👴 Sponsor a Chore' : 'New Chore'}
                </Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: BRAND.purple }}>
                  {defaultQuestType === 'grandparent_quest' ? 'Create a special chore for the grandkids' : 'Assign a chore, bounty, or task'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { reset(); onClose(); }}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Scrollable form fields ── */}
            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}
            >

            {/* Title */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title *</Text>
            <TextInput
              style={[aq.input, { color: colors.textPrimary,
                // Neutral border until the parent has actually left this
                // field empty at least once — required-but-untouched
                // shouldn't read as an error before anyone's had a chance
                // to type anything. colors.surface (tan) against the
                // sheet's white colors.card background gives the field its
                // own visible shape, with borderMed (28% tint) instead of
                // the near-invisible 15%-opacity default border.
                borderColor: (!title.trim() && titleTouched) ? colors.danger : colors.borderMed,
                backgroundColor: colors.surface }]}
              placeholder={routineType === 'shopping' ? 'e.g. Grocery run, Pick up dry cleaning…' : 'e.g. Wash the dishes, Take out trash…'}
              placeholderTextColor={colors.textTertiary}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => { setTitleFocused(false); setTitleTouched(true); }}
              returnKeyType="next"
            />
            {/* Dynamic suggestion pills — always visible */}
            {suggestions.length > 0 && (
              <View style={{ marginTop: -6, marginBottom: 12 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginBottom: 8, fontWeight: '700', letterSpacing: 0.4 }}>
                  {title.trim() ? 'Matching suggestions' : routineType === 'shopping' ? '🛍️ Shopping errands — tap to fill' : 'Quick picks — tap to fill'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {suggestions.map((s, i) => {
                      const isSelected = title.toLowerCase() === s.title.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[aq.suggPill, {
                            backgroundColor: isSelected ? BRAND.purple + '25' : colors.surface,
                            borderColor:     isSelected ? BRAND.purple : colors.border,
                          }]}
                          onPress={() => 'coins' in s ? applySuggestion(s) : setTitle(s.title)}
                        >
                          <Text style={{ fontSize: TYPO.micro, color: isSelected ? BRAND.purple : colors.textSecondary, fontWeight: '700' }} numberOfLines={1}>
                            {s.title}
                          </Text>
                          {'coins' in s && !isSelected && (
                          <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginLeft: 5 }}>
                            +{s.coins}🪙
                          </Text>
                          )}
                          {isSelected && (
                            <Pressable
                              onPress={clearSelectedSuggestion}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={{ marginLeft: 6 }}
                            >
                              <Ionicons name="close-circle" size={15} color={BRAND.purple} />
                            </Pressable>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Category — follows from what's typed/picked above rather than
                leading the form: picking a suggestion sets it automatically,
                and typing something that matches nothing anywhere falls it
                back to Other (see the title-driven effect near the top of
                this component). Still directly tappable to override. */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>
              Category *{'  '}
              {!categoryTouched && <Text style={{ fontWeight: '400', color: colors.textTertiary }}>auto-set from what you type</Text>}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[...ALL_CATEGORIES, ...customCategories.filter(cc => !ALL_CATEGORIES.includes(cc.key as QuestCategory)).map(cc => cc.key as QuestCategory)].map(c => {
                  const meta = CATEGORY_META[c] ?? { emoji: '✨', color: BRAND.purple };
                  const active = category === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => { setCategory(c); setCategoryTouched(true); }}
                      style={{
                        borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8,
                        alignItems: 'center', gap: 3, minWidth: 64,
                        backgroundColor: active ? meta.color + '18' : pillBg,
                        borderColor: active ? meta.color : pillBdr,
                      }}
                    >
                      <Text style={{ fontSize: 20, opacity: active ? 1 : 0.6 }}>{meta.emoji}</Text>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: active ? meta.color : colors.textSecondary }}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* ── Assignment suggestion — calls the live Responsibility Engine
                 (process-task-assignment) so a parent can see who this would
                 likely go to before saving. Always a dry run.
                 Adult tasks only: process-task-assignment scores directly
                 from a category string, but process-kid-chore-assignment
                 (the kid-scoring engine) needs an EXISTING chore_tasks row
                 to read from — it can't preview before the chore is
                 created. Rather than fake a kid-assignment preview this
                 form can't actually produce, the button only appears for
                 isAdultTask, where a real preview is genuinely possible. ── */}
            {familyId && isAdultTask && assignIds.length === 0 && (
              <View style={{ marginBottom: 14 }}>
                <TouchableOpacity
                  onPress={async () => {
                    setLoadingSuggestion(true);
                    setAssignmentSuggestion(null);
                    const result = await previewAssignment({
                      taskId: `preview-${Date.now()}`,
                      taskType: 'chore',
                      familyId,
                      category: subcategoryId ?? resolveDomainFromLooseLabel(category),
                    });
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

            {/* Description — mandatory, max 150 chars */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>
              Description *{'  '}
              <Text style={{ fontWeight: '400', color: colors.textTertiary }}>what needs to be done</Text>
            </Text>
            <TextInput
              style={[aq.input, aq.descInput, { color: colors.textPrimary,
                borderColor: (!desc.trim() && descTouched) ? colors.danger : colors.borderMed,
                backgroundColor: colors.surface }]}
              placeholder="Describe exactly what's expected so there's no confusion…"
              placeholderTextColor={colors.textTertiary}
              value={desc}
              onChangeText={t => setDesc(t.slice(0, 150))}
              onBlur={() => setDescTouched(true)}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={{ fontSize: TYPO.micro, color: desc.length > 130 ? colors.danger : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 12 }}>
              {desc.length}/150
            </Text>

            {/* ── Grocery list attachment (Errand / Shopping) ── */}
            {isGroceryCategory && (
              <AddQuestGrocerySection
                colors={colors} isDark={isDark}
                linkGroceries={linkGroceries} setLinkGroceries={setLinkGroceries} setGroceryListOpen={setGroceryListOpen}
                loadingGroceries={loadingGroceries} groceryItems={groceryItems}
                expandedStores={expandedStores} setExpandedStores={setExpandedStores}
                selectedItemIds={selectedItemIds} setSelectedItemIds={setSelectedItemIds}
                newGroceryLines={newGroceryLines} setNewGroceryLines={setNewGroceryLines}
                focusedLineIdx={focusedLineIdx} setFocusedLineIdx={setFocusedLineIdx}
                focusedField={focusedField} setFocusedField={setFocusedField}
                cachedItemNames={cachedItemNames} cachedStores={cachedStores}
              />
            )}

            {/* Coins + Bonus + Photo required — one compact row.
                coinsLocked: citizenship chores are always free — no coin reward */}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 78, opacity: (isRoutine && routineType === 'citizenship') || coinsDisabled ? 0.4 : 1 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Coins 🪙</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: (isRoutine && routineType === 'citizenship') || coinsDisabled ? (isDark ? '#1F2937' : '#F3F4F6') : colors.surface, marginBottom: 0 }]}
                  keyboardType="number-pad"
                  value={(isRoutine && routineType === 'citizenship') || coinsDisabled ? '0' : coins}
                  onChangeText={(isRoutine && routineType === 'citizenship') || coinsDisabled ? undefined : setCoins}
                  editable={!((isRoutine && routineType === 'citizenship') || coinsDisabled)}
                />
              </View>
              <View style={{ width: 78, opacity: (isRoutine && routineType === 'citizenship') || coinsDisabled ? 0.4 : 1 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Bonus 🎉</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: bonusCoins ? BRAND.amber : colors.border,
                    backgroundColor: (isRoutine && routineType === 'citizenship') || coinsDisabled ? (isDark ? '#1F2937' : '#F3F4F6') : colors.surface, marginBottom: 0 }]}
                  keyboardType="number-pad"
                  placeholder="+coins"
                  placeholderTextColor={colors.textTertiary}
                  value={(isRoutine && routineType === 'citizenship') || coinsDisabled ? '' : bonusCoins}
                  onChangeText={(isRoutine && routineType === 'citizenship') || coinsDisabled ? undefined : (t => setBonusCoins(t.replace(/[^0-9]/g, '')))}
                  editable={!((isRoutine && routineType === 'citizenship') || coinsDisabled)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[aq.label, { color: 'transparent' }]}>·</Text>
                <TouchableOpacity
                  style={[aq.toggleRow, { paddingHorizontal: 10,
                    borderColor: photoReq ? BRAND.purple : pillBdr, backgroundColor: photoReq ? BRAND.purple + '18' : pillBg }]}
                  onPress={() => setPhotoReq(p => !p)}
                >
                  <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '700', color: photoReq ? BRAND.purple : colors.textSecondary, textAlign: 'center' }} numberOfLines={1}>
                    {photoReq ? '📷 Required' : '📷 Optional'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {(!(isRoutine && routineType === 'citizenship') && !!bonusCoins && parseInt(bonusCoins) > 0) ? (
              <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginTop: 3 }}>
                Total: {(parseInt(coins)||0)+(parseInt(bonusCoins)||0)}🪙
              </Text>
            ) : (isRoutine && routineType === 'citizenship') ? (
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 3 }}>no reward</Text>
            ) : null}

            {/* Hardness — its own row now that Coins/Bonus/Photo share one above */}
            <View style={{ marginTop: 10, marginBottom: 14 }}>
              <Text style={[aq.label, { color: colors.textSecondary }]}>Hardness <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
              <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                {([
                  { key: 'easy',   label: '😊',  color: '#10B981' },
                  { key: 'medium', label: '💪',  color: BRAND.amber },
                  { key: 'hard',   label: '🔥',  color: '#EF4444' },
                  { key: 'hero',   label: '⚡',  color: BRAND.purple },
                ] as { key: QuestDifficulty; label: string; color: string }[]).map(d => (
                  <TouchableOpacity
                    key={d.key}
                    style={[aq.diffChip, {
                      borderColor: difficulty === d.key ? d.color : pillBdr,
                      backgroundColor: difficulty === d.key ? d.color + '22' : pillBg,
                    }]}
                    onPress={() => setDifficulty(prev => prev === d.key ? '' : d.key)}
                  >
                    <Text style={{ fontSize: TYPO.label }}>{d.label}</Text>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: difficulty === d.key ? d.color : colors.textTertiary, marginLeft: 2 }}>
                      {d.key.charAt(0).toUpperCase() + d.key.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Due Date + Time */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Due Date & Time</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {/* Date pill */}
              <TouchableOpacity
                style={[aq.datePill, { backgroundColor: showDatePick ? BRAND.purple + '20' : pillBg, borderColor: showDatePick ? BRAND.purple : pillBdr }]}
                onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}
              >
                <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>📅</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showDatePick ? BRAND.purple : colors.textPrimary }}>
                  {fmtDateLabel(dueDate)}
                </Text>
              </TouchableOpacity>

              {/* Time pill */}
              <TouchableOpacity
                style={[aq.datePill, { backgroundColor: showTimePick ? BRAND.purple + '20' : pillBg, borderColor: showTimePick ? BRAND.purple : pillBdr }]}
                onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}
              >
                <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>🕐</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showTimePick ? BRAND.purple : colors.textPrimary }}>
                  {fmtTimeLabel(dueDate)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Picker overlay — floats above form, no layout shift */}
            {(showDatePick || showTimePick) && (
              <Modal transparent animationType="fade" visible onRequestClose={() => { setShowDatePick(false); setShowTimePick(false); }}>
                <TouchableOpacity style={aq.pickerOverlay} activeOpacity={1} onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                  <TouchableOpacity activeOpacity={1} style={[aq.pickerCard, { backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>
                        {showDatePick ? '📅 Pick a Date' : '🕐 Pick a Time'}
                      </Text>
                      <TouchableOpacity onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                        <Text style={{ color: BRAND.purple, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    {showDatePick && (
                      <DateTimePicker
                        value={dueDate}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={onDateChange}
                        textColor={colors.textPrimary}
                        style={{ height: 180, width: '100%' }}
                      />
                    )}
                    {showTimePick && (
                      <DateTimePicker
                        value={dueDate}
                        mode="time"
                        display="spinner"
                        is24Hour={false}
                        onChange={onTimeChange}
                        textColor={colors.textPrimary}
                        style={{ height: 180, width: '100%' }}
                      />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}

            {/* Call-style reminder — opt-in, rings via CallKit/ConnectionService */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: alertCall ? 8 : 14 }}>
              <TouchableOpacity onPress={() => setAlertCall(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons name={alertCall ? 'call' : 'call-outline'} size={18} color={alertCall ? BRAND.purple : colors.textSecondary} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>Call to remind</Text>
              </TouchableOpacity>
              <Switch value={alertCall} onValueChange={setAlertCall} trackColor={{ true: BRAND.purple }} />
            </View>
            {alertCall && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {[0, 5, 10].map(mins => (
                  <TouchableOpacity key={mins} onPress={() => setAlertCallLeadMinutes(mins)}
                    style={[aq.datePill, {
                      backgroundColor: alertCallLeadMinutes === mins ? BRAND.purple + '20' : pillBg,
                      borderColor: alertCallLeadMinutes === mins ? BRAND.purple : pillBdr,
                    }]}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: alertCallLeadMinutes === mins ? BRAND.purple : colors.textPrimary }}>
                      {mins === 0 ? 'On time' : `${mins} min before`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <AddQuestRecurrenceSection
              colors={colors} isDark={isDark}
              isAdultTask={isAdultTask} toggleAdultTask={toggleAdultTask}
              inviteGrandparent={inviteGrandparent} toggleGPInvite={toggleGPInvite}
              routineFreq={routineFreq} setRoutineFreq={setRoutineFreq}
              isRoutine={isRoutine} setIsRoutine={setIsRoutine}
              routineType={routineType} setRoutineType={setRoutineType}
              setCoins={setCoins}
              shoppingStore={shoppingStore} setShoppingStore={setShoppingStore}
              shoppingBudget={shoppingBudget} setShoppingBudget={setShoppingBudget}
              shoppingItemsOpen={shoppingItemsOpen} setShoppingItemsOpen={setShoppingItemsOpen}
              shoppingLines={shoppingLines} updateShoppingLine={updateShoppingLine} removeShoppingLine={removeShoppingLine} addShoppingLine={addShoppingLine}
            />

            <AddQuestAssignSection
              colors={colors} isDark={isDark}
              members={members} activeMemberId={activeMemberId}
              isAdultTask={isAdultTask} setIsAdultTask={setIsAdultTask}
              isPool={isPool} setIsPool={setIsPool}
              assignIds={assignIds} setAssignIds={setAssignIds}
              inviteGrandparent={inviteGrandparent}
              maxClaimants={maxClaimants} setMaxClaimants={setMaxClaimants}
              coins={coins}
              pillBg={pillBg}
            />

            {/* Submit */}
            <TouchableOpacity
              style={[aq.submitBtn, { backgroundColor: title.trim() && desc.trim() && categoryTouched ? '#059669' : colors.border, opacity: saving ? 0.6 : 1 }]}
              onPress={submit} disabled={saving || !title.trim() || !desc.trim() || !categoryTouched}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>Add Chore to Board</Text>
                    <Text style={{ color: '#A7F3D0', fontSize: TYPO.label, marginTop: 2 }}>
                      Due {fmtDateLabel(dueDate)} at {fmtTimeLabel(dueDate)}
                    </Text>
                  </>}
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export const aq = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title:      { fontSize: TYPO.subheading, fontWeight: '900' },
  label:      { fontSize: TYPO.caption, fontWeight: '700', marginBottom: 5 },
  input:      { borderWidth: 1.5, borderRadius: 14, padding: 13, fontSize: TYPO.body, marginBottom: 12 },
  catChip:    { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  toggleRow:  { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
  avatarCheck:{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  datePill:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flex: 1 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  pickerCard:    { borderRadius: 20, overflow: 'hidden', paddingBottom: 12 },
  suggPill:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 220 },
  diffChip:   { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 },
  descInput:  { minHeight: 72, marginBottom: 4 },
  submitBtn:  { borderRadius: 14, padding: 14, alignItems: 'center' },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

