/**
 * AskParentUnifiedPage — single form covering all 8 Ask-Parent screens
 * (Permission/Question/Medication/Quest/Chore/Grocery/Supplies/Ride). Ride
 * was previously its own dedicated RideRequestPage with a describe-box/AI/
 * voice intake, edit/withdraw support, and a different backing store
 * (useEventStore, not kidRequestStore) — folded in here per explicit
 * direction ("lets fold the ask ride in to the unified askparent form"),
 * ported verbatim: its own describe box (kept separate from the shared
 * DescribeComposer below since Ride detects live on every keystroke, not
 * only on reveal), its FieldCardSections, and its submit/edit/withdraw
 * logic, now as an 8th pill alongside the generic DescribeComposer flow
 * the other 7 types share. `editRideEvent` replaces RideRequestPage's own
 * `editEvent` prop for the one caller (ride detail/edit entry point) that
 * needs to open this form pre-filled for an existing calendar event.
 * A row of type pills sits above the generic flow; picking a pill only
 * changes placeholder/CTA copy and which field body renders after reveal —
 * typed text is preserved across pill switches for the 7 generic types.
 * Submit logic per type is ported verbatim from each original file.
 */
import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Switch, Alert, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Unlock, HelpCircle, Pill, ShoppingCart, BookOpen, ClipboardList, MessageCircle, X, Car, Mic, Phone, Trash2, Sparkles, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { TYPO, RADIUS } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { KidRequestItem } from '@/store/kidRequestStore';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent, EventType } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { GROCERY_CATEGORIES, ALL_GROCERY_SUGGESTIONS, SUPPLIES_SUGGESTIONS, ItemNameField } from '@/features/hub/KidModals';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';
import { familyAi } from '@/lib/familyAiService';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';
import { f } from '@/features/calendar/components/eventForm/styles';
import { SUGGESTIONS, localDateStr, fmtTime as fmtTimeVal, fmtDisplay, fmtTimeDisplay } from '@/features/calendar/components/eventForm/types';
import type { EventCategory } from '@/features/calendar/components/eventForm/types';
import { RIDE_PICKUP_TIME_UNKNOWN, parseRideMeta } from '@/features/hub/parent/rideLegs';
import { detectLocalTask } from '@/features/tasks/lib/localTaskDetection';
import { showToast } from '@/components/AppToast';
import { FieldCard, FieldCardSection } from './shared/FieldCard';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { BeforeYouSendBox } from './shared/BeforeYouSendBox';
import { SentConfirmation } from './shared/SentConfirmation';
import { DropRow } from './shared/DropRow';
import { DescribeComposer } from './shared/DescribeComposer';

export type AskFormType = 'permission' | 'question' | 'medication' | 'quest' | 'chore' | 'grocery' | 'supplies' | 'ride';

const INDIGO_ACCENT = '#6366F1';
const QUESTION_ACCENT = '#4A7FA5';

type RideChoice = 'none' | 'dropoff' | 'pickup' | 'both';

const KID_RIDE_CATEGORIES: { key: EventCategory; emoji: string; label: string; color: string }[] = [
  { key: 'Sports',   emoji: '🏅', label: 'Sports',   color: '#F59E0B' },
  { key: 'Study',    emoji: '📚', label: 'Study',    color: '#4A7FA5' },
  { key: 'Event',    emoji: '🎉', label: 'Hang out', color: '#6C5CE7' },
  { key: 'Birthday', emoji: '🎂', label: 'Birthday', color: '#F59E0B' },
];
const OTHER_RIDE_CATEGORY: { key: EventCategory; emoji: string; label: string; color: string } =
  { key: 'Other', emoji: '✨', label: 'Something else', color: '#64748B' };

function RideAutoBadge({ colors }: { colors: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: 8, backgroundColor: colors.primary + '18' }}>
      <Sparkles size={9} color={colors.primary} />
      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>auto</Text>
    </View>
  );
}

const REPLY_PREFERENCE_OPTIONS = [
  { key: 'app_no_rush', label: 'In Family Cube · no urgent deadline' },
  { key: 'app_today', label: 'In Family Cube · today if possible' },
  { key: 'call_me', label: 'Call me when you can' },
];

type GroceryLine = { name: string; qty: string; category: string; emoji: string; store: string };
const emptyGroceryLine = (): GroceryLine => ({ name: '', qty: '', category: 'Snacks', emoji: '🛒', store: '' });

function typeMeta(type: AskFormType, accent: Record<AskFormType, string>) {
  const map: Record<AskFormType, { label: string; Icon: typeof Unlock; placeholder: string; pageTitle: string; subtitle: string }> = {
    permission: { label: 'Permission', Icon: Unlock, placeholder: `"Can I go to Jake's house Wed after school?"`, pageTitle: 'Ask Permission', subtitle: 'Your idea matters. Give a parent the details.' },
    question:   { label: 'Question',   Icon: HelpCircle, placeholder: `"Can you bring money for the field trip?"`, pageTitle: 'Ask a Question', subtitle: 'Your idea matters. Give a parent the details.' },
    medication: { label: 'Medication', Icon: Pill, placeholder: `"I didn't take my morning pill yet"`, pageTitle: 'Medication Alert', subtitle: 'Urgent — your parent is notified right away.' },
    quest:      { label: 'Suggest Chore', Icon: HelpCircle, placeholder: `"Wash the car for 20 coins"`, pageTitle: 'Suggest a Chore', subtitle: 'Sent to a parent to review' },
    chore:      { label: 'Propose Chore', Icon: ClipboardList, placeholder: `"Vacuum the living room"`, pageTitle: 'Propose a Chore', subtitle: 'A parent reviews it and sets the reward' },
    grocery:    { label: 'Grocery', Icon: ShoppingCart, placeholder: `"Milk, eggs, and bread"`, pageTitle: 'Request Groceries', subtitle: 'Parent approves before items are added' },
    supplies:   { label: 'Supplies', Icon: BookOpen, placeholder: `"Folder and pencils for school"`, pageTitle: 'School Supplies', subtitle: 'Parent approves and picks these up for you' },
    ride:       { label: 'Ride', Icon: Car, placeholder: `"Pick me up from soccer at 4pm"`, pageTitle: 'Ask for a Ride', subtitle: 'Describe it — everything else is detected automatically' },
  };
  return map[type];
}

