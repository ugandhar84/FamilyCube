/**
 * EventFormModal — Add / Edit family events.
 *
 * RBAC:
 *  Parent  — full form, all categories, immediate helper assignment
 *  Senior  — can create Work / Event for themselves; can accept helper role
 *  Kid     — limited to Ride & Study requests → auto approvalPending = true,
 *            no helper picker (parent assigns later), can withdraw before approved
 *
 * Edit mode restrictions (same as quests):
 *  - Past events: read-only for kids; parents can edit notes/helper only
 *  - After approval: kid cannot edit or delete
 *  - Parent: full edit always
 *
 * Swipe-to-delete is handled in CalendarScreen (this file exports the modals only).
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Modal, KeyboardAvoidingView, Platform, Alert,
  Switch, ActivityIndicator, Pressable,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType, HelperStatus } from '@/store/eventStore';
import { useGroceryStore } from '@/store/groceryStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';

import { X } from './components/eventForm/Icons';
import Chip from './components/eventForm/Chip';
import MemberPicker from './components/eventForm/MemberPicker';
import PickerOverlay from './components/eventForm/PickerOverlay';
import GroceryLinkSection from './components/eventForm/GroceryLinkSection';
import CategoryFields from './components/eventForm/CategoryFields';
import HelperAssignmentSection from './components/eventForm/HelperAssignmentSection';
import { f } from './components/eventForm/styles';
import {
  EventCategory, CATEGORIES, SUGGESTIONS, SPORT_TYPES, SUBJECTS, APPT_TYPES,
  localDateStr, fmtTime, fmtLocalDateTimeStamp, fmtDisplay, fmtTimeDisplay,
} from './components/eventForm/types';
export type { EventCategory } from './components/eventForm/types';

// ─── Family-specific custom categories/suggestions — backed by DB ─────────────
import { fetchCustomSuggestions, recordCustomSuggestion, fetchCustomCategories, CustomCategory } from '@/lib/familyCustomCategories';
import {
  lookupCategoryDefaultsByLooseLabel, resolveDomainFromLooseLabel, fetchSubcategoriesForDomain,
  applyAssignment, type ResponsibilityCategory, type AssignmentSuggestion,
} from '@/lib/responsibilityCategories';
import AssignmentSuggestionCard from './components/eventForm/AssignmentSuggestionCard';

// ═══════════════════════════════════════════════════════════════════════════════
// AddEventModal
// ═══════════════════════════════════════════════════════════════════════════════
export function AddEventModal({ visible, onClose, activeMemberId, prefill }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
  // Seeds initial state from AI-extracted data (VoiceIntakeReviewSheet's
  // "Edit in full form" handoff) — only covers what the AI response
  // actually produces; every other field keeps its normal default.
  prefill?: { title?: string; category?: EventCategory; memberId?: string; startAt?: string; notes?: string };
}) {
  const { colors, isDark } = useTheme();
  const { addEvent, updateEvent } = useEventStore();
  const members = useFamilyStore(s => s.members);
  const { pastStores: cachedStores, pastItemNames: cachedItemNames, appendToCache } = useGroceryStore();
  const siblings = members.map(m => m.name);

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent  = activeMember?.role === 'parent';
  const isSenior  = activeMember?.role === 'senior';
  const isKid     = activeMember?.role === 'kid';
  const isTeen    = activeMember?.role === 'teen';

  // Kids can request Sports / Study / Event / Birthday / Other, with optional ride flag

  // ── State ──────────────────────────────────────────────────────────────────
  const [category,       setCategory]       = useState<EventCategory>(prefill?.category ?? (isKid ? 'Sports' : 'Medical'));
  const [kidRideNeeded,    setKidRideNeeded]    = useState(false);
  const [kidDropoffOn,     setKidDropoffOn]     = useState(false);
  const [kidPickupOn,      setKidPickupOn]      = useState(false);
  const [kidDropoffDate,   setKidDropoffDate]   = useState<Date | null>(null);
  const [kidPickupDate,    setKidPickupDate]     = useState<Date | null>(null);
  const [showKidDropDate,  setShowKidDropDate]  = useState(false);
  const [showKidDropTime,  setShowKidDropTime]  = useState(false);
  const [showKidPickDate,  setShowKidPickDate]  = useState(false);
  const [showKidPickTime,  setShowKidPickTime]  = useState(false);
  // Legacy — kept for submit encoding
  const kidRideType: 'none' | 'dropoff' | 'pickup' | 'both' =
    !kidRideNeeded ? 'none' : kidDropoffOn && kidPickupOn ? 'both' : kidDropoffOn ? 'dropoff' : kidPickupOn ? 'pickup' : 'none';
  const kidReturnDate = kidPickupDate;
  const [title,          setTitle]          = useState(prefill?.title ?? '');
  const [titleFocused,   setTitleFocused]   = useState(false);
  const [notes,          setNotes]          = useState(prefill?.notes ?? '');
  const [saving,         setSaving]         = useState(false);

  // Date/time
  const nowRounded = () => { const d = new Date(); const m = d.getMinutes(); d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1); return d; };
  const [eventDate,      setEventDate]      = useState<Date>(() => prefill?.startAt ? new Date(prefill.startAt) : nowRounded());
  const [showDatePick,   setShowDatePick]   = useState(false);
  const [showTimePick,   setShowTimePick]   = useState(false);
  const [allDay,         setAllDay]         = useState(false);
  const [alertCall,            setAlertCall]            = useState(false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(10);

  // Category-specific
  const [memberIds,      setMemberIds]      = useState<string[]>(prefill?.memberId ? [prefill.memberId] : (isKid ? [activeMemberId] : []));
  const [helperId,       setHelperId]       = useState<string | undefined>();
  const [helperName,     setHelperName]     = useState('');
  const [doctorName,     setDoctorName]     = useState('');
  const [clinicLocation, setClinicLocation] = useState('');
  const [apptType,       setApptType]       = useState('');
  const [sportType,      setSportType]      = useState('');
  const [coachName,      setCoachName]      = useState('');
  const [venueLocation,  setVenueLocation]  = useState('');
  const [returnDate,     setReturnDate]     = useState<Date | null>(null);
  const [showReturnDatePick, setShowReturnDatePick] = useState(false);
  const [showReturnTimePick, setShowReturnTimePick] = useState(false);
  const [kitReminder,    setKitReminder]    = useState(false);
  const [subject,        setSubject]        = useState('');
  const [tutorName,      setTutorName]      = useState('');
  const [isOnline,       setIsOnline]       = useState(false);
  const [meetingUrl,     setMeetingUrl]     = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation,   setDropLocation]   = useState('');
  // Drive assignment — separate from the tutor/escort/coach name above, for
  // when an external tutor is set but transport is still a parent decision.
  const [driverId,       setDriverId]       = useState<string | undefined>();
  const [driverName,     setDriverName]     = useState('');
  const handleDriverSelect = (id: string) => {
    const m = members.find(x => x.id === id);
    setDriverId(id);
    setDriverName(m?.name ?? '');
  };
  const [generalLocation,setGeneralLocation]= useState('');
  const [openToGrandparents, setOpenToGrandparents] = useState(false);
  const [openToTeens,        setOpenToTeens]        = useState(false);
  const [rideCoinsTeen,      setRideCoinsTeen]      = useState('');
  // Tracks whether the parent has manually touched either toggle, so a
  // category-driven default (below) never overwrites a deliberate choice —
  // only pre-fills the toggles the first time a category is picked.
  const [gpTeenToggledByUser, setGpTeenToggledByUser] = useState(false);
  // Optional taxonomy subcategory refinement — e.g. category "Medical" +
  // subcategory "medical.dentist". Not required to submit; when set, it
  // sharpens the eligibility defaults above (dentist vs. emergency have
  // different needs_parent defaults even though both are "Medical") and
  // gets passed to process-task-assignment as a more precise category than
  // the loose top-level label alone would give.
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [subcategoryOptions, setSubcategoryOptions] = useState<ResponsibilityCategory[]>([]);
  const [assignmentSuggestion, setAssignmentSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [customSuggestions,  setCustomSuggestions]  = useState<{ title: string; hint: string }[]>([]);
  const [customCategories,   setCustomCategories]   = useState<CustomCategory[]>([]);

  // Grocery run attachment (Errand category)
  const [linkGroceries,      setLinkGroceries]      = useState(false);
  const [groceryItems,       setGroceryItems]        = useState<{ id: string; name: string; quantity?: string; category?: string; storePreference?: string }[]>([]);
  const [selectedItemIds,    setSelectedItemIds]    = useState<Set<string>>(new Set());
  const [loadingGroceries,   setLoadingGroceries]   = useState(false);
  const [newGroceryLines,    setNewGroceryLines]    = useState<{ name: string; qty: string; store: string }[]>([]);
  const [focusedLineIdx,     setFocusedLineIdx]     = useState<number | null>(null);
  const [focusedField,       setFocusedField]       = useState<'name' | 'store' | null>(null);

  const familyId = activeMember?.familyId ?? '';

  useEffect(() => {
    if (!familyId) return;
    fetchCustomCategories(familyId, 'event').then(setCustomCategories);
  }, [familyId]);

  useEffect(() => {
    if (!familyId || category !== 'Other') return;
    fetchCustomSuggestions(familyId, 'event', 'Other').then(setCustomSuggestions);
  }, [familyId, category]);

  // Pre-fill GP-welcome/teen-eligible from the Responsibility Engine's
  // category taxonomy when the category changes — e.g. picking "Ride"
  // defaults both toggles on (transport is teen_eligible + gp_welcome),
  // picking "Medical" leaves them off. Never overwrites a toggle the
  // parent has already touched by hand this session.
  useEffect(() => {
    if (isKid || isTeen || gpTeenToggledByUser) return;
    lookupCategoryDefaultsByLooseLabel(category).then(defaults => {
      if (!defaults) return;
      setOpenToGrandparents(defaults.gpWelcome);
      setOpenToTeens(defaults.teenEligible);
    });
  }, [category, isKid, isTeen, gpTeenToggledByUser]);

  // Subcategory options for the current category's mapped taxonomy domain
  // — optional refinement, resets whenever the top-level category changes
  // since a subcategory from "Medical" makes no sense once switched to "Ride".
  useEffect(() => {
    setSubcategoryId(null);
    setAssignmentSuggestion(null);
    if (isKid || isTeen) { setSubcategoryOptions([]); return; }
    const domain = resolveDomainFromLooseLabel(category);
    fetchSubcategoriesForDomain(domain).then(setSubcategoryOptions);
  }, [category, isKid, isTeen]);

  // Picking a specific subcategory sharpens the eligibility defaults beyond
  // the domain-level majority vote above — e.g. "Medical" alone splits
  // roughly evenly, but "medical.prescription" specifically is teen/GP-
  // eligible while "medical.emergency" is parent-only. Still never
  // overwrites a manually-touched toggle.
  useEffect(() => {
    if (!subcategoryId || gpTeenToggledByUser) return;
    const match = subcategoryOptions.find(s => s.id === subcategoryId);
    if (!match) return;
    setOpenToGrandparents(match.defaultGpWelcome);
    setOpenToTeens(match.defaultTeenEligible);
  }, [subcategoryId, subcategoryOptions, gpTeenToggledByUser]);

  useEffect(() => {
    if (!linkGroceries || !familyId) return;
    setLoadingGroceries(true);
    supabase.from('grocery_items')
      .select('id, name, quantity, category, store_preference')
      .eq('family_id', familyId).eq('is_bought', false).order('category')
      .then(({ data }) => {
        setGroceryItems((data ?? []).map((r: any) => ({
          id: r.id, name: r.name, quantity: r.quantity ?? undefined,
          category: r.category ?? undefined, storePreference: r.store_preference ?? undefined,
        })));
        setLoadingGroceries(false);
      });
  }, [linkGroceries, familyId]);

  // Merge system + family custom categories (after state is declared)
  const allCategories = [
    ...CATEGORIES,
    ...customCategories
      .filter(cc => !CATEGORIES.some(sc => sc.key === cc.key))
      .map(cc => ({ key: cc.key as EventCategory, emoji: cc.emoji, label: cc.label, color: cc.color })),
  ];
  const allowedCategories = isKid
    ? allCategories.filter(c => ['Sports', 'Study', 'Event', 'Birthday', 'Other'].includes(c.key))
    : isTeen
    ? allCategories.filter(c => ['Sports', 'Study', 'Event', 'Birthday', 'Ride', 'Other'].includes(c.key))
    : isSenior
    ? allCategories.filter(c => ['Medical', 'Work', 'Event', 'Other'].includes(c.key))
    : allCategories;

  const suggPressing = useRef(false);

  // ── Suggestions ────────────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const base = SUGGESTIONS[category] ?? [];
    const pool = category === 'Other' ? customSuggestions : base;
    if (!title.trim()) return pool.slice(0, 6);
    const q = title.toLowerCase();
    return pool.filter(s => s.title.toLowerCase().includes(q)).slice(0, 6);
  }, [category, title, customSuggestions]);

  const applySuggestion = (s: { title: string }) => {
    suggPressing.current = false;
    setTitle(s.title);
    setTitleFocused(false);
  };

  // ── Member pickers ─────────────────────────────────────────────────────────
  const kids   = members.filter(m => m.role === 'kid');
  // Grandparents only appear as a directly-pickable "Accompanied by/Driven
  // by" option once Grandparents Welcome is on — picking one while the
  // toggle reads "Off · private between parents only" was a direct
  // contradiction (see AddQuestModal's same suggestion-then-lock pattern).
  const adults = members.filter(m => m.role === 'parent' || (m.role === 'senior' && openToGrandparents));
  // Show all family members in "For" picker; exclude the selected helper so one person isn't in both roles
  const forMembers = members.filter(m => m.id !== helperId);

  // When parent picks helper from list, fill name from member record
  const handleHelperSelect = (id: string) => {
    const m = members.find(x => x.id === id);
    setHelperId(id);
    setHelperName(m?.name ?? '');
  };

  // Auto-build title when relevant fields change (for Ride)
  const autoTitle = useMemo(() => {
    if (category === 'Ride' && dropLocation && !title)
      return `Ride to ${dropLocation}`;
    if (category === 'Study' && subject && !title)
      return `${subject} tutoring`;
    return '';
  }, [category, dropLocation, subject, title]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => {
    setCategory(isKid ? 'Ride' : 'Medical');
    setTitle(''); setNotes(''); setEventDate(nowRounded()); setAllDay(false);
    setMemberIds(isKid ? [activeMemberId] : []);
    setHelperId(undefined); setHelperName('');
    setDoctorName(''); setClinicLocation(''); setApptType('');
    setSportType(''); setCoachName(''); setVenueLocation(''); setKitReminder(false);
    setSubject(''); setTutorName(''); setIsOnline(false); setMeetingUrl('');
    setPickupLocation(''); setDropLocation(''); setReturnDate(null);
    setGeneralLocation('');
    setShowDatePick(false); setShowTimePick(false);
    setShowReturnDatePick(false); setShowReturnTimePick(false);
    setKidRideNeeded(false); setKidDropoffOn(false); setKidPickupOn(false);
    setKidDropoffDate(null); setKidPickupDate(null);
    setShowKidDropDate(false); setShowKidDropTime(false);
    setShowKidPickDate(false); setShowKidPickTime(false);
    setLinkGroceries(false); setGroceryItems([]); setSelectedItemIds(new Set()); setNewGroceryLines([]);
    setFocusedLineIdx(null); setFocusedField(null);
    setOpenToGrandparents(false); setOpenToTeens(false); setRideCoinsTeen(''); setGpTeenToggledByUser(false);
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const finalTitle = title.trim() || autoTitle;
  const canSubmit = !!finalTitle && (allDay || true); // time optional

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);

    const primaryKidRideDate = isKid && kidRideNeeded
      ? (kidDropoffOn && kidDropoffDate
          ? kidDropoffDate
          : kidPickupOn && kidPickupDate
            ? kidPickupDate
            : eventDate)
      : eventDate;

    const location =
      category === 'Medical'  ? clinicLocation || undefined
      : category === 'Sports' ? venueLocation  || undefined
      : category === 'Study'  ? (isOnline ? 'Online — Zoom' : venueLocation || undefined)
      : category === 'Ride'   ? dropLocation   || undefined
      : generalLocation       || undefined;

    // Study's dedicated "Tutor name" field is the source of truth when no
    // family tutor was picked — helperName alone would silently drop it.
    let helper = category === 'Study'
      ? (helperId ? helperName.trim() : tutorName.trim()) || undefined
      : helperName.trim() || undefined;

    // A parent creating a Ride with no explicit choice (didn't pick a
    // specific helper, didn't toggle Open to GP/Teen) auto-assigns to the
    // other parent — the common two-parent-household case shouldn't require
    // manually picking who when there's only one other person it could be.
    // Declining routes into eventStore's own auto-open-pool-on-decline,
    // so GP/Teen become the fallback without the creating parent having to
    // notice and manually flip those toggles.
    if (isParent && category === 'Ride' && !helper && !openToGrandparents && !openToTeens) {
      // hasCar !== false — a parent who's explicitly turned off "Can Drive"
      // (RosterTab) shouldn't be auto-handed a ride they can't fulfill,
      // same eligibility check every other reassignment path already uses.
      const otherParents = members.filter(m => m.role === 'parent' && m.id !== activeMemberId && m.hasCar !== false);
      if (otherParents.length === 1) {
        helper = otherParents[0].name;
      }
    }

    const newEventId = addEvent({
      title:           finalTitle,
      date:            localDateStr(primaryKidRideDate),
      time:            allDay ? undefined : fmtTime(primaryKidRideDate),
      type:            (category === 'Birthday' ? 'birthday' : category === 'Medical' ? 'appointment' : 'event') as EventType,
      category,
      allDay,
      location,
      notes:           notes.trim() || undefined,
      // Encode kid ride request as structured metadata in returnTime field
      returnTime:      isKid && kidRideType === 'both' && kidPickupDate
        ? `RIDE:both:${fmtLocalDateTimeStamp(kidPickupDate)}`
        : isKid && kidRideType === 'dropoff'
        ? 'RIDE:dropoff'
        : isKid && kidRideType === 'pickup' && kidPickupDate
        ? `RIDE:pickup:${fmtLocalDateTimeStamp(kidPickupDate)}`
        : returnDate ? fmtTimeDisplay(returnDate) : undefined,
      memberId:        memberIds[0],
      memberIds:       memberIds.length > 1 ? memberIds : undefined,
      // Helper — always starts pending, even when picking yourself. Staying
      // in the pending flow (rather than auto-confirming self-picks) is what
      // surfaces "Can't Make It"/reassign/Open to GP/Open to Teen right away
      // instead of only after an extra explicit confirm step.
      helper,
      helperStatus:    helper ? 'pending' : undefined,
      helperRequestedBy: isKid ? activeMember?.name : undefined,
      // Medical
      doctorName:      doctorName.trim() || undefined,
      // Study
      subject:         subject || undefined,
      // Sports
      coachName:       coachName.trim() || undefined,
      // Ride/Sports
      pickupLocation:  pickupLocation.trim() || undefined,
      dropLocation:    dropLocation.trim()   || undefined,
      // Approval flow
      approvalPending:      isKid || isTeen,
      conflict:             false,
      color:                CATEGORIES.find(c => c.key === category)?.color,
      isOpenToGrandparents: !isKid && !isTeen && openToGrandparents,
      isOpenToTeens:        !isKid && !isTeen && openToTeens,
      rideCoins:            (!isKid && !isTeen && openToTeens && rideCoinsTeen) ? parseInt(rideCoinsTeen, 10) : undefined,
      // Drive assignment — distinct from `helper` (tutor/escort/coach).
      // Same self-pick rule: assigning yourself is already settled.
      rideRequired:    !isKid && !!driverName.trim(),
      driverName:      !isKid ? (driverName.trim() || undefined) : undefined,
      driverStatus:    !isKid && driverName.trim() ? (driverId === activeMemberId ? 'confirmed' : 'pending') : undefined,
      alertCall, alertCallLeadMinutes,
    });

    // Persist custom title so it appears in future suggestions for this family
    if (category === 'Other' && finalTitle && familyId) {
      recordCustomSuggestion(familyId, 'event', 'Other', finalTitle);
    }

    // Zero-touch auto-assignment: only when nobody was already explicitly
    // picked in the "For" member list — an explicit pick already has its
    // answer, no need to run the engine over it. Parent-only (kid/teen
    // requests go through the approval flow, not the assignment engine).
    // Fire-and-forget: the event is already saved above; a slow or failed
    // engine call must never block or fail the save the user is waiting on.
    // If the engine returns AUTO it has already written member_id server-
    // side (process-task-assignment step 9) — reflect that back into the
    // local optimistic copy so the UI shows the assignee without a refetch.
    if (!isKid && !isTeen && familyId && memberIds.length === 0) {
      applyAssignment({
        taskId: newEventId,
        taskType: 'event',
        familyId,
        category: subcategoryId ?? resolveDomainFromLooseLabel(category),
      }).then(res => {
        if (res?.decisionType === 'auto' && res.selectedMemberId) {
          updateEvent(newEventId, { memberId: res.selectedMemberId });
        }
      });
    }

    // Same zero-touch pattern for "who's accompanying/driving" — Work and
    // Event have no accompanying-adult concept at all (matches the
    // MemberPicker's own visibility gate above), and Ride runs through its
    // own open-dispatch pool (RideRequestCard/Junior Dispatch) once nobody
    // picks a helper here, so it's excluded from this direct auto-assign too.
    if (!isKid && !isTeen && familyId && category !== 'Work' && category !== 'Event' && category !== 'Ride' && !helperId && !helperName.trim()) {
      applyAssignment({
        taskId: newEventId,
        taskType: 'event',
        familyId,
        category: subcategoryId ?? resolveDomainFromLooseLabel(category),
        targetField: 'helper',
      }).then(res => {
        if (res?.decisionType === 'auto' && res.selectedMemberId) {
          const name = members.find(m => m.id === res.selectedMemberId)?.name;
          if (name) updateEvent(newEventId, { helper: name, helperStatus: 'confirmed' });
        }
      });
    }

    // Study's separate Drive Assignment field (transport, when different
    // from the tutor picked above) gets the same treatment.
    if (!isKid && !isTeen && familyId && category === 'Study' && !driverId && !driverName.trim()) {
      applyAssignment({
        taskId: newEventId,
        taskType: 'event',
        familyId,
        category: subcategoryId ?? resolveDomainFromLooseLabel(category),
        targetField: 'driver',
      }).then(res => {
        if (res?.decisionType === 'auto' && res.selectedMemberId) {
          const name = members.find(m => m.id === res.selectedMemberId)?.name;
          if (name) updateEvent(newEventId, { driverName: name, driverStatus: 'confirmed', rideRequired: true });
        }
      });
    }

    // Create grocery run(s) when items are selected or new items typed
    if (category === 'Errand' && linkGroceries && familyId) {
      const hasExisting = selectedItemIds.size > 0;
      const validNewLines = newGroceryLines.filter(l => l.name.trim());
      if (hasExisting || validNewLines.length > 0) {
        try {
          // Insert new items to grocery_items first, collect their IDs
          const newItemsByStore: Record<string, string[]> = {};
          for (const line of validNewLines) {
            const store = line.store.trim() || 'Any store';
            const { data: inserted } = await supabase
              .from('grocery_items')
              .insert({ family_id: familyId, name: line.name.trim(), quantity: line.qty.trim() || null, store_preference: line.store.trim() || null, added_by: activeMemberId ?? '', is_bought: false, ai_generated: false })
              .select('id')
              .single();
            if (inserted?.id) {
              if (!newItemsByStore[store]) newItemsByStore[store] = [];
              newItemsByStore[store].push(inserted.id);
            }
          }

          // Group existing selected items by store
          const existingByStore: Record<string, string[]> = {};
          for (const id of selectedItemIds) {
            const item = groceryItems.find(i => i.id === id);
            const store = item?.storePreference || 'Any store';
            if (!existingByStore[store]) existingByStore[store] = [];
            existingByStore[store].push(id);
          }

          // Merge all stores
          const allStores = new Set([...Object.keys(existingByStore), ...Object.keys(newItemsByStore)]);

          // Create one run per store
          for (const store of allStores) {
            const itemIds = [...(existingByStore[store] ?? []), ...(newItemsByStore[store] ?? [])];
            if (itemIds.length === 0) continue;
            const { data: runRow, error: runErr } = await supabase
              .from('grocery_runs')
              .insert({
                family_id:  familyId,
                name:       finalTitle,
                store:      store === 'Any store' ? (generalLocation.trim() || 'Store') : store,
                status:     'draft',
                created_by: activeMemberId ?? '',
                planned_at: localDateStr(eventDate),
              })
              .select('id')
              .single();
            if (!runErr && runRow?.id) {
              const rows = itemIds.map(itemId => ({ run_id: runRow.id, item_id: itemId, checked_in_run: false }));
              await supabase.from('grocery_run_items').insert(rows);
            }
          }
          // Update local cache immediately so next form open has suggestions
          const newNames  = validNewLines.map(l => l.name.trim()).filter(Boolean);
          const newStores = [...allStores].filter(s => s !== 'Any store');
          if (newNames.length || newStores.length) appendToCache(newNames, newStores);
        } catch (e: any) {
          console.warn('[EventFormModal] grocery run creation failed', e?.message);
        }
      }
    }

    setSaving(false);
    reset();
    onClose();
  };

  const catColor = CATEGORIES.find(c => c.key === category)?.color ?? BRAND.purple;
  const catEmoji = CATEGORIES.find(c => c.key === category)?.emoji ?? '📅';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={[f.sheet, { backgroundColor: colors.card }]}>
            {/* Drag handle */}
            <View style={[f.handle, { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }]} />

            {/* ── Fixed header ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>
                  {isKid ? '🙋 Request Help' : '+ New Event'}
                </Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: catColor }}>
                  {isKid
                    ? 'Your request goes to a parent for approval'
                    : `${catEmoji} ${category} — ${isParent ? 'full access' : 'senior view'}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { reset(); onClose(); }}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}
              >
                <X c={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Scrollable form fields (category included) ── */}
            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}
            >
            {/* ── Category selector ── */}
            <Text style={[f.label, { color: colors.textSecondary, marginBottom: 6 }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {allowedCategories.map(c => {
                  const active = category === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      onPress={() => { setCategory(c.key); setTitle(''); }}
                      style={{
                        borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8,
                        alignItems: 'center', gap: 3, minWidth: 64,
                        backgroundColor: active ? c.color + '18' : (isDark ? colors.surface : colors.inputBg),
                        borderColor: active ? c.color : (isDark ? colors.border : '#E2E8F0'),
                      }}
                    >
                      <Text style={{ fontSize: 20, opacity: active ? 1 : 0.6 }}>{c.emoji}</Text>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: active ? c.color : colors.textSecondary }}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* ── Optional subcategory refinement (Responsibility Engine taxonomy) ── */}
            {!isKid && !isTeen && subcategoryOptions.length > 0 && (
              <View style={{ marginBottom: 14, marginTop: -6 }}>
                <Text style={[f.label, { color: colors.textSecondary, marginBottom: 6 }]}>
                  Specifically… <Text style={{ color: colors.textTertiary, fontWeight: '600' }}>(optional, sharpens who can help)</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {subcategoryOptions.map(sc => {
                      const active = subcategoryId === sc.id;
                      return (
                        <TouchableOpacity
                          key={sc.id}
                          onPress={() => setSubcategoryId(active ? null : sc.id)}
                          style={{
                            borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
                            backgroundColor: active ? catColor + '18' : (isDark ? colors.surface : colors.inputBg),
                            borderColor: active ? catColor : (isDark ? colors.border : '#E2E8F0'),
                          }}
                        >
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: active ? catColor : colors.textSecondary }}>
                            {sc.subcategoryLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {!isKid && !isTeen && familyId && (
              <AssignmentSuggestionCard
                colors={colors} isDark={isDark} familyId={familyId}
                category={category} subcategoryId={subcategoryId}
                loadingSuggestion={loadingSuggestion} setLoadingSuggestion={setLoadingSuggestion}
                assignmentSuggestion={assignmentSuggestion} setAssignmentSuggestion={setAssignmentSuggestion}
              />
            )}

            {/* ── Title ── */}
            <Text style={[f.label, { color: colors.textSecondary }]}>Title *</Text>
            <TextInput
              style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface,
                borderColor: finalTitle ? colors.borderMed : colors.danger + '60' }]}
              placeholder={autoTitle || `e.g. ${SUGGESTIONS[category]?.[0]?.title ?? 'Event title'}`}
              placeholderTextColor={colors.textTertiary}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
              returnKeyType="next"
            />
            {/* Suggestions */}
            {suggestions.length > 0 && (
              <View style={{ marginTop: -8, marginBottom: 14 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginBottom: 8, fontWeight: '700', letterSpacing: 0.4 }}>
                  {title.trim() ? 'Matching — tap to fill' : 'Quick picks'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {suggestions.map((s, i) => {
                      const selected = title === s.title;
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => selected ? setTitle('') : applySuggestion(s)}
                          style={[f.suggPill, {
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: selected ? catColor + '20' : (isDark ? colors.surface : colors.inputBg),
                            borderColor: selected ? catColor : (isDark ? colors.border : '#E2E8F0'),
                          }]}
                        >
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: selected ? catColor : colors.textPrimary }} numberOfLines={1}>
                            {s.title}
                          </Text>
                          {s.hint ? <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginLeft: 4 }}>{s.hint}</Text> : null}
                          {selected && <X c={catColor} size={12} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* ── Date / Time ── */}
            <Text style={[f.label, { color: colors.textSecondary }]}>Date & Time</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                style={[f.dateBtn, { flex: 3, backgroundColor: showDatePick ? catColor + '20' : colors.surface, borderColor: showDatePick ? catColor : colors.border }]}
                onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}
              >
                <Text style={{ fontSize: 13 }}>📅</Text>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showDatePick ? catColor : colors.textPrimary }}>
                  {fmtDisplay(eventDate)}
                </Text>
              </TouchableOpacity>
              {!allDay && (
                <TouchableOpacity
                  style={[f.dateBtn, { flex: 2, backgroundColor: showTimePick ? catColor + '20' : colors.surface, borderColor: showTimePick ? catColor : colors.border }]}
                  onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}
                >
                  <Text style={{ fontSize: 13 }}>🕐</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showTimePick ? catColor : colors.textPrimary }}>
                    {fmtTimeDisplay(eventDate)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Picker overlay — floats above form, no layout shift */}
            <PickerOverlay
              showDate={showDatePick} showTime={showTimePick}
              value={eventDate}
              onChangeDate={d => { const m = new Date(d); m.setHours(eventDate.getHours(), eventDate.getMinutes()); setEventDate(m); }}
              onChangeTime={d => { const m = new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setEventDate(m); }}
              onDone={() => { setShowDatePick(false); setShowTimePick(false); }}
              accentColor={catColor} colors={colors}
              minimumDate={new Date()}
            />

            {/* All day toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>All day</Text>
              <Switch
                value={allDay} onValueChange={setAllDay}
                trackColor={{ false: colors.border, true: catColor + '80' }}
                thumbColor={allDay ? catColor : colors.textTertiary}
              />
            </View>

            {/* Call-style reminder — opt-in, rings via CallKit/ConnectionService */}
            {!allDay && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: alertCall ? 8 : 16, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>📞 Call to remind</Text>
                  <Switch
                    value={alertCall} onValueChange={setAlertCall}
                    trackColor={{ false: colors.border, true: catColor + '80' }}
                    thumbColor={alertCall ? catColor : colors.textTertiary}
                  />
                </View>
                {alertCall && (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, paddingHorizontal: 4 }}>
                    {[0, 5, 10].map(mins => (
                      <TouchableOpacity key={mins} onPress={() => setAlertCallLeadMinutes(mins)}
                        style={[f.dateBtn, { flex: 1, backgroundColor: alertCallLeadMinutes === mins ? catColor + '20' : colors.surface, borderColor: alertCallLeadMinutes === mins ? catColor : colors.border }]}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: alertCallLeadMinutes === mins ? catColor : colors.textPrimary }}>
                          {mins === 0 ? 'On time' : `${mins} min before`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            <CategoryFields
              category={category} catColor={catColor} colors={colors} isDark={isDark} siblings={siblings} adults={adults} isKid={isKid}
              apptType={apptType} setApptType={setApptType} doctorName={doctorName} setDoctorName={setDoctorName}
              clinicLocation={clinicLocation} setClinicLocation={setClinicLocation}
              sportType={sportType} setSportType={setSportType} coachName={coachName} setCoachName={setCoachName}
              venueLocation={venueLocation} setVenueLocation={setVenueLocation}
              pickupLocation={pickupLocation} setPickupLocation={setPickupLocation}
              kitReminder={kitReminder} setKitReminder={setKitReminder}
              subject={subject} setSubject={setSubject} tutorName={tutorName} setTutorName={setTutorName}
              isOnline={isOnline} setIsOnline={setIsOnline} meetingUrl={meetingUrl} setMeetingUrl={setMeetingUrl}
              helperId={helperId} dropLocation={dropLocation} setDropLocation={setDropLocation}
              driverId={driverId} driverName={driverName} setDriverName={setDriverName} setDriverId={setDriverId}
              handleDriverSelect={handleDriverSelect}
              eventDate={eventDate}
              returnDate={returnDate} setReturnDate={setReturnDate}
              showReturnDatePick={showReturnDatePick} setShowReturnDatePick={setShowReturnDatePick}
              showReturnTimePick={showReturnTimePick} setShowReturnTimePick={setShowReturnTimePick}
              showDatePick={showDatePick} setShowDatePick={setShowDatePick}
              showTimePick={showTimePick} setShowTimePick={setShowTimePick}
              isTeen={isTeen} members={members}
              openToGrandparents={openToGrandparents} setOpenToGrandparents={setOpenToGrandparents}
              openToTeens={openToTeens} setOpenToTeens={setOpenToTeens}
              setGpTeenToggledByUser={setGpTeenToggledByUser}
              rideCoinsTeen={rideCoinsTeen} setRideCoinsTeen={setRideCoinsTeen}
              generalLocation={generalLocation} setGeneralLocation={setGeneralLocation}
              linkGroceries={linkGroceries} setLinkGroceries={setLinkGroceries}
              loadingGroceries={loadingGroceries} groceryItems={groceryItems}
              selectedItemIds={selectedItemIds} setSelectedItemIds={setSelectedItemIds}
              newGroceryLines={newGroceryLines} setNewGroceryLines={setNewGroceryLines}
              focusedLineIdx={focusedLineIdx} setFocusedLineIdx={setFocusedLineIdx}
              focusedField={focusedField} setFocusedField={setFocusedField}
              cachedItemNames={cachedItemNames} cachedStores={cachedStores}
            />

            {/* ── For (member picker — multi-select) ── */}
            {category !== 'Event' && !isKid && (
              <MemberPicker
                label={
                  category === 'Medical'  ? 'Patient — select all who attend' :
                  category === 'Sports'   ? 'Player — select participants' :
                  category === 'Study'    ? 'Student — select all studying' :
                  category === 'Ride'     ? 'Passenger(s)' :
                  category === 'Birthday' ? '🎂 Who\'s attending?' :
                  category === 'Other'    ? '👤 For (optional)' :
                  'For'
                }
                selectedIds={memberIds}
                members={forMembers}
                onToggle={id => setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                onSelectAll={() => {
                  const allIds = forMembers.map(m => m.id);
                  setMemberIds(memberIds.length === forMembers.length ? [] : allIds);
                }}
                colors={colors} isDark={isDark} siblings={siblings}
              />
            )}

            {(isKid || (category !== 'Work' && category !== 'Event')) && (
              <HelperAssignmentSection
                isKid={isKid} category={category} catColor={catColor} colors={colors} isDark={isDark} siblings={siblings} adults={adults}
                eventDate={eventDate}
                kidRideNeeded={kidRideNeeded} setKidRideNeeded={setKidRideNeeded}
                kidDropoffOn={kidDropoffOn} setKidDropoffOn={setKidDropoffOn} kidDropoffDate={kidDropoffDate} setKidDropoffDate={setKidDropoffDate}
                kidPickupOn={kidPickupOn} setKidPickupOn={setKidPickupOn} kidPickupDate={kidPickupDate} setKidPickupDate={setKidPickupDate}
                showKidDropDate={showKidDropDate} setShowKidDropDate={setShowKidDropDate}
                showKidDropTime={showKidDropTime} setShowKidDropTime={setShowKidDropTime}
                showKidPickDate={showKidPickDate} setShowKidPickDate={setShowKidPickDate}
                showKidPickTime={showKidPickTime} setShowKidPickTime={setShowKidPickTime}
                helperId={helperId} handleHelperSelect={handleHelperSelect}
                helperName={helperName} setHelperName={setHelperName} setHelperId={setHelperId}
              />
            )}

            {/* ── Grandparents Welcome toggle (parents only, non-Ride — Ride has inline toggles) ── */}
            {!isKid && !isTeen && category !== 'Ride' && (
              <TouchableOpacity
                onPress={() => { setGpTeenToggledByUser(true); setOpenToGrandparents(g => !g); }}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, marginBottom: 14,
                  borderWidth: 1.5,
                  borderColor: openToGrandparents ? colors.warning : (isDark ? colors.border : '#E2E8F0'),
                  backgroundColor: openToGrandparents
                    ? (isDark ? '#2D1800' : colors.warningLight)
                    : (isDark ? colors.surface : '#F9FAFB'),
                }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                    color: openToGrandparents ? '#92400E' : colors.textPrimary }}>
                    👴👵 Grandparents Welcome
                  </Text>
                  <Text style={{ fontSize: TYPO.label, color: openToGrandparents ? '#B45309' : colors.textSecondary }}>
                    {openToGrandparents
                      ? 'Enters voluntary pool — grandparents can claim or pass, no pressure'
                      : 'Off · private between parents only'}
                  </Text>
                </View>
                <View style={{ width: 44, height: 26, borderRadius: 13,
                  backgroundColor: openToGrandparents ? colors.warning : (isDark ? '#334155' : '#CBD5E1'),
                  justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textInverse,
                    alignSelf: openToGrandparents ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>
            )}

            {/* ── Teens Welcome toggle — non-Ride (has its own inline toggle),
                non-Medical (not appropriate for a minor to be responsible
                for a medical appointment) ── */}
            {!isKid && !isTeen && category !== 'Ride' && category !== 'Medical' && members.some(m => m.role === 'teen') && (
              <TouchableOpacity
                onPress={() => { setGpTeenToggledByUser(true); setOpenToTeens(t => !t); }}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, marginBottom: 14,
                  borderWidth: 1.5,
                  borderColor: openToTeens ? '#6366F1' : (isDark ? colors.border : '#E2E8F0'),
                  backgroundColor: openToTeens
                    ? (isDark ? '#1E1B4B' : '#EEF2FF')
                    : (isDark ? colors.surface : '#F9FAFB'),
                }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                    color: openToTeens ? '#3730A3' : colors.textPrimary }}>
                    🧑 Teens Welcome
                  </Text>
                  <Text style={{ fontSize: TYPO.label, color: openToTeens ? '#4338CA' : colors.textSecondary }}>
                    {openToTeens
                      ? 'Enters voluntary pool — a teen with a car can cover this'
                      : 'Off · not offered to teens'}
                  </Text>
                </View>
                <View style={{ width: 44, height: 26, borderRadius: 13,
                  backgroundColor: openToTeens ? '#6366F1' : (isDark ? '#334155' : '#CBD5E1'),
                  justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textInverse,
                    alignSelf: openToTeens ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>
            )}

            {/* ── Notes ── */}
            <Text style={[f.label, { color: colors.textSecondary, marginTop: 4 }]}>📝 Notes (optional)</Text>
            <TextInput
              style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
              placeholder={isKid ? 'Any message for parents? (e.g. please pick me up early)' : 'Any details, instructions, or reminders…'}
              placeholderTextColor={colors.textTertiary}
              value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
              multiline numberOfLines={3} textAlignVertical="top"
            />
            <Text style={{ fontSize: TYPO.micro, color: notes.length > 180 ? colors.danger : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 16 }}>
              {notes.length}/200
            </Text>

            {/* ── Kid approval reminder ── */}
            {isKid && (
              <View style={[f.kidNote, { backgroundColor: isDark ? '#1E1B4B' : '#F0F0FE', borderColor: BRAND.purple + '40', marginBottom: 16 }]}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
                  ⏳ Sent for parent approval
                </Text>
                <Text style={{ fontSize: TYPO.micro, color: BRAND.purple, opacity: 0.8, marginTop: 2 }}>
                  A parent will review and assign someone. You'll see it on your schedule once confirmed.
                </Text>
              </View>
            )}

            {/* ── Submit ── */}
            <TouchableOpacity
              style={[f.submitBtn, { backgroundColor: canSubmit && !saving ? catColor : colors.border, opacity: saving ? 0.7 : 1 }]}
              onPress={submit} disabled={!canSubmit || saving}
            >
              {saving
                ? <ActivityIndicator color={colors.textInverse} size="small" />
                : <Text style={{ color: colors.textInverse, fontSize: TYPO.caption, fontWeight: '900' }}>
                    {isKid ? 'Send Request to Parent 🙋' : `Add to Family Schedule ${catEmoji}`}
                  </Text>}
            </TouchableOpacity>
          </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EditEventModal
// ═══════════════════════════════════════════════════════════════════════════════
export function EditEventModal({ event, activeMemberId, onClose, onDelete }: {
  event: FamilyEvent;
  activeMemberId: string;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { updateEvent } = useEventStore();
  const members  = useFamilyStore(s => s.members);
  const siblings = members.map(m => m.name);
  const kids     = members.filter(m => m.role === 'kid');

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent = activeMember?.role === 'parent';
  const isKid    = activeMember?.role === 'kid';
  const isPast   = (() => {
    if (!event.date) return false;
    // Local calendar date, not UTC — toISOString() can already read as
    // "tomorrow" hours before local midnight in timezones behind UTC,
    // which would lock an event as "past" while it's still happening today.
    const today = localDateStr(new Date());
    if (event.date < today) return true;
    if (event.date > today) return false;
    // Same day — compare time
    if (!event.time) return false;
    const [h, m] = event.time.split(':').map(Number);
    const now = new Date();
    return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
  })();

  // Kids can only edit their own pending requests
  const isOwnPending   = isKid && event.approvalPending && event.memberId === activeMemberId;
  const isParentApproved = !event.approvalPending;
  const restricted     = isPast || (isKid && isParentApproved); // past or kid approved → read-only

  // Original requester — if this was a kid request, lock that kid from being removed
  const originalRequesterId = event.helperRequestedBy
    ? members.find(m => event.helperRequestedBy?.includes(m.name))?.id
    : undefined;
  const lockedMemberIds = originalRequesterId ? [originalRequesterId] : [];

  const [notes,      setNotes]      = useState(event.notes ?? '');
  const [helperName, setHelperName] = useState('');
  const [helperId,   setHelperId]   = useState<string | undefined>(
    members.find((m: any) => m.name === event.helper)?.id
  );
  const [editMemberIds, setEditMemberIds] = useState<string[]>(
    event.memberIds?.length ? event.memberIds : event.memberId ? [event.memberId] : []
  );
  const [saving,        setSaving]        = useState(false);
  const [editGPOpen,    setEditGPOpen]    = useState(event.isOpenToGrandparents ?? false);
  const [editTeenOpen,  setEditTeenOpen]  = useState(event.isOpenToTeens ?? false);
  const [editRideCoins, setEditRideCoins] = useState(event.rideCoins != null ? String(event.rideCoins) : '');
  // Same reveal-on-opt-in as the create form — a GP only appears as a
  // directly-pickable accompany/drive option once Grandparents Welcome is on.
  const adults = members.filter(m => m.role === 'parent' || (m.role === 'senior' && editGPOpen));

  // Drive assignment — separate from the tutor/escort/coach (`helper`) once
  // that's already filled in (e.g. by the kid naming an external tutor).
  const [editRideRequired, setEditRideRequired] = useState(event.rideRequired ?? false);
  const [editDriverName,   setEditDriverName]   = useState(event.driverName ?? '');
  const [editDriverId,     setEditDriverId]     = useState<string | undefined>(
    members.find((m: any) => m.name === event.driverName)?.id
  );
  const [alertCall,            setAlertCall]            = useState(event.alertCall ?? false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(event.alertCallLeadMinutes ?? 10);
  const handleDriverSelect = (id: string) => {
    const m = members.find(x => x.id === id);
    setEditDriverId(id);
    setEditDriverName(m?.name ?? '');
  };
  // Categories where `helper` means a role (tutor/escort/coach), not the driver —
  // Ride keeps `helper` as the driver directly, unchanged.
  const ROLE_HELPER_CATEGORIES = ['Medical', 'Study', 'Sports'];
  const helperIsRoleFilled = ROLE_HELPER_CATEGORIES.includes(event.category ?? '') && !!event.helper;

  const catColor = CATEGORIES.find(c => c.key === event.category)?.color ?? BRAND.purple;
  const catEmoji = CATEGORIES.find(c => c.key === event.category)?.emoji ?? '📅';

  const handleHelperSelect = (id: string) => {
    const m = members.find(x => x.id === id);
    setHelperId(id);
    setHelperName(m?.name ?? '');
  };

  const save = async () => {
    setSaving(true);
    const patch: Partial<FamilyEvent> = {};
    // Past/restricted: notes is the one field still editable (matches the
    // quest pattern — everything locks after the fact except a note).
    // Every other field's local state may still hold stale edits from
    // before the event tipped into "past" mid-session, so this must
    // ignore them entirely rather than trust the hidden sections are inert.
    if (restricted) {
      if (notes !== event.notes) patch.notes = notes.trim() || undefined;
      if (alertCall !== (event.alertCall ?? false)) patch.alertCall = alertCall;
      if (alertCallLeadMinutes !== (event.alertCallLeadMinutes ?? 10)) patch.alertCallLeadMinutes = alertCallLeadMinutes;
      if (Object.keys(patch).length > 0) updateEvent(event.id, patch);
      setSaving(false);
      onClose();
      return;
    }
    if (isParent) {
      if (notes !== event.notes) patch.notes = notes.trim() || undefined;
      if (alertCall !== (event.alertCall ?? false)) patch.alertCall = alertCall;
      if (alertCallLeadMinutes !== (event.alertCallLeadMinutes ?? 10)) patch.alertCallLeadMinutes = alertCallLeadMinutes;
      if (helperName !== event.helper) {
        let newHelperName = helperName.trim();
        // Same auto-assign-to-other-parent convenience as creating a new
        // Ride — clearing the helper here without opening to GP/Teen
        // shouldn't require manually re-picking the one other parent it
        // could be.
        if (!newHelperName && event.category === 'Ride' && !editGPOpen && !editTeenOpen) {
          const otherParents = members.filter(m => m.role === 'parent' && m.id !== activeMemberId && m.hasCar !== false);
          if (otherParents.length === 1) newHelperName = otherParents[0].name;
        }
        patch.helper = newHelperName || undefined;
        // Always starts pending, even reassigning to yourself — see the
        // matching comment in AddEventModal's create path for why.
        patch.helperStatus = newHelperName ? 'pending' : undefined;
      }
      const origIds = event.memberIds?.length ? event.memberIds : event.memberId ? [event.memberId] : [];
      if (JSON.stringify(editMemberIds) !== JSON.stringify(origIds)) {
        patch.memberIds = editMemberIds.length > 1 ? editMemberIds : undefined;
        patch.memberId  = editMemberIds[0];
      }
      if (event.category === 'Ride' || event.category === 'Study') {
        if (editGPOpen !== (event.isOpenToGrandparents ?? false)) patch.isOpenToGrandparents = editGPOpen;
      }
      if (event.category === 'Ride') {
        if (editTeenOpen !== (event.isOpenToTeens ?? false)) patch.isOpenToTeens = editTeenOpen;
        const newCoins = editTeenOpen && editRideCoins ? parseInt(editRideCoins, 10) : undefined;
        if (newCoins !== event.rideCoins) patch.rideCoins = newCoins;
      }
      if (helperIsRoleFilled) {
        if (editRideRequired !== (event.rideRequired ?? false)) patch.rideRequired = editRideRequired;
        if (editDriverName !== (event.driverName ?? '')) {
          patch.driverName = editDriverName.trim() || undefined;
          patch.driverStatus = editDriverName.trim() ? (editDriverId === activeMemberId ? 'confirmed' : 'pending') : undefined;
        }
      }
    } else if (isOwnPending) {
      // Kid can only update notes on their own pending request
      patch.notes = notes.trim() || undefined;
    }
    if (Object.keys(patch).length > 0) {
      updateEvent(event.id, patch);
    }
    setSaving(false);
    onClose();
  };

  const handleDelete = () => {
    if (restricted) return; // blocked in UI
    Alert.alert(
      isOwnPending ? 'Withdraw Request' : 'Delete Event',
      isOwnPending
        ? `Withdraw your request for "${event.title}"?`
        : `Remove "${event.title}" from the family schedule?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isOwnPending ? 'Withdraw' : 'Delete', style: 'destructive', onPress: () => { onDelete?.(); onClose(); } },
      ]
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

          {/* Sheet — header outside scroll, content scrolls */}
          <View style={[f.sheet, { backgroundColor: colors.card }]}>
            {/* Drag handle */}
            <View style={[f.handle, { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }]} />

            {/* ── Fixed header (never scrolls) ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: catColor + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>{catEmoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>{event.title}</Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                  {event.date}{event.time ? ` · ${event.time}` : ''}{event.location ? ` · ${event.location}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X c={colors.textSecondary} size={14} />
              </TouchableOpacity>
            </View>

            {/* Detail pills — fixed */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {(() => {
                const ids = event.memberIds?.length ? event.memberIds : event.memberId ? [event.memberId] : [];
                return ids.map(mid => {
                  const name = members.find((m: any) => m.id === mid)?.name?.split(' ')[0];
                  return name ? (
                    <View key={mid} style={{ backgroundColor: catColor + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: catColor }}>
                        {event.category === 'Medical' ? '🩺' : event.category === 'Study' ? '🎓' : '👤'} {name}
                      </Text>
                    </View>
                  ) : null;
                });
              })()}
              {event.category === 'Medical' && event.doctorName && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>🩺 {event.doctorName}</Text>
                </View>
              )}
              {event.category === 'Study' && event.subject && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>📖 {event.subject}</Text>
                </View>
              )}
              {event.category === 'Sports' && event.coachName && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>🏅 {event.coachName}</Text>
                </View>
              )}
              {(event.pickupLocation || event.dropLocation) && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>📍 {event.pickupLocation ?? '?'} → {event.dropLocation ?? '?'}</Text>
                </View>
              )}
              {event.helper && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: event.helperStatus === 'confirmed' ? colors.success : event.helperStatus === 'rejected' ? colors.danger : colors.amber }}>
                    {event.helperStatus === 'confirmed' ? '✓' : event.helperStatus === 'rejected' ? '✕' : '⏳'} {event.helper}
                  </Text>
                </View>
              )}
              {event.helperRequestedBy && (
                <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#C7D2FE' }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: '#4338CA' }}>
                    🙋 Requested by {event.helperRequestedBy}
                  </Text>
                </View>
              )}
              {restricted && (
                <View style={{ backgroundColor: colors.warningLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.amber, fontWeight: '700' }}>🔒 Read-only</Text>
                </View>
              )}
            </View>

            {/* ── Scrollable body (editable fields only) ── */}
            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
            >
              {/* Change who it's for */}
              {!restricted && isParent && !['Work', 'Event'].includes(event.category ?? '') && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 }}>
                  {lockedMemberIds.length > 0 && (
                    <Text style={{ fontSize: TYPO.micro, color: colors.warning, fontWeight: '700', marginBottom: 4 }}>
                      🔒 Original requester cannot be removed • add siblings if needed
                    </Text>
                  )}
                  <MemberPicker
                    label={
                      event.category === 'Medical'  ? '🩺 Change patient(s)' :
                      event.category === 'Sports'   ? '🏅 Change player(s)' :
                      event.category === 'Study'    ? '📚 Change student(s)' :
                      event.category === 'Ride'     ? '🚗 Passenger(s)' : '👤 For'
                    }
                    selectedIds={editMemberIds}
                    members={['Medical', 'Sports', 'Study', 'Ride'].includes(event.category ?? '') ? kids : members}
                    onToggle={id => {
                      if (lockedMemberIds.includes(id)) return; // locked kid cannot be removed
                      setEditMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                    }}
                    onSelectAll={() => {
                      // Birthday/Errand/Other aren't kid-specific — a parent can run an
                      // errand or throw their own party, so the pool isn't kids-only there.
                      const pool = ['Medical', 'Sports', 'Study', 'Ride'].includes(event.category ?? '') ? kids : members;
                      // Select all but preserve locked kids
                      const allIds = pool.map(m => m.id);
                      setEditMemberIds(editMemberIds.length === pool.length ? lockedMemberIds : allIds);
                    }}
                    colors={colors} isDark={isDark} siblings={siblings}
                    lockedIds={lockedMemberIds}
                  />
                </View>
              )}

              {/* Helper/tutor/escort/coach reassignment — Ride always shows this (helper IS
                  the driver there). For Medical/Study/Sports it only shows until a
                  role-helper name is filled in; once set, Drive Assignment below takes
                  over since the remaining question is transport, not who tutors. */}
              {!restricted && isParent && !['Work', 'Event'].includes(event.category ?? '') && !helperIsRoleFilled && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
                    {event.category === 'Medical' ? '🏥 Reassign escort' :
                     event.category === 'Study'   ? '📚 Change tutor / helper' :
                     event.category === 'Sports'  ? '🚗 Reassign drop-off' :
                     '🚗 Reassign driver'}
                  </Text>
                  <MemberPicker
                    label={
                      event.category === 'Medical' ? '🏥 Accompanied by' :
                      event.category === 'Study'   ? '📚 Tutored by'     :
                      event.category === 'Sports'  ? '🚗 Drop-off by'    :
                      '🚗 Driven by'
                    }
                    selectedIds={helperId ? [helperId] : []}
                    members={adults}
                    onToggle={handleHelperSelect}
                    colors={colors} isDark={isDark} siblings={siblings}
                  />
                  {!helperId && (
                    <TextInput
                      style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed, marginTop: -4 }]}
                      placeholder="Or type a name (e.g. external tutor)"
                      placeholderTextColor={colors.textTertiary}
                      value={helperName}
                      onChangeText={t => setHelperName(t)}
                    />
                  )}
                </View>
              )}

              {/* Drive Assignment — Medical/Study/Sports once the tutor/escort/coach is
                  already set (e.g. by the kid). Transport is a separate, parent-decided
                  need from who's running the actual session. */}
              {!restricted && isParent && helperIsRoleFilled && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 10 }}>
                  <View style={{ backgroundColor: isDark ? colors.surface : '#F8FAFC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                      {event.category === 'Medical' ? '🏥' : event.category === 'Study' ? '📚' : '🏅'}{' '}
                      {event.category === 'Medical' ? 'Escort' : event.category === 'Study' ? 'Tutor' : 'Coach'}:{' '}
                      <Text style={{ fontWeight: '800', color: colors.textPrimary }}>{event.helper}</Text> — already set
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setEditRideRequired(v => !v)}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5,
                      borderColor: editRideRequired ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                      backgroundColor: editRideRequired ? (isDark ? '#0D2A2A' : '#ECFDF5') : (isDark ? colors.surface : '#F9FAFB'),
                    }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: editRideRequired ? BRAND.teal : colors.textPrimary }}>
                        🚗 Ride Needed?
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: editRideRequired ? BRAND.teal : colors.textSecondary }}>
                        {editRideRequired ? 'Assign who drives below' : 'Off · no ride tracked for this event'}
                      </Text>
                    </View>
                    <View style={{ width: 40, height: 24, borderRadius: 12,
                      backgroundColor: editRideRequired ? BRAND.teal : (isDark ? '#334155' : '#CBD5E1'),
                      justifyContent: 'center', paddingHorizontal: 3 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textInverse,
                        alignSelf: editRideRequired ? 'flex-end' : 'flex-start' }} />
                    </View>
                  </TouchableOpacity>
                  {editRideRequired && (
                    <View style={{ gap: 8 }}>
                      <MemberPicker
                        label="🚗 Drive Assignment"
                        selectedIds={editDriverId ? [editDriverId] : []}
                        members={adults}
                        onToggle={handleDriverSelect}
                        colors={colors} isDark={isDark} siblings={siblings}
                      />
                      {!editDriverId && (
                        <TextInput
                          style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                          placeholder="Or type a name (e.g. external driver)"
                          placeholderTextColor={colors.textTertiary}
                          value={editDriverName}
                          onChangeText={setEditDriverName}
                        />
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* GP Welcome toggle — matches the create form's gate (every
                  category except Ride, which has its own inline toggle
                  above); previously edit mode only offered this for
                  Ride/Study, so a parent could set it at creation but never
                  change it afterward for Medical/Sports/Birthday/etc. */}
              {isParent && !isPast && event.category !== 'Ride' && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setEditGPOpen(g => !g)}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5,
                      borderColor: editGPOpen ? colors.warning : (isDark ? colors.border : '#E2E8F0'),
                      backgroundColor: editGPOpen ? (isDark ? '#2D1800' : colors.warningLight) : (isDark ? colors.surface : '#F9FAFB'),
                    }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: editGPOpen ? '#92400E' : colors.textPrimary }}>
                        👴👵 Grandparents Welcome
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: editGPOpen ? '#B45309' : colors.textSecondary }}>
                        {editGPOpen
                          ? (event.category === 'Study'
                              ? 'GP can help with tutoring/escort, or pass'
                              : 'Enters voluntary pool — grandparents can claim or pass, no pressure')
                          : 'Off · only visible to parents'}
                      </Text>
                    </View>
                    <View style={{ width: 44, height: 26, borderRadius: 13,
                      backgroundColor: editGPOpen ? colors.warning : (isDark ? '#334155' : '#CBD5E1'),
                      justifyContent: 'center', paddingHorizontal: 3 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textInverse,
                        alignSelf: editGPOpen ? 'flex-end' : 'flex-start' }} />
                    </View>
                  </TouchableOpacity>

                  {event.category !== 'Medical' && members.some(m => m.role === 'teen') && (
                    <TouchableOpacity
                      onPress={() => setEditTeenOpen(t => !t)}
                      activeOpacity={0.8}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5,
                        borderColor: editTeenOpen ? '#6366F1' : (isDark ? colors.border : '#E2E8F0'),
                        backgroundColor: editTeenOpen ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? colors.surface : '#F9FAFB'),
                      }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: editTeenOpen ? '#3730A3' : colors.textPrimary }}>
                          🧑 Teens Welcome
                        </Text>
                        <Text style={{ fontSize: TYPO.label, color: editTeenOpen ? '#4338CA' : colors.textSecondary }}>
                          {editTeenOpen
                            ? (event.category === 'Ride' ? 'Teen can drive · set coins below' : 'Enters voluntary pool — a teen with a car can cover this')
                            : 'Off · not offered to teens'}
                        </Text>
                      </View>
                      <View style={{ width: 44, height: 26, borderRadius: 13,
                        backgroundColor: editTeenOpen ? '#6366F1' : (isDark ? '#334155' : '#CBD5E1'),
                        justifyContent: 'center', paddingHorizontal: 3 }}>
                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textInverse,
                          alignSelf: editTeenOpen ? 'flex-end' : 'flex-start' }} />
                      </View>
                    </TouchableOpacity>
                  )}
                  {event.category === 'Ride' && editTeenOpen && members.some(m => m.role === 'teen') && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
                      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, flex: 1 }}>🪙 Coins for teen driver</Text>
                      <TextInput
                        style={[f.input, { flex: 0, width: 80, textAlign: 'center', color: colors.textPrimary, backgroundColor: colors.surface, borderColor: '#6366F1' }]}
                        keyboardType="numeric" maxLength={4}
                        placeholder="0" placeholderTextColor={colors.textTertiary}
                        value={editRideCoins} onChangeText={setEditRideCoins}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Call-style reminder — allowed even when otherwise
                  restricted (not past), same as notes. */}
              {!isPast && !!event.time && (
                <View style={{ gap: 6, marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>📞 Call to remind</Text>
                    <Switch
                      value={alertCall} onValueChange={setAlertCall}
                      trackColor={{ false: colors.border, true: colors.primary + '80' }}
                      thumbColor={alertCall ? colors.primary : colors.textTertiary}
                    />
                  </View>
                  {alertCall && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[0, 5, 10].map(mins => (
                        <TouchableOpacity key={mins} onPress={() => setAlertCallLeadMinutes(mins)}
                          style={[f.dateBtn, { flex: 1, backgroundColor: alertCallLeadMinutes === mins ? colors.primary + '20' : colors.surface, borderColor: alertCallLeadMinutes === mins ? colors.primary : colors.border }]}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: alertCallLeadMinutes === mins ? colors.primary : colors.textPrimary }}>
                            {mins === 0 ? 'On time' : `${mins} min before`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Notes — the one field still editable once an event is past
                  (matches the quest pattern: everything locks after the
                  fact except a note). A kid-restricted event (not past,
                  just not theirs to edit) stays fully locked including
                  notes — that's a permissions boundary, not "add a
                  retrospective note." */}
              {(!restricted || (isPast && isParent)) && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>📝 Notes</Text>
                  <TextInput
                    style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                    placeholder="Add or update notes…"
                    placeholderTextColor={colors.textTertiary}
                    value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
                    multiline numberOfLines={3} textAlignVertical="top"
                  />
                </View>
              )}

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                {!isPast && (isParent || isOwnPending) && onDelete && (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
                      borderWidth: 1, borderColor: colors.danger + '60', backgroundColor: isDark ? '#2D1515' : colors.dangerLight }}
                    onPress={handleDelete}>
                    <X c={colors.danger} size={16} />
                  </TouchableOpacity>
                )}
                {(!restricted || (isPast && isParent)) && (
                  <TouchableOpacity style={[f.submitBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]} onPress={save} disabled={saving}>
                    {saving ? <ActivityIndicator color={colors.textInverse} size="small" />
                      : <Text style={{ color: colors.textInverse, fontSize: TYPO.caption, fontWeight: '900' }}>{restricted ? 'Save Note' : 'Save Changes'}</Text>}
                  </TouchableOpacity>
                )}
                {restricted && !(isPast && isParent) && (
                  <TouchableOpacity style={[f.submitBtn, { flex: 1, backgroundColor: colors.surface }]} onPress={onClose}>
                    <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption, fontWeight: '700' }}>Close</Text>
                  </TouchableOpacity>
                )}
              </View>

              {restricted && (
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center' }}>
                  {isPast && isParent ? 'This event is in the past — only a note can still be added.'
                    : isPast ? 'This event is in the past — no edits allowed.'
                    : 'This event was approved by a parent. Ask a parent to make changes.'}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
