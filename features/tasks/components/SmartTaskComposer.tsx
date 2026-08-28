/**
 * SmartTaskComposer — "just describe it" task creator matching the
 * reference mock's live auto-detection UX: one free-text box, re-classified
 * as the user types, with every auto-filled field marked "✨ auto" until
 * the user touches it, at which point it locks to their value and stops
 * being overwritten by further re-classification.
 *
 * Live typing runs entirely LOCAL (features/tasks/lib/localTaskDetection.ts,
 * ported from the reference mock's own categoryDB/scoreCategory keyword
 * matching) — no network call, no debounce, instant on every keystroke,
 * same as the mock. The real AI engine (familyAi.extractResponsibility) is
 * reserved for the explicit voice path only: tapping the mic records
 * speech, and ONLY THEN is that transcript sent to the AI edge function for
 * classification — never fired just from typing.
 *
 * previewAssignment (process-task-assignment, dry-run) still surfaces a
 * "who would this go to" suggestion inline once a category is known.
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, Keyboard } from 'react-native';
import { Mic, Calendar, ClipboardList, Sparkles, AlertTriangle, PenLine, X } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS, SPACING } from '@/constants/theme';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { familyAi } from '@/lib/familyAiService';
import { eventCategoryFromDomain, questCategoryFromDomain, previewAssignment, applyAssignment, type AssignmentSuggestion } from '@/lib/responsibilityCategories';
import { CATEGORIES } from '@/features/calendar/components/eventForm/types';
import MemberPicker from '@/features/calendar/components/eventForm/MemberPicker';
import { detectLocalTask, type LocalDetectionResult } from '../lib/localTaskDetection';
import { useEventStore } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useGroceryStore } from '@/store/groceryStore';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import { AddQuestGrocerySection } from '@/features/quests/components/AddQuestGrocerySection';

const MIN_CHARS = 4;

function AutoBadge() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '18', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Sparkles size={10} color={colors.primary} />
      <Text style={{ fontSize: 9, fontWeight: '800', color: colors.primary }}>auto</Text>
    </View>
  );
}

export default function SmartTaskComposer({
  visible, members, activeMemberId, familyId, onClose, onCreated, onOpenFullForm,
}: {
  visible: boolean;
  members: FamilyMember[];
  activeMemberId: string;
  familyId: string;
  onClose: () => void;
  onCreated?: (kind: 'event' | 'quest') => void;
  // Same handoff shape AddIntakeChooser/VoiceIntakeReviewSheet already use —
  // opens the real AddEventModal/AddQuestModal, pre-filled, for anything
  // this quick composer's fields don't cover (recurrence, grocery links, etc).
  onOpenFullForm: (kind: 'event' | 'quest', prefill: {
    title: string; category?: string; memberId?: string; startAt?: string;
    notes?: string; coins?: number; photoRequired?: boolean;
    recurFreq?: 'daily' | 'weekly' | 'monthly'; recurDays?: number[];
  }) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // AppBottomSheet sets an explicit pixel `height` (content-driven, capped
  // at maxHeight) and wraps everything in a KeyboardAvoidingView with
  // behavior="padding" — when the keyboard opens, that padding shifts the
  // WHOLE fixed-height sheet upward on top of its own height, so a sheet
  // already near its cap visually overshoots past the top of the screen.
  // EventFormModal's sheets use a pure CSS maxHeight (no explicit height)
  // so they just shrink-to-fit instead of hitting this; matching that here
  // would mean not using AppBottomSheet's measured-height mechanism at all.
  // Cheaper, scoped fix: shrink the cap itself while the keyboard is open,
  // so sheet-height + keyboard-height never exceeds the screen, then let it
  // grow back to the normal cap once the keyboard closes.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const addEvent = useEventStore(s => s.addEvent);
  const { addQuest, createParticipants } = useQuestStore();

  const [input, setInput] = useState('');
  const [detection, setDetection] = useState<LocalDetectionResult | null>(null);

  // Touched fields stop being overwritten by re-analysis — mirrors the
  // mock's dataset.touched pattern, expressed as React state here.
  const [touchedTitle, setTouchedTitle] = useState(false);
  const [touchedMember, setTouchedMember] = useState(false);
  const [touchedCategory, setTouchedCategory] = useState(false);
  const [touchedWhen, setTouchedWhen] = useState(false);
  const [whenDate, setWhenDate] = useState<Date | null>(null);
  const [showWhenPicker, setShowWhenPicker] = useState(false);
  const [showReturnPicker, setShowReturnPicker] = useState(false);

  const [title, setTitle] = useState('');
  const [touchedUrgent, setTouchedUrgent] = useState(false);
  const [urgent, setUrgent] = useState(false);
  // Call reminder — same alertCall/alertCallLeadMinutes fields
  // AskCubeProposalCard's ReminderPicker and the full forms already write;
  // a VoIP-style ringing reminder (call-reminder-sweeper cron), distinct
  // from the app's ordinary push notifications. Off by default, 10 min
  // lead once turned on — only meaningful when a "When" time is set.
  const [touchedAlertCall, setTouchedAlertCall] = useState(false);
  const [alertCall, setAlertCall] = useState(false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(10);
  // Multi-select — "all kids"/"Leo and Maya" resolve to multiple ids via
  // the local detector's memberNames. "Family"/"All Kids" quick-pills below
  // let the user reach the same result manually.
  const [forMemberIds, setForMemberIds] = useState<string[]>([]);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [coinsStr, setCoinsStr] = useState('20');
  // Repeats stepper — same Daily/Weekly/Monthly + weekday chips + day-of-
  // month grid pattern as AddQuestRecurrenceSection.tsx, condensed for this
  // quick composer. Seeded from the local detector's own recurrence guess
  // (e.g. "every Monday and Wednesday") but always user-editable; applied
  // directly to quests (ChoreTask.recurrenceRule) since addChore takes it
  // as a plain field. Events with recurrence set route to the full form
  // instead — addRecurringEvent's series-materialization is a meaningfully
  // different creation path from this composer's plain addEvent call, not
  // worth risking a half-wired quick-create version of it.
  const [touchedRecurrence, setTouchedRecurrence] = useState(false);
  const [recurFreq, setRecurFreq] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [recurDays, setRecurDays] = useState<number[]>([]);
  const [recurDayOfMonth, setRecurDayOfMonth] = useState<number | undefined>(undefined);
  const [photoRequired, setPhotoRequired] = useState(false);

  // Notes — free-text extra context. Local detection never invents this
  // (there's nothing in a keyword match that reads as "context" beyond the
  // fields already extracted), so it stays off/empty until the user opts in
  // via the toggle. The AI path DOES have something real to put here —
  // family-ai's own `requirements: string[]` is exactly "what it inferred
  // beyond the structured fields" (the same field AddEventModal's existing
  // voice-prefill path already surfaces into its own Notes field) — so a
  // successful AI classification opens the toggle and fills it automatically.
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');

  // Grocery-list attachment — same shape/behavior as AddQuestModal's own
  // linkGroceries block (features/quests/components/AddQuestGrocerySection.tsx
  // is a pure presentational component, reused verbatim here), shown once
  // the detected/selected category is Errand or Shopping.
  const [linkGroceries, setLinkGroceries] = useState(false);
  const [groceryListOpen, setGroceryListOpen] = useState(false);
  const [loadingGroceries, setLoadingGroceries] = useState(false);
  const [groceryItemsList, setGroceryItemsList] = useState<{ id: string; name: string; quantity?: string; storePreference?: string }[]>([]);
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [newGroceryLines, setNewGroceryLines] = useState<{ name: string; qty: string; store: string }[]>([]);
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<'name' | 'store' | null>(null);
  const { pastStores: cachedStores, pastItemNames: cachedItemNames, appendToCache } = useGroceryStore();

  // "Who's accompanying" — same concept as HelperAssignmentSection.tsx's
  // adult picker, condensed for this quick composer (member picker only,
  // no free-text fallback — that stays a full-form-only capability). Shown
  // for every event category, per-category label matching the full form's
  // own wording (Medical: "Accompanied by", Sports: "Drop-off by", etc).
  const [helperId, setHelperId] = useState<string | undefined>(undefined);
  const [touchedHelper, setTouchedHelper] = useState(false);

  // Category-specific detail fields — same fields CategoryFields.tsx
  // collects for the full event form, condensed to the ones that actually
  // change what the event means (doctor/clinic, coach/venue, tutor,
  // general location) rather also duplicating that component's kit-
  // reminder/online-meeting/grocery-linking extras, which stay full-form-only.
  const [doctorName, setDoctorName] = useState('');
  const [clinicLocation, setClinicLocation] = useState('');
  const [coachName, setCoachName] = useState('');
  const [venueLocation, setVenueLocation] = useState('');
  const [tutorName, setTutorName] = useState('');
  const [generalLocation, setGeneralLocation] = useState('');

  // Ride-only — both optional, each cross-prompts the other once filled
  // (picking up from somewhere usually implies dropping off somewhere too,
  // and vice versa) rather than forcing both up front. Return time is a
  // simple HH:MM string, matching eventStore's own returnTime field shape.
  const [pickupLocation, setPickupLocation] = useState('');
  const [touchedPickup, setTouchedPickup] = useState(false);
  const [dropLocation, setDropLocation] = useState('');
  const [touchedDrop, setTouchedDrop] = useState(false);
  const [returnTime, setReturnTime] = useState('');
  const [showReturnTime, setShowReturnTime] = useState(false);
  // GP/Teen Welcome — same pool-opening toggles the full Ride form
  // (CategoryFields.tsx's Ride branch) already offers, surfaced here so a
  // parent doesn't have to leave the quick composer to open a ride to the
  // GP/teen-driver pool. Off by default, same as the full form — never
  // silently defaulted on.
  const [openToGrandparents, setOpenToGrandparents] = useState(false);
  const [openToTeens, setOpenToTeens] = useState(false);
  const [rideCoinsTeen, setRideCoinsTeen] = useState('');

  const [suggestion, setSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const reset = () => {
    setInput(''); setDetection(null); setVoiceError(null);
    setTouchedTitle(false); setTouchedMember(false); setTouchedCategory(false);
    setTouchedUrgent(false); setUrgent(false);
    setTouchedAlertCall(false); setAlertCall(false); setAlertCallLeadMinutes(10);
    setTitle(''); setForMemberIds([]); setCategory(undefined);
    setCoinsStr('20'); setPhotoRequired(false);
    setPickupLocation(''); setTouchedPickup(false); setDropLocation(''); setTouchedDrop(false); setReturnTime(''); setShowReturnTime(false);
    setOpenToGrandparents(false); setOpenToTeens(false); setRideCoinsTeen('');
    setTouchedRecurrence(false); setRecurFreq('once'); setRecurDays([]); setRecurDayOfMonth(undefined);
    setTouchedWhen(false); setWhenDate(null); setShowWhenPicker(false); setShowReturnPicker(false);
    setHelperId(undefined); setTouchedHelper(false);
    setDoctorName(''); setClinicLocation(''); setCoachName(''); setVenueLocation('');
    setTutorName(''); setGeneralLocation('');
    setLinkGroceries(false); setGroceryListOpen(false); setGroceryItemsList([]);
    setExpandedStores(new Set()); setSelectedItemIds(new Set()); setNewGroceryLines([]);
    setFocusedLineIdx(null); setFocusedField(null);
    setShowNotes(false); setNotes('');
    setSuggestion(null); setLoadingSuggestion(false);
    dictation.reset();
  };

  const close = () => { reset(); onClose(); };

  // Applies a fresh detection result to the (still-untouched) form fields —
  // shared by both the local live-typing path and the voice/AI path, so a
  // spoken sentence lands in exactly the same fields a typed one would.
  const applyDetection = (d: LocalDetectionResult) => {
    setDetection(d);
    if (!touchedTitle && d.title) setTitle(d.title);
    if (!touchedMember && d.memberNames.length) {
      const matches = d.memberNames
        .map(n => members.find(m => m.name.toLowerCase() === n.toLowerCase()))
        .filter((m): m is FamilyMember => !!m)
        .map(m => m.id);
      if (matches.length) setForMemberIds(matches);
    }
    if (!touchedCategory) {
      const mapped = d.category.kind === 'event' ? d.category.eventCategory : d.category.questCategory;
      if (mapped) setCategory(mapped);
    }
    if (!touchedWhen && (d.when.date || d.when.time)) {
      // A bare time with no date word ("at 4pm", no "today"/"tomorrow"/
      // weekday) still means something — default the date part to today
      // rather than dropping the detected time entirely.
      const datePart = d.when.date ?? new Date().toISOString().slice(0, 10);
      const dt = new Date(datePart + (d.when.time ? `T${d.when.time}:00` : 'T00:00:00'));
      if (!isNaN(dt.getTime())) setWhenDate(dt);
    }
    // Was "only fill if currently empty" — once a stale detection (e.g.
    // from an earlier abandoned sentence) had set this, re-analyzing a
    // completely different, freshly-typed/spoken sentence could never
    // overwrite or clear it, since the field was no longer empty. Live-
    // reported: cancelled "...every day", re-recorded "today", but the
    // Pickup field still showed the old "Badminton every day" text.
    // touchedPickup/touchedDrop (set only by the user directly editing the
    // field, see the TextInput onChangeText below) is the correct signal
    // for "don't overwrite this" — matching every other field in this form.
    if (!touchedPickup) setPickupLocation(d.locations.pickup ?? '');
    if (!touchedDrop) setDropLocation(d.locations.dropoff ?? '');
    if (!touchedHelper && d.driverName) {
      const match = members.find(m => m.name === d.driverName);
      if (match) setHelperId(match.id);
    }
    // A dollar amount mentioned ("groceries, about $50") only overwrites
    // the untouched default coin value — never a value the user already
    // typed themselves.
    if (d.amount !== null && (parseInt(coinsStr, 10) || 0) === 20) {
      setCoinsStr(String(Math.round(d.amount)));
    }
    // Was "only set when detected as recurring" — never cleared back to
    // 'once' when a fresh detection no longer contains a recurrence
    // phrase, so a stale "every day" guess from an earlier abandoned
    // sentence stuck around (and kept routing to the full-form handoff)
    // even after the input was cleared and replaced with a genuinely
    // one-time sentence. Mirrors touchedPickup/touchedDrop's fix above.
    if (!touchedRecurrence) {
      setRecurFreq(d.recurrence);
      setRecurDays(d.recurrence === 'weekly' ? d.recurrenceDays : []);
    }
    if (!touchedUrgent && d.urgent) setUrgent(true);
    // "enable call reminder"/"call notification" typed directly into the
    // free-text box previously did nothing — alertCall only ever flipped
    // via the manual toggle button (live-reported). Same touched-guard
    // pattern as urgent above: once the user manually taps the toggle,
    // further typing/re-detection won't silently flip it back.
    if (!touchedAlertCall && d.alertCall) setAlertCall(true);
  };

  // Instant local re-classification on every keystroke — no debounce, no
  // network, matches the mock's oninput="analyzeTask()" exactly.
  useEffect(() => {
    if (input.trim().length < MIN_CHARS) { setDetection(null); return; }
    const d = detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    if (d) applyDetection(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // Mic — plain transcribe-only dictation, same as typing: the transcript
  // just lands in the text box and runs through the same local detector
  // below, nothing is sent anywhere automatically. Sending to the real AI
  // engine is a SEPARATE, explicit action (the Sparkles button next to the
  // mic) — the user decides per-request whether local detection is good
  // enough or they want the stronger (network) classification.
  // No onSilenceReady callback here — useVoiceDictation fires that after
  // EVERY ~2s pause while still actively recording (armSilenceTimer re-arms
  // on every partial result), not just once at the very end. Wiring
  // setInput to it meant a natural mid-sentence pause ("soccer at 4pm...
  // <pause>...and the driver should be Priya") committed a truncated,
  // sometimes garbled partial transcript into `input` WHILE THE USER WAS
  // STILL TALKING — running local detection on half a sentence, and
  // (worse) locking that bad guess into pickup/dropoff via applyDetection's
  // "only fill if not already set" guards before the real, complete
  // transcript ever arrived. The box already shows dictation.liveTranscript
  // live while listening (see the TextInput below); input/detection is
  // only ever updated once, explicitly, when the user taps stop.
  const dictation = useVoiceDictation();

  const [aiLoading, setAiLoading] = useState(false);

  // Maps family-ai's ExtractResponsibilityResult onto this component's own
  // LocalDetectionResult shape so both the local and AI paths converge on
  // one set of fields downstream.
  const applyAiResult = (task: NonNullable<Awaited<ReturnType<typeof familyAi.extractResponsibility>>['task']>) => {
    const entry = task.kind === 'event'
      ? { key: 'ai', label: eventCategoryFromDomain(task.category) ?? 'Other', emoji: '✨', kind: 'event' as const, eventCategory: eventCategoryFromDomain(task.category) ?? 'Other', kw: [] }
      : { key: 'ai', label: questCategoryFromDomain(task.category) ?? 'Other', emoji: '✨', kind: 'quest' as const, questCategory: questCategoryFromDomain(task.category) ?? 'Other', kw: [] };
    const names = task.forMemberNames?.length ? task.forMemberNames : (task.forMemberName ? [task.forMemberName] : []);
    applyDetection({
      category: entry,
      confidence: 90,
      title: task.title,
      when: task.startAt ? { date: task.startAt.slice(0, 10), time: task.startAt.length > 10 ? task.startAt.slice(11, 16) : null } : { date: null, time: null },
      locations: { pickup: null, dropoff: null },
      memberNames: names,
      amount: null,
      recurrence: 'once',
      recurrenceDays: [],
      urgent: false,
      kindOverride: task.kind,
      driverName: null,
      alertCall: false,
    });
    // family-ai's `requirements` is exactly "what the AI inferred beyond
    // the structured fields" — surface it into Notes and open the toggle
    // so the user sees it was filled, same as AddEventModal's own voice
    // path already does with this field. Never overwrites notes the user
    // already typed themselves.
    if (task.requirements?.length && !notes.trim()) {
      setNotes(task.requirements.join('. ').slice(0, 300));
      setShowNotes(true);
    }
  };

  const sendToAi = async () => {
    const trimmed = input.trim();
    if (!trimmed || aiLoading) return;
    setAiLoading(true);
    setVoiceError(null);
    try {
      const result = await familyAi.extractResponsibility(trimmed, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
      if (!result.task) { setVoiceError("Couldn't quite figure that out — the local guess above is still there to edit."); return; }
      applyAiResult(result.task);
    } catch (e: any) {
      setVoiceError(e?.message ?? "Couldn't reach the AI — the local guess above is still there to edit.");
    } finally {
      setAiLoading(false);
    }
  };

  const detected = detection;
  // kindOverride (a verb-level signal like "remind me to…" or "schedule…")
  // wins over the category vote's own kind when the two disagree — see
  // localTaskDetection.ts's QUEST_VERB_RE/EVENT_VERB_RE comment for why
  // keyword category alone can't always tell "remind me to call the
  // dentist" (a to-do) apart from an actual dentist visit.
  const isEvent = (detected?.kindOverride ?? detected?.category.kind) === 'event';
  const showFields = !!detected;
  // Big mic/stop button + hiding the redundant inline icon — true for an
  // empty sheet (no typed text, nothing detected yet) whether or not
  // dictation is actively running. Once real content exists (typed text or
  // a detected field form), this goes false and the small inline mic in
  // the input box takes back over.
  const bigMicShowing = !input.trim() && !showFields;

  // Assignment suggestion — fetched once a member/category is known,
  // mirrors AssignmentSuggestionCard's own preview call.
  useEffect(() => {
    if (!showFields || !familyId || !category) { setSuggestion(null); return; }
    setLoadingSuggestion(true);
    previewAssignment({ taskId: 'composer-preview', taskType: isEvent ? 'event' : 'chore', familyId, category })
      .then(s => { if (!s.error) setSuggestion(s); })
      .finally(() => setLoadingSuggestion(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFields, category, familyId]);

  const forMembers = members.filter(m => forMemberIds.includes(m.id));
  // Coins/photo-proof only make sense when every assignee is a kid/teen —
  // a mixed or all-adult selection zeroes them out, matching the existing
  // single-select rule (a parent/senior doesn't earn coins for their own
  // chore) extended to the multi-select case.
  const assignedToAdult = forMembers.length > 0 && forMembers.every(m => m.role === 'parent' || m.role === 'senior');
  const catMeta = category ? CATEGORIES.find(c => c.key === category) : undefined;
  const kidMembers = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const isGroceryCategory = !isEvent && (category === 'Errand' || category === 'Shopping');
  const viewerRole = members.find(m => m.id === activeMemberId)?.role;
  const isViewerParentOrSenior = viewerRole === 'parent' || viewerRole === 'senior';

  useEffect(() => {
    if (!linkGroceries || !familyId) return;
    setLoadingGroceries(true);
    supabase.from('grocery_items')
      .select('id, name, quantity, store_preference')
      .eq('family_id', familyId).eq('is_bought', false).order('store_preference')
      .then(({ data }) => {
        setGroceryItemsList((data ?? []).map((r: any) => ({
          id: r.id, name: r.name, quantity: r.quantity ?? undefined, storePreference: r.store_preference ?? undefined,
        })));
        setLoadingGroceries(false);
      });
  }, [linkGroceries, familyId]);

  const create = () => {
    if (!detected) return;
    const finalTitle = (title || detected.title).trim();
    if (!finalTitle) return;
    // No real active member yet (mid profile-switch, store still
    // hydrating) — addEvent/addQuest read the family/member id fresh off
    // the store at insert time, so creating now would either send an empty
    // createdById or resolve to the wrong family server-side and get
    // rejected by RLS ("new row violates row-level security policy").
    // Bail out instead of firing a doomed insert.
    if (!activeMemberId) {
      setVoiceError("Still loading your profile — try again in a moment.");
      return;
    }

    // Recurring EVENTS need addRecurringEvent's series-materialization,
    // not this composer's plain addEvent call — hand off to the full form
    // instead of silently dropping the recurrence and creating a one-time
    // event the user explicitly asked to repeat. Quests don't have this
    // problem: addChore takes recurrenceRule directly (see below).
    if (isEvent && recurFreq !== 'once') {
      onOpenFullForm('event', {
        title: finalTitle,
        category: category ?? detected.category.eventCategory,
        memberId: forMemberIds[0],
        startAt: detected.when.date ? (detected.when.date + (detected.when.time ? `T${detected.when.time}:00` : 'T00:00:00')) : undefined,
        // Was dropped entirely on handoff — the composer's own detected/
        // chosen recurrence (e.g. "every day") never reached the full
        // form's prefill, so REPEATS silently reset to "One-time" on
        // step 4's review screen despite the title still saying "every
        // day" and the composer having correctly detected it moments
        // earlier (live-reported: title "Pickup from Badminton every
        // day", Repeats showed "One-time").
        recurFreq,
        ...(recurFreq === 'weekly' && recurDays.length ? { recurDays } : {}),
      });
      close();
      return;
    }

    if (isEvent) {
      const dt = whenDate;
      const finalCategory = category ?? detected.category.eventCategory ?? 'Other';
      const isRide = finalCategory === 'Ride';
      const helperMember = helperId ? members.find(m => m.id === helperId) : undefined;

      // Same per-category location mapping EventFormModal.tsx's own submit
      // handler uses — clinic/venue/general location all collapse onto the
      // one generic `location` field on FamilyEvent, ride's own drop
      // location stays in its dedicated pickupLocation/dropLocation pair.
      const location =
        finalCategory === 'Medical' ? clinicLocation.trim() || undefined
        : finalCategory === 'Sports' ? venueLocation.trim() || undefined
        : finalCategory === 'Study'  ? venueLocation.trim() || undefined
        : finalCategory === 'Ride'   ? undefined
        : generalLocation.trim() || undefined;

      const helper = finalCategory === 'Study'
        ? (helperMember?.name ?? tutorName.trim()) || undefined
        : helperMember?.name;

      addEvent({
        title: finalTitle,
        date: (dt ?? new Date()).toISOString().slice(0, 10),
        time: dt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : undefined,
        type: 'event',
        category: finalCategory as any,
        allDay: !dt,
        memberId: forMemberIds[0],
        ...(forMemberIds.length > 1 ? { memberIds: forMemberIds } : {}),
        approvalPending: false,
        conflict: false,
        location,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(helper ? { helper, helperStatus: 'pending' as const } : {}),
        ...(finalCategory === 'Medical' && doctorName.trim() ? { doctorName: doctorName.trim() } : {}),
        ...(finalCategory === 'Sports' && coachName.trim() ? { coachName: coachName.trim() } : {}),
        ...(isRide ? {
          rideRequired: true,
          ...(pickupLocation.trim() ? { pickupLocation: pickupLocation.trim() } : {}),
          ...(dropLocation.trim() ? { dropLocation: dropLocation.trim() } : {}),
          ...(returnTime.trim() ? { returnTime: returnTime.trim() } : {}),
          ...(isViewerParentOrSenior ? {
            isOpenToGrandparents: openToGrandparents,
            isOpenToTeens: openToTeens,
            ...(openToTeens && rideCoinsTeen.trim() ? { rideCoins: parseInt(rideCoinsTeen, 10) || undefined } : {}),
          } : {}),
        } : {}),
        ...(alertCall && dt ? { alertCall: true, alertCallLeadMinutes } : {}),
      });
      if (suggestion?.decisionType === 'auto' && category) {
        applyAssignment({ taskId: 'composer-preview', taskType: 'event', familyId, category }).catch(() => {});
      }
      onCreated?.('event');
    } else {
      const coins = parseInt(coinsStr, 10);
      const isMulti = forMemberIds.length > 1;
      const finalQuestCategory = category ?? detected.category.questCategory ?? 'Other';
      const newQuest = addQuest({
        title: finalTitle,
        description: notes.trim() || undefined,
        category: finalQuestCategory as any,
        priority: urgent ? 'urgent' : 'medium',
        coins: assignedToAdult ? 0 : (Number.isFinite(coins) && coins >= 0 ? coins : 20),
        xpReward: assignedToAdult ? 0 : 15,
        // Multi-assignee creates the quest unassigned, then
        // createParticipants fans it out to a real per-kid clone each —
        // same two-step pattern AddQuestModal.tsx's own multi-select uses
        // (choreAdapter.addQuest only ever reads assignedToIds[0] and
        // silently drops the rest otherwise).
        isPool: forMemberIds.length === 0,
        isDaily: recurFreq === 'daily',
        recurrence: recurFreq,
        ...(recurFreq === 'weekly' && recurDays.length ? { recurrenceDays: recurDays } : {}),
        ...(recurFreq === 'monthly' && recurDayOfMonth ? { recurrenceDayOfMonth: recurDayOfMonth } : {}),
        status: 'todo',
        assignedToIds: isMulti ? [] : forMemberIds,
        isAdultTask: assignedToAdult,
        dueDate: detected.when.date ?? undefined,
        photoRequired,
        createdById: activeMemberId,
        ...(alertCall && detected.when.date ? { alertCall: true, alertCallLeadMinutes } : {}),
      });
      if (isMulti && newQuest?.id) {
        createParticipants(newQuest.id, forMemberIds).catch((e: any) =>
          console.warn('[SmartTaskComposer] createParticipants failed', e?.message));
      }
      // Grocery run — same store-grouped create-on-submit pattern as
      // AddQuestModal's own grocery step (features/quests/components/
      // AddQuestModal.tsx's doCreate()): insert any new lines, group
      // existing+new selections by store, one grocery_runs row per store.
      if (isGroceryCategory && linkGroceries && familyId) {
        const validNewLines = newGroceryLines.filter(l => l.name.trim());
        const hasExisting = selectedItemIds.size > 0;
        if (hasExisting || validNewLines.length > 0) {
          (async () => {
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
                const item = groceryItemsList.find(i => i.id === id);
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
                  .insert({ family_id: familyId, name: finalTitle, store: store === 'Any store' ? 'Store' : store, status: 'draft', created_by: activeMemberId, planned_at: whenDate ? whenDate.toISOString().slice(0, 10) : (detected.when.date ?? new Date().toISOString().slice(0, 10)) })
                  .select('id').single();
                if (!runErr && runRow?.id) {
                  await supabase.from('grocery_run_items').insert(itemIds.map(itemId => ({ run_id: runRow.id, item_id: itemId, checked_in_run: false })));
                }
              }
              const newNames = validNewLines.map(l => l.name.trim()).filter(Boolean);
              const newStores = [...allStores].filter(s => s !== 'Any store');
              if (newNames.length || newStores.length) appendToCache(newNames, newStores);
            } catch (e: any) {
              console.warn('[SmartTaskComposer] grocery run creation failed', e?.message);
            }
          })();
        }
      }
      onCreated?.('quest');
    }
    close();
  };

  return (
    <AppBottomSheet visible={visible} onClose={close} title="What do you need?" subtitle="Describe it — everything else is detected automatically"
      // With nothing typed yet there's nothing to justify a 45% floor —
      // the sheet looked oversized on open (live-reported). Once the user
      // starts typing (or dictation fills in text), grow to 60% so there's
      // room for the detected fields/results that appear below the input.
      minHeight={input.trim() ? '60%' : '28%'} maxHeight={keyboardOpen ? '55%' : '85%'} bodyPaddingBottom={40 + insets.bottom}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
        <View style={{ position: 'relative' }}>
          <TextInput
            // While actively listening, the box shows the live transcript
            // (updates on every partial speech result, not just once at
            // the end) — the user sees words appear as they talk, same as
            // if they were typing them. Tapping the mic again to stop
            // hands the transcript over to `input` as real, editable text;
            // typing directly always wins over anything dictation is doing.
            value={dictation.state === 'listening' ? dictation.liveTranscript : input}
            onChangeText={setInput}
            editable={dictation.state !== 'listening'}
            placeholder={`"Pick up Maya from soccer at 4pm" or "Take out the trash tonight, 10 coins"`}
            placeholderTextColor={colors.textTertiary}
            multiline
            style={{
              fontSize: TYPO.body, color: colors.textPrimary, minHeight: 64,
              backgroundColor: isDark ? colors.surface : colors.inputBg,
              borderRadius: RADIUS.md, borderWidth: 1.5,
              borderColor: dictation.state === 'listening' ? colors.danger : colors.border,
              padding: SPACING.md, paddingRight: 84, paddingBottom: 40,
            }}
          />
          {/* Row pinned inside the box, bottom-right: Clear (only once
              there's text) · AI (explicit "send this text to AI" action,
              separate from the local detection that already runs live as
              the user types — only this tap fires the network call).
              Bottom-right instead of top-right so it never collides with
              the first line of typed text. The inline mic/stop icon used
              to live here too, but while the big centered mic/stop button
              below is showing (empty sheet, before or during dictation)
              it's a redundant second control for the same action — so
              it's only rendered here once the sheet has real content and
              the big button has already disappeared. */}
          <View style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!!input && dictation.state !== 'listening' && (
              <Pressable
                onPress={() => { setInput(''); setDetection(null); dictation.reset(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ width: 28, height: 28, borderRadius: 14,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: colors.border }}>
                <X size={13} color={colors.textSecondary} />
              </Pressable>
            )}
            {!bigMicShowing && (
              <Pressable
                onPress={async () => {
                  if (dictation.state === 'listening') {
                    // stop() only resolves the transcript, it doesn't commit
                    // it anywhere — without this the box would flip back to
                    // whatever `input` was before dictation started (usually
                    // empty) the instant state left 'listening', silently
                    // losing everything just spoken.
                    const finalTranscript = await dictation.stop();
                    if (finalTranscript) setInput(finalTranscript);
                  } else {
                    dictation.start();
                  }
                }}
                style={{ width: 28, height: 28, borderRadius: 14,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: dictation.state === 'listening' ? colors.danger : colors.primary + '18' }}>
                {dictation.state === 'listening'
                  ? <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#fff' }} />
                  : <Mic size={14} color={colors.primary} />}
              </Pressable>
            )}
            <Pressable
              onPress={sendToAi}
              disabled={!input.trim() || aiLoading || dictation.state === 'listening'}
              style={{ width: 28, height: 28, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.primary, opacity: (!input.trim() || aiLoading || dictation.state === 'listening') ? 0.4 : 1 }}>
              {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Sparkles size={14} color="#fff" />}
            </Pressable>
          </View>
        </View>

        {/* Big centered mic/stop — shown while the sheet is still empty (no
            typed text, nothing detected yet), covering both "not yet
            listening" and "actively listening" so there's one obvious big
            control the whole time instead of shrinking down to just the
            small inline square once recording starts. Once local detection
            parses the input and the field form shows below, this
            disappears — it would otherwise just be dead space above the
            results. */}
        {bigMicShowing && (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Pressable
              onPress={async () => {
                if (dictation.state === 'listening') {
                  const finalTranscript = await dictation.stop();
                  if (finalTranscript) setInput(finalTranscript);
                } else {
                  dictation.start();
                }
              }}
              style={{
                width: 72, height: 72, borderRadius: 36,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: dictation.state === 'listening' ? colors.danger : colors.primary,
                shadowColor: dictation.state === 'listening' ? colors.danger : colors.primary,
                shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
              }}>
              {dictation.state === 'listening'
                ? <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' }} />
                : <Mic size={28} color="#fff" />}
            </Pressable>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: dictation.state === 'listening' ? colors.danger : colors.textSecondary }}>
              {dictation.state === 'listening' ? 'Listening… tap to stop' : 'Tap to speak'}
            </Text>
          </View>
        )}
        {aiLoading && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Asking AI…</Text>
          </View>
        )}
        {(voiceError || dictation.error) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.danger + '12', borderRadius: RADIUS.sm, padding: 10 }}>
            <AlertTriangle size={14} color={colors.danger} />
            <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.danger }}>{voiceError ?? dictation.error}</Text>
          </View>
        )}

        {detected && detected.confidence === 0 && showFields && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.warning + '18', borderRadius: RADIUS.sm, padding: 10 }}>
            <AlertTriangle size={14} color={colors.warningDark ?? colors.warning} />
            <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.warningDark ?? colors.warning }}>
              Wasn't totally clear — double-check the details below.
            </Text>
          </View>
        )}

        {showFields && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isEvent ? <Calendar size={16} color={colors.primary} /> : <ClipboardList size={16} color={colors.primary} />}
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {isEvent ? 'Event' : 'Quest'}{catMeta ? ` · ${catMeta.emoji} ${catMeta.label}` : ''}
              </Text>
              {!touchedCategory && catMeta && <AutoBadge />}
            </View>

            {isEvent && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Category</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {CATEGORIES.filter(c => c.key !== 'Work').map(c => {
                    const sel = category === c.key;
                    return (
                      <Pressable key={c.key} onPress={() => { setCategory(c.key); setTouchedCategory(true); }}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1.5,
                          backgroundColor: sel ? c.color + '20' : (isDark ? colors.surface : colors.inputBg),
                          borderColor: sel ? c.color : colors.border }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: sel ? c.color : colors.textSecondary }}>{c.emoji} {c.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {isEvent && category === 'Ride' && (
              <View style={{ gap: 8 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Pickup <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                  <TextInput
                    value={pickupLocation}
                    onChangeText={t => { setPickupLocation(t); setTouchedPickup(true); if (t && !dropLocation) setDropLocation(''); }}
                    placeholder="e.g. Dance studio"
                    placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                      backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: RADIUS.md,
                      paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}
                  />
                  {!!pickupLocation && !dropLocation && (
                    <Text style={{ fontSize: 11, color: colors.textTertiary, fontStyle: 'italic' }}>Where are they headed after?</Text>
                  )}
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Drop-off <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                  <TextInput
                    value={dropLocation}
                    onChangeText={t => { setDropLocation(t); setTouchedDrop(true); }}
                    placeholder="e.g. Home"
                    placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                      backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: RADIUS.md,
                      paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}
                  />
                  {!!dropLocation && !pickupLocation && (
                    <Text style={{ fontSize: 11, color: colors.textTertiary, fontStyle: 'italic' }}>Where are they being picked up from?</Text>
                  )}
                </View>

                {(pickupLocation || dropLocation) && !showReturnTime && (
                  <Pressable onPress={() => setShowReturnTime(true)}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary }}>+ Add a return time</Text>
                  </Pressable>
                )}
                {showReturnTime && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Return time <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                    <Pressable onPress={() => { setShowWhenPicker(false); setShowReturnPicker(true); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isDark ? colors.surface : colors.inputBg,
                        borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'flex-start' }}>
                      <Calendar size={14} color={colors.textSecondary} />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: returnTime ? colors.textPrimary : colors.textTertiary }}>
                        {returnTime || 'Tap to choose'}
                      </Text>
                    </Pressable>
                    {showReturnPicker && (
                      <View style={{ backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                        <DateTimePicker
                          value={(() => {
                            const d = new Date();
                            if (returnTime) {
                              const [h, m] = returnTime.split(':').map(Number);
                              if (!isNaN(h) && !isNaN(m)) d.setHours(h, m, 0, 0);
                            }
                            return d;
                          })()}
                          mode="time" display="spinner"
                          onChange={(_, d) => { if (d) setReturnTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }}
                          textColor={colors.textPrimary}
                          style={{ height: 180, width: '100%' }}
                        />
                        <Pressable onPress={() => setShowReturnPicker(false)} style={{ alignSelf: 'flex-end', padding: 10 }}>
                          <Text style={{ color: colors.primary, fontWeight: '900', fontSize: TYPO.caption }}>Done</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {isEvent && category === 'Medical' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>🩺 Doctor</Text>
                  <TextInput value={doctorName} onChangeText={setDoctorName} placeholder="Dr. Smith" placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, backgroundColor: isDark ? colors.surface : colors.inputBg,
                      borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>📍 Clinic</Text>
                  <TextInput value={clinicLocation} onChangeText={setClinicLocation} placeholder="Clinic name" placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, backgroundColor: isDark ? colors.surface : colors.inputBg,
                      borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }} />
                </View>
              </View>
            )}

            {isEvent && category === 'Sports' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>🏅 Coach</Text>
                  <TextInput value={coachName} onChangeText={setCoachName} placeholder="Coach Williams" placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, backgroundColor: isDark ? colors.surface : colors.inputBg,
                      borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>📍 Venue</Text>
                  <TextInput value={venueLocation} onChangeText={setVenueLocation} placeholder="Riverside Park" placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, backgroundColor: isDark ? colors.surface : colors.inputBg,
                      borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }} />
                </View>
              </View>
            )}

            {isEvent && category === 'Study' && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>📚 Tutor name</Text>
                <TextInput value={tutorName} onChangeText={setTutorName} placeholder="Mr. Kumar" placeholderTextColor={colors.textTertiary}
                  style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, backgroundColor: isDark ? colors.surface : colors.inputBg,
                    borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }} />
              </View>
            )}

            {isEvent && ['Event', 'Birthday', 'Errand', 'Other'].includes(category ?? '') && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>📍 Location <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                <TextInput value={generalLocation} onChangeText={setGeneralLocation} placeholder="Where is this happening?" placeholderTextColor={colors.textTertiary}
                  style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, backgroundColor: isDark ? colors.surface : colors.inputBg,
                    borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }} />
              </View>
            )}

            {/* Who's accompanying — every event category, same per-category
                label wording HelperAssignmentSection.tsx uses in the full
                form, so the language matches whichever entry point created
                the event. */}
            {isEvent && (
              <View style={{ gap: 6 }}>
                {!touchedHelper && helperId && (
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <AutoBadge />
                  </View>
                )}
                <MemberPicker
                  label={
                    category === 'Medical'  ? '🏥 Accompanied by (adult)' :
                    category === 'Study'    ? '📚 Or pick a family tutor' :
                    category === 'Sports'   ? '🚗 Drop-off by (adult)' :
                    category === 'Birthday' ? '🚗 Driven by / accompanying' :
                    '🚗 Driven by (adult)'
                  }
                  selectedIds={helperId ? [helperId] : []}
                  members={members.filter(m => m.role === 'parent' || m.role === 'senior')}
                  onToggle={(id) => { setHelperId(prev => prev === id ? undefined : id); setTouchedHelper(true); }}
                  colors={colors} isDark={isDark} siblings={[]}
                />
              </View>
            )}

            {/* GP/Teen Welcome — Ride only, same pool-opening toggles the
                full form's Ride branch offers (CategoryFields.tsx). Opens
                the ride to the grandparent/teen-driver pool alongside
                whoever's picked above, instead of only that one person. */}
            {isEvent && category === 'Ride' && isViewerParentOrSenior && (
              <View style={{ gap: 8 }}>
                <Pressable onPress={() => setOpenToGrandparents(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 11, paddingHorizontal: 14, borderRadius: RADIUS.md,
                    borderWidth: 1.5,
                    borderColor: openToGrandparents ? colors.warning : colors.border,
                    backgroundColor: openToGrandparents ? (isDark ? '#2D1800' : colors.warningLight) : (isDark ? colors.surface : colors.inputBg) }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: openToGrandparents ? '#92400E' : colors.textPrimary }}>
                      👴👵 Grandparents Welcome
                    </Text>
                    <Text style={{ fontSize: TYPO.label, color: openToGrandparents ? '#B45309' : colors.textSecondary }}>
                      {openToGrandparents ? 'GPs can claim this ride or pass, no pressure' : 'Off · only visible to parents'}
                    </Text>
                  </View>
                  <View style={{ width: 44, height: 26, borderRadius: 13,
                    backgroundColor: openToGrandparents ? colors.warning : (isDark ? '#334155' : '#CBD5E1'),
                    justifyContent: 'center', paddingHorizontal: 3 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                      alignSelf: openToGrandparents ? 'flex-end' : 'flex-start' }} />
                  </View>
                </Pressable>

                {kidMembers.some(m => m.role === 'teen') && (
                  <Pressable onPress={() => setOpenToTeens(v => !v)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 11, paddingHorizontal: 14, borderRadius: RADIUS.md,
                      borderWidth: 1.5,
                      borderColor: openToTeens ? '#6366F1' : colors.border,
                      backgroundColor: openToTeens ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? colors.surface : colors.inputBg) }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: openToTeens ? '#3730A3' : colors.textPrimary }}>
                        🚗 Teen Driver Welcome
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: openToTeens ? '#4338CA' : colors.textSecondary }}>
                        {openToTeens ? 'Teen can drive · set coins below' : 'Off · teen driver not offered'}
                      </Text>
                    </View>
                    <View style={{ width: 44, height: 26, borderRadius: 13,
                      backgroundColor: openToTeens ? '#6366F1' : (isDark ? '#334155' : '#CBD5E1'),
                      justifyContent: 'center', paddingHorizontal: 3 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                        alignSelf: openToTeens ? 'flex-end' : 'flex-start' }} />
                    </View>
                  </Pressable>
                )}
                {openToTeens && kidMembers.some(m => m.role === 'teen') && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, flex: 1 }}>🪙 Coins for teen driver</Text>
                    <TextInput
                      style={{ width: 80, textAlign: 'center', fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                        backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: RADIUS.md,
                        paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#6366F1' }}
                      keyboardType="numeric" maxLength={4}
                      placeholder="0" placeholderTextColor={colors.textTertiary}
                      value={rideCoinsTeen} onChangeText={setRideCoinsTeen}
                    />
                  </View>
                )}
              </View>
            )}

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Title</Text>
                {!touchedTitle && title && <AutoBadge />}
              </View>
              <TextInput
                value={title}
                onChangeText={t => { setTitle(t); setTouchedTitle(true); }}
                style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                  backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: RADIUS.md,
                  paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}
              />
            </View>

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>For</Text>
                {!touchedMember && forMemberIds.length > 0 && <AutoBadge />}
                {loadingSuggestion && <ActivityIndicator size="small" color={colors.textTertiary} />}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {/* Quick multi-select pills — "Family" selects everyone,
                    "All Kids" selects every kid/teen. Re-tapping either
                    toggles the whole group off if it's already exactly
                    that group selected. */}
                {kidMembers.length > 1 && (() => {
                  const allKidIds = kidMembers.map(m => m.id);
                  const isExact = forMemberIds.length === allKidIds.length && allKidIds.every(id => forMemberIds.includes(id));
                  return (
                    <Pressable
                      onPress={() => { setForMemberIds(isExact ? [] : allKidIds); setTouchedMember(true); }}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1.5,
                        backgroundColor: isExact ? (isDark ? colors.amber + '20' : colors.amberLight) : (isDark ? colors.surface : colors.inputBg),
                        borderColor: isExact ? colors.amber : colors.border }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: isExact ? colors.amber : colors.textSecondary }}>👦👧 All Kids</Text>
                    </Pressable>
                  );
                })()}
                {members.length > 1 && (() => {
                  const allIds = members.map(m => m.id);
                  const isExact = forMemberIds.length === allIds.length && allIds.every(id => forMemberIds.includes(id));
                  return (
                    <Pressable
                      onPress={() => { setForMemberIds(isExact ? [] : allIds); setTouchedMember(true); }}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1.5,
                        backgroundColor: isExact ? (isDark ? colors.primary + '20' : colors.primaryLight) : (isDark ? colors.surface : colors.inputBg),
                        borderColor: isExact ? colors.primary : colors.border }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: isExact ? colors.primary : colors.textSecondary }}>👨‍👩‍👧‍👦 Family</Text>
                    </Pressable>
                  );
                })()}
                {members.map(m => {
                  const sel = forMemberIds.includes(m.id);
                  const isSuggested = !sel && suggestion?.selectedMemberId === m.id;
                  return (
                    <Pressable key={m.id} onPress={() => {
                      setForMemberIds(prev => sel ? prev.filter(id => id !== m.id) : [...prev, m.id]);
                      setTouchedMember(true);
                    }}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1.5,
                        backgroundColor: sel ? colors.primary + '18' : (isDark ? colors.surface : colors.inputBg),
                        borderColor: sel ? colors.primary : (isSuggested ? colors.primary + '60' : colors.border) }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: sel ? colors.primary : colors.textSecondary }}>
                        {m.name.split(' ')[0]}{isSuggested ? ' ✨' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {suggestion?.explanation?.selected && forMemberIds.length === 0 && (
                <Text style={{ fontSize: 11, color: colors.textTertiary, fontStyle: 'italic' }}>
                  Suggested: {suggestion.explanation.selected}
                </Text>
              )}
            </View>

            {/* Repeats — same Daily/Weekly/Monthly + weekday-chip + day-of-
                month-grid pattern as AddQuestRecurrenceSection.tsx, so this
                reads identically to the full form. Applies directly to
                quests; for events, Create hands off to the full form
                instead (see the recurFreq !== 'once' guard in create()). */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Repeats</Text>
                {!touchedRecurrence && recurFreq !== 'once' && <AutoBadge />}
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['once', 'daily', 'weekly', 'monthly'] as const).map(freq => {
                  const sel = recurFreq === freq;
                  return (
                    <Pressable key={freq}
                      onPress={() => { setRecurFreq(freq); setTouchedRecurrence(true); if (freq !== 'weekly') setRecurDays([]); if (freq !== 'monthly') setRecurDayOfMonth(undefined); }}
                      style={{ flex: 1, borderRadius: RADIUS.sm, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
                        borderColor: sel ? colors.primary : colors.border,
                        backgroundColor: sel ? colors.primaryLight : (isDark ? colors.surface : colors.inputBg) }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: sel ? colors.primary : colors.textSecondary }}>
                        {freq === 'once' ? 'One-time' : freq === 'daily' ? '📅 Daily' : freq === 'weekly' ? '🗓 Weekly' : '📆 Monthly'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {recurFreq === 'weekly' && (
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, dow) => {
                    const active = recurDays.includes(dow);
                    return (
                      <Pressable key={dow}
                        onPress={() => { setRecurDays(days => active ? days.filter(d => d !== dow) : [...days, dow].sort()); setTouchedRecurrence(true); }}
                        style={{ flex: 1, borderRadius: RADIUS.sm, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : 'transparent' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: active ? '#fff' : colors.textSecondary }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {recurFreq === 'monthly' && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(day => {
                    const active = recurDayOfMonth === day;
                    return (
                      <Pressable key={day}
                        onPress={() => { setRecurDayOfMonth(active ? undefined : day); setTouchedRecurrence(true); }}
                        style={{ width: '12.5%', aspectRatio: 1, borderRadius: RADIUS.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : 'transparent' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: active ? '#fff' : colors.textSecondary }}>{day}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => { setRecurDayOfMonth(recurDayOfMonth === 31 ? undefined : 31); setTouchedRecurrence(true); }}
                    style={{ flexGrow: 1, borderRadius: RADIUS.sm, borderWidth: 1.5, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', marginTop: 4,
                      borderColor: recurDayOfMonth === 31 ? colors.primary : colors.border,
                      backgroundColor: recurDayOfMonth === 31 ? colors.primary : 'transparent' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: recurDayOfMonth === 31 ? '#fff' : colors.textSecondary }}>Last day</Text>
                  </Pressable>
                </View>
              )}

              {isEvent && recurFreq !== 'once' && (
                <Text style={{ fontSize: 11, color: colors.textTertiary, fontStyle: 'italic' }}>
                  Recurring events are set up in the full form — Create will take you there.
                </Text>
              )}
            </View>

            {/* Bounty toggle — quests only. A "bounty" is just a quest with
                a meaningful coin reward set explicitly by the creator,
                rather than the default small amount; matches the mock's
                own citizenship-chore-vs-bounty framing (0 = expected,
                10+ = bounty) already used elsewhere in this app's coin UI. */}
            {!isEvent && !assignedToAdult && (
              <Pressable onPress={() => setCoinsStr(prev => (parseInt(prev, 10) || 0) > 0 ? '0' : '25')}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: (parseInt(coinsStr, 10) || 0) > 0 ? colors.amber + '18' : (isDark ? colors.surface : colors.inputBg),
                  borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12,
                  borderWidth: 1, borderColor: (parseInt(coinsStr, 10) || 0) > 0 ? colors.amber : colors.border }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: (parseInt(coinsStr, 10) || 0) > 0 ? colors.amber : colors.textPrimary }}>
                  🪙 {(parseInt(coinsStr, 10) || 0) > 0 ? 'Bounty — coins offered' : 'Citizenship chore — no coins'}
                </Text>
              </Pressable>
            )}

            {!isEvent && (
              assignedToAdult ? (
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textTertiary, fontStyle: 'italic' }}>
                  No coins — assigned to a parent/grandparent
                </Text>
              ) : (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Coins (optional)</Text>
                  <TextInput
                    value={coinsStr} onChangeText={setCoinsStr} keyboardType="number-pad" placeholder="20"
                    placeholderTextColor={colors.placeholder}
                    style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                      backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: RADIUS.md,
                      paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, width: 100 }}
                  />
                </View>
              )
            )}

            {!isEvent && !assignedToAdult && (
              <Pressable onPress={() => setPhotoRequired(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: photoRequired ? colors.primary + '14' : (isDark ? colors.surface : colors.inputBg),
                  borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12,
                  borderWidth: 1, borderColor: photoRequired ? colors.primary + '50' : colors.border }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: photoRequired ? colors.primary : colors.textPrimary }}>
                  📷 Photo proof {photoRequired ? 'required' : 'optional'}
                </Text>
              </Pressable>
            )}

            {/* Grocery-list attachment — Errand/Shopping quests only. Same
                component/behavior AddQuestModal's own grocery step uses:
                pick from existing pending items (grouped by store) and/or
                add new lines, linked to the quest as a grocery run on
                create. */}
            {isGroceryCategory && (
              <AddQuestGrocerySection
                colors={colors} isDark={isDark}
                linkGroceries={linkGroceries} setLinkGroceries={setLinkGroceries} setGroceryListOpen={setGroceryListOpen}
                loadingGroceries={loadingGroceries} groceryItems={groceryItemsList}
                expandedStores={expandedStores} setExpandedStores={setExpandedStores}
                selectedItemIds={selectedItemIds} setSelectedItemIds={setSelectedItemIds}
                newGroceryLines={newGroceryLines} setNewGroceryLines={setNewGroceryLines}
                focusedLineIdx={focusedLineIdx} setFocusedLineIdx={setFocusedLineIdx}
                focusedField={focusedField} setFocusedField={setFocusedField}
                cachedItemNames={cachedItemNames} cachedStores={cachedStores}
              />
            )}

            {(whenDate || detected.when.date || detected.when.time) && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>When</Text>
                  {!touchedWhen && <AutoBadge />}
                </View>
                <Pressable onPress={() => { setShowReturnPicker(false); setShowWhenPicker(true); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isDark ? colors.surface : colors.inputBg,
                    borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'flex-start' }}>
                  <Calendar size={14} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                    {(whenDate ?? new Date((detected.when.date ?? new Date().toISOString().slice(0, 10)) + (detected.when.time ? `T${detected.when.time}:00` : 'T00:00:00'))).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </Pressable>
                {showWhenPicker && (
                  <View style={{ backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                    <DateTimePicker
                      value={whenDate ?? new Date((detected.when.date ?? new Date().toISOString().slice(0, 10)) + (detected.when.time ? `T${detected.when.time}:00` : 'T00:00:00'))}
                      mode="datetime" display="spinner"
                      onChange={(_, d) => { if (d) { setWhenDate(d); setTouchedWhen(true); } }}
                      textColor={colors.textPrimary}
                      style={{ height: 180, width: '100%' }}
                    />
                    <Pressable onPress={() => setShowWhenPicker(false)} style={{ alignSelf: 'flex-end', padding: 10 }}>
                      <Text style={{ color: colors.primary, fontWeight: '900', fontSize: TYPO.caption }}>Done</Text>
                    </Pressable>
                  </View>
                )}

                {/* Call reminder — VoIP-style ringing alert (call-reminder-
                    sweeper cron), distinct from ordinary push notifications.
                    Off by default; turning it on defaults to 10 min before,
                    same default AskCubeProposalCard's ReminderPicker uses
                    when a reminder is first added. */}
                <Pressable onPress={() => { setTouchedAlertCall(true); setAlertCall(v => !v); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: alertCall ? colors.primary + '14' : (isDark ? colors.surface : colors.inputBg),
                    borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12,
                    borderWidth: 1, borderColor: alertCall ? colors.primary + '50' : colors.border, marginTop: 4 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: alertCall ? colors.primary : colors.textPrimary }}>
                    📞 Call reminder {alertCall ? `— ${alertCallLeadMinutes} min before` : 'off'}
                  </Text>
                </Pressable>
                {alertCall && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[0, 10, 15, 30].map(mins => {
                      const active = alertCallLeadMinutes === mins;
                      return (
                        <Pressable key={mins} onPress={() => setAlertCallLeadMinutes(mins)}
                          style={{ flex: 1, borderRadius: RADIUS.sm, borderWidth: 1.5, paddingVertical: 7, alignItems: 'center',
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primaryLight : 'transparent' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: active ? colors.primary : colors.textSecondary }}>
                            {mins === 0 ? 'On time' : `${mins}m`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Urgent — silently detected from words like "urgent"/"asap"
                in the free text; surfaced here as a real, editable toggle
                rather than a hidden field write, and drives quest priority
                on create. */}
            <Pressable onPress={() => { setUrgent(v => !v); setTouchedUrgent(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: urgent ? colors.danger + '14' : (isDark ? colors.surface : colors.inputBg),
                borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12,
                borderWidth: 1, borderColor: urgent ? colors.danger + '50' : colors.border }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: urgent ? colors.danger : colors.textPrimary }}>
                ⚡ {urgent ? 'Marked urgent' : 'Not urgent'}
              </Text>
              {!touchedUrgent && urgent && <AutoBadge />}
            </Pressable>

            {/* Notes — local detection never invents this (nothing to
                infer beyond the structured fields above), so it stays
                collapsed until the user opts in. A successful AI
                classification opens it automatically with what the AI
                inferred (family-ai's `requirements`, see applyAiResult). */}
            {!showNotes ? (
              <Pressable onPress={() => setShowNotes(true)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 }}>
                <PenLine size={12} color={colors.textTertiary} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>+ Add a note</Text>
              </Pressable>
            ) : (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Notes <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                  <Pressable onPress={() => { setShowNotes(false); setNotes(''); }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>Remove</Text>
                  </Pressable>
                </View>
                <TextInput
                  value={notes}
                  onChangeText={t => setNotes(t.slice(0, 300))}
                  placeholder="Any extra details or instructions…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary, minHeight: 60,
                    backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: RADIUS.md,
                    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' }}
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable onPress={close}
                style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Discard</Text>
              </Pressable>
              <Pressable onPress={create} disabled={!title.trim() && !detected.title}
                style={{ flex: 2, borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center', backgroundColor: colors.primary }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
                  {isEvent && recurFreq !== 'once' ? 'Set Up Recurring →' : `Create ${isEvent ? 'Event' : 'Quest'}`}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => onOpenFullForm(isEvent ? 'event' : 'quest', {
                title: title.trim() || detected.title,
                category: isEvent ? (category ?? detected.category.eventCategory) : undefined,
                memberId: forMemberIds[0],
                startAt: detected.when.date ? (detected.when.date + (detected.when.time ? `T${detected.when.time}:00` : 'T00:00:00')) : undefined,
                coins: !isEvent ? (parseInt(coinsStr, 10) || undefined) : undefined,
                photoRequired: !isEvent ? photoRequired : undefined,
                notes: notes.trim() || undefined,
              })}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
              <PenLine size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Adjust in full form</Text>
            </Pressable>
          </>
        )}

        {!showFields && input.trim().length > 0 && input.trim().length < MIN_CHARS && (
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, textAlign: 'center' }}>Keep typing…</Text>
        )}
      </ScrollView>
    </AppBottomSheet>
  );
}