export function AskParentUnifiedPage({ active, members, familyId, initialType = 'permission', onClose, editRideEvent }: {
  active: FamilyMember; members: FamilyMember[]; familyId: string; initialType?: AskFormType; onClose: () => void;
  // Pre-fills and switches straight into the Ride pill's field body for an
  // existing calendar event — the one caller that needs "editing", ported
  // from RideRequestPage.tsx's own `editEvent` prop.
  editRideEvent?: FamilyEvent;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest, requests, appendItems } = useKidRequestStore();
  const familyMembers = useFamilyStore(s => s.members);
  const parentNames = familyMembers.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);
  const pastStores = useGroceryStore(s => s.pastStores);
  const storePool = [...new Set([...pastStores, ...DEFAULT_GROCERY_STORES])].slice(0, 6);
  const { submitting, guard } = useSubmitGuard();
  const { addEvent, updateEvent, deleteEvent } = useEventStore();
  const isEditingRide = !!editRideEvent;

  const [type, setType] = useState<AskFormType>(editRideEvent ? 'ride' : initialType);
  const [revealed, setRevealed] = useState(isEditingRide);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // permission
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [whereWith, setWhereWith] = useState('');
  const [getHome, setGetHome] = useState('');
  // question
  const [replyPreference, setReplyPreference] = useState(REPLY_PREFERENCE_OPTIONS[0].key);
  // quest
  const [coins, setCoins] = useState('15');
  // chore
  const [forId, setForId] = useState(active.id);
  // grocery
  const [lines, setLines] = useState<GroceryLine[]>([emptyGroceryLine()]);
  const [globalCat, setGlobalCat] = useState('Snacks');
  const [groceryNotes, setGroceryNotes] = useState('');
  const [sentCount, setSentCount] = useState(0);
  const [appended, setAppended] = useState(false);
  // supplies
  const [supplyItems, setSupplyItems] = useState<{ name: string; qty: string }[]>([{ name: '', qty: '' }]);
  const [supplyUrgency, setSupplyUrgency] = useState<'normal' | 'soon'>('normal');
  const [supplyNotes, setSupplyNotes] = useState('');

  // ride — ported verbatim from RideRequestPage.tsx
  const [rideCategory, setRideCategory] = useState<EventCategory | null>((editRideEvent?.category as EventCategory) ?? null);
  const [touchedRideCategory, setTouchedRideCategory] = useState(!!editRideEvent);
  const [rideTitle, setRideTitle] = useState(editRideEvent?.title ?? '');
  const [rideEventDate, setRideEventDate] = useState<Date>(() => {
    if (editRideEvent) {
      const [y, mo, d] = editRideEvent.date.split('-').map(Number);
      const dt = new Date(y, mo - 1, d);
      if (editRideEvent.time) { const [h, mi] = editRideEvent.time.split(':').map(Number); dt.setHours(h, mi); }
      return dt;
    }
    const d = new Date(); const m = d.getMinutes();
    d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1);
    return d;
  });
  const [showRideDatePick, setShowRideDatePick] = useState(false);
  const [showRideTimePick, setShowRideTimePick] = useState(false);
  const [ridePickupLocation, setRidePickupLocation] = useState(editRideEvent?.pickupLocation ?? editRideEvent?.location ?? '');
  const [rideDropoffLocation, setRideDropoffLocation] = useState(editRideEvent?.dropLocation ?? '');
  const [touchedRidePickup, setTouchedRidePickup] = useState(!!editRideEvent);
  const [touchedRideDrop, setTouchedRideDrop] = useState(!!editRideEvent);
  // Pick-up LEG's own From/To — mirrors the parent Ride form's dual-leg
  // layout (JustDescribeItEventScreen.tsx: separate Drop-off/Pick-up
  // sections, each with its own From/To pair that auto-mirrors the other
  // leg) [live-requested: "parent ride form and the kids ride form is
  // diffrently working for the filling drop picup switcher... make
  // something uniform here too"]. FamilyEvent only persists one
  // pickupLocation/dropLocation pair total (no separate return-leg slot
  // on this single-event model, unlike the parent's two-linked-events
  // model), so these two are UI-only state feeding the same
  // ridePickupLocation/rideDropoffLocation pair on submit — the mirroring
  // keeps both legs showing the same addresses without a second backend
  // field to store them in.
  const [ridePickupFromLocation, setRidePickupFromLocation] = useState('');
  const [ridePickupToLocation, setRidePickupToLocation] = useState('');
  const [touchedRidePickupFrom, setTouchedRidePickupFrom] = useState(false);
  const [touchedRidePickupTo, setTouchedRidePickupTo] = useState(false);
  const [rideNotes, setRideNotes] = useState(editRideEvent?.notes ?? '');
  const [rideWithSiblings, setRideWithSiblings] = useState<string[]>(editRideEvent?.memberIds?.filter(id => id !== active.id) ?? []);
  const rideSiblings = members.filter(m => m.id !== active.id && (m.role === 'kid' || m.role === 'teen'));
  const [rideAlertCall, setRideAlertCall] = useState(editRideEvent?.alertCall ?? false);
  const [rideRecurrence, setRideRecurrence] = useState<'once' | 'daily' | 'weekly' | 'monthly'>(editRideEvent?.rideRecurrence ?? 'once');
  const [rideRecurrenceDays, setRideRecurrenceDays] = useState<number[]>(editRideEvent?.rideRecurrenceDays ?? []);
  const [rideRecurrenceEndDate, setRideRecurrenceEndDate] = useState(editRideEvent?.rideRecurrenceEndDate ?? '');
  const [showRideRecurEndDatePick, setShowRideRecurEndDatePick] = useState(false);
  const [touchedRideRecurrence, setTouchedRideRecurrence] = useState(!!editRideEvent);
  const editRideMeta = editRideEvent ? parseRideMeta(editRideEvent.returnTime, editRideEvent.date) : null;
  const [rideChoice, setRideChoice] = useState<RideChoice>(() => {
    if (!editRideEvent) return 'dropoff';
    if (!editRideEvent.rideRequired) return 'none';
    if (editRideMeta?.isBothWays) return 'both';
    if (editRideMeta?.isPickup) return 'pickup';
    if (editRideMeta?.isDropoff) return 'dropoff';
    return 'none';
  });
  const [touchedRideChoice, setTouchedRideChoice] = useState(!!editRideEvent);
  const [rideDone, setRideDone] = useState(false);
  const [ridePickupDate, setRidePickupDate] = useState<Date | null>(() => {
    if (editRideMeta?.pickupDate && editRideMeta.pickupDate !== editRideEvent?.date) {
      const [y, mo, d] = editRideMeta.pickupDate.split('-').map(Number);
      return new Date(y, mo - 1, d);
    }
    return null;
  });
  const [ridePickupTime, setRidePickupTime] = useState<Date | null>(() => {
    if (editRideMeta?.pickupTime) {
      const d = new Date();
      const [h, mi] = editRideMeta.pickupTime.split(':').map(Number);
      d.setHours(h, mi, 0, 0);
      return d;
    }
    return null;
  });
  const [touchedRidePickupTime, setTouchedRidePickupTime] = useState(!!editRideEvent);
  const [showRidePickupDatePick, setShowRidePickupDatePick] = useState(false);
  const [showRidePickupTimePick, setShowRidePickupTimePick] = useState(false);
  const [rideDescribeInput, setRideDescribeInput] = useState('');
  const [touchedRideTitle, setTouchedRideTitle] = useState(!!editRideEvent);
  const [touchedRideWhen, setTouchedRideWhen] = useState(!!editRideEvent);
  const [rideAiLoading, setRideAiLoading] = useState(false);
  const [rideAiError, setRideAiError] = useState<string | null>(null);
  const rideDictation = useVoiceDictation();

  const pickableMembers = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const accentByType: Record<AskFormType, string> = {
    permission: BRAND.purple, question: QUESTION_ACCENT, medication: colors.danger,
    quest: BRAND.purple, chore: BRAND.purple, grocery: BRAND.teal, supplies: INDIGO_ACCENT,
    ride: colors.sky,
  };
  // Each pill gets its own resting pastel tint (not just a shared card
  // color) so the grid reads as 8 distinct cards even before selection —
  // reuses the existing *Light brand tokens per CLAUDE.md rule 10, no new hex.
  const pastelByType: Record<AskFormType, string> = {
    permission: colors.pinkLight, question: colors.tealLight, medication: colors.primaryLight,
    quest: colors.amberLight, chore: colors.primaryLight, grocery: colors.tealLight, supplies: colors.pinkLight,
    ride: colors.amberLight,
  };
  const accent = accentByType[type];
  const meta = typeMeta(type, accentByType);
  const canvas = isDark ? colors.background : GEMINI.canvas;
  const cardWhiteBg = isDark ? colors.card : GEMINI.cardBg;

  const resetAllFields = () => {
    setText(''); setWhen(''); setWhereWith(''); setGetHome('');
    setReplyPreference(REPLY_PREFERENCE_OPTIONS[0].key);
    setCoins('15'); setForId(active.id);
    setLines([emptyGroceryLine()]); setGlobalCat('Snacks'); setGroceryNotes(''); setAppended(false);
    setSupplyItems([{ name: '', qty: '' }]); setSupplyUrgency('normal'); setSupplyNotes('');
    resetRideFields();
  };

  const resetRideFields = () => {
    if (editRideEvent) return;
    setRideDescribeInput(''); setTouchedRideTitle(false); setTouchedRideWhen(false); setRideAiError(null);
    setRideCategory(null); setTouchedRideCategory(false); setRideTitle(''); setRidePickupLocation(''); setRideDropoffLocation(''); setRideNotes('');
    setTouchedRidePickup(false); setTouchedRideDrop(false);
    setRidePickupFromLocation(''); setRidePickupToLocation(''); setTouchedRidePickupFrom(false); setTouchedRidePickupTo(false);
    setRideChoice('dropoff'); setTouchedRideChoice(false); setRideDone(false); rideDictation.reset();
    setRidePickupDate(null); setRidePickupTime(null); setTouchedRidePickupTime(false); setShowRidePickupDatePick(false);
    setRideAlertCall(false); setRideWithSiblings([]); setRideRecurrence('once'); setRideRecurrenceDays([]); setRideRecurrenceEndDate(''); setTouchedRideRecurrence(false);
  };

  const close = () => {
    setRevealed(isEditingRide); setSent(false); setError(null);
    resetAllFields();
    onClose();
  };

  // Maps a detected category onto the kid's own 5-chip set (Sports/Study/
  // Event/Birthday/Other) — ported verbatim from RideRequestPage.tsx.
  const mapToKidRideCategory = (eventCategory: string | undefined): EventCategory => {
    const known = [...KID_RIDE_CATEGORIES, OTHER_RIDE_CATEGORY].map(c => c.key);
    if (eventCategory && (known as string[]).includes(eventCategory)) return eventCategory as EventCategory;
    return 'Other';
  };

  const applyRideDetection = (d: {
    title?: string; eventDate?: Date | null; pickup?: string | null; dropoff?: string | null;
    eventCategory?: string; recurrence?: 'once' | 'daily' | 'weekly' | 'monthly'; recurrenceDays?: number[];
    rideDirection?: 'dropoff' | 'pickup' | 'both' | null;
  }) => {
    if (!touchedRideTitle && d.title) setRideTitle(d.title);
    if (!touchedRideWhen && d.eventDate) setRideEventDate(d.eventDate);
    if (!touchedRidePickup && d.pickup) setRidePickupLocation(d.pickup);
    if (!touchedRideDrop && d.dropoff) setRideDropoffLocation(d.dropoff);
    if (!touchedRideCategory) setRideCategory(mapToKidRideCategory(d.eventCategory));
    if (!touchedRideRecurrence && d.recurrence) {
      setRideRecurrence(d.recurrence);
      if (d.recurrence === 'weekly' && d.recurrenceDays?.length) setRideRecurrenceDays(d.recurrenceDays);
    }
    if (!touchedRideChoice && d.rideDirection) {
      setRideChoice(d.rideDirection);
      // Same rule as the manual toggle handlers below: pickup-only means
      // the detected time IS the exact pickup time, no offset; +1h only
      // applies when both legs are detected [live-requested: "when i
      // said 9:30 pickup and no drop off then that 9:30 is my exact
      // pickup time why +90?"] — this path previously had its own,
      // separate copy of the same +90min bug.
      if ((d.rideDirection === 'pickup' || d.rideDirection === 'both') && !touchedRidePickupTime && d.eventDate) {
        if (d.rideDirection === 'both') {
          const t = new Date(d.eventDate); t.setHours(t.getHours() + 1); setRidePickupTime(t);
        } else {
          setRidePickupTime(new Date(d.eventDate));
        }
      }
    }
  };

  // Instant local re-classification as the kid types the ride description —
  // only runs while the ride pill is active, ported verbatim.
  useEffect(() => {
    if (editRideEvent) return;
    if (type !== 'ride') return;
    if (rideDescribeInput.trim().length < 4) return;
    const d = detectLocalTask(rideDescribeInput, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    if (!d) return;
    const datePart = d.when.date;
    const timePart = d.when.time;
    const parsedDate = datePart ? new Date(`${datePart}T${timePart ?? '00:00'}:00`) : null;
    applyRideDetection({
      title: d.title,
      eventDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
      pickup: d.locations.pickup, dropoff: d.locations.dropoff,
      eventCategory: d.category.eventCategory, recurrence: d.recurrence, recurrenceDays: d.recurrenceDays,
      rideDirection: d.rideDirection,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideDescribeInput, type]);

  const sendRideToAi = async () => {
    const trimmed = rideDescribeInput.trim();
    if (!trimmed || rideAiLoading) return;
    setRideAiLoading(true);
    setRideAiError(null);
    try {
      const result = await familyAi.extractResponsibility(trimmed, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
      if (!result.task) { setRideAiError("Couldn't quite figure that out — the local guess above is still there to edit."); return; }
      const parsed = result.task.startAt ? new Date(result.task.startAt) : null;
      const hasRealTime = !!result.task.startAt && /T\d{2}:\d{2}/.test(result.task.startAt);
      const local = detectLocalTask(trimmed, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
      applyRideDetection({
        title: result.task.title,
        eventDate: parsed && hasRealTime && !Number.isNaN(parsed.getTime()) ? parsed : null,
        pickup: result.task.pickupLocation ?? local?.locations.pickup ?? null,
        dropoff: result.task.dropoffLocation ?? local?.locations.dropoff ?? null,
        eventCategory: local?.category.eventCategory, recurrence: result.task.recurrenceFrequency ?? local?.recurrence,
        recurrenceDays: result.task.recurrenceDays?.length ? result.task.recurrenceDays : local?.recurrenceDays,
        rideDirection: result.task.rideDirection ?? local?.rideDirection,
      });
    } catch (e: any) {
      setRideAiError(e?.message ?? "Couldn't reach the AI — the local guess above is still there to edit.");
    } finally {
      setRideAiLoading(false);
    }
  };

  const rideCatMeta = rideCategory ? [...KID_RIDE_CATEGORIES, OTHER_RIDE_CATEGORY].find(c => c.key === rideCategory) : null;
  const rideAccentColor = rideCatMeta?.color ?? BRAND.purple;
  const showRideFields = !!editRideEvent || !!rideCategory;
  const rideNeedsPickupTime = rideChoice === 'pickup' || rideChoice === 'both';
  const rideNeedsDropoffLeg = rideChoice === 'dropoff' || rideChoice === 'both';
  const rideNeedsPickupLeg = rideChoice === 'pickup' || rideChoice === 'both';
  const canSubmitRide = rideTitle.trim().length > 0 && !!rideCategory && (!rideNeedsPickupTime || !!ridePickupTime);

  const submitRide = guard(async () => {
    if (!active || !rideCategory) return;
    const choice = rideChoice;

    const pickupDateStr = ridePickupDate ? localDateStr(ridePickupDate) : localDateStr(rideEventDate);
    const pickupTimeStr = ridePickupTime ? fmtTimeVal(ridePickupTime) : undefined;
    const returnTime = choice === 'both'
      ? `RIDE:both:${pickupDateStr}T${pickupTimeStr ?? RIDE_PICKUP_TIME_UNKNOWN}`
      : choice === 'pickup'
        ? `RIDE:pickup:${pickupDateStr}T${pickupTimeStr ?? RIDE_PICKUP_TIME_UNKNOWN}`
        : choice === 'dropoff' ? 'RIDE:dropoff' : undefined;

    if (isEditingRide && editRideEvent) {
      const rideFieldsChanged = editRideEvent.rideRequired !== (choice !== 'none') || editRideEvent.returnTime !== returnTime;
      updateEvent(editRideEvent.id, {
        title: rideTitle.trim(),
        date: localDateStr(rideEventDate),
        time: fmtTimeVal(rideEventDate),
        category: rideCategory,
        location: ridePickupLocation.trim() || undefined,
        pickupLocation: ridePickupLocation.trim() || undefined,
        dropLocation: rideDropoffLocation.trim() || undefined,
        notes: rideNotes.trim() || undefined,
        returnTime,
        rideRequired: choice !== 'none',
        memberIds: rideWithSiblings.length > 0 ? [active.id, ...rideWithSiblings] : undefined,
        alertCall: rideAlertCall,
        alertCallLeadMinutes: 0,
        rideRecurrence,
        rideRecurrenceDays: rideRecurrence === 'weekly' && rideRecurrenceDays.length > 0 ? rideRecurrenceDays : undefined,
        rideRecurrenceEndDate: rideRecurrence !== 'once' ? (rideRecurrenceEndDate || undefined) : undefined,
        ...(rideFieldsChanged && !editRideEvent.driverName
          ? { driverStatus: choice !== 'none' ? 'pending' as const : undefined }
          : {}),
      });
      setRideDone(true);
      setTimeout(close, 1200);
      return;
    }

    const eventInput: Omit<FamilyEvent, 'id'> = {
      title: rideTitle.trim(),
      date: localDateStr(rideEventDate),
      time: fmtTimeVal(rideEventDate),
      type: (rideCategory === 'Birthday' ? 'birthday' : 'event') as EventType,
      category: rideCategory,
      allDay: false,
      location: ridePickupLocation.trim() || undefined,
      pickupLocation: ridePickupLocation.trim() || undefined,
      dropLocation: rideDropoffLocation.trim() || undefined,
      notes: rideNotes.trim() || undefined,
      returnTime,
      memberId: active.id,
      memberIds: rideWithSiblings.length > 0 ? [active.id, ...rideWithSiblings] : undefined,
      helperRequestedBy: active.name,
      approvalPending: true,
      conflict: false,
      color: rideAccentColor,
      alertCall: rideAlertCall,
      alertCallLeadMinutes: 0,
      rideRequired: choice !== 'none',
      rideRecurrence,
      rideRecurrenceDays: rideRecurrence === 'weekly' && rideRecurrenceDays.length > 0 ? rideRecurrenceDays : undefined,
      rideRecurrenceEndDate: rideRecurrence !== 'once' ? (rideRecurrenceEndDate || undefined) : undefined,
      driverStatus: choice !== 'none' ? 'pending' : undefined,
    };

    addEvent(eventInput);
    setRideDone(true);
    setTimeout(close, 1600);
  });

  // One-shot fill, mirrors each original form's handleReveal — AI's
  // extractResponsibility is title/startAt-shaped, used only where that
  // maps (permission's text+when); other types just seed their own first
  // free-text field with the typed/spoken string.
  const handleReveal = (typed: string, aiResult: Awaited<ReturnType<typeof familyAi.extractResponsibility>> | null) => {
    switch (type) {
      case 'permission': {
        setText(typed);
        if (aiResult?.task?.startAt) {
          const d = new Date(aiResult.task.startAt);
          if (!Number.isNaN(d.getTime())) {
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const h = d.getHours(); const ampm = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
            setWhen(`${months[d.getMonth()]} ${d.getDate()} · ${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`);
          }
        }
        break;
      }
      case 'question': setText(typed); break;
      case 'medication': setText(typed); break;
      case 'quest': setQuestTitle(typed); break;
      case 'chore': setChoreTitle(typed); break;
      case 'grocery': setLines([{ ...emptyGroceryLine(), name: typed }]); break;
      case 'supplies': setSupplyItems([{ name: typed, qty: '' }]); break;
      // Ride used to skip this shared composer entirely (pill tap jumped
      // straight to revealed=true, landing on its own separate describe
      // box further down) [live-requested: "may be we can get that box
      // inline in the same page instead opening new page?"]. Now it goes
      // through the same composer as the other 7 types; typed/spoken text
      // seeds rideDescribeInput. The live-detect effect keyed off
      // rideDescribeInput already parses it, but that effect only fires on
      // the NEXT render after this state update, and showRideFields needs
      // rideCategory to already be set to render the field section — so
      // run the same local detection synchronously here too
      // [live-requested: "we should open the inline form too once we
      // click on the CTA"], mirroring the effect's own logic, so the ride
      // fields appear immediately instead of waiting a tick (or not
      // appearing at all when local detection can't guess a category).
      case 'ride': {
        setRideDescribeInput(typed);
        const d = detectLocalTask(typed, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
        if (d) {
          const datePart = d.when.date;
          const timePart = d.when.time;
          const parsedDate = datePart ? new Date(`${datePart}T${timePart ?? '00:00'}:00`) : null;
          applyRideDetection({
            title: d.title,
            eventDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
            pickup: d.locations.pickup, dropoff: d.locations.dropoff,
            eventCategory: d.category.eventCategory, recurrence: d.recurrence, recurrenceDays: d.recurrenceDays,
            rideDirection: d.rideDirection,
          });
        }
        if (!d) setRideCategory(OTHER_RIDE_CATEGORY.key as EventCategory);
        break;
      }
    }
    setRevealed(true);
  };

  // quest/chore both use a single "title" field — separate state so each
  // submit path below stays verbatim from its original source file.
  const [questTitle, setQuestTitle] = useState('');
  const [choreTitle, setChoreTitle] = useState('');

  // Clearing the type's primary describe field back to empty resets that
  // type's other fields too (but the revealed form stays open) — typing
  // again starts clean instead of leaving stale When/Where/etc behind.
  const handlePermissionTextChange = (v: string) => {
    setText(v);
    if (!v) { setWhen(''); setWhereWith(''); setGetHome(''); }
  };
  const handleQuestionTextChange = (v: string) => { setText(v); if (!v) setReplyPreference(REPLY_PREFERENCE_OPTIONS[0].key); };
  const handleQuestTitleChange = (v: string) => { setQuestTitle(v); if (!v) setCoins('15'); };
  const handleChoreTitleChange = (v: string) => { setChoreTitle(v); if (!v) setForId(active.id); };
  const handleGroceryFirstLineChange = (v: string) => {
    if (!v) { setLines([emptyGroceryLine()]); setGroceryNotes(''); }
    else updateGroceryLine(0, { name: v });
  };
  const handleSupplyFirstItemChange = (v: string) => {
    if (!v) { setSupplyItems([{ name: '', qty: '' }]); setSupplyNotes(''); }
    else updateSupplyItem(0, 'name', v);
  };

  const submitPermission = () => {
    if (!text.trim()) return;
    const parts = [text.trim()];
    if (when.trim()) parts.push(`When: ${when.trim()}`);
    if (whereWith.trim()) parts.push(`Where and who with: ${whereWith.trim()}`);
    if (getHome.trim()) parts.push(`How I'll get home: ${getHome.trim()}`);
    sendRequest({ type: 'permission', fromMemberId: active.id, detail: parts.join('\n\n'), urgency: 'normal' });
    setSent(true);
  };

  const submitQuestion = () => {
    if (!text.trim()) return;
    const prefLabel = REPLY_PREFERENCE_OPTIONS.find(o => o.key === replyPreference)?.label;
    const detail = prefLabel ? `${text.trim()}\n\nReply preference: ${prefLabel}` : text.trim();
    sendRequest({ type: 'question', fromMemberId: active.id, detail, urgency: 'normal' });
    setSent(true);
  };

  const submitMedication = () => {
    if (!text.trim()) return;
    sendRequest({ type: 'medication', fromMemberId: active.id, detail: text.trim(), urgency: 'urgent' });
    setSent(true);
  };

  const submitQuest = () => {
    const trimmed = questTitle.trim();
    if (!trimmed) return;
    const rewardCoins = Math.max(0, Math.round(parseInt(coins, 10) || 0));
    sendRequest({ type: 'quest_proposal', fromMemberId: active.id, detail: trimmed, rewardCoins, urgency: 'normal' });
    setSent(true);
  };

  const submitChore = guard(async () => {
    const trimmed = choreTitle.trim();
    if (!trimmed) return;
    const target = members.find(m => m.id === forId);
    if (!target || (target.role !== 'kid' && target.role !== 'teen')) {
      setError('Chores can only be for you or a brother/sister.');
      return;
    }
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('propose_kid_chore', {
        p_family_id: familyId, p_proposer_id: active.id, p_for_member_id: forId,
        p_title: trimmed, p_description: null, p_category: 'other',
      });
      if (rpcError) throw rpcError;
      setError(null); setSent(true);
    } catch (e: any) { setError(e?.message ?? "Couldn't send that — try again."); }
  });

  const validGroceryLines = lines.filter(l => l.name.trim());
  const submitGrocery = () => {
    if (validGroceryLines.length === 0) return;
    const newItems: KidRequestItem[] = validGroceryLines.map((l, i) => ({
      id: `item-${Date.now()}-${i}`, name: l.name.trim(), qty: l.qty.trim(),
      category: l.category || globalCat, store: l.store.trim() || undefined,
      emoji: l.emoji, status: 'pending', requestedBy: active.id,
    }));
    const existing = requests.find(r => r.fromMemberId === active.id && r.status === 'pending' && r.type === 'grocery');
    setSentCount(newItems.length);
    if (existing) {
      appendItems(existing.id, newItems);
      setAppended(true);
    } else {
      sendRequest({
        type: 'grocery', fromMemberId: active.id, urgency: 'normal',
        detail: validGroceryLines.map(l => l.name.trim()).join(', ') + (groceryNotes.trim() ? ` — ${groceryNotes.trim()}` : ''),
        items: newItems,
      });
      setAppended(false);
    }
    setSent(true);
  };

  const validSupplyItems = supplyItems.filter(i => i.name.trim());
  const submitSupplies = () => {
    if (validSupplyItems.length === 0) return;
    const newItems: KidRequestItem[] = validSupplyItems.map((it, i) => ({
      id: `item-${Date.now()}-${i}`, name: it.name.trim(), qty: it.qty.trim(),
      category: 'Supplies', status: 'pending', requestedBy: active.id,
    }));
    const existing = requests.find(r => r.fromMemberId === active.id && r.status === 'pending' && r.type === 'supplies');
    if (existing) {
      appendItems(existing.id, newItems);
      setAppended(true);
    } else {
      sendRequest({
        type: 'supplies', fromMemberId: active.id, urgency: supplyUrgency,
        detail: validSupplyItems.map(i => i.name.trim()).join(', ') + (supplyNotes.trim() ? ` — ${supplyNotes.trim()}` : ''),
        items: newItems,
      });
      setAppended(false);
    }
    setSent(true);
  };

  const submitByType: Record<AskFormType, () => void> = {
    permission: submitPermission, question: submitQuestion, medication: submitMedication,
    quest: submitQuest, chore: submitChore, grocery: submitGrocery, supplies: submitSupplies,
    ride: submitRide,
  };

  const canSubmitByType: Record<AskFormType, boolean> = {
    permission: !!text.trim(), question: !!text.trim(), medication: !!text.trim(),
    quest: !!questTitle.trim(), chore: !!choreTitle.trim(),
    grocery: validGroceryLines.length > 0, supplies: validSupplyItems.length > 0,
    ride: canSubmitRide,
  };

  const sentMessageByType: Record<AskFormType, string> = {
    permission: 'Permission request sent. Wait for a parent\'s decision before going.',
    question: `Question delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}. A reply will appear on your Hub.`,
    medication: `Alert delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'} as urgent.`,
    quest: `Proposal delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}. They'll set the coin reward.`,
    chore: `Proposal delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}. They'll set the coin reward.`,
    grocery: appended
      ? `${sentCount} item${sentCount > 1 ? 's' : ''} added to your existing grocery request.`
      : `${sentCount} item${sentCount > 1 ? 's' : ''} sent to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'} for approval.`,
    supplies: appended
      ? `${validSupplyItems.length} item${validSupplyItems.length > 1 ? 's' : ''} added to your existing supplies request.`
      : `Request delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}. They'll approve each item.`,
    ride: rideChoice !== 'none' ? "They'll pick who drives you." : "They'll take a look and confirm.",
  };

  const updateGroceryLine = (idx: number, patch: Partial<GroceryLine>) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeGroceryLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const addGroceryLine = () => setLines(prev => [...prev, { ...emptyGroceryLine(), category: globalCat }]);

  const updateSupplyItem = (idx: number, field: 'name' | 'qty', val: string) =>
    setSupplyItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  const addSupplyRow = () => setSupplyItems(prev => [...prev, { name: '', qty: '' }]);
  const removeSupplyRow = (idx: number) => setSupplyItems(prev => prev.filter((_, i) => i !== idx));

  const PILLS: { key: AskFormType; label: string; Icon: typeof Unlock }[] = [
    { key: 'ride', label: 'Ride', Icon: Car },
    { key: 'permission', label: 'Permission', Icon: Unlock },
    { key: 'question', label: 'Question', Icon: HelpCircle },
    { key: 'medication', label: 'Medication', Icon: Pill },
    { key: 'quest', label: 'Suggest Chore', Icon: HelpCircle },
    { key: 'chore', label: 'Propose Chore', Icon: ClipboardList },
    { key: 'grocery', label: 'Grocery', Icon: ShoppingCart },
    { key: 'supplies', label: 'Supplies', Icon: BookOpen },
  ];

  const isSentForCurrentType = type === 'ride' ? rideDone : sent;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ backgroundColor: canvas }}>
          {!isSentForCurrentType && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingTop: insets.top + 8 }}>
              {/* Back/Close used to always fully exit Ask Parent, even once
                  revealed showed a type's field cards — a kid who picked
                  the wrong category (or just wants to try another type)
                  had no way back to the pill picker short of leaving the
                  whole flow [live-requested: "close or the back should go
                  back to the page it originated"]. Now, once revealed,
                  both step back to the pill-selection page instead; only
                  pre-reveal (or once a request is already sent) do they
                  exit via onClose. editRideEvent always exits via onClose —
                  there's no pill picker to step back to when editing an
                  existing ride. */}
              <Pressable onPress={() => (revealed && !editRideEvent) ? setRevealed(false) : onClose()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>‹ Ask Parent</Text>
              </Pressable>
              <Pressable onPress={() => (revealed && !editRideEvent) ? setRevealed(false) : onClose()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
          <PageHeading
            title={isSentForCurrentType ? 'Sent' : (revealed ? meta.pageTitle : 'Ask Parent')}
            subtitle={isSentForCurrentType ? undefined : (revealed ? meta.subtitle : 'What do you need?')}
            accent="pink"
            Icon={revealed ? meta.Icon : MessageCircle}
            topInset={0}
          />
        </View>

        <View style={{ padding: 20, paddingTop: 0, gap: 16 }}>
        {type === 'ride' && rideDone ? (
          <SentConfirmation
            title={`Sent to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}!`}
            message={sentMessageByType.ride}
            onReturn={close}
            colors={colors}
          />
        ) : sent ? (
          <SentConfirmation
            title="Sent · awaiting a reply"
            message={sentMessageByType[type]}
            onReturn={close}
            colors={colors}
          />
        ) : !revealed ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {PILLS.map(p => {
                const isActive = type === p.key;
                const Icon = p.Icon;
                const pillAccent = accentByType[p.key];
                const restBg = isDark ? colors.card : pastelByType[p.key];
                const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
                return (
                  <TouchableOpacity key={p.key} onPress={() => { setType(p.key); if (p.key === 'ride' && editRideEvent) setRevealed(true); }}
                    style={{
                      width: '31%', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
                      alignItems: 'center', gap: 6, borderWidth: isActive ? 2 : 1,
                      backgroundColor: isActive ? pillAccent + '14' : restBg,
                      borderColor: isActive ? pillAccent : colors.border,
                      ...(isActive ? {} : cardShadow),
                    }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: pillAccent + (isActive ? '28' : '14'),
                    }}>
                      <Icon size={17} color={pillAccent} />
                    </View>
                    <Text numberOfLines={2} style={{
                      fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 15,
                      color: isActive ? pillAccent : (isDark ? colors.textPrimary : GEMINI.titleColor),
                    }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <DescribeComposer
              placeholder={meta.placeholder}
              ctaLabel="Fill in details →"
              onReveal={handleReveal}
              colors={colors} isDark={isDark} accent={accent}
            />
          </>
        ) : (
          <>
            {type === 'ride' && !editRideEvent && (
              <>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    value={rideDictation.state === 'listening' ? rideDictation.liveTranscript : rideDescribeInput}
                    onChangeText={setRideDescribeInput}
                    editable={rideDictation.state !== 'listening'}
                    placeholder={`"Pick me up from soccer at 4pm" or "Need a ride to Maya's house Saturday"`}
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={{
                      fontSize: TYPO.body, color: colors.textPrimary, minHeight: 64,
                      backgroundColor: isDark ? colors.surface : colors.inputBg,
                      borderRadius: RADIUS.md, borderWidth: 1.5,
                      borderColor: rideDictation.state === 'listening' ? colors.danger : colors.border,
                      padding: 14, paddingRight: 84, paddingBottom: 40,
                    }}
                  />
                  <View style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {!!rideDescribeInput && rideDictation.state !== 'listening' && (
                      <TouchableOpacity
                        onPress={() => { setRideDescribeInput(''); rideDictation.reset(); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ width: 28, height: 28, borderRadius: 14,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: colors.border }}>
                        <X size={13} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                    {!!rideDescribeInput.trim() && (
                      <TouchableOpacity
                        onPress={async () => {
                          if (rideDictation.state === 'listening') {
                            const finalTranscript = await rideDictation.stop();
                            if (finalTranscript) setRideDescribeInput(finalTranscript);
                          } else {
                            rideDictation.start();
                          }
                        }}
                        style={{ width: 28, height: 28, borderRadius: 14,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: rideDictation.state === 'listening' ? colors.danger : BRAND.purple + '18' }}>
                        {rideDictation.state === 'listening'
                          ? <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#fff' }} />
                          : <Mic size={14} color={BRAND.purple} />}
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={sendRideToAi}
                      disabled={!rideDescribeInput.trim() || rideAiLoading || rideDictation.state === 'listening'}
                      style={{ width: 28, height: 28, borderRadius: 14,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: BRAND.purple, opacity: (!rideDescribeInput.trim() || rideAiLoading || rideDictation.state === 'listening') ? 0.4 : 1 }}>
                      {rideAiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Sparkles size={14} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                </View>

                {!rideDescribeInput.trim() && (
                  <View style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <TouchableOpacity
                      onPress={async () => {
                        if (rideDictation.state === 'listening') {
                          const finalTranscript = await rideDictation.stop();
                          if (finalTranscript) setRideDescribeInput(finalTranscript);
                        } else {
                          rideDictation.start();
                        }
                      }}
                      style={{
                        width: 72, height: 72, borderRadius: 36,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: rideDictation.state === 'listening' ? colors.danger : BRAND.purple,
                      }}>
                      {rideDictation.state === 'listening'
                        ? <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' }} />
                        : <Mic size={28} color="#fff" />}
                    </TouchableOpacity>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: rideDictation.state === 'listening' ? colors.danger : colors.textSecondary }}>
                      {rideDictation.state === 'listening' ? 'Listening… tap to stop' : 'Tap to speak'}
                    </Text>
                  </View>
                )}

                {rideAiLoading && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={BRAND.purple} />
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Asking AI…</Text>
                  </View>
                )}
                {(rideAiError || rideDictation.error) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.danger + '12', borderRadius: RADIUS.sm, padding: 10 }}>
                    <AlertTriangle size={14} color={colors.danger} />
                    <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.danger }}>{rideAiError ?? rideDictation.error}</Text>
                  </View>
                )}
              </>
            )}

            {type === 'ride' && showRideFields && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {rideCategory && <Car size={14} color={rideAccentColor} />}
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: rideAccentColor, letterSpacing: 0.5 }}>
                    {(rideCatMeta?.label ?? 'RIDE').toUpperCase()}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[...KID_RIDE_CATEGORIES, OTHER_RIDE_CATEGORY].map(c => {
                    const isOn = rideCategory === c.key;
                    return (
                      <TouchableOpacity key={c.key} onPress={() => { setTouchedRideCategory(true); setRideCategory(c.key); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
                          borderRadius: 999, borderWidth: 1.5,
                          backgroundColor: isOn ? c.color + '20' : (isDark ? colors.surface : '#F9FAFB'),
                          borderColor: isOn ? c.color : colors.border }}>
                        <Text style={{ fontSize: 15 }}>{c.emoji}</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: isOn ? c.color : colors.textPrimary }}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <FieldCardSection title="The journey" colors={colors} isDark={isDark}>
                  <FieldCard label="Title" colors={colors} isDark={isDark}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TextInput
                        style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                        placeholder="e.g. Cricket practice"
                        placeholderTextColor={colors.textTertiary}
                        value={rideTitle} onChangeText={t => { setTouchedRideTitle(true); setRideTitle(t); }} returnKeyType="next"
                      />
                      {!touchedRideTitle && !!rideTitle && <RideAutoBadge colors={colors} />}
                    </View>
                    {rideCategory && rideCategory !== 'Other' && SUGGESTIONS[rideCategory]?.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {SUGGESTIONS[rideCategory].slice(0, 4).map((s: { title: string; hint: string }, i: number) => (
                            <TouchableOpacity key={i} onPress={() => { setTouchedRideTitle(true); setRideTitle(s.title); }}
                              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                                backgroundColor: rideTitle === s.title ? rideAccentColor + '20' : (isDark ? colors.surface : colors.inputBg),
                                borderWidth: 1.5, borderColor: rideTitle === s.title ? rideAccentColor : colors.border }}>
                              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: rideTitle === s.title ? rideAccentColor : colors.textPrimary }}>
                                {s.title}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    )}
                  </FieldCard>

                  <FieldCard label="Date and time" colors={colors} isDark={isDark}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={[f.dateBtn, { flex: 3, backgroundColor: showRideDatePick ? rideAccentColor + '20' : colors.surface, borderColor: showRideDatePick ? rideAccentColor : colors.border }]}
                        onPress={() => { setShowRideDatePick(p => !p); setShowRideTimePick(false); }}>
                        <Text style={{ fontSize: 13 }}>📅</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showRideDatePick ? rideAccentColor : colors.textPrimary }}>
                          {fmtDisplay(rideEventDate)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[f.dateBtn, { flex: 2, backgroundColor: showRideTimePick ? rideAccentColor + '20' : colors.surface, borderColor: showRideTimePick ? rideAccentColor : colors.border }]}
                        onPress={() => { setShowRideTimePick(p => !p); setShowRideDatePick(false); }}>
                        <Text style={{ fontSize: 13 }}>🕐</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showRideTimePick ? rideAccentColor : colors.textPrimary }}>
                          {fmtTimeDisplay(rideEventDate)}
                        </Text>
                      </TouchableOpacity>
                      {!touchedRideWhen && <RideAutoBadge colors={colors} />}
                    </View>
                    <PickerOverlay
                      showDate={showRideDatePick} showTime={showRideTimePick}
                      value={rideEventDate}
                      onChangeDate={d => { setTouchedRideWhen(true); const m = new Date(d); m.setHours(rideEventDate.getHours(), rideEventDate.getMinutes()); setRideEventDate(m); }}
                      onChangeTime={d => { setTouchedRideWhen(true); const m = new Date(rideEventDate); m.setHours(d.getHours(), d.getMinutes()); setRideEventDate(m); }}
                      onDone={() => { setShowRideDatePick(false); setShowRideTimePick(false); }}
                      accentColor={rideAccentColor} colors={colors}
                      minimumDate={new Date()}
                    />
                  </FieldCard>

                  <FieldCard label="Anything else? (optional)" colors={colors} isDark={isDark}>
                    <TextInput
                      style={{ fontSize: TYPO.body, color: colors.textPrimary, padding: 0, minHeight: 40, textAlignVertical: 'top' }}
                      placeholder="e.g. Practice finishes at 11"
                      placeholderTextColor={colors.textTertiary}
                      value={rideNotes} onChangeText={t => setRideNotes(t.slice(0, 200))}
                      multiline numberOfLines={2}
                    />
                  </FieldCard>
                </FieldCardSection>

                <FieldCardSection title="Who and how often" colors={colors} isDark={isDark}>
                  <FieldCard label="Rider" colors={colors} isDark={isDark}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>You</Text>
                  </FieldCard>

                  {rideSiblings.length > 0 && (
                    <FieldCard label="Going with a sibling? (optional)" colors={colors} isDark={isDark}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {rideSiblings.map(sib => {
                          const isOn = rideWithSiblings.includes(sib.id);
                          return (
                            <TouchableOpacity key={sib.id}
                              onPress={() => setRideWithSiblings(prev => isOn ? prev.filter(id => id !== sib.id) : [...prev, sib.id])}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
                                borderRadius: 999, borderWidth: 1.5,
                                backgroundColor: isOn ? rideAccentColor : (isDark ? colors.surface : '#F9FAFB'),
                                borderColor: isOn ? rideAccentColor : colors.border }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: isOn ? '#fff' : colors.textPrimary }}>
                                {sib.name.split(' ')[0]}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </FieldCard>
                  )}

                  {/* Dual-leg transport — mirrors the parent Ride form's
                      structure (JustDescribeItEventScreen.tsx: separate
                      Drop-off/Pick-up toggles, each opening its own From/To
                      LocationAutocompleteInput pair that auto-mirrors the
                      other leg) instead of one shared pickup/drop-off pair
                      up top [live-requested: "parent ride form and the kids
                      ride form is diffrently working for the filling drop
                      picup switcher... make something uniform here too"].
                      No "Who's driving?" picker here — unlike the parent,
                      the kid form has no driver-assignment concept (kids
                      request, parents assign the driver afterward). */}
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Ride needed?</Text>
                    <View style={{ gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => {
                          setTouchedRideChoice(true);
                          const next = !rideNeedsDropoffLeg;
                          setRideChoice(next ? (rideNeedsPickupLeg ? 'both' : 'dropoff') : (rideNeedsPickupLeg ? 'pickup' : 'none'));
                          if (next && !ridePickupLocation.trim() && ridePickupFromLocation.trim()) setRidePickupLocation(ridePickupFromLocation.trim());
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 14, borderWidth: 1.5,
                          borderColor: rideNeedsDropoffLeg ? rideAccentColor : colors.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 15 }}>🚗➡️</Text>
                          <View>
                            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Need a drop-off</Text>
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>Getting there · {fmtTimeDisplay(rideEventDate)}</Text>
                          </View>
                        </View>
                        <View style={{ width: 36, height: 22, borderRadius: 11,
                          backgroundColor: rideNeedsDropoffLeg ? rideAccentColor : colors.border,
                          alignItems: rideNeedsDropoffLeg ? 'flex-end' : 'flex-start', paddingHorizontal: 2, justifyContent: 'center' }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' }} />
                        </View>
                      </TouchableOpacity>

                      {rideNeedsDropoffLeg && (
                        <View style={{ gap: 8, paddingHorizontal: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, flex: 1 }}>From</Text>
                            {!touchedRidePickup && !!ridePickupLocation && <RideAutoBadge colors={colors} />}
                          </View>
                          <LocationAutocompleteInput
                            value={ridePickupLocation}
                            onChangeText={t => { setTouchedRidePickup(true); setRidePickupLocation(t); }}
                            placeholder="From" accent={rideAccentColor} colors={colors}
                          />
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, flex: 1 }}>To</Text>
                            {!touchedRideDrop && !!rideDropoffLocation && <RideAutoBadge colors={colors} />}
                          </View>
                          <LocationAutocompleteInput
                            value={rideDropoffLocation}
                            onChangeText={t => {
                              setTouchedRideDrop(true); setRideDropoffLocation(t);
                              // Mirrors parent form: drop-off's "To" becomes
                              // pick-up leg's "From" when the kid hasn't
                              // touched that field themselves yet.
                              if (!touchedRidePickupFrom) setRidePickupFromLocation(t);
                            }}
                            placeholder="To" accent={rideAccentColor} colors={colors}
                          />
                        </View>
                      )}

                      <TouchableOpacity
                        onPress={() => {
                          setTouchedRideChoice(true);
                          const nextPickup = !rideNeedsPickupLeg;
                          setRideChoice(nextPickup ? (rideNeedsDropoffLeg ? 'both' : 'pickup') : (rideNeedsDropoffLeg ? 'dropoff' : 'none'));
                          if (nextPickup && !ridePickupTime) {
                            // Drop-off + pickup together: main time is the
                            // drop-off, pickup defaults to +1h (editable).
                            // Pickup-only: the main date/time the kid already
                            // set IS the exact pickup time — no offset
                            // [live-requested: "when i said 9:30 pickup and no
                            // drop off then that 9:30 is my exact pickup time
                            // why +90? ... lets say they need pickup and
                            // drop of followed by then? ... just simplify
                            // similar to the Parents ride flow"].
                            if (rideNeedsDropoffLeg) {
                              const d = new Date(rideEventDate); d.setHours(d.getHours() + 1); setRidePickupTime(d);
                            } else {
                              setRidePickupTime(new Date(rideEventDate));
                            }
                          }
                          // Default pick-up From/To to the mirror of the
                          // drop-off leg, same as the parent form.
                          if (nextPickup) {
                            if (!ridePickupFromLocation.trim() && rideDropoffLocation.trim()) setRidePickupFromLocation(rideDropoffLocation.trim());
                            if (!ridePickupToLocation.trim() && ridePickupLocation.trim()) setRidePickupToLocation(ridePickupLocation.trim());
                          }
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 14, borderWidth: 1.5,
                          borderColor: rideNeedsPickupLeg ? rideAccentColor : colors.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 15 }}>⬅️🚗</Text>
                          <View>
                            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Need a pickup</Text>
                            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                              Getting home{ridePickupTime ? ` · ${fmtTimeDisplay(ridePickupTime)}` : ''}
                            </Text>
                          </View>
                        </View>
                        <View style={{ width: 36, height: 22, borderRadius: 11,
                          backgroundColor: rideNeedsPickupLeg ? rideAccentColor : colors.border,
                          alignItems: rideNeedsPickupLeg ? 'flex-end' : 'flex-start', paddingHorizontal: 2, justifyContent: 'center' }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' }} />
                        </View>
                      </TouchableOpacity>

                      {rideNeedsPickupLeg && (
                        <View style={{ gap: 8, paddingHorizontal: 2 }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>From</Text>
                          <LocationAutocompleteInput
                            value={ridePickupFromLocation}
                            onChangeText={t => { setTouchedRidePickupFrom(true); setRidePickupFromLocation(t); }}
                            placeholder="From" accent={rideAccentColor} colors={colors}
                          />
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>To</Text>
                          <LocationAutocompleteInput
                            value={ridePickupToLocation}
                            onChangeText={t => { setTouchedRidePickupTo(true); setRidePickupToLocation(t); }}
                            placeholder="To" accent={rideAccentColor} colors={colors}
                          />
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Only shown for "both" — pickup-only uses the main Date
                      and time field above as the exact pickup time, no
                      separate redundant time card [live-requested: "just
                      simplify similar to the Parents ride flow"]. */}
                  {rideChoice === 'both' && (
                    <FieldCard label="Pickup date and time" colors={colors} isDark={isDark}>
                      {rideChoice === 'both' && (
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <TouchableOpacity
                            onPress={() => setRidePickupDate(null)}
                            style={{ flex: 1, alignItems: 'center', padding: 10, borderRadius: 12,
                              backgroundColor: !ridePickupDate ? rideAccentColor + '14' : (isDark ? colors.surface : '#F9FAFB'),
                              borderWidth: 1.5, borderColor: !ridePickupDate ? rideAccentColor : colors.border }}>
                            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textPrimary }}>Same day</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => { if (!ridePickupDate) setRidePickupDate(rideEventDate); setShowRidePickupDatePick(true); }}
                            style={{ flex: 1, alignItems: 'center', padding: 10, borderRadius: 12,
                              backgroundColor: ridePickupDate ? rideAccentColor + '14' : (isDark ? colors.surface : '#F9FAFB'),
                              borderWidth: 1.5, borderColor: ridePickupDate ? rideAccentColor : colors.border }}>
                            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textPrimary }}>
                              {ridePickupDate ? fmtDisplay(ridePickupDate) : 'Different day'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      <PickerOverlay
                        showDate={showRidePickupDatePick} showTime={false}
                        value={ridePickupDate ?? rideEventDate}
                        onChangeDate={d => setRidePickupDate(new Date(d))}
                        onChangeTime={() => {}}
                        onDone={() => setShowRidePickupDatePick(false)}
                        accentColor={rideAccentColor} colors={colors}
                        minimumDate={rideEventDate}
                      />
                      <TouchableOpacity
                        style={[f.dateBtn, { alignSelf: 'flex-start', backgroundColor: rideAccentColor + '14', borderColor: rideAccentColor }]}
                        onPress={() => setShowRidePickupTimePick(p => !p)}>
                        <Text style={{ fontSize: 16 }}>🕐</Text>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: rideAccentColor }}>
                          {ridePickupTime ? fmtTimeDisplay(ridePickupTime) : 'Set time'}
                        </Text>
                      </TouchableOpacity>
                      <PickerOverlay
                        showDate={false} showTime={showRidePickupTimePick}
                        value={ridePickupTime ?? rideEventDate}
                        onChangeDate={() => {}}
                        onChangeTime={d => { setTouchedRidePickupTime(true); const m = new Date(ridePickupTime ?? rideEventDate); m.setHours(d.getHours(), d.getMinutes()); setRidePickupTime(m); }}
                        onDone={() => setShowRidePickupTimePick(false)}
                        accentColor={rideAccentColor} colors={colors}
                      />
                    </FieldCard>
                  )}

                  <FieldCard label="How often" colors={colors} isDark={isDark}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {([
                        { label: 'Once', value: 'once' as const },
                        { label: 'Daily', value: 'daily' as const },
                        { label: 'Weekly', value: 'weekly' as const },
                        { label: 'Monthly', value: 'monthly' as const },
                      ]).map(opt => {
                        const isOn = rideRecurrence === opt.value;
                        return (
                          <TouchableOpacity key={opt.value} onPress={() => { setTouchedRideRecurrence(true); setRideRecurrence(opt.value); }}
                            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12,
                              backgroundColor: isOn ? rideAccentColor + '20' : (isDark ? colors.surface : '#F9FAFB'),
                              borderWidth: 1.5, borderColor: isOn ? rideAccentColor : colors.border }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: isOn ? rideAccentColor : colors.textPrimary }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {rideRecurrence === 'weekly' && (
                      <View style={{ marginTop: 10, gap: 6 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Repeats on</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, idx) => {
                            const sel = rideRecurrenceDays.includes(idx);
                            return (
                              <TouchableOpacity key={idx}
                                onPress={() => {
                                  setTouchedRideRecurrence(true);
                                  setRideRecurrenceDays(prev => sel ? prev.filter(d => d !== idx) : [...prev, idx]);
                                }}
                                style={{ flex: 1, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                                  backgroundColor: sel ? rideAccentColor : (isDark ? colors.surface : '#F9FAFB'),
                                  borderWidth: 1.5, borderColor: sel ? rideAccentColor : colors.border }}>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: sel ? '#FFFFFF' : colors.textPrimary }}>{label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {rideRecurrence !== 'once' && (
                      <View style={{ marginTop: 10, gap: 6 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Ends on (optional)</Text>
                        <TouchableOpacity onPress={() => setShowRideRecurEndDatePick(true)}
                          style={{ backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
                            paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 15 }}>🏁</Text>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: rideRecurrenceEndDate ? colors.textPrimary : colors.textTertiary }}>
                            {rideRecurrenceEndDate ? fmtDisplay(new Date(rideRecurrenceEndDate + 'T00:00:00')) : 'No end date'}
                          </Text>
                        </TouchableOpacity>
                        <PickerOverlay
                          showDate={showRideRecurEndDatePick} showTime={false}
                          value={new Date((rideRecurrenceEndDate || localDateStr(rideEventDate)) + 'T00:00:00')}
                          onChangeDate={d => { setTouchedRideRecurrence(true); setRideRecurrenceEndDate(localDateStr(d)); }}
                          onChangeTime={() => {}}
                          onDone={() => setShowRideRecurEndDatePick(false)}
                          accentColor={rideAccentColor} colors={colors}
                          dateLabel="🏁 Ends On"
                          minimumDate={rideEventDate}
                        />
                      </View>
                    )}
                  </FieldCard>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Phone size={16} color={rideAlertCall ? rideAccentColor : colors.textTertiary} />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Call to remind me</Text>
                    </View>
                    <Switch value={rideAlertCall} onValueChange={setRideAlertCall}
                      trackColor={{ false: colors.border, true: rideAccentColor + '80' }}
                      thumbColor={rideAlertCall ? rideAccentColor : colors.textTertiary}
                    />
                  </View>
                </FieldCardSection>
              </>
            )}

            {type === 'permission' && (
              <FieldCardSection title="Tell us your plan" colors={colors} isDark={isDark}>
                <FieldCard label="What would you like to do?" focused={text.length > 0} colors={colors} isDark={isDark}>
                  <TextInput
                    style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, minHeight: 50, textAlignVertical: 'top' }}
                    placeholder="e.g. Can I go to Jake's house?" placeholderTextColor={colors.textTertiary}
                    value={text} onChangeText={handlePermissionTextChange} multiline
                  />
                </FieldCard>
                <FieldCard label="When" focused={when.length > 0} colors={colors} isDark={isDark}>
                  <TextInput style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                    placeholder="e.g. Wed after school, 4–5:30" placeholderTextColor={colors.textTertiary}
                    value={when} onChangeText={setWhen} />
                </FieldCard>
                <FieldCard label="Where and who with" focused={whereWith.length > 0} colors={colors} isDark={isDark}>
                  <TextInput style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                    placeholder="e.g. Jake's house · his mum will be home" placeholderTextColor={colors.textTertiary}
                    value={whereWith} onChangeText={setWhereWith} />
                </FieldCard>
                <FieldCard label="How you'll get home" focused={getHome.length > 0} colors={colors} isDark={isDark}>
                  <TextInput style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                    placeholder="e.g. Please pick me up at 5:30" placeholderTextColor={colors.textTertiary}
                    value={getHome} onChangeText={setGetHome} />
                </FieldCard>
              </FieldCardSection>
            )}

            {type === 'question' && (
              <FieldCardSection title="What's on your mind?" colors={colors} isDark={isDark}>
                <FieldCard label="Your question" focused={text.length > 0} colors={colors} isDark={isDark}>
                  <TextInput
                    style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, minHeight: 60, textAlignVertical: 'top' }}
                    placeholder="e.g. Can you bring money for the field trip?" placeholderTextColor={colors.textTertiary}
                    value={text} onChangeText={handleQuestionTextChange} multiline
                  />
                </FieldCard>
                <DropRow label="Reply preference" value={replyPreference} options={REPLY_PREFERENCE_OPTIONS}
                  onSelect={setReplyPreference} isDark={isDark} colors={colors} />
              </FieldCardSection>
            )}

            {type === 'medication' && (
              <FieldCardSection title="What's going on?" colors={colors} isDark={isDark}>
                <FieldCard label="Tell us what's happening" focused={text.length > 0} colors={colors} isDark={isDark}>
                  <TextInput
                    style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, minHeight: 60, textAlignVertical: 'top' }}
                    placeholder="e.g. I didn't take my morning pill yet" placeholderTextColor={colors.textTertiary}
                    value={text} onChangeText={setText} multiline
                  />
                </FieldCard>
              </FieldCardSection>
            )}

            {type === 'quest' && (
              <FieldCardSection title="What's the chore?" colors={colors} isDark={isDark}>
                <FieldCard label="Chore" focused={questTitle.length > 0} colors={colors} isDark={isDark}>
                  <TextInput value={questTitle} onChangeText={handleQuestTitleChange} placeholder="e.g. Wash the car"
                    placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }} />
                </FieldCard>
                <FieldCard label="How many coins? (parent can change this)" focused={coins.length > 0} colors={colors} isDark={isDark}>
                  <TextInput value={coins} onChangeText={t => setCoins(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad" placeholder="15" placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }} />
                </FieldCard>
              </FieldCardSection>
            )}

            {type === 'chore' && (
              <FieldCardSection title="What's the chore?" colors={colors} isDark={isDark}>
                <FieldCard label="Chore" focused={choreTitle.length > 0} colors={colors} isDark={isDark}>
                  <TextInput value={choreTitle} onChangeText={handleChoreTitleChange} placeholder="e.g. Wash the car"
                    placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }} />
                </FieldCard>
                <DropRow
                  label="Who's this for?" value={forId}
                  options={pickableMembers.map(m => ({ key: m.id, label: m.id === active.id ? 'Me' : m.name.split(' ')[0] }))}
                  onSelect={setForId} isDark={isDark} colors={colors}
                />
                {error && <Text style={{ fontSize: TYPO.label, color: colors.danger, fontWeight: '600' }}>{error}</Text>}
              </FieldCardSection>
            )}

            {type === 'grocery' && (
              <>
                <FieldCardSection title="Category" colors={colors} isDark={isDark}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {GROCERY_CATEGORIES.map(c => {
                        const isActive = globalCat === c;
                        return (
                          <TouchableOpacity key={c} onPress={() => setGlobalCat(c)}
                            style={{ borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8,
                              alignItems: 'center', gap: 3, minWidth: 56,
                              backgroundColor: isActive ? BRAND.teal + '18' : cardWhiteBg,
                              borderColor: isActive ? BRAND.teal : colors.border }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                              color: isActive ? BRAND.teal : colors.textSecondary }}>{c}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </FieldCardSection>

                <FieldCardSection title="Items list" colors={colors} isDark={isDark}>
                  {lines.map((line, idx) => {
                    const q = line.name.trim().toLowerCase();
                    const nameSuggs = q
                      ? ALL_GROCERY_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q).slice(0, 8)
                      : ALL_GROCERY_SUGGESTIONS.filter(s => !globalCat || s.category === globalCat || globalCat === 'All').slice(0, 10);
                    return (
                      <FieldCard key={idx} label={`Item ${idx + 1}`} focused={line.name.length > 0} colors={colors} isDark={isDark}>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <ItemNameField
                            style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                            value={line.name} onChangeText={v => idx === 0 ? handleGroceryFirstLineChange(v) : updateGroceryLine(idx, { name: v })}
                            accent={BRAND.teal} colors={colors} isDark={isDark}
                          />
                          <TextInput
                            style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, width: 56 }}
                            placeholder="Qty" placeholderTextColor={colors.textTertiary}
                            value={line.qty} onChangeText={v => updateGroceryLine(idx, { qty: v })}
                          />
                          <Pressable onPress={() => removeGroceryLine(idx)} style={{ padding: 6 }}>
                            <Text style={{ fontSize: 16, color: colors.textTertiary }}>✕</Text>
                          </Pressable>
                        </View>
                        {storePool.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {storePool.map(st => {
                                const picked = line.store === st;
                                return (
                                  <Pressable key={st} onPress={() => updateGroceryLine(idx, { store: picked ? '' : st })}
                                    style={{ borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4,
                                      backgroundColor: picked ? BRAND.teal + '20' : cardWhiteBg,
                                      borderWidth: 1, borderColor: picked ? BRAND.teal : colors.border }}>
                                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: picked ? BRAND.teal : colors.textSecondary }}>🏪 {st}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </ScrollView>
                        )}
                        {nameSuggs.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {nameSuggs.map(s => (
                                <Pressable key={s.name}
                                  onPress={() => updateGroceryLine(idx, { name: s.name, emoji: s.emoji, category: s.category })}
                                  style={{ backgroundColor: line.name === s.name ? BRAND.teal + '20' : cardWhiteBg,
                                    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5,
                                    borderColor: line.name === s.name ? BRAND.teal : colors.border }}>
                                  <Text style={{ fontSize: TYPO.micro, color: line.name === s.name ? BRAND.teal : colors.textSecondary, fontWeight: '700' }}>
                                    {s.emoji} {s.name}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </ScrollView>
                        )}
                      </FieldCard>
                    );
                  })}

                  <TouchableOpacity onPress={addGroceryLine}
                    style={{ borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.teal + '50', paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.teal }}>+ Add item</Text>
                  </TouchableOpacity>

                  <FieldCard label="Note for parent (optional)" focused={groceryNotes.length > 0} colors={colors} isDark={isDark}>
                    <TextInput
                      style={{ fontSize: TYPO.body, color: colors.textPrimary, padding: 0, minHeight: 44, textAlignVertical: 'top' }}
                      placeholder="e.g. get the name-brand ones, not store brand" placeholderTextColor={colors.textTertiary}
                      value={groceryNotes} onChangeText={setGroceryNotes} multiline
                    />
                  </FieldCard>
                </FieldCardSection>
              </>
            )}

            {type === 'supplies' && (
              <>
                <FieldCardSection title="How urgent?" colors={colors} isDark={isDark}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['normal', 'soon'] as const).map(u => (
                      <TouchableOpacity key={u} onPress={() => setSupplyUrgency(u)}
                        style={{ flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5,
                          backgroundColor: supplyUrgency === u ? (u === 'soon' ? '#EF444418' : colors.sky + '18') : cardWhiteBg,
                          borderColor: supplyUrgency === u ? (u === 'soon' ? '#EF4444' : colors.sky) : colors.border }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                          color: supplyUrgency === u ? (u === 'soon' ? '#EF4444' : colors.sky) : colors.textSecondary }}>
                          {u === 'soon' ? '🔴 Need Soon' : '📋 No Rush'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </FieldCardSection>

                <FieldCardSection title="Items needed" colors={colors} isDark={isDark}>
                  {supplyItems.map((item, idx) => {
                    const q = item.name.trim().toLowerCase();
                    const filtered = q
                      ? SUPPLIES_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(q) && !supplyItems.some((it, ii) => ii !== idx && it.name === s.name))
                      : SUPPLIES_SUGGESTIONS.filter(s => !supplyItems.some((it, ii) => ii !== idx && it.name === s.name)).slice(0, 18);
                    return (
                      <FieldCard key={idx} label={`Item ${idx + 1}`} focused={item.name.length > 0} colors={colors} isDark={isDark}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          <ItemNameField
                            value={item.name} onChangeText={v => idx === 0 ? handleSupplyFirstItemChange(v) : updateSupplyItem(idx, 'name', v)}
                            placeholder="Type or pick below"
                            style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                            flex={2} accent={INDIGO_ACCENT} colors={colors} isDark={isDark}
                          />
                          <TextInput value={item.qty} onChangeText={v => updateSupplyItem(idx, 'qty', v)}
                            placeholder="Qty" placeholderTextColor={colors.textTertiary}
                            style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, flex: 1 }} />
                          {supplyItems.length > 1 && (
                            <TouchableOpacity onPress={() => removeSupplyRow(idx)} style={{ padding: 6 }}>
                              <Text style={{ fontSize: 18, color: colors.danger }}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        {filtered.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {filtered.map(s => (
                                <TouchableOpacity key={s.name} onPress={() => updateSupplyItem(idx, 'name', s.name)}
                                  style={{
                                    flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5,
                                    paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0,
                                    backgroundColor: item.name === s.name ? colors.sky + '20' : cardWhiteBg,
                                    borderColor: item.name === s.name ? colors.sky : colors.border,
                                  }}>
                                  <Text style={{ fontSize: TYPO.micro }}>{s.emoji}</Text>
                                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', marginLeft: 4,
                                    color: item.name === s.name ? colors.sky : colors.textSecondary }} numberOfLines={1}>{s.name}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        )}
                      </FieldCard>
                    );
                  })}

                  <TouchableOpacity onPress={addSupplyRow}
                    style={{ borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.sky + '50', paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.sky }}>+ Add another item</Text>
                  </TouchableOpacity>

                  <FieldCard label="Note for parent (optional)" focused={supplyNotes.length > 0} colors={colors} isDark={isDark}>
                    <TextInput value={supplyNotes} onChangeText={setSupplyNotes}
                      style={{ fontSize: TYPO.body, color: colors.textPrimary, padding: 0, minHeight: 44, textAlignVertical: 'top' }}
                      placeholder="e.g. for science project due Friday" placeholderTextColor={colors.textTertiary} multiline />
                  </FieldCard>
                </FieldCardSection>
              </>
            )}

            {(type !== 'ride' || showRideFields) && (
              <>
                <BeforeYouSendBox
                  recipientLabel={`To ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}`}
                  note={
                    type === 'medication' ? "Marked urgent — sent straight to your parent's phone."
                    : type === 'grocery' ? 'A parent approves each item before it\'s added to the list.'
                    : type === 'supplies' ? 'A parent approves and picks these up for you.'
                    : type === 'quest' || type === 'chore' ? 'A parent will set the final coin reward when they approve it.'
                    : type === 'ride' ? 'Sending keeps a dated request; it does not grant permission, assign a driver, or award coins.'
                    : undefined
                  }
                  colors={colors}
                />

                <Pressable onPress={submitByType[type]} disabled={!canSubmitByType[type] || submitting}
                  style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                    backgroundColor: canSubmitByType[type] ? accent : colors.surface }}>
                  {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Text style={{ fontSize: 15, fontWeight: '900', color: canSubmitByType[type] ? '#fff' : colors.textTertiary }}>
                      {type === 'medication' ? 'Send urgent alert'
                        : type === 'grocery' ? `Send ${validGroceryLines.length} item${validGroceryLines.length !== 1 ? 's' : ''} to parent`
                        : type === 'supplies' ? `Send ${validSupplyItems.length} item${validSupplyItems.length !== 1 ? 's' : ''} to parent`
                        : type === 'quest' ? 'Send chore idea'
                        : type === 'chore' ? 'Send chore proposal'
                        : type === 'question' ? 'Send question'
                        : type === 'ride' ? (isEditingRide ? 'Save changes' : 'Send ride request')
                        : 'Send permission request'}
                    </Text>
                  )}
                </Pressable>

                <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                    Cancel · return unchanged
                  </Text>
                </Pressable>

                {type === 'ride' && isEditingRide && editRideEvent && (
                  <Pressable
                    onPress={() => {
                      Alert.alert('Withdraw Request', `Withdraw "${editRideEvent.title}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Withdraw', style: 'destructive', onPress: () => { deleteEvent(editRideEvent.id); showToast('Request withdrawn'); close(); } },
                      ]);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
                    <Trash2 size={14} color={colors.danger} />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Withdraw this request</Text>
                  </Pressable>
                )}
              </>
            )}
          </>
        )}
        </View>
        </TouchableWithoutFeedback>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
