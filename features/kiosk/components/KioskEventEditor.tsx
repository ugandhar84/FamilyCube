/**
 * KioskEventEditor — edit or delete an existing calendar event from kiosk
 * mode. Kiosk-sized drawer, writes through the exact same eventStore
 * actions the phone's EventFormModal already calls — updateEvent/
 * deleteEvent for a plain event, updateEventScoped/deleteEventScoped/
 * addRecurringEvent for a recurring one. This file only builds UI and
 * calls them; every bit of series lookup/bulk-update/bulk-delete logic
 * lives in the shared store, untouched.
 *
 * RBAC: kiosk had zero permission awareness here — any member tapping any
 * event on the shared Hub display could edit or delete it outright, unlike
 * the phone app which gates edits through deriveEventEditPermission's rules
 * (past events lock, a kid's approved event locks, a teen can't touch a
 * sibling's event, a still-pending kid/teen request only gets a notes/alert
 * subset, etc). This mirrors that exact same shared logic — same rules,
 * kiosk-appropriate presentation only — across three tiers: full edit,
 * restricted (notes/alert-call only, matches the phone's "Save Note" path),
 * and read-only (no editable fields, no delete).
 *
 * Time was previously a free-text field storing whatever the row already
 * had verbatim — every other event's `time` is a real "HH:MM" 24h string
 * (sorting, the day's timeline, Agenda all parse it that way); a typed
 * edit here could silently corrupt it into something nothing else can
 * parse. Switched to the same real DateTimePicker every phone-app form
 * already uses.
 *
 * Recurrence, live-requested ("all add modify forms also should present
 * and recurence sheet also should be there" / "same action buttons
 * similar to the mobile"): full edit now includes the same real
 * RecurrenceControl EventFormModal.tsx's own "🔁 Repeats" block uses
 * (shared with the Chores form too, not reimplemented here), and
 * Save/Delete on an event that already has a seriesId ask the SAME real
 * "Just this one / This and following / All events" question the phone's
 * applyScope/handleDelete do, verbatim. Kiosk's actual CREATE flow needed
 * none of this new work — showManualEvent already mounts the real
 * AddEventModal from EventFormModal.tsx directly, unmodified, so its own
 * recurrence UI was already present; this file is kiosk's separate,
 * lighter-built EDIT surface, which is where the real gap was.
 *
 * Shell, live-requested ("we should replicate it and use the side narrow
 * sheet to edit like the gocery add"): rebuilt from a hand-rolled centered
 * Modal/View (its own overlay/card/header/footer, the phone's own `colors`
 * theme prop throughout every field) onto KioskFormDrawer's real drawer
 * shell and kiosk's own useKioskColors()/k.* palette — matching
 * KioskGroceryItemSheet's exact pattern, not a one-off shape. Delete moves
 * into the drawer's headerRight slot (same trash-icon-in-header placement
 * KioskGroceryItemSheet's own delete button uses), and the read-only/
 * restricted/full-edit three-tier body swap is otherwise unchanged — same
 * fields, same gating, only every color/spacing value now comes from k.
 *
 * Category, live-requested ("match all fileds similar to the mobile app"):
 * a real category picker (same 9 categories EventFormModal.tsx's own
 * EventCategory type has) plus that category's own fields, writing to the
 * SAME real FamilyEvent columns the phone's real submit logic folds them
 * into — Medical's "Clinic" and Sports/Study's "Venue" are NOT their own
 * DB columns (confirmed: grep of eventStore.ts's real FamilyEvent fields
 * has no clinicLocation/venueLocation/tutorName at all), they're phone-
 * form-LOCAL state that EventFormModal.tsx's own submit() folds into the
 * single real `location` field per category (line ~531: `category ===
 * 'Medical' ? clinicLocation : category === 'Sports' ? venueLocation :
 * ...`), and Study's "Tutor name" folds into the real `helper` field the
 * same way (line ~539). This file reproduces that exact same folding on
 * save, not new columns. Doctor/Subject/Coach/pickupLocation/dropLocation/
 * driverName/driverId ARE real columns and are set directly.
 *
 * Deliberately NOT ported from EventFormModal.tsx's own CategoryFields.tsx:
 * the GP/teen ride-sharing toggles+coins, Errand's grocery-linking section,
 * and the Study/Ride/Birthday/Errand "return pickup" nested date/time
 * sub-picker. CategoryFields.tsx's own real prop signature needs 37+ pieces
 * of state that only exist as EventFormModal.tsx's own wizard-local
 * variables — reusing it as-is would mean rebuilding that entire state
 * machine to satisfy its props, not a lighter path than a kiosk-native
 * equivalent of the field CONTENT (same labels, same real columns
 * written) with that additional machinery left out, which is the scope
 * this was confirmed as.
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, Switch, ScrollView, StyleSheet } from 'react-native';
import { Trash2, Clock, Lock, CalendarDays } from 'lucide-react-native';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { fmtTime, localDateStr, parseLocalDate } from '@/lib/dates';
import { fmtDisplay, SUBJECTS } from '@/features/calendar/components/eventForm/types';
import type { EventCategory } from '@/features/calendar/components/eventForm/types';
import { deriveEventEditPermission } from '@/features/tasks/lib/deriveCardActions';
import { RecurrenceControl } from '@/features/tasks/components/forms/RecurrenceControl';
// Same picker mobile's own AddEventModal/EditEventModal use (PickerOverlay
// wraps @react-native-community/datetimepicker in a proper "Done"-headed
// bottom sheet, spinner display) — was previously a bare DateTimePicker
// with no header/Done affordance, a genuine functional gap vs. mobile's
// real form UI, not just a visual difference.
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';
import MemberPicker from '@/features/calendar/components/eventForm/MemberPicker';
import HelperAssignmentSection from '@/features/calendar/components/eventForm/HelperAssignmentSection';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { kioskCatAccent } from '../tabs/KioskScheduleTab';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';

const CATEGORIES: EventCategory[] = ['Medical', 'Sports', 'Study', 'Ride', 'Work', 'Event', 'Birthday', 'Errand', 'Other'];

function timeStrToDate(t: string | undefined): Date | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function KioskEventEditor({ event, active, members, onClose, colors, isDark }: {
  event: FamilyEvent | null; active: FamilyMember; members: FamilyMember[]; onClose: () => void; colors: any; isDark: boolean;
}) {
  const { k } = useKioskColors();
  const updateEvent = useEventStore(s => s.updateEvent);
  const deleteEvent = useEventStore(s => s.deleteEvent);
  // Same real store actions EventFormModal.tsx's own applyScope/handleDelete
  // call — updateEventScoped/deleteEventScoped already do every bit of the
  // real series-lookup/bulk-update/bulk-delete work; this file only needs
  // to call them and ask the same "this/following/all" question the phone
  // does before it does. addRecurringEvent is the CREATE side of the same
  // real generator — used here to turn a plain event into a recurring
  // series when a parent sets a repeat rule on an event that didn't
  // already have one.
  const updateEventScoped = useEventStore(s => s.updateEventScoped);
  const deleteEventScoped = useEventStore(s => s.deleteEventScoped);
  const addRecurringEvent = useEventStore(s => s.addRecurringEvent);
  const [title, setTitle] = useState('');
  const [dateValue, setDateValue] = useState<Date>(new Date());
  const [timeValue, setTimeValue] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [alertCall, setAlertCall] = useState(false);
  // "Who is this for" — real multi-select, same shape EventFormModal.tsx's
  // own memberIds state uses (memberIds[0] becomes the real memberId
  // column, the rest ride along in memberIds when there's more than one).
  // A genuine gap this file had with zero prior UI: kiosk could edit
  // every other field but never reassign an event to a different member.
  const [memberIds, setMemberIds] = useState<string[]>([]);
  // Live-requested: "when i select family it should show all family
  // members avatars overlapped" — same as explicitly picking everyone.
  // MemberPicker's own Family chip writes memberIds=[] (its highlighted-
  // ring state is hardcoded to selectedIds.length===0 — changing what
  // Family WRITES there would make the chip itself immediately look
  // unselected right after tapping it), which is ALSO what a plain never-
  // touched event already has, and those two need to stay visually
  // different: a genuinely untouched event keeps its on-card tap-to-claim
  // picker (confirmed explicitly kept), while Family should show the
  // overlap cluster. This flag is the one place that distinction lives —
  // set the moment Family is tapped, expanded to all 4 real ids only at
  // save time (saveFull), so MemberPicker's own selection semantics never
  // change and the DB ends up with the exact same real memberIds shape a
  // manual "select all" would have produced.
  const [familyPicked, setFamilyPicked] = useState(false);
  // Category + its own fields — real EventCategory picker, same 9 values
  // EventFormModal.tsx's own type has. The category-specific state below
  // is form-local exactly like EventFormModal.tsx's own equivalents
  // (clinicLocation/venueLocation/tutorName aren't real columns — see
  // this file's header comment) and gets folded into the real columns in
  // saveFull()'s patch, matching that file's own folding logic verbatim.
  const [category, setCategory] = useState<EventCategory>('Event');
  const [doctorName, setDoctorName] = useState('');
  const [clinicLocation, setClinicLocation] = useState('');
  const [coachName, setCoachName] = useState('');
  const [venueLocation, setVenueLocation] = useState('');
  const [subject, setSubject] = useState('');
  const [tutorName, setTutorName] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation] = useState('');
  // Real family-member picker + free-text fallback backing "who's
  // accompanying/driving" for Medical/Sports/Ride — the real helper/
  // helperId pair HelperAssignmentSection.tsx's own "Accompanied by
  // (adult)" / "Drop-off by (adult)" / "Driven by (adult)" pickers use.
  // Was plain free-text only, a real gap next to the phone's own picker.
  const [helperId, setHelperId] = useState<string | undefined>(undefined);
  const [helperName, setHelperName] = useState('');
  // Study's own SEPARATE "who's driving to the session" picker — real
  // driverName/driverId columns. Confirmed by reading CategoryFields.tsx
  // in full: this "🚗 Drive Assignment" MemberPicker only ever renders
  // inside the Study block (line ~229-249), never Ride's — a bug in this
  // file's own earlier build had Ride writing "Driver" into driverName/
  // driverId instead of helper/helperId, which EventFormModal.tsx's own
  // submit-time comment calls out explicitly ("Drive assignment —
  // distinct from `helper` (tutor/escort/coach)"). Fixed: Ride now uses
  // the same helper/helperId + HelperAssignmentSection every other
  // escort-needing category does; this pair is Study-only.
  const [driverName, setDriverName] = useState('');
  const [driverId, setDriverId] = useState<string | undefined>(undefined);
  // Live-requested: "yeah all add modify forms also should present and
  // recurence sheet also should be there" — same real vocabulary/shape as
  // EventFormModal.tsx's own repeatFreq/repeatDays ('none' rather than
  // 'never', matching that file's own RecurrenceControl options exactly).
  // Only meaningful for a full edit — a restricted/read-only viewer never
  // reaches the branch that renders this.
  const [repeatFreq, setRepeatFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDateValue(event.date ? parseLocalDate(event.date) : new Date());
      setTimeValue(timeStrToDate(event.time));
      setLocation(event.location ?? '');
      setNotes(event.notes ?? '');
      setAlertCall(event.alertCall ?? false);
      setShowDatePicker(false);
      setShowTimePicker(false);
      // Same real memberIds-else-memberId prefill shape EventFormModal.tsx's
      // own prefill uses (that file's line ~177-178, read before writing this).
      setMemberIds(event.memberIds?.length ? event.memberIds : (event.memberId ? [event.memberId] : []));
      setFamilyPicked(false);
      // Category + its fields — same reverse-derivation direction as
      // EventFormModal.tsx's own edit-prefill: clinicLocation/venueLocation/
      // tutorName aren't real columns, so an existing event's `location`/
      // `helper` is read back INTO the category-shaped field it came from
      // on save, keyed off the event's real, already-set category.
      const cat = (event.category ?? 'Event') as EventCategory;
      setCategory(cat);
      setDoctorName(cat === 'Medical' ? (event.doctorName ?? '') : '');
      setClinicLocation(cat === 'Medical' ? (event.location ?? '') : '');
      setCoachName(cat === 'Sports' ? (event.coachName ?? '') : '');
      setSubject(cat === 'Study' ? (event.subject ?? '') : '');
      const online = cat === 'Study' && event.location === 'Online — Zoom';
      setIsOnline(online);
      setVenueLocation(
        cat === 'Sports' ? (event.location ?? '')
        : cat === 'Study' && !online ? (event.location ?? '')
        : ''
      );
      setTutorName(cat === 'Study' && !event.helperId ? (event.helper ?? '') : '');
      setPickupLocation(cat === 'Ride' ? (event.pickupLocation ?? '') : '');
      setDropLocation(cat === 'Ride' ? (event.dropLocation ?? '') : '');
      // helper/helperId — the real "accompanying/driving" pair for
      // Medical/Sports/Ride (HelperAssignmentSection.tsx). Study alone
      // skips this: its own Tutor field above already owns `helper`.
      const needsHelper = cat === 'Medical' || cat === 'Sports' || cat === 'Ride';
      setHelperId(needsHelper ? event.helperId : undefined);
      setHelperName(needsHelper ? (event.helper ?? '') : '');
      // driverName/driverId — Study's OWN separate "drive assignment"
      // pair, real columns, unrelated to helper/helperId above.
      setDriverName(cat === 'Study' ? (event.driverName ?? '') : '');
      setDriverId(cat === 'Study' ? event.driverId : undefined);
      // Existing recurrence, if any — pre-fills the control the same way
      // the phone's own EditEventModal would read it from the event's row
      // (the frequency/days live on the series anchor's recurrenceRule).
      setRepeatFreq(event.recurrenceRule?.frequency ?? 'none');
      setRepeatDays(event.recurrenceRule?.days ?? []);
      setConfirmingDelete(false);
    }
  }, [event?.id]);

  if (!event) return null;

  const perm = deriveEventEditPermission(event, { id: active.id, role: active.role });
  const canEditFull = perm.canEditFull;
  const canEditRestricted = perm.canEditRestricted;
  const readOnly = !canEditFull && !canEditRestricted;

  // Same real "adult" filter EventFormModal.tsx's own HelperAssignmentSection
  // mount uses (that file's line ~435-439) — simplified to parent-only here
  // since kiosk deliberately doesn't carry the GP/teen ride-sharing toggles
  // that widen it there (see this file's header comment on scope).
  const adults = members.filter(m => m.role === 'parent');
  const siblings = members.map(m => m.name);
  const handleHelperSelect = (id: string) => {
    const m = members.find(x => x.id === id);
    setHelperId(id);
    setHelperName(m?.name ?? '');
  };
  const handleDriverSelect = (id: string) => {
    const m = adults.find(x => x.id === id);
    setDriverId(id);
    setDriverName(m?.name ?? '');
  };

  const saveFull = () => {
    // AUDIT FIX: re-check the permission at the point of the actual write,
    // not only where the button is rendered. KioskQuestEditor's own header
    // already documents this belt-and-suspenders reasoning for quests
    // ("a future second entry point ... would silently reopen full write
    // access"); the event editor's save/delete paths were the half that
    // never got it, and they're the more exposed pair — a calendar event
    // delete is irreversible and this runs on a device anyone in the house
    // can walk up to.
    if (!canEditFull || !title.trim()) return;
    const time = timeValue
      ? `${String(timeValue.getHours()).padStart(2, '0')}:${String(timeValue.getMinutes()).padStart(2, '0')}`
      : undefined;

    // Same real per-category folding EventFormModal.tsx's own submit()
    // does (that file's line ~530-541, read in full before writing this):
    // clinicLocation/venueLocation/tutorName are form-local, never their
    // own DB column — they collapse into the single real `location`/
    // `helper` fields here exactly like they do on the phone. Doctor/
    // Subject/Coach/pickupLocation/dropLocation/driverName ARE real
    // columns and are set directly, also matching that file's own
    // eventInput construction (line ~627-628 for the pickup/drop pair).
    const foldedLocation =
      category === 'Medical' ? (clinicLocation.trim() || undefined)
      : category === 'Sports' ? (venueLocation.trim() || undefined)
      : category === 'Study'  ? (isOnline ? 'Online — Zoom' : (venueLocation.trim() || undefined))
      : category === 'Ride'   ? (dropLocation.trim() || undefined)
      : (location.trim() || undefined);
    // helper/helperId — Study's own dedicated Tutor field is the source
    // of truth for `helper` there (real column, folded from tutorName);
    // Medical/Sports/Ride's `helper`/`helperId` instead comes straight
    // from HelperAssignmentSection's own picker/free-text state, exactly
    // the real "accompanying/driving adult" pair EventFormModal.tsx's own
    // submit uses for these three categories (helperId prefers the
    // picker's selection, helperName is the fallback/display value).
    const foldedHelper =
      category === 'Study' ? (tutorName.trim() || undefined)
      : (category === 'Medical' || category === 'Sports' || category === 'Ride') ? (helperName.trim() || undefined)
      : undefined;
    const foldedHelperId =
      (category === 'Medical' || category === 'Sports' || category === 'Ride') ? helperId : undefined;

    const patch: Partial<FamilyEvent> = {
      title: title.trim(),
      date: localDateStr(dateValue),
      time,
      allDay: !time,
      category,
      // Same memberIds[0]->memberId shape EventFormModal.tsx's own
      // eventInput uses (that file's line ~604-605) — an empty picker
      // clears both, matching the phone's "nobody explicitly picked, hand
      // it to the auto-assignment engine / family-wide" convention rather
      // than leaving the event's PREVIOUS assignee stuck forever.
      // memberIds is `[]`, never undefined — live-crashed "null value in
      // column member_ids violates not-null constraint" on Family/clear:
      // toRowPartial's own generic `?? null` fallback (eventStore.ts) has
      // no per-column default table the way toRow()'s insert path does
      // (member_ids: ev.memberIds ?? []), so an undefined here reaches the
      // DB as a literal null against a NOT NULL column. This UI is the
      // first caller to actually clear memberIds through the partial-
      // update path, surfacing a pre-existing gap in toRowPartial itself.
      //
      // familyPicked expands the Family tap into the SAME real shape a
      // manual "select all" produces (all real member ids), rather than
      // a plain empty array — that empty-array state stays reserved for a
      // genuinely untouched event, which keeps its own on-card tap-to-
      // claim picker (confirmed kept). Family instead now saves as
      // "explicitly everyone," so it shows the same overlapping-avatar
      // cluster manually picking all 4 would.
      memberId: familyPicked ? members[0]?.id : memberIds[0],
      memberIds: familyPicked ? members.map(m => m.id) : (memberIds.length > 1 ? memberIds : []),
      location: foldedLocation,
      notes: notes.trim() || undefined,
      alertCall,
      doctorName: category === 'Medical' ? (doctorName.trim() || undefined) : event.doctorName,
      coachName: category === 'Sports' ? (coachName.trim() || undefined) : event.coachName,
      subject: category === 'Study' ? (subject || undefined) : event.subject,
      pickupLocation: category === 'Ride' ? (pickupLocation.trim() || undefined) : event.pickupLocation,
      dropLocation: category === 'Ride' ? (dropLocation.trim() || undefined) : event.dropLocation,
      // driverName/driverId — Study's own separate drive-assignment pair
      // (see the state declarations above for why this isn't Ride's).
      driverName: category === 'Study' ? (driverName.trim() || undefined) : event.driverName,
      driverId: category === 'Study' ? driverId : event.driverId,
      ...(foldedHelper !== undefined ? { helper: foldedHelper } : {}),
      ...(foldedHelperId !== undefined ? { helperId: foldedHelperId } : {}),
    };

    // A brand-new repeat rule on an event that wasn't already a series —
    // same real generator EventFormModal.tsx's own submit() calls
    // (addRecurringEvent), materializing real rows rather than a single
    // updateEvent with a rule nothing else would ever read. The FIRST
    // occurrence is this same event (its own id is reused as the series
    // anchor by addRecurringEvent, matching how a phone-created series
    // anchors on its own first row), so it deletes this row and recreates
    // the whole run through the recurring path rather than trying to
    // retrofit a plain event into a series in place.
    if (repeatFreq !== 'none' && !event.seriesId) {
      deleteEvent(event.id);
      addRecurringEvent(
        { ...event, ...patch } as Omit<FamilyEvent, 'id'>,
        { frequency: repeatFreq, days: repeatFreq === 'weekly' ? (repeatDays.length ? repeatDays : [dateValue.getDay()]) : undefined },
      );
      onClose();
      return;
    }

    if (event.seriesId) {
      // Live-requested: "same action buttons similar to the mobile" —
      // EventFormModal.tsx's own applyScope prompt, verbatim: Just this
      // one / This and following / All events, calling the same real
      // updateEventScoped the phone does. Cancel does nothing, matching
      // the phone's own Alert.
      Alert.alert(
        'Repeating Event',
        'Apply this change to just this event, or the whole series?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Just this one', onPress: () => { updateEventScoped(event.id, patch, 'this'); onClose(); } },
          { text: 'This and following', onPress: () => { updateEventScoped(event.id, patch, 'following'); onClose(); } },
          { text: 'All events', onPress: () => { updateEventScoped(event.id, patch, 'all'); onClose(); } },
        ],
      );
      return;
    }

    updateEvent(event.id, patch);
    onClose();
  };

  const saveRestricted = () => {
    if (!canEditRestricted) return;
    const patch: Partial<FamilyEvent> = {};
    if (notes !== (event.notes ?? '')) patch.notes = notes.trim() || undefined;
    if (alertCall !== (event.alertCall ?? false)) patch.alertCall = alertCall;
    if (Object.keys(patch).length > 0) updateEvent(event.id, patch);
    onClose();
  };

  // Same trash-icon-in-header two-tap confirm KioskGroceryItemSheet's own
  // delete button uses (tap once to arm, tap again to confirm) — except a
  // recurring event's OWN third state (Just this one/This and following/
  // All events) still needs the real phone Alert, since a plain two-tap
  // confirm has nowhere to ask which occurrences.
  const handleDeletePress = () => {
    if (!canEditFull) return;
    if (event.seriesId) {
      Alert.alert(
        'Repeating Event',
        `Delete just this occurrence of "${event.title}", or the whole series?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Just this one', style: 'destructive', onPress: () => { deleteEventScoped(event.id, 'this'); onClose(); } },
          { text: 'This and following', style: 'destructive', onPress: () => { deleteEventScoped(event.id, 'following'); onClose(); } },
          { text: 'All events', style: 'destructive', onPress: () => { deleteEventScoped(event.id, 'all'); onClose(); } },
        ],
      );
      return;
    }
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    deleteEvent(event.id);
    onClose();
  };

  const input = kioskInputStyle(k);

  return (
    <KioskFormDrawer
      visible={!!event}
      variant="drawer"
      title={readOnly ? event.title : canEditRestricted ? 'Add a Note' : 'Edit Event'}
      subtitle={
        (readOnly || canEditRestricted)
          ? (readOnly ? 'Read-only' : 'Locked — only a note can be added')
          : undefined
      }
      accent={k.primary}
      Icon={readOnly || canEditRestricted ? Lock : CalendarDays}
      k={k}
      onClose={onClose}
      onSubmit={canEditFull ? saveFull : canEditRestricted ? saveRestricted : undefined}
      canSubmit={canEditFull ? !!title.trim() : canEditRestricted}
      submitLabel={canEditFull ? 'Save Changes' : 'Save Note'}
      headerRight={canEditFull ? (
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
          accessibilityLabel={confirmingDelete ? 'Confirm delete event' : `Delete event ${event.title}`}
          accessibilityHint={confirmingDelete ? 'Tap again to permanently remove this event' : undefined}
        >
          <Trash2 size={18} color={confirmingDelete ? k.onAccent : k.textMuted} />
          {confirmingDelete && (
            <Text style={[s.deleteConfirmText, { color: k.onAccent }]} numberOfLines={1}>Confirm?</Text>
          )}
        </Pressable>
      ) : undefined}
    >
      {readOnly ? (
        <>
          <DetailRow label="Time" value={event.time ? fmtTime(event.time) : 'All day'} k={k} />
          {!!event.location && <DetailRow label="Location" value={event.location} k={k} />}
          {!!event.notes && <DetailRow label="Notes" value={event.notes} k={k} />}
        </>
      ) : canEditRestricted ? (
        <>
          <DetailRow label="Time" value={event.time ? fmtTime(event.time) : 'All day'} k={k} />
          {!!event.location && <DetailRow label="Location" value={event.location} k={k} />}
          <View style={s.section}>
            <KioskFieldLabel k={k}>NOTES</KioskFieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[input, s.notesInput]}
              placeholderTextColor={k.textFaint}
            />
          </View>
          <View style={s.switchRow}>
            <Text style={[s.switchLabel, { color: k.text }]}>Call reminder</Text>
            <Switch value={alertCall} onValueChange={setAlertCall} trackColor={{ false: k.cardBorder, true: k.primary + '80' }} thumbColor={alertCall ? k.primary : k.textFaint} />
          </View>
        </>
      ) : (
        <>
          <View style={s.section}>
            <KioskFieldLabel k={k}>TITLE</KioskFieldLabel>
            <TextInput
              value={title}
              onChangeText={setTitle}
              accessibilityLabel="Event title"
              maxLength={120}
              style={input}
              placeholderTextColor={k.textFaint}
            />
          </View>
          {/* Live-requested: "check if anything is missing like assinments
              or pickers etc those also should match to mobile" — this file
              had no way to reassign an event to a different member at all.
              Same real MemberPicker EventFormModal.tsx's own "Who is this
              for" row uses, unmodified (its own prop contract is
              self-contained, unlike CategoryFields.tsx's 37+ coupled
              props — no rebuild needed to reuse it directly here). */}
          <View style={s.section}>
            <MemberPicker
              label="WHO IS THIS FOR"
              hint="Tap Family to assign everyone"
              selectedIds={memberIds}
              members={members}
              onToggle={(id) => { setFamilyPicked(false); setMemberIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]); }}
              onSelectAll={() => { setFamilyPicked(false); setMemberIds(prev => prev.length === members.length ? [] : members.map(m => m.id)); }}
              colors={colors}
              isDark={isDark}
              siblings={members.map(m => m.name)}
              showFamilyOption
              onClear={() => { setFamilyPicked(true); setMemberIds([]); }}
            />
          </View>
          <View style={s.section}>
            <KioskFieldLabel k={k}>DATE &amp; TIME</KioskFieldLabel>
            <View style={s.row}>
              <Pressable
                onPress={() => { setShowDatePicker(true); setShowTimePicker(false); }}
                style={[input, s.timeBtn, { flex: 3, backgroundColor: showDatePicker ? k.primary + '18' : k.well, borderColor: showDatePicker ? k.primary : k.cardBorder }]}
              >
                <Text style={[s.timeBtnText, { color: k.text }]}>{fmtDisplay(dateValue)}</Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowTimePicker(true); setShowDatePicker(false); }}
                style={[input, s.timeBtn, { flex: 2, backgroundColor: showTimePicker ? k.primary + '18' : k.well, borderColor: showTimePicker ? k.primary : k.cardBorder }]}
              >
                <Clock size={16} color={timeValue ? k.primary : k.textFaint} />
                <Text style={[s.timeBtnText, { color: timeValue ? k.text : k.textFaint }]}>
                  {timeValue ? fmtTime(`${String(timeValue.getHours()).padStart(2, '0')}:${String(timeValue.getMinutes()).padStart(2, '0')}`) : 'All day'}
                </Text>
              </Pressable>
            </View>
          </View>
          {/* Same shared PickerOverlay every mobile event form uses — one
              overlay, toggled by which button was tapped, not two separate
              bare pickers. */}
          <PickerOverlay
            showDate={showDatePicker} showTime={showTimePicker}
            value={showDatePicker ? dateValue : (timeValue ?? new Date())}
            onChangeDate={setDateValue}
            onChangeTime={setTimeValue}
            onDone={() => { setShowDatePicker(false); setShowTimePicker(false); }}
            accentColor={k.primary} colors={colors}
            dateLabel="📅 Event Date" timeLabel="🕐 Event Time"
          />
          {/* Live-requested: "match all fileds similar to the mobile app" —
              same 9-category picker EventFormModal.tsx's own CategoryFields
              switches on, using kioskCatAccent (promoted to exported so this
              file can share the same category→color mapping Schedule's own
              cards use, rather than inventing a second one). */}
          <View style={s.section}>
            <KioskFieldLabel k={k}>CATEGORY</KioskFieldLabel>
            <View style={s.pillWrap}>
              {CATEGORIES.map(cat => (
                <KioskPill
                  key={cat}
                  label={cat}
                  selected={category === cat}
                  onPress={() => setCategory(cat)}
                  accent={kioskCatAccent(cat, k).fg}
                  k={k}
                />
              ))}
            </View>
          </View>
          {category === 'Medical' && (
            <View style={s.section}>
              <KioskFieldLabel k={k}>DOCTOR</KioskFieldLabel>
              <TextInput value={doctorName} onChangeText={setDoctorName} style={input} placeholderTextColor={k.textFaint} placeholder="Who's the appointment with?" />
              <KioskFieldLabel k={k}>CLINIC</KioskFieldLabel>
              <LocationAutocompleteInput value={clinicLocation} onChangeText={setClinicLocation} colors={colors} accent={k.primary} placeholder="Clinic or office address" />
              <HelperAssignmentSection
                category={category} catColor={kioskCatAccent(category, k).fg} colors={colors} isDark={isDark} siblings={siblings} adults={adults}
                helperId={helperId} handleHelperSelect={handleHelperSelect}
                helperName={helperName} setHelperName={setHelperName} setHelperId={setHelperId}
              />
            </View>
          )}
          {category === 'Sports' && (
            <View style={s.section}>
              <KioskFieldLabel k={k}>COACH</KioskFieldLabel>
              <TextInput value={coachName} onChangeText={setCoachName} style={input} placeholderTextColor={k.textFaint} placeholder="Coach's name" />
              <KioskFieldLabel k={k}>VENUE</KioskFieldLabel>
              <LocationAutocompleteInput value={venueLocation} onChangeText={setVenueLocation} colors={colors} accent={k.primary} placeholder="Field, gym, or rink" />
              <HelperAssignmentSection
                category={category} catColor={kioskCatAccent(category, k).fg} colors={colors} isDark={isDark} siblings={siblings} adults={adults}
                helperId={helperId} handleHelperSelect={handleHelperSelect}
                helperName={helperName} setHelperName={setHelperName} setHelperId={setHelperId}
              />
            </View>
          )}
          {category === 'Study' && (
            <View style={s.section}>
              <KioskFieldLabel k={k}>SUBJECT</KioskFieldLabel>
              <View style={s.pillWrap}>
                {SUBJECTS.map(subj => (
                  <KioskPill key={subj} label={subj} selected={subject === subj} onPress={() => setSubject(p => p === subj ? '' : subj)} accent={k.blue} k={k} />
                ))}
              </View>
              <KioskFieldLabel k={k}>TUTOR</KioskFieldLabel>
              <TextInput value={tutorName} onChangeText={setTutorName} style={input} placeholderTextColor={k.textFaint} placeholder="Tutor's name" />
              <View style={s.switchRow}>
                <Text style={[s.switchLabel, { color: k.text }]}>Online session</Text>
                <Switch value={isOnline} onValueChange={setIsOnline} trackColor={{ false: k.cardBorder, true: k.primary + '80' }} thumbColor={isOnline ? k.primary : k.textFaint} />
              </View>
              {!isOnline && (
                <>
                  <KioskFieldLabel k={k}>VENUE</KioskFieldLabel>
                  <LocationAutocompleteInput value={venueLocation} onChangeText={setVenueLocation} colors={colors} accent={k.primary} placeholder="Where's the session?" />
                </>
              )}
              {/* Study's OWN separate "who's driving to the session" pair —
                  real driverName/driverId columns, distinct from `helper`
                  (the Tutor field above already owns that). Same real
                  MemberPicker CategoryFields.tsx's own "🚗 Drive Assignment"
                  row uses for this exact category (confirmed by reading
                  that file in full — this block only ever renders inside
                  Study there, never Ride's). */}
              <MemberPicker
                label="DRIVE ASSIGNMENT"
                selectedIds={driverId ? [driverId] : []}
                members={adults}
                onToggle={handleDriverSelect}
                colors={colors} isDark={isDark} siblings={siblings}
              />
              {!driverId && (
                <TextInput value={driverName} onChangeText={t => { setDriverName(t); if (!t) setDriverId(undefined); }} style={input} placeholderTextColor={k.textFaint} placeholder="Or type a name (e.g. external driver)" />
              )}
            </View>
          )}
          {category === 'Ride' && (
            <View style={s.section}>
              <KioskFieldLabel k={k}>PICKUP FROM</KioskFieldLabel>
              <LocationAutocompleteInput value={pickupLocation} onChangeText={setPickupLocation} colors={colors} accent={k.primary} placeholder="Pickup address" />
              <KioskFieldLabel k={k}>DROP TO</KioskFieldLabel>
              <LocationAutocompleteInput value={dropLocation} onChangeText={setDropLocation} colors={colors} accent={k.primary} placeholder="Drop-off address" />
              <HelperAssignmentSection
                category={category} catColor={kioskCatAccent(category, k).fg} colors={colors} isDark={isDark} siblings={siblings} adults={adults}
                helperId={helperId} handleHelperSelect={handleHelperSelect}
                helperName={helperName} setHelperName={setHelperName} setHelperId={setHelperId}
              />
            </View>
          )}
          {/* Live-requested: "all add modify forms also should present and
              recurence sheet also should be there" — same real shared
              RecurrenceControl EventFormModal.tsx's own "🔁 Repeats" block
              uses (also shared with the Chores form), same frequency
              vocabulary. Editing an event that's already part of a series
              shows its current rule; changing it here only takes effect
              once Save is tapped, same as every other field on this form. */}
          <View style={s.section}>
            <KioskFieldLabel k={k}>REPEATS</KioskFieldLabel>
            <RecurrenceControl
              freq={repeatFreq}
              setFreq={setRepeatFreq}
              options={[
                { key: 'none', label: 'One-time' },
                { key: 'daily', label: 'Daily' },
                { key: 'weekly', label: 'Weekly' },
                { key: 'monthly', label: 'Monthly' },
              ]}
              days={repeatDays}
              setDays={setRepeatDays}
              accentColor={k.primary}
              colors={colors}
              isDark={isDark}
            />
          </View>
          {/* Only for categories that don't already have their own
              location-shaped field above — Medical/Sports/Study/Ride fold
              into `location` from their OWN fields on save (see saveFull's
              foldedLocation), so showing this generic box for them too
              would silently be ignored, same gap EventFormModal.tsx avoids
              by only rendering its own generalLocation field in this same
              category set. */}
          {(category === 'Event' || category === 'Birthday' || category === 'Work' || category === 'Errand' || category === 'Other') && (
            <View style={s.section}>
              <KioskFieldLabel k={k}>LOCATION</KioskFieldLabel>
              <TextInput
                value={location}
                onChangeText={setLocation}
                style={input}
                placeholderTextColor={k.textFaint}
              />
            </View>
          )}
          <View style={s.section}>
            <KioskFieldLabel k={k}>NOTES</KioskFieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[input, s.notesInput]}
              placeholderTextColor={k.textFaint}
            />
          </View>
          <View style={s.switchRow}>
            <Text style={[s.switchLabel, { color: k.text }]}>Call reminder</Text>
            <Switch value={alertCall} onValueChange={setAlertCall} trackColor={{ false: k.cardBorder, true: k.primary + '80' }} thumbColor={alertCall ? k.primary : k.textFaint} />
          </View>
        </>
      )}
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
  row: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  timeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs },
  timeBtnText: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  notesInput: { minHeight: 88, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  detailValue: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
  },
  deleteConfirmText: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
});
