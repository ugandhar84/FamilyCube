/**
 * EventFormModal — Add / Edit family events.
 *
 * RBAC:
 *  Parent  — full form, all categories, immediate helper assignment
 *  Senior  — can create Medical / Work / Event / Other for themselves; can accept helper role
 *  Kid     — limited to Sports / Study / Event / Birthday / Other, with an
 *            optional "Ride needed?" request layered on top → auto
 *            approvalPending = true, no helper picker (parent assigns
 *            later), can withdraw before approved
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType, HelperStatus } from '@/store/eventStore';
import { useGroceryStore } from '@/store/groceryStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

import { X } from './components/eventForm/Icons';
import Chip from './components/eventForm/Chip';
import MemberPicker from './components/eventForm/MemberPicker';
import PickerOverlay from './components/eventForm/PickerOverlay';
import GroceryLinkSection from './components/eventForm/GroceryLinkSection';
import CategoryFields from './components/eventForm/CategoryFields';
import HelperAssignmentSection from './components/eventForm/HelperAssignmentSection';
import { KidRideSection } from './components/eventForm/KidRideSection';
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
  applyAssignment, eventCategoryFromDomain, type ResponsibilityCategory, type AssignmentSuggestion,
} from '@/lib/responsibilityCategories';
import AssignmentSuggestionCard from './components/eventForm/AssignmentSuggestionCard';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { familyAi } from '@/lib/familyAiService';
import { showToast } from '@/components/AppToast';

// ─── Shared task-form pieces (features/tasks/components/forms) ────────────────
// One stepper shell + one recurrence picker + one call-reminder toggle + one
// voice box, used by BOTH this form and AddQuestModal. See TaskFormShell's
// header for why: these were hand-maintained twice and provably drifted.
import { TaskFormShell } from '@/features/tasks/components/forms/TaskFormShell';
import { RecurrenceControl } from '@/features/tasks/components/forms/RecurrenceControl';
import { CallReminderToggle } from '@/features/tasks/components/forms/CallReminderToggle';
import { VoicePrefillBox } from '@/features/tasks/components/forms/TitleStep';

// ═══════════════════════════════════════════════════════════════════════════════
// AddEventModal
// ═══════════════════════════════════════════════════════════════════════════════
export function AddEventModal({ visible, onClose, activeMemberId, prefill, initialStep }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
  // Seeds initial state from AI-extracted data (VoiceIntakeReviewSheet's
  // "Edit in full form" handoff) or from SmartTaskComposer's local
  // detection ("Review & create in full form" handoff) — every field the
  // caller doesn't know keeps its normal default.
  prefill?: {
    title?: string; category?: EventCategory; memberId?: string; memberIds?: string[]; startAt?: string; notes?: string;
    doctorName?: string; clinicLocation?: string; coachName?: string; venueLocation?: string; tutorName?: string;
    generalLocation?: string; pickupLocation?: string; dropLocation?: string; returnTime?: string;
    helperId?: string; recurFreq?: 'none' | 'daily' | 'weekly' | 'monthly'; recurDays?: number[];
    alertCall?: boolean; alertCallLeadMinutes?: number;
  };
  // 'review' opens directly on the summary step (SmartTaskComposer's
  // "Review & create" handoff — the user already saw/edited these fields
  // once and shouldn't have to re-click through the wizard to see them
  // again); omitted/undefined keeps the normal step-0 start.
  initialStep?: 'review';
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { addEvent, updateEvent } = useEventStore();
  const members = useFamilyStore(s => s.members);
  const { pastStores: cachedStores, pastItemNames: cachedItemNames, appendToCache } = useGroceryStore();
  const siblings = members.map(m => m.name);

  // ── Stepper ──────────────────────────────────────────────────────────────
  // Same redesign as AddQuestModal: one long flat scroll → a small paged
  // flow, same fields/state/submit logic, purely a layout change. Fixed
  // 4-step list (unlike AddQuestModal's conditional grocery step) — every
  // event category shares the same What/When/Who/Review shape here, so
  // there's no category that skips a whole step the way chores' non-
  // Errand/Shopping categories skip the grocery step.
  const [step, setStep] = useState(initialStep === 'review' ? 3 : 0);
  const stepIds = ['what', 'when', 'assign', 'review'] as const;
  type StepId = typeof stepIds[number];
  const currentStepId: StepId = stepIds[Math.min(step, stepIds.length - 1)];
  const stepTitles: Record<StepId, string> = {
    what: 'What is it?', when: 'When is it?', assign: 'Who & details', review: 'Review',
  };

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent  = activeMember?.role === 'parent';
  const isSenior  = activeMember?.role === 'senior';
  const isKid     = activeMember?.role === 'kid';
  const isTeen    = activeMember?.role === 'teen';
  const roleLabel = isParent ? 'parent' : isSenior ? 'senior' : isTeen ? 'teen' : isKid ? 'kid' : 'unknown';
  const activeMemberName = activeMember?.name ?? '';

  // Kids can request Sports / Study / Event / Birthday / Other, with optional ride flag

  // ── State ──────────────────────────────────────────────────────────────────
  const [category,       setCategory]       = useState<EventCategory>(prefill?.category ?? (isKid ? 'Sports' : 'Medical'));
  const [kidRideNeeded,    setKidRideNeeded]    = useState(false);
  const [kidDropoffOn,     setKidDropoffOn]     = useState(false);
  const [kidPickupOn,      setKidPickupOn]      = useState(false);
  const [kidDropoffDate,   setKidDropoffDate]   = useState<Date | null>(null);
  const [kidPickupDate,    setKidPickupDate]     = useState<Date | null>(null);
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
  // Scenarios 2.6/5.4 — explicit privacy tag. A Medical-category event is
  // ALSO always treated as sensitive regardless of this toggle (see
  // isEventSensitive) — this only controls the OPTIONAL tag for any other
  // category (e.g. a therapist appointment logged under a non-Medical
  // category, or a teen's own private social plan).
  const [isPrivateTag,   setIsPrivateTag]   = useState(false);
  // Scenario 2.11 — an optional group event needs an explicit RSVP model
  // (Going/Not-Going/Maybe + headcount), distinct from the mandatory-event
  // Acknowledge pattern. Off by default — most events are ordinary
  // logistics, not an "optional, need a headcount" invite.
  const [isOptionalRsvp, setIsOptionalRsvp] = useState(false);

  // Date/time
  const nowRounded = () => { const d = new Date(); const m = d.getMinutes(); d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1); return d; };
  const [eventDate,      setEventDate]      = useState<Date>(() => prefill?.startAt ? new Date(prefill.startAt) : nowRounded());
  const [showDatePick,   setShowDatePick]   = useState(false);
  const [showTimePick,   setShowTimePick]   = useState(false);
  const [allDay,         setAllDay]         = useState(false);
  const [alertCall,            setAlertCall]            = useState(prefill?.alertCall ?? false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(prefill?.alertCallLeadMinutes ?? 10);

  // Repeats — weekly-on-specific-weekdays is the primary case (a school
  // class, recurring practice); daily/monthly are simpler variants of the
  // same underlying generator (see addRecurringEvent in eventStore.ts).
  // 'none' is the default — this control is opt-in, same as chores' own
  // Repeats picker never defaults to a recurring frequency.
  const [repeatFreq, setRepeatFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(prefill?.recurFreq ?? 'none');
  const [repeatDays, setRepeatDays] = useState<number[]>(prefill?.recurDays ?? []); // 0=Sun..6=Sat, weekly only
  const [repeatEndDate, setRepeatEndDate] = useState<Date | null>(null);
  const [showRepeatEndDatePick, setShowRepeatEndDatePick] = useState(false);

  // Category-specific
  const [memberIds,      setMemberIds]      = useState<string[]>(
    prefill?.memberIds?.length ? prefill.memberIds : (prefill?.memberId ? [prefill.memberId] : (isKid ? [activeMemberId] : []))
  );
  const [helperId,       setHelperId]       = useState<string | undefined>(prefill?.helperId);
  const [helperName,     setHelperName]     = useState(() => prefill?.helperId ? (members.find(m => m.id === prefill.helperId)?.name ?? '') : '');
  const [doctorName,     setDoctorName]     = useState(prefill?.doctorName ?? '');
  const [clinicLocation, setClinicLocation] = useState(prefill?.clinicLocation ?? '');
  const [apptType,       setApptType]       = useState('');
  const [sportType,      setSportType]      = useState('');
  const [coachName,      setCoachName]      = useState(prefill?.coachName ?? '');
  const [venueLocation,  setVenueLocation]  = useState(prefill?.venueLocation ?? '');
  const [returnDate,     setReturnDate]     = useState<Date | null>(() => {
    if (!prefill?.returnTime) return null;
    const [h, m] = prefill.returnTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  });
  const [showReturnDatePick, setShowReturnDatePick] = useState(false);
  const [showReturnTimePick, setShowReturnTimePick] = useState(false);
  const [kitReminder,    setKitReminder]    = useState(false);
  const [subject,        setSubject]        = useState('');
  const [tutorName,      setTutorName]      = useState(prefill?.tutorName ?? '');
  const [isOnline,       setIsOnline]       = useState(false);
  const [meetingUrl,     setMeetingUrl]     = useState('');
  const [pickupLocation, setPickupLocation] = useState(prefill?.pickupLocation ?? '');
  const [dropLocation,   setDropLocation]   = useState(prefill?.dropLocation ?? '');
  // Drive assignment — separate from the tutor/escort/coach name above, for
  // when an external tutor is set but transport is still a parent decision.
  const [driverId,       setDriverId]       = useState<string | undefined>();
  const [driverName,     setDriverName]     = useState('');
  const handleDriverSelect = (id: string) => {
    const m = members.find(x => x.id === id);
    setDriverId(id);
    setDriverName(m?.name ?? '');
  };
  const [generalLocation,setGeneralLocation]= useState(prefill?.generalLocation ?? '');
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

  // Voice → AI prefill, Step 1 only. Same interaction shape as Ask Cube's
  // mic: tap to record, the live transcript lands in an editable text box,
  // the user reviews/edits it, and only an explicit tap on "Send" fires the
  // AI call — never automatic on speech-end. useVoiceDictation is the same
  // plain transcribe-only hook Ask Cube itself uses (no AI involved in the
  // capture step); only the final transcript TEXT the user approved is ever
  // sent to extractResponsibility, never audio.
  const voice = useVoiceDictation();
  const [voiceDraft, setVoiceDraft] = useState('');
  const [isPrefilling, setIsPrefilling] = useState(false);

  const applyVoiceTranscript = async (transcript: string) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    setIsPrefilling(true);
    try {
      const result = await familyAi.extractResponsibility(trimmed, members.map(m => ({ id: m.id, name: m.name })));
      const task = result.task;
      if (!task) {
        Alert.alert("Couldn't quite catch that", 'Try again, or type it in below.');
        return;
      }
      setTitle(task.title);
      if (task.requirements?.length) setNotes(task.requirements.join('. ').slice(0, 200));
      if (task.startAt) {
        const d = new Date(task.startAt);
        if (!isNaN(d.getTime())) setEventDate(d);
      }
      if (task.forMemberName) {
        const match = members.find(m => m.name.toLowerCase() === task.forMemberName!.toLowerCase());
        if (match) setMemberIds([match.id]);
      }
      // Unlike AddQuestModal's category mapping (which only maps a handful
      // of unambiguous domains), events already have a dedicated, complete
      // domain->EventCategory table (eventCategoryFromDomain) built for
      // exactly this kind of voice/text intake — safe to apply whenever it
      // resolves to something real.
      const mappedCategory = eventCategoryFromDomain(task.category);
      if (mappedCategory) setCategory(mappedCategory as EventCategory);
      setVoiceDraft('');
      voice.reset();
    } catch (e: any) {
      Alert.alert('Something went wrong', e?.message ?? "Couldn't process that — try again, or type it in below.");
    } finally {
      setIsPrefilling(false);
    }
  };

  useEffect(() => {
    if (!familyId) return;
    fetchCustomCategories(familyId, 'event').then(setCustomCategories);
  }, [familyId]);

  useEffect(() => {
    if (!familyId || category !== 'Other') return;
    fetchCustomSuggestions(familyId, 'event', 'Other').then(setCustomSuggestions);
  }, [familyId, category]);

  // Was: silently defaulted Grandparents/Teens Welcome ON the moment a
  // category like "Ride" was picked (transport's taxonomy is gp_welcome +
  // teen_eligible) — a parent creating what they assumed was a private
  // family ride had it auto-opened to the whole GP/teen pool with zero
  // explicit action on their part, then saw both toggles already lit on
  // the very next edit with no memory of turning them on (user report:
  // "by default GP and teens are showing welcome on edit"). Opening a
  // ride to people outside the two parents is consequential enough that
  // it should always be something the parent actively chose, never a
  // silent category-driven default — removed entirely; both toggles now
  // only ever change via the parent's own tap.

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

  // Same removal as the category-level default above — a subcategory pick
  // (e.g. "medical.prescription") no longer silently opens the event to
  // GP/teen either. Both toggles are parent-tap-only now.

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
  // Live-reported: a teen could never be picked as a Ride passenger,
  // Medical patient, Sports player, or Study student through this pool —
  // `role === 'kid'` alone excluded every teen-role member, even though
  // isKid/isTeen are checked together everywhere else in this same file
  // (e.g. line 120-121) treating them as the same "child" category for
  // permission purposes. A teen absolutely can be picked up from soccer.
  const kids   = members.filter(m => m.role === 'kid' || m.role === 'teen');
  // Grandparents only appear as a directly-pickable "Accompanied by/Driven
  // by" option once Grandparents Welcome is on — picking one while the
  // toggle reads "Off · private between parents only" was a direct
  // contradiction (see AddQuestModal's same suggestion-then-lock pattern).
  // Same teen-inclusion gap fixed in the edit form's own `adults` below —
  // kept symmetric so a prefilled/pre-assigned teen driver on the create
  // form doesn't hit the identical "picker shows nothing selected" bug.
  const adults = members.filter(m =>
    m.role === 'parent' || (m.role === 'senior' && openToGrandparents) || (m.role === 'teen' && openToTeens)
  );
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
    setShowKidPickDate(false); setShowKidPickTime(false);
    setLinkGroceries(false); setGroceryItems([]); setSelectedItemIds(new Set()); setNewGroceryLines([]);
    setFocusedLineIdx(null); setFocusedField(null);
    setOpenToGrandparents(false); setOpenToTeens(false); setRideCoinsTeen(''); setGpTeenToggledByUser(false);
    setStep(0);
    voice.reset();
    setVoiceDraft('');
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

    const eventInput: Omit<FamilyEvent, 'id'> = {
      title:           finalTitle,
      date:            localDateStr(primaryKidRideDate),
      time:            allDay ? undefined : fmtTime(primaryKidRideDate),
      type:            (category === 'Birthday' ? 'birthday' : category === 'Medical' ? 'appointment' : 'event') as EventType,
      category,
      allDay,
      location,
      notes:           notes.trim() || undefined,
      // Encode kid ride request as structured metadata in returnTime field.
      // Was: the 'both'/'pickup' branches required kidPickupDate to be
      // truthy — but that field only gets set once the kid actually TAPS
      // the pickup date/time picker, not just from toggling "Pickup
      // needed" on. A kid who toggled both drop-off and pickup on but
      // never opened the pickup picker fell through to `undefined` here,
      // silently and permanently losing the pickup leg — the toggle they
      // explicitly set had no effect, no error, no visible difference
      // (QA Round 12, Finding C-2). parseRideMeta already supports the
      // bare 'RIDE:both'/'RIDE:pickup' form with no timestamp (falls back
      // to the event's own date, no pickup time) — same as the 'dropoff'
      // branch below, which never had this guard and always encoded.
      returnTime:      isKid && kidRideType === 'both'
        ? (kidPickupDate ? `RIDE:both:${fmtLocalDateTimeStamp(kidPickupDate)}` : 'RIDE:both')
        : isKid && kidRideType === 'dropoff'
        ? 'RIDE:dropoff'
        : isKid && kidRideType === 'pickup'
        ? (kidPickupDate ? `RIDE:pickup:${fmtLocalDateTimeStamp(kidPickupDate)}` : 'RIDE:pickup')
        : returnDate ? fmtTimeDisplay(returnDate) : undefined,
      memberId:        memberIds[0],
      memberIds:       memberIds.length > 1 ? memberIds : undefined,
      // Helper — auto-confirmed when assigning yourself, matching every
      // other self-assignment path in the app (reassign_event's own status
      // logic, HelperEventCard's Take Over, RideRequiredEventCard's "I'll
      // Drive"). Previously always started 'pending' even for a self-pick,
      // deliberately, to surface Can't-Make-It/reassign/Open-to-GP/Open-to-
      // Teen immediately rather than only after an explicit decline — but
      // that read as "my own assignment is waiting for someone else's
      // acceptance," confirmed confusing live. Auto-confirming here doesn't
      // remove those options; Reassign/Cancel still reach them from a
      // confirmed assignment too.
      helper,
      helperId,
      helperStatus:    helper ? (helperId === activeMemberId ? 'confirmed' : 'pending') : undefined,
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
      // Approval flow — spec 2.7: teen autonomy extends to self-scheduling
      // plans that don't need anything FROM a parent (a ride, money, an
      // overnight). Only gate a teen's own event when it actually asks for
      // a resource — here, a driver. Kids stay gated unconditionally (no
      // expanded-autonomy carve-out for kids anywhere else in the spec).
      // Previously every teen-created event of every category was forced
      // into the parent approval queue with no exemption at all, contrary
      // to 1.5/2.7/4.3's repeated "teens get expanded autonomy" pattern.
      approvalPending:      isKid || (isTeen && !!driverName.trim()),
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
      // Scenarios 2.6/5.4/5.5 — explicit tag OR Medical category (always
      // treated as sensitive regardless of the toggle).
      privacyLevel: (isPrivateTag || category === 'Medical') ? 'private' : 'normal',
      // Scenario 2.11.
      isOptionalRsvp: isParent && isOptionalRsvp,
    };

    // Live-reported bug: a recurring ride got created twice (deleted, then
    // recreated) — Calendar Sync correctly synced BOTH versions to/from
    // Google since it has no way to know they represent the same
    // real-world commitment, and the app itself never warned before
    // creating what was obviously a duplicate. check_likely_duplicate_event
    // is a read-only pre-flight check (same family/time, title containment
    // either direction, next 14 days) — best-effort, only for a genuinely
    // NEW event (not an edit), and fails open (a network hiccup here must
    // never block a real create) rather than fails closed.
    if (eventInput.time && familyId) {
      try {
        const { data: dupe } = await supabase.rpc('check_likely_duplicate_event', {
          p_family_id: familyId, p_title: eventInput.title, p_start_time: eventInput.time, p_date: eventInput.date,
        });
        const match = Array.isArray(dupe) ? dupe[0] : dupe;
        if (match) {
          const proceed = await new Promise<boolean>(resolve => {
            Alert.alert(
              'Possible duplicate',
              `"${match.title}" already exists on ${match.date}${match.is_series ? ' (a recurring series)' : ''} at this same time. Create this one anyway?`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Create anyway', style: 'destructive', onPress: () => resolve(true) },
              ],
            );
          });
          if (!proceed) { setSaving(false); return; }
        }
      } catch (e: any) {
        console.warn('[EventFormModal] check_likely_duplicate_event failed (proceeding):', e?.message);
      }
    }

    // Recurring — weekly with no explicit day picked defaults to the
    // create-date's own weekday (matches generateOccurrenceDates' own
    // fallback), so a parent who just picks "Weekly" without touching the
    // day row still gets the obviously-intended "same day every week."
    const newEventId = repeatFreq === 'none'
      ? await addEvent(eventInput)
      : await useEventStore.getState().addRecurringEvent(eventInput, {
          frequency: repeatFreq,
          days: repeatFreq === 'weekly' ? (repeatDays.length ? repeatDays : [primaryKidRideDate.getDay()]) : undefined,
          endDate: repeatEndDate ? localDateStr(repeatEndDate) : undefined,
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
              // Was a raw bulk insert into grocery_run_items — that table has
              // no realtime subscription anywhere in the app, and this run
              // was itself just created via a raw insert too (not
              // createRun()), so useGroceryStore's own `runs[].runItems`
              // never picked up these items until something happened to open
              // the run's detail sheet. addItemToRun now self-heals via its
              // own loadRunDetail() call, so routing through it here closes
              // that gap instead of leaving the store silently stale.
              const groceryStore = useGroceryStore.getState();
              for (const itemId of itemIds) {
                await groceryStore.addItemToRun(runRow.id, itemId);
              }
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
    showToast('Event created');
    reset();
    onClose();
  };

  const catColor = CATEGORIES.find(c => c.key === category)?.color ?? BRAND.purple;
  const catEmoji = CATEGORIES.find(c => c.key === category)?.emoji ?? '📅';

  return (
    <TaskFormShell
      visible={visible}
      onClose={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Close" on AddEventModal [features/calendar/EventFormModal.tsx]`); reset(); onClose(); }}
      stepIds={stepIds}
      stepTitles={stepTitles}
      step={step}
      setStep={setStep}
      accentColor={catColor}
      headerTitle={isKid ? '🙋 Request Help' : isSenior ? '🤝 Ask for Help' : '+ New Event'}
      headerSubtitle={
        isKid
          ? 'Your request goes to a parent for approval'
          : isSenior
          ? 'Let the family know what you need'
          : `${catEmoji} ${category} — ${isParent ? 'full access' : 'senior view'}`
      }
    >
            {currentStepId === 'what' && <>
            {/* ── Category selector ── */}
            <Text style={[f.label, { color: colors.textSecondary, marginBottom: 6 }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {allowedCategories.map(c => {
                  const active = category === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${c.label}" for "category" [features/calendar/EventFormModal.tsx:636]`); setCategory(c.key); setTitle(''); }}
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
                          onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${sc.subcategoryLabel}" for "subcategory" [features/calendar/EventFormModal.tsx:667]`); setSubcategoryId(active ? null : sc.id); }}
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
              onBlur={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} field="Title" on "AddEventModal" newValue=${title} [features/calendar/EventFormModal.tsx:704]`); setTitleFocused(false); }}
              returnKeyType="next"
            />

            {/* Voice → AI prefill — shared with AddQuestModal (see
                VoicePrefillBox); tap to record, review the transcript, and
                only an explicit "Send" tap fires the AI call. */}
            <VoicePrefillBox
              voice={voice} voiceDraft={voiceDraft} setVoiceDraft={setVoiceDraft}
              isPrefilling={isPrefilling} onSend={applyVoiceTranscript}
              accentColor={catColor} colors={colors} isDark={isDark}
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
                          onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${s.title}" for "title suggestion" [features/calendar/EventFormModal.tsx:720]`); selected ? setTitle('') : applySuggestion(s); }}
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
            </>}

            {currentStepId === 'when' && <>
            {/* ── Ride needed? + pickup (kid only) — right above Date &
                Time, which doubles as the drop-off time whenever ride
                needed is on (relabeled below, no separate drop-off field
                at all — see KidRideSection's own comment). Only pickup
                (when the event ends, a genuinely different moment) is its
                own explicit choice here. */}
            {isKid && (
              <KidRideSection
                catColor={catColor} colors={colors} isDark={isDark} eventDate={eventDate}
                kidRideNeeded={kidRideNeeded} setKidRideNeeded={setKidRideNeeded}
                setKidDropoffOn={setKidDropoffOn} setKidDropoffDate={setKidDropoffDate}
                kidPickupOn={kidPickupOn} setKidPickupOn={setKidPickupOn} kidPickupDate={kidPickupDate} setKidPickupDate={setKidPickupDate}
                showKidPickDate={showKidPickDate} setShowKidPickDate={setShowKidPickDate}
                showKidPickTime={showKidPickTime} setShowKidPickTime={setShowKidPickTime}
              />
            )}

            {/* ── Date / Time ── */}
            {/* When a kid has "Ride needed?" on, this field IS the drop-off
                time — no separate "Drop-off" field exists anymore (see
                KidRideSection). Relabeled so that's clear instead of
                looking like a plain event date with a redundant drop-off
                confirmation underneath (user feedback: "hide the date
                field and it becomes the drop off... time"). */}
            <Text style={[f.label, { color: colors.textSecondary }]}>
              {isKid && kidRideNeeded ? '📍 Drop-off Date & Time' : 'Date & Time'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                style={[f.dateBtn, { flex: 3, backgroundColor: showDatePick ? catColor + '20' : colors.surface, borderColor: showDatePick ? catColor : colors.border }]}
                onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Date" field on AddEventModal [features/calendar/EventFormModal.tsx:770]`); setShowDatePick(p => !p); setShowTimePick(false); }}
              >
                <Text style={{ fontSize: 13 }}>📅</Text>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showDatePick ? catColor : colors.textPrimary }}>
                  {fmtDisplay(eventDate)}
                </Text>
              </TouchableOpacity>
              {!allDay && (
                <TouchableOpacity
                  style={[f.dateBtn, { flex: 2, backgroundColor: showTimePick ? catColor + '20' : colors.surface, borderColor: showTimePick ? catColor : colors.border }]}
                  onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Time" field on AddEventModal [features/calendar/EventFormModal.tsx:780]`); setShowTimePick(p => !p); setShowDatePick(false); }}
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
              onChangeDate={d => {
                const m = new Date(d); m.setHours(eventDate.getHours(), eventDate.getMinutes()); setEventDate(m);
                // Keeps drop-off silently mirroring the event's own
                // date/time — this field doubles as drop-off for a kid's
                // ride request, so any edit here must carry through.
                if (isKid && kidRideNeeded) setKidDropoffDate(m);
              }}
              onChangeTime={d => {
                const m = new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setEventDate(m);
                if (isKid && kidRideNeeded) setKidDropoffDate(m);
              }}
              onDone={() => { setShowDatePick(false); setShowTimePick(false); }}
              accentColor={catColor} colors={colors}
              minimumDate={new Date()}
            />

            {/* All day toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>All day</Text>
              <Switch
                value={allDay} onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} toggled "All day" on AddEventModal newValue=${v} [features/calendar/EventFormModal.tsx:814]`); setAllDay(v); }}
                trackColor={{ false: colors.border, true: catColor + '80' }}
                thumbColor={allDay ? catColor : colors.textTertiary}
              />
            </View>

            {/* Repeats — weekly-on-weekdays is the headline case (a school
                class on Mon/Wed/Fri); daily/monthly are one-tap variants.
                Materializes real rows via addRecurringEvent, same
                architecture chores' own recurrence uses. */}
            <View style={{ marginBottom: 16, paddingHorizontal: 4 }}>
              {/* Shared with the Chores form's own Repeats picker — one
                  weekday-chip implementation, not two (see
                  RecurrenceControl). Materializes real rows via
                  addRecurringEvent on submit. */}
              <RecurrenceControl
                label="🔁 Repeats"
                freq={repeatFreq}
                setFreq={(k: any) => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${k}" for "repeats" [features/calendar/EventFormModal.tsx]`); setRepeatFreq(k); }}
                options={[
                  { key: 'none',    label: 'One-time' },
                  { key: 'daily',   label: 'Daily' },
                  { key: 'weekly',  label: 'Weekly' },
                  { key: 'monthly', label: 'Monthly' },
                ]}
                days={repeatDays} setDays={setRepeatDays}
                accentColor={catColor} colors={colors} isDark={isDark}
              />

              {repeatFreq !== 'none' && (
                <TouchableOpacity
                  onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Repeat end date" field on AddEventModal [features/calendar/EventFormModal.tsx:865]`); setShowRepeatEndDatePick(p => !p); }}
                  style={[f.dateBtn, { marginTop: 8, backgroundColor: showRepeatEndDatePick ? catColor + '20' : colors.surface, borderColor: showRepeatEndDatePick ? catColor : colors.border }]}>
                  <Text style={{ fontSize: 13 }}>🏁</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                    {repeatEndDate ? `Until ${fmtDisplay(repeatEndDate)}` : 'No end date (12 weeks ahead)'}
                  </Text>
                </TouchableOpacity>
              )}
              {showRepeatEndDatePick && (
                <PickerOverlay
                  showDate showTime={false}
                  value={repeatEndDate ?? eventDate}
                  onChangeDate={d => setRepeatEndDate(new Date(d))}
                  onChangeTime={() => {}}
                  onDone={() => setShowRepeatEndDatePick(false)}
                  accentColor={catColor} colors={colors}
                  minimumDate={eventDate}
                />
              )}
            </View>

            {/* Call-style reminder — shared with the Chores forms (see
                CallReminderToggle); opt-in, rings via CallKit/
                ConnectionService. Only meaningful when a time is set. */}
            {!allDay && (
              <CallReminderToggle
                alertCall={alertCall} setAlertCall={setAlertCall}
                alertCallLeadMinutes={alertCallLeadMinutes} setAlertCallLeadMinutes={setAlertCallLeadMinutes}
                accentColor={catColor} colors={colors} isDark={isDark}
                variant="switch" pillStyle={f.dateBtn} containerPaddingHorizontal={4}
              />
            )}
            </>}

            {currentStepId === 'assign' && <>
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
                // Only 'Other' and the generic fallback leave real ambiguity —
                // Medical/Sports/Study/Ride/Birthday's own labels already make
                // clear who the event concerns. Leaving this picker untouched
                // for those two doesn't mean "just me" — it hands the event to
                // the auto-assignment engine, which guesses an assignee from
                // category context (see the applyAssignment() call below).
                hint={
                  (category === 'Other' || !['Medical', 'Sports', 'Study', 'Ride', 'Birthday'].includes(category))
                    ? 'Leave blank to auto-assign, or tap yourself if this is just for you'
                    : undefined
                }
                selectedIds={memberIds}
                members={forMembers}
                onToggle={id => setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                onSelectAll={() => {
                  const allIds = forMembers.map(m => m.id);
                  const willSelectAll = memberIds.length !== forMembers.length;
                  console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "${willSelectAll ? 'All' : 'Deselect all'}" for "For member picker" [features/calendar/EventFormModal.tsx:963]`);
                  setMemberIds(willSelectAll ? allIds : []);
                }}
                colors={colors} isDark={isDark} siblings={siblings}
              />
            )}

            {/* Kid's ride request is fully handled by KidRideSection above,
                right beside the toggle that reveals it — this call is now
                parent/senior only (adult MemberPicker + free-text helper
                name fallback). */}
            {!isKid && category !== 'Work' && category !== 'Event' && (
              <HelperAssignmentSection
                category={category} catColor={catColor} colors={colors} isDark={isDark} siblings={siblings} adults={adults}
                helperId={helperId} handleHelperSelect={handleHelperSelect}
                helperName={helperName} setHelperName={setHelperName} setHelperId={setHelperId}
              />
            )}

            {/* ── Grandparents Welcome toggle (parents only, non-Ride — Ride has inline toggles) ── */}
            {!isKid && !isTeen && category !== 'Ride' && (
              <TouchableOpacity
                onPress={() => { const v = !openToGrandparents; console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} toggled "Grandparents Welcome" on AddEventModal newValue=${v} [features/calendar/EventFormModal.tsx:984]`); setGpTeenToggledByUser(true); setOpenToGrandparents(v); }}
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
                onPress={() => { const v = !openToTeens; console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} toggled "Teens Welcome" on AddEventModal newValue=${v} [features/calendar/EventFormModal.tsx:1019]`); setGpTeenToggledByUser(true); setOpenToTeens(v); }}
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

            {/* ── Privacy tag (scenarios 2.6/5.4) — not offered to a Kid
                creator, whose request already goes through a full parent
                approval gate regardless. Medical-category events are always
                treated as sensitive independent of this toggle (5.5). */}
            {!isKid && category !== 'Medical' && (
              <TouchableOpacity
                onPress={() => { const v = !isPrivateTag; console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} toggled "Mark as private" on AddEventModal newValue=${v} [features/calendar/EventFormModal.tsx:1055]`); setIsPrivateTag(v); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 4, marginBottom: 16 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                    🔒 Mark as private
                  </Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                    {isTeen
                      ? 'Household sees a busy block only — no title or details'
                      : 'Hidden from siblings & grandparent — only guardians + the person it\'s about see full detail'}
                  </Text>
                </View>
                <Switch
                  value={isPrivateTag} onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} toggled "Mark as private" (switch) on AddEventModal newValue=${v} [features/calendar/EventFormModal.tsx:1069]`); setIsPrivateTag(v); }}
                  trackColor={{ false: colors.border, true: catColor + '80' }}
                  thumbColor={isPrivateTag ? catColor : colors.textTertiary}
                />
              </TouchableOpacity>
            )}

            {/* ── RSVP toggle (scenario 2.11) — a real Going/Not-Going/
                Maybe headcount for an optional group event, distinct from
                the ordinary mandatory-event Acknowledge pattern. */}
            {isParent && (
              <TouchableOpacity
                onPress={() => { const v = !isOptionalRsvp; console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} toggled "Optional — collect RSVPs" on AddEventModal newValue=${v} [features/calendar/EventFormModal.tsx:1081]`); setIsOptionalRsvp(v); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 4, marginBottom: 16 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                    📋 Optional — collect RSVPs
                  </Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                    Everyone gets Going / Not Going / Maybe instead of a plain Acknowledge
                  </Text>
                </View>
                <Switch
                  value={isOptionalRsvp} onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} toggled "Optional — collect RSVPs" (switch) on AddEventModal newValue=${v} [features/calendar/EventFormModal.tsx:1093]`); setIsOptionalRsvp(v); }}
                  trackColor={{ false: colors.border, true: catColor + '80' }}
                  thumbColor={isOptionalRsvp ? catColor : colors.textTertiary}
                />
              </TouchableOpacity>
            )}
            </>}

            {currentStepId === 'review' && (() => {
              const forNames = memberIds.map(id => members.find(m => m.id === id)).filter(Boolean).map(m => m!.id === activeMemberId ? 'Me' : m!.name.split(' ')[0]);
              const whoLabel = isKid ? 'You (pending approval)' : forNames.length ? forNames.join(', ') : 'Nobody yet';
              const recurLabel = repeatFreq === 'none' ? 'One-time'
                : repeatFreq === 'daily' ? 'Daily'
                : repeatFreq === 'weekly' ? `Weekly${repeatDays.length ? ` · ${repeatDays.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join('/')}` : ''}`
                : 'Monthly';
              return (
                <View style={{ gap: 10 }}>
                  <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0', backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: 14, gap: 10 }}>
                    <View>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Event</Text>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginTop: 2 }} numberOfLines={2}>
                        {finalTitle || '—'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Who</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }} numberOfLines={1}>
                          {whoLabel}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>When</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }} numberOfLines={1}>
                          {fmtDisplay(eventDate)}{!allDay ? ` · ${fmtTimeDisplay(eventDate)}` : ' · All day'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Category</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }} numberOfLines={1}>
                          {catEmoji} {category}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Repeats</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }} numberOfLines={1}>
                          {recurLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* ── Notes — kept on the Review step (not "What") since
                      it reads as final context right before creating,
                      matching how a parent scans a summary before
                      committing. Was a 3rd near-identical "a parent will
                      review this" note here too — the header subtitle
                      already sets that expectation up front, and
                      HelperAssignmentSection's own note (shown only when
                      Ride needed is on) already explains the driver-
                      assignment specifics, so repeating it a third time
                      added length without adding information. */}
                  <Text style={[f.label, { color: colors.textSecondary, marginTop: 4 }]}>📝 Notes (optional)</Text>
                  <TextInput
                    style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                    placeholder={isKid ? 'Any message for parents? (e.g. please pick me up early)' : 'Any details, instructions, or reminders…'}
                    placeholderTextColor={colors.textTertiary}
                    value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
                    onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} field="Notes" on "AddEventModal" newValue=${notes} [features/calendar/EventFormModal.tsx:1106]`)}
                    multiline numberOfLines={3} textAlignVertical="top"
                  />
                  <Text style={{ fontSize: TYPO.micro, color: notes.length > 180 ? colors.danger : colors.textTertiary, textAlign: 'right', marginTop: -8 }}>
                    {notes.length}/200
                  </Text>

                  {!canSubmit && (
                    <Text style={{ fontSize: TYPO.label, color: colors.danger, textAlign: 'center' }}>
                      Add a title on the first step.
                    </Text>
                  )}

                  <TouchableOpacity
                    style={[f.submitBtn, { backgroundColor: canSubmit && !saving ? catColor : colors.border, opacity: saving ? 0.7 : 1 }]}
                    onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "${isKid ? 'Send Request to Parent' : 'Add to Family Schedule'}" title="${finalTitle}" category=${category} → submit/addEvent [features/calendar/EventFormModal.tsx:1123]`); submit(); }} disabled={!canSubmit || saving}
                  >
                    {saving
                      ? <ActivityIndicator color={colors.textInverse} size="small" />
                      : <Text style={{ color: colors.textInverse, fontSize: TYPO.caption, fontWeight: '900' }}>
                          {isKid ? 'Send Request to Parent 🙋' : `Add to Family Schedule ${catEmoji}`}
                        </Text>}
                  </TouchableOpacity>
                </View>
              );
            })()}

    </TaskFormShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EditEventModal
// ═══════════════════════════════════════════════════════════════════════════════
export function EditEventModal({ event, activeMemberId, onClose, onDelete }: {
  event: FamilyEvent;
  activeMemberId: string;
  onClose: () => void;
  // scope is only ever passed for a recurring occurrence ('this'/
  // 'following'/'all' — see handleDelete's own Alert); the caller (
  // CalendarScreen) owns the actual deleteEvent/deleteEventScoped call so
  // it can also fire its own notifyDeleteIfAssigned exactly once regardless
  // of which path was taken, instead of duplicating that notification logic
  // inside this form component.
  onDelete?: (scope?: 'this' | 'following' | 'all') => void;
}) {
  const { colors, isDark } = useTheme();
  // f.sheet's maxHeight: '75%' (eventForm/styles.ts, shared with
  // AddQuestModal via TaskFormShell) is static against the full screen —
  // clamp it once the keyboard opens so it can't get pushed past the top
  // of the screen (same class of bug fixed in AppBottomSheet.tsx). Falls
  // through to the sheet's own 75% when the keyboard is closed.
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(75);
  const { updateEvent } = useEventStore();
  const members  = useFamilyStore(s => s.members);
  const siblings = members.map(m => m.name);
  const kids     = members.filter(m => m.role === 'kid');

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent = activeMember?.role === 'parent';
  const isKid    = activeMember?.role === 'kid';
  const isTeen   = activeMember?.role === 'teen';
  // Spec 5.7 — AddEventModal computes isSenior (gates which categories a GP
  // can create: Medical/Work/Event/Other) but this edit modal never did, so
  // a senior editing their own self-created event fell through every
  // branch below (not isParent, not isKid/isTeen's isOwnPending) and Save
  // silently built an empty patch — nothing they typed ever persisted.
  const isSenior = activeMember?.role === 'senior';
  const editRoleLabel = isParent ? 'parent' : isSenior ? 'senior' : isTeen ? 'teen' : isKid ? 'kid' : 'unknown';
  const editActiveMemberName = activeMember?.name ?? '';
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

  // Kids AND teens can edit/withdraw their own pending requests — this was
  // kid-only, so a teen who created an event that landed in approvalPending
  // (e.g. one that needs a driver, per the create-form's gate) had no
  // Withdraw and no Edit path at all: isParent is false, isOwnPending was
  // false (isKid-only), so the save handler below built an empty patch and
  // the delete/withdraw button never rendered for them (spec 2.7).
  const isOwnPending   = (isKid || isTeen) && event.approvalPending && event.memberId === activeMemberId;
  // A senior editing an event they're the subject/organiser of (their own
  // Medical/Work/Event/Other, per isSenior's create-time category gate) —
  // notes/alertCall/date-time, same safe subset isOwnPending gets, NOT the
  // full isParent reassignment surface (picking a different kid/helper/
  // driver for someone else's event stays parent-only).
  // Same isOpenToGrandparents gate as CalendarScreen's dayEvents/
  // scopedRangeEvents — a no-assignee Ride/rideRequired event isn't
  // "family-wide," it's an ungated ride that must still respect the
  // isOpenToGrandparents flag, or any GP could open (and lightly edit)
  // a ride explicitly marked not open to grandparents just because its
  // memberId happened to be unset.
  const isOwnEventBySenior = isSenior && (
    event.memberId === activeMemberId ||
    (!event.memberId && !event.memberIds?.length &&
      (event.category !== 'Ride' && !event.rideRequired ? true : !!event.isOpenToGrandparents))
  );
  const isParentApproved = !event.approvalPending;
  // A teen long-pressing a SIBLING's event (not isOwnPending, not
  // isParent, not isSenior) previously matched no branch here at all —
  // restricted was isKid-only, so the read-only badge never showed, every
  // field rendered freely editable, and Save silently built an empty
  // patch with zero feedback that nothing was actually going to persist
  // (QA sweep, teen-role audit, High). Read-only now applies the same way
  // it already does for a kid on a non-own/approved event.
  const isForeignToTeen = isTeen && !isOwnPending;
  const restricted     = isPast || (isKid && isParentApproved) || isForeignToTeen; // past, kid approved, or teen viewing someone else's → read-only

  // Original requester — if this was a kid request, lock that kid from being removed
  const originalRequesterId = event.helperRequestedBy
    ? members.find(m => event.helperRequestedBy?.includes(m.name))?.id
    : undefined;
  const lockedMemberIds = originalRequesterId ? [originalRequesterId] : [];

  const [notes,      setNotes]      = useState(event.notes ?? '');
  // Was seeded to '' instead of event.helper — helperId (right below)
  // correctly started from the real assignee, but helperName didn't, so
  // save()'s `helperName !== event.helper` diff check was true on first
  // render for ANY event with a real assignee, silently triggering a
  // reassignment on saving an edit to something completely unrelated (e.g.
  // notes). This is the root cause of a production bug: a Ride's driver
  // got silently swapped to a co-parent because the edit form was opened
  // and saved for an unrelated reason. helperTouched (below) additionally
  // replaces the value-diff itself with an explicit dirty flag, since even
  // a correctly-seeded value-diff is fragile against this class of bug.
  const [helperName, setHelperName] = useState(event.helper ?? '');
  const [helperTouched, setHelperTouched] = useState(false);
  // event.helperId is the real column now (calendar_events.helper_id) —
  // prefer it directly instead of re-deriving via a name lookup, which is
  // fragile (rename, two members sharing a first name) and only a
  // fallback for an older row saved before that column existed.
  const [helperId,   setHelperId]   = useState<string | undefined>(
    event.helperId ?? members.find((m: any) => m.name === event.helper)?.id
  );
  const [editMemberIds, setEditMemberIds] = useState<string[]>(
    event.memberIds?.length ? event.memberIds : event.memberId ? [event.memberId] : []
  );
  const [saving,        setSaving]        = useState(false);
  const [editGPOpen,    setEditGPOpen]    = useState(event.isOpenToGrandparents ?? false);
  const [editTeenOpen,  setEditTeenOpen]  = useState(event.isOpenToTeens ?? false);
  const [editRideCoins, setEditRideCoins] = useState(event.rideCoins != null ? String(event.rideCoins) : '');
  // Same reveal-on-opt-in as the create form — a GP only appears as a
  // directly-pickable accompany/drive option once Grandparents Welcome is
  // on, and likewise a teen once Teens Welcome is on. Without the teen
  // half of this, editDriverId correctly resolved to a teen who'd already
  // claimed an open ride pool (members.find below searches the full
  // members array, not this filtered list) but the picker itself never
  // included that teen as an option — so nothing rendered as selected and
  // the ride looked unassigned from the parent's edit view even though it
  // wasn't (live-reported: "assigned to picker is not showing as teen
  // already assigned person").
  const adults = members.filter(m =>
    m.role === 'parent' || (m.role === 'senior' && editGPOpen) || (m.role === 'teen' && editTeenOpen)
  );

  // Drive assignment — separate from the tutor/escort/coach (`helper`) once
  // that's already filled in (e.g. by the kid naming an external tutor).
  const [editRideRequired, setEditRideRequired] = useState(event.rideRequired ?? false);
  // Pickup/drop location — the create form (AddEventModal) has always let a
  // parent set these for a Ride, but this edit form never did: the summary
  // chip further down only ever displayed them read-only ("📍 X → ?"), with
  // no way to fix a wrong value or fill a missing one after creation.
  const [editPickupLocation, setEditPickupLocation] = useState(event.pickupLocation ?? '');
  const [editDropLocation,   setEditDropLocation]   = useState(event.dropLocation ?? '');
  const [editDriverName,   setEditDriverName]   = useState(event.driverName ?? '');
  // event.driverId is the real column now (calendar_events.driver_id) —
  // prefer it directly instead of re-deriving via a name lookup; the name
  // fallback only matters for an older row saved before that column
  // existed.
  const [editDriverId,     setEditDriverId]     = useState<string | undefined>(
    event.driverId ?? members.find((m: any) => m.name === event.driverName)?.id
  );
  const [alertCall,            setAlertCall]            = useState(event.alertCall ?? false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(event.alertCallLeadMinutes ?? 10);
  // Scenarios 2.6/5.4 — editable by a parent, or by the event's own
  // creator/subject in the "own pending" case; a Medical event is always
  // sensitive regardless (see isEventSensitive), so this toggle is only
  // meaningful for a non-Medical event.
  const [isPrivateTag,         setIsPrivateTag]         = useState(event.privacyLevel === 'private');
  // Spec 2.9 — date/time were never editable after creation; only
  // title/notes/etc. Same PickerOverlay component AddEventModal already
  // uses, seeded from the event's existing date+time (falls back to "now,
  // rounded" for an all-day event with no time set, matching AddEventModal's
  // own nowRounded default so the picker never opens on an invalid date).
  const [editEventDate, setEditEventDate] = useState<Date>(() => {
    const d = event.date ? new Date(`${event.date}T${event.time ?? '00:00'}:00`) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });
  const [showEditDatePick, setShowEditDatePick] = useState(false);
  const [showEditTimePick, setShowEditTimePick] = useState(false);
  // Live-reported: an event created all-day (e.g. a Ride with no time set)
  // had NO way to ever get a time added, because both the Time button and
  // the save-patch's time computation keyed off the original, immutable
  // `event.allDay` — there was no toggle anywhere in the edit screen to
  // flip it, unlike AddEventModal which has one (line ~924). This mirrors
  // that same toggle so all-day is editable, not permanent.
  const [editAllDay, setEditAllDay] = useState<boolean>(event.allDay ?? false);
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
    setHelperTouched(true);
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
      if (Object.keys(patch).length > 0) { updateEvent(event.id, patch); showToast('Event updated'); }
      setSaving(false);
      onClose();
      return;
    }
    if (isParent) {
      if (notes !== event.notes) patch.notes = notes.trim() || undefined;
      if (alertCall !== (event.alertCall ?? false)) patch.alertCall = alertCall;
      if (alertCallLeadMinutes !== (event.alertCallLeadMinutes ?? 10)) patch.alertCallLeadMinutes = alertCallLeadMinutes;
      // Scenarios 2.6/5.4 — a parent can toggle the privacy tag on edit.
      // Medical category events stay sensitive regardless (isEventSensitive
      // ORs in the category check), so this only meaningfully changes
      // anything for a non-Medical event.
      const newPrivacyLevel = isPrivateTag ? 'private' : 'normal';
      if (newPrivacyLevel !== (event.privacyLevel ?? 'normal')) patch.privacyLevel = newPrivacyLevel;
      // Spec 2.9 — date/time edit. All-day events carry no time field at all
      // (matches AddEventModal's own `allDay ? undefined : fmtTime(...)`).
      // Uses editAllDay (the live toggle state), not event.allDay — the
      // original, immutable value — so switching "All day" off here and
      // picking a time actually sticks on save.
      const newDateStr = localDateStr(editEventDate);
      const newTimeStr = editAllDay ? undefined : fmtTime(editEventDate);
      if (newDateStr !== event.date) patch.date = newDateStr;
      if (newTimeStr !== event.time) patch.time = newTimeStr;
      if (editAllDay !== (event.allDay ?? false)) patch.allDay = editAllDay;
      if (helperTouched) {
        let newHelperName = helperName.trim();
        // Same auto-assign-to-other-parent convenience as creating a new
        // Ride — clearing the helper here without opening to GP/Teen
        // shouldn't require manually re-picking the one other parent it
        // could be.
        if (!newHelperName && event.category === 'Ride' && !editGPOpen && !editTeenOpen) {
          const otherParents = members.filter(m => m.role === 'parent' && m.id !== activeMemberId && m.hasCar !== false);
          if (otherParents.length === 1) newHelperName = otherParents[0].name;
        }
        // Real bug, confirmed live: this unconditionally hardcoded
        // 'pending' even when the parent editing the event assigned
        // THEMSELVES as helper/driver — self-assignment is already the
        // confirmation everywhere else in the app (reassign_event's own
        // status logic, HelperEventCard's Take Over, RideRequiredEventCard's
        // "I'll Drive"), so this was the one inconsistent path, producing
        // exactly the user-reported "why is my own assignment waiting for
        // acceptance" confusion. The referenced "matching comment in
        // AddEventModal" this cited doesn't exist in this file — whatever
        // justified it originally is not recoverable, and it directly
        // contradicts the established, otherwise-universal rule. Also now
        // sets helperId (was never included in this patch at all), needed
        // for classifyEventUrgency.ts's id-based "is this mine" check.
        const assignedSelf = newHelperName && helperId === activeMemberId;
        patch.helper = newHelperName || undefined;
        patch.helperId = newHelperName ? helperId : undefined;
        patch.helperStatus = newHelperName ? (assignedSelf ? 'confirmed' : 'pending') : undefined;
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
        // QA deep-trace finding: this used to compare only the trimmed
        // NAME string against event.driverName. Two different members who
        // happen to share a display name (two grandparents both saved as
        // "Grandma", divorced/remarried parents both "Mom") produced an
        // identical string on both sides even though editDriverId picked
        // a genuinely different person — the whole branch skipped, so
        // driverId/driverStatus were never written at all: the
        // reassignment silently didn't save, and a stale 'confirmed' from
        // the PREVIOUS (same-named) driver stayed attached to the new one,
        // who never actually confirmed anything. Compare the id too, same
        // rationale as deriveEventActions' isSelfAssigned switching to an
        // id-based compare.
        if (editDriverName !== (event.driverName ?? '') || editDriverId !== event.driverId) {
          patch.driverName = editDriverName.trim() || undefined;
          // driverId was never included in this patch — needed for
          // classifyEventUrgency.ts's id-based "is this mine" check.
          patch.driverId = editDriverName.trim() ? editDriverId : undefined;
          patch.driverStatus = editDriverName.trim() ? (editDriverId === activeMemberId ? 'confirmed' : 'pending') : undefined;
        }
      }
      if (event.category === 'Ride') {
        if (editPickupLocation.trim() !== (event.pickupLocation ?? '')) patch.pickupLocation = editPickupLocation.trim() || undefined;
        if (editDropLocation.trim() !== (event.dropLocation ?? '')) patch.dropLocation = editDropLocation.trim() || undefined;
      }
    } else if (isOwnPending) {
      // Kid can only update notes on their own pending request
      patch.notes = notes.trim() || undefined;
    } else if (isOwnEventBySenior) {
      // Spec 5.7 — a senior editing their own Medical/Work/Event/Other gets
      // the same safe subset a restricted edit gets (notes/alertCall/date-
      // time), not the full parent reassignment surface.
      if (notes !== event.notes) patch.notes = notes.trim() || undefined;
      if (alertCall !== (event.alertCall ?? false)) patch.alertCall = alertCall;
      if (alertCallLeadMinutes !== (event.alertCallLeadMinutes ?? 10)) patch.alertCallLeadMinutes = alertCallLeadMinutes;
      const newDateStr = localDateStr(editEventDate);
      const newTimeStr = editAllDay ? undefined : fmtTime(editEventDate);
      if (newDateStr !== event.date) patch.date = newDateStr;
      if (newTimeStr !== event.time) patch.time = newTimeStr;
      if (editAllDay !== (event.allDay ?? false)) patch.allDay = editAllDay;
    }
    if (Object.keys(patch).length > 0) {
      // A recurring occurrence's edit needs to know whether it applies to
      // just this one, this-and-future, or the whole series — a plain
      // updateEvent() would only ever touch the single row being viewed.
      // Ask only when the patch could plausibly matter to siblings in the
      // series (i.e. anything beyond a one-off note); a notes-only tweak on
      // a single occurrence is common enough (kid's after-school request
      // this Wednesday only) that always prompting would be more friction
      // than the feature is worth for that case.
      const notesOnly = Object.keys(patch).length === 1 && 'notes' in patch;
      if (event.seriesId && !notesOnly) {
        Alert.alert(
          'Repeating Event',
          'Apply this change to just this event, or the whole series?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setSaving(false) },
            { text: 'Just this one', onPress: () => { useEventStore.getState().updateEventScoped(event.id, patch, 'this'); setSaving(false); showToast('Event updated'); onClose(); } },
            { text: 'This and following', onPress: () => { useEventStore.getState().updateEventScoped(event.id, patch, 'following'); setSaving(false); showToast('Event updated'); onClose(); } },
            { text: 'All events', onPress: () => { useEventStore.getState().updateEventScoped(event.id, patch, 'all'); setSaving(false); showToast('Event updated'); onClose(); } },
          ],
        );
        return;
      }
      updateEvent(event.id, patch);
      showToast('Event updated');
    }
    setSaving(false);
    onClose();
  };

  const handleDelete = () => {
    if (restricted) return; // blocked in UI
    console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} tapped "Delete" (X) on "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1844]`);
    if (event.seriesId) {
      Alert.alert(
        'Repeating Event',
        `Delete just this occurrence of "${event.title}", or the whole series?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Just this one', style: 'destructive', onPress: () => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} confirmed "Just this one" delete on "${event.title}" (id=${event.id}) → onDelete('this') [features/calendar/EventFormModal.tsx:1412]`); onDelete?.('this'); showToast('Event deleted'); onClose(); } },
          { text: 'This and following', style: 'destructive', onPress: () => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} confirmed "This and following" delete on "${event.title}" (id=${event.id}) → onDelete('following') [features/calendar/EventFormModal.tsx:1413]`); onDelete?.('following'); showToast('Event deleted'); onClose(); } },
          { text: 'All events', style: 'destructive', onPress: () => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} confirmed "All events" delete on "${event.title}" (id=${event.id}) → onDelete('all') [features/calendar/EventFormModal.tsx:1414]`); onDelete?.('all'); showToast('Event deleted'); onClose(); } },
        ],
      );
      return;
    }
    Alert.alert(
      isOwnPending ? 'Withdraw Request' : 'Delete Event',
      isOwnPending
        ? `Withdraw your request for "${event.title}"?`
        : `Remove "${event.title}" from the family schedule?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isOwnPending ? 'Withdraw' : 'Delete', style: 'destructive', onPress: () => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} confirmed "${isOwnPending ? 'Withdraw' : 'Delete'}" on "${event.title}" (id=${event.id}) → onDelete() [features/calendar/EventFormModal.tsx:1426]`); onDelete?.(); showToast(isOwnPending ? 'Request withdrawn' : 'Event deleted'); onClose(); } },
      ]
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

          {/* Sheet — header outside scroll, content scrolls */}
          <View style={[f.sheet, { backgroundColor: colors.card },
            keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : null]}>
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
              <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} tapped "Close" on EditEventModal for "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1453]`); onClose(); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
              {/* Date / Time — spec 2.9. Same PickerOverlay AddEventModal uses.
                  Spec 5.7 — also available to a senior editing their own event. */}
              {!restricted && (isParent || isOwnEventBySenior) && (
                <View style={{ gap: 8 }}>
                  <Text style={[f.label, { color: colors.textSecondary }]}>Date & Time</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[f.dateBtn, { flex: 3, backgroundColor: showEditDatePick ? catColor + '20' : colors.surface, borderColor: showEditDatePick ? catColor : colors.border }]}
                      onPress={() => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} tapped "Date" field on EditEventModal for "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1522]`); setShowEditDatePick(p => !p); setShowEditTimePick(false); }}
                    >
                      <Text style={{ fontSize: 13 }}>📅</Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showEditDatePick ? catColor : colors.textPrimary }}>
                        {fmtDisplay(editEventDate)}
                      </Text>
                    </TouchableOpacity>
                    {!editAllDay && (
                      <TouchableOpacity
                        style={[f.dateBtn, { flex: 2, backgroundColor: showEditTimePick ? catColor + '20' : colors.surface, borderColor: showEditTimePick ? catColor : colors.border }]}
                        onPress={() => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} tapped "Time" field on EditEventModal for "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1532]`); setShowEditTimePick(p => !p); setShowEditDatePick(false); }}
                      >
                        <Text style={{ fontSize: 13 }}>🕐</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showEditTimePick ? catColor : colors.textPrimary }}>
                          {fmtTimeDisplay(editEventDate)}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <PickerOverlay
                    showDate={showEditDatePick} showTime={showEditTimePick}
                    value={editEventDate}
                    onChangeDate={d => { const m = new Date(d); m.setHours(editEventDate.getHours(), editEventDate.getMinutes()); setEditEventDate(m); }}
                    onChangeTime={d => { const m = new Date(editEventDate); m.setHours(d.getHours(), d.getMinutes()); setEditEventDate(m); }}
                    onDone={() => { setShowEditDatePick(false); setShowEditTimePick(false); }}
                    accentColor={catColor} colors={colors}
                  />
                  {/* All day toggle — previously missing entirely, which meant
                      an event created all-day (e.g. a Ride with no time set)
                      could never get a time added: the Time button above was
                      permanently hidden and the save patch permanently
                      discarded any time. Matches AddEventModal's own toggle. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>All day</Text>
                    <Switch
                      value={editAllDay}
                      onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} toggled "All day" on EditEventModal for "${event.title}" (id=${event.id}) newValue=${v} [features/calendar/EventFormModal.tsx:1719]`); setEditAllDay(v); if (!v) { setShowEditTimePick(false); } }}
                      trackColor={{ false: colors.border, true: catColor + '80' }}
                      thumbColor={editAllDay ? catColor : colors.textTertiary}
                    />
                  </View>
                </View>
              )}

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
                      const m = members.find(x => x.id === id);
                      console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} selected "${m?.name}" (id=${id}) for "Change who it's for" on "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1569]`);
                      setEditMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                    }}
                    onSelectAll={() => {
                      // Birthday/Errand/Other aren't kid-specific — a parent can run an
                      // errand or throw their own party, so the pool isn't kids-only there.
                      const pool = ['Medical', 'Sports', 'Study', 'Ride'].includes(event.category ?? '') ? kids : members;
                      // Select all but preserve locked kids
                      const allIds = pool.map(m => m.id);
                      console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} tapped "All/Deselect all" for "Change who it's for" on "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1579]`);
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
                    onToggle={(id) => { const m = members.find(x => x.id === id); console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} selected "${m?.name}" (id=${id}) for "reassign helper" on "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1608]`); handleHelperSelect(id); }}
                    colors={colors} isDark={isDark} siblings={siblings}
                  />
                  {!helperId && (
                    <TextInput
                      style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed, marginTop: -4 }]}
                      placeholder="Or type a name (e.g. external tutor)"
                      placeholderTextColor={colors.textTertiary}
                      value={helperName}
                      onChangeText={t => { setHelperName(t); setHelperTouched(true); }}
                      onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} field="Helper name" on "${event.title}" (id=${event.id}) newValue=${helperName} [features/calendar/EventFormModal.tsx:1617]`)}
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
                    onPress={() => { const v = !editRideRequired; console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} toggled "Ride Needed?" on "${event.title}" (id=${event.id}) newValue=${v} [features/calendar/EventFormModal.tsx:1636]`); setEditRideRequired(v); }}
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
                        onToggle={(id) => { const m = members.find(x => x.id === id); console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} selected "${m?.name}" (id=${id}) for "Drive Assignment" on "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1664]`); handleDriverSelect(id); }}
                        colors={colors} isDark={isDark} siblings={siblings}
                      />
                      {!editDriverId && (
                        <TextInput
                          style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                          placeholder="Or type a name (e.g. external driver)"
                          placeholderTextColor={colors.textTertiary}
                          value={editDriverName}
                          onChangeText={setEditDriverName}
                          onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} field="Driver name" on "${event.title}" (id=${event.id}) newValue=${editDriverName} [features/calendar/EventFormModal.tsx:1673]`)}
                        />
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Pickup/Drop-off — Ride only. The create form always let a
                  parent set these; this edit form never did, leaving the
                  read-only "📍 X → ?" summary chip further down as the only
                  way to see them and no way to fix a wrong value or fill in
                  a missing one. */}
              {isParent && !isPast && event.category === 'Ride' && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>📍 Pickup from</Text>
                    <LocationAutocompleteInput
                      value={editPickupLocation} onChangeText={setEditPickupLocation}
                      placeholder="Home / School" colors={colors}
                      onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} field="Pickup from" on "${event.title}" (id=${event.id}) newValue=${editPickupLocation} [features/calendar/EventFormModal.tsx]`)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>🏁 Drop to</Text>
                    <LocationAutocompleteInput
                      value={editDropLocation} onChangeText={setEditDropLocation}
                      placeholder="Chess Club, Oak St" colors={colors}
                      onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} field="Drop to" on "${event.title}" (id=${event.id}) newValue=${editDropLocation} [features/calendar/EventFormModal.tsx]`)}
                    />
                  </View>
                </View>
              )}

              {/* GP Welcome toggle — previously excluded Ride under the
                  assumption it had its own inline edit-mode version
                  elsewhere; it didn't, so a parent could open a ride to the
                  GP/teen pool at creation but never change it afterward.
                  Reusing this generic block for Ride too instead of building
                  a third near-duplicate copy (CategoryFields.tsx already has
                  one for the CREATE form; a second one here isn't worth it
                  when this block already covers every other category fine). */}
              {isParent && !isPast && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => { const v = !editGPOpen; console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} toggled "Grandparents Welcome" on "${event.title}" (id=${event.id}) newValue=${v} [features/calendar/EventFormModal.tsx:1689]`); setEditGPOpen(v); }}
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
                      onPress={() => { const v = !editTeenOpen; console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} toggled "Teens Welcome" on "${event.title}" (id=${event.id}) newValue=${v} [features/calendar/EventFormModal.tsx:1718]`); setEditTeenOpen(v); }}
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
                        onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} field="Coins for teen driver" on "${event.title}" (id=${event.id}) newValue=${editRideCoins} [features/calendar/EventFormModal.tsx:1762]`)}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Call-style reminder — allowed even when otherwise
                  restricted (not past), same as notes. Gated on the live
                  editAllDay toggle, not the original event.time prop —
                  that prop stays stale for the whole editing session, so
                  turning "All day" off and picking a time (both above)
                  used to still hide this section until the modal was
                  closed and reopened after saving. */}
              {!isPast && !editAllDay && (
                <View style={{ gap: 6, marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>📞 Call to remind</Text>
                    <Switch
                      value={alertCall} onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} toggled "Call to remind" on "${event.title}" (id=${event.id}) newValue=${v} [features/calendar/EventFormModal.tsx:1777]`); setAlertCall(v); }}
                      trackColor={{ false: colors.border, true: colors.primary + '80' }}
                      thumbColor={alertCall ? colors.primary : colors.textTertiary}
                    />
                  </View>
                  {alertCall && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[0, 10, 15, 30].map(mins => (
                        <TouchableOpacity key={mins} onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} selected "${mins} min" for "call reminder lead time" on "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1785]`); setAlertCallLeadMinutes(mins); }}
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

              {/* Privacy tag (scenarios 2.6/5.4) — parent-editable, and only
                  meaningful for a non-Medical event (Medical is always
                  sensitive regardless — see isEventSensitive). */}
              {!restricted && isParent && event.category !== 'Medical' && (
                <TouchableOpacity
                  onPress={() => { const v = !isPrivateTag; console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} toggled "Mark as private" on "${event.title}" (id=${event.id}) newValue=${v} [features/calendar/EventFormModal.tsx:1802]`); setIsPrivateTag(v); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>🔒 Mark as private</Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                      Hidden from siblings & grandparent — guardians + the subject still see full detail
                    </Text>
                  </View>
                  <Switch
                    value={isPrivateTag} onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} toggled "Mark as private" (switch) on "${event.title}" (id=${event.id}) newValue=${v} [features/calendar/EventFormModal.tsx:1811]`); setIsPrivateTag(v); }}
                    trackColor={{ false: colors.border, true: colors.primary + '80' }}
                    thumbColor={isPrivateTag ? colors.primary : colors.textTertiary}
                  />
                </TouchableOpacity>
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
                    onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} field="Notes" on "${event.title}" (id=${event.id}) newValue=${notes} [features/calendar/EventFormModal.tsx:1831]`)}
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
                  <TouchableOpacity style={[f.submitBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]} onPress={() => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} tapped "${restricted ? 'Save Note' : 'Save Changes'}" on "${event.title}" (id=${event.id}) → save [features/calendar/EventFormModal.tsx:1850]`); save(); }} disabled={saving}>
                    {saving ? <ActivityIndicator color={colors.textInverse} size="small" />
                      : <Text style={{ color: colors.textInverse, fontSize: TYPO.caption, fontWeight: '900' }}>{restricted ? 'Save Note' : 'Save Changes'}</Text>}
                  </TouchableOpacity>
                )}
                {restricted && !(isPast && isParent) && (
                  <TouchableOpacity style={[f.submitBtn, { flex: 1, backgroundColor: colors.surface }]} onPress={() => { console.log(`[UserAction] screen=Schedule role=${editRoleLabel} member=${editActiveMemberName} tapped "Close" (footer) on "${event.title}" (id=${event.id}) [features/calendar/EventFormModal.tsx:1856]`); onClose(); }}>
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
