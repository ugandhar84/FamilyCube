/**
 * KidRequestModal — a kid's own request flow, separate from AddEventModal.
 *
 * Built from a deep-research UX redesign (see the redesign report/commit
 * history) after three rounds of patching the shared adult form's kid
 * branch kept producing the same "still confusing" feedback. Diagnosis:
 * the kid was seeing an adult scheduling tool (Repeats, All-day, Call-to-
 * remind, Coach/Venue/Kit-reminder fields) with two toggles renamed — the
 * fix isn't field placement, it's a genuinely separate, purpose-built flow
 * where every field is opt-in to the kid's surface, not opt-out from the
 * parent's. Sharing one component meant every new parent field silently
 * appeared for a kid unless someone remembered to gate it; three rounds of
 * evidence said that doesn't hold.
 *
 * Three steps, ~8 taps for the simplest case ("I have practice, take me
 * there"), ~13 for the fullest (+ location, both ways, a note):
 *   1. What do you need? — category, as a card grid, not a chip row.
 *   2. Tell us about it — title, when, optional where. No Repeats/All-day/
 *      Call-reminder/category-specific adult fields (Coach, Venue, Kit
 *      reminder, Subject, Tutor name, Online session) — a parent editing
 *      the request afterward has the full form for any of that.
 *   3. Do you need a lift? — ONE question, four plain-language cards
 *      (Take me there / Bring me home / Both ways / I'm all set), not two
 *      nested toggles. "Take me there"/"I'm all set" submit immediately;
 *      "Bring me home"/"Both ways" ask one more question (pickup time, and
 *      for both-ways, same-day vs a different day) before submitting.
 *
 * "Bring me home" and "Both ways" both ask for a real pickup TIME (and, for
 * both-ways, optionally a different pickup DATE — sleepaway trip, multi-day
 * camp) right after the ride-choice card, pre-filled at drop-off + 90
 * minutes as a starting guess a kid can adjust. Earlier drafts deliberately
 * left this to the parent's own +90min stepper at approval time (see
 * PickupTimeStepper in RideRequestCard/RideRequiredEventCard) on the theory
 * that a kid rarely knows precisely when practice ends — reversed on
 * explicit product direction: a kid's own answer beats a parent's blind
 * guess, and the stepper still exists as a one-tap adjustment if plans
 * change before the ride is confirmed.
 *
 * Fixes a real, previously-shipping bug in the same pass: the old kid path
 * never set `rideRequired: true`, so a kid's Sports/Study/etc ride request
 * always routed to RideRequestCard (the category:'Ride' card, reading
 * helper/helperStatus) instead of RideRequiredEventCard (the correct card
 * for this shape, reading driverName/driverStatus) — writing to fields
 * nothing downstream read correctly, and forking a both-ways request
 * orphaned a second event with the wrong category. `rideRequired: true`
 * here is what actually fixes that, not just a copy/layout change.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Switch, Alert } from 'react-native';
import { Mic, ChevronLeft, X, Check, Phone, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useVoiceIntake } from '@/lib/hooks/useVoiceIntake';
import PickerOverlay from './components/eventForm/PickerOverlay';
import { f } from './components/eventForm/styles';
import { SUGGESTIONS, localDateStr, fmtTime as fmtTimeVal, fmtDisplay, fmtTimeDisplay } from './components/eventForm/types';
import { RIDE_PICKUP_TIME_UNKNOWN, parseRideMeta } from '../hub/parent/rideLegs';
import type { EventCategory } from './components/eventForm/types';
import type { FamilyEvent, EventType } from '@/store/eventStore';

type RideChoice = 'none' | 'dropoff' | 'pickup' | 'both';

const KID_CATEGORIES: { key: EventCategory; emoji: string; label: string; sub: string; color: string }[] = [
  { key: 'Sports',   emoji: '🏅', label: 'Sports',    sub: 'practice, game',   color: '#F59E0B' },
  { key: 'Study',    emoji: '📚', label: 'Study',     sub: 'class, tutor',     color: '#3B82F6' },
  { key: 'Event',    emoji: '🎉', label: 'Hang out',  sub: 'party, friend',    color: '#6C5CE7' },
  { key: 'Birthday', emoji: '🎂', label: 'Birthday',  sub: 'a party',          color: '#F59E0B' },
];
const OTHER_CATEGORY: { key: EventCategory; emoji: string; label: string; color: string } =
  { key: 'Other', emoji: '✨', label: 'Something else', color: '#64748B' };

// Loose AI-domain → kid category mapping. The AI returns a responsibility
// domain string (transport/medical/household/etc), not our EventCategory
// enum directly — this is a best-effort guess the kid reviews and can
// still change with one tap in Step 1, so it doesn't need to be exact.
function guessCategoryFromDomain(domain: string | undefined, title: string): EventCategory {
  const t = `${domain ?? ''} ${title}`.toLowerCase();
  if (/sport|practice|game|match|training|soccer|basketball|swim|tennis|cricket/.test(t)) return 'Sports';
  if (/stud|class|tutor|homework|school|lesson/.test(t)) return 'Study';
  if (/birthday|party/.test(t)) return 'Birthday';
  return 'Event';
}

export function KidRequestModal({ visible, onClose, activeMemberId, editEvent }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
  // A kid long-pressing their own still-pending request previously fell
  // through to the shared adult EditEventModal — the same form this whole
  // component exists to replace, dead isKid branches and all (long-press
  // was wired unconditionally for every role, with no gate at all). Now
  // routed back into this component instead, in edit mode: seeds state
  // from the existing event, lands on Step 2 for review, and writes via
  // updateEvent instead of addEvent on submit. Only ever offered for a
  // kid's own event while it's still approvalPending — once a parent has
  // acted on it, editing goes through the parent's own surfaces instead.
  editEvent?: FamilyEvent;
}) {
  const { colors, isDark } = useTheme();
  const { addEvent, updateEvent, deleteEvent } = useEventStore();
  const members = useFamilyStore(s => s.members);
  const active = members.find(m => m.id === activeMemberId);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);
  const isEditing = !!editEvent;
  const roleLabel = active?.role ?? 'unknown';
  const activeMemberName = active?.name ?? '';

  const [step, setStep] = useState<1 | 2 | 3>(editEvent ? 2 : 1);
  const [category, setCategory] = useState<EventCategory | null>((editEvent?.category as EventCategory) ?? null);
  const [title, setTitle] = useState(editEvent?.title ?? '');
  const [eventDate, setEventDate] = useState<Date>(() => {
    if (editEvent) {
      const [y, mo, d] = editEvent.date.split('-').map(Number);
      const dt = new Date(y, mo - 1, d);
      if (editEvent.time) { const [h, mi] = editEvent.time.split(':').map(Number); dt.setHours(h, mi); }
      return dt;
    }
    const d = new Date(); const m = d.getMinutes();
    d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1);
    return d;
  });
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);
  const [location, setLocation] = useState(editEvent?.location ?? '');
  const [notes, setNotes] = useState(editEvent?.notes ?? '');
  // Siblings going to the same place — the requesting kid can add them
  // directly (parent still approves the ride itself via the normal
  // approvalPending flow; no separate approval step for the sibling-join,
  // per explicit product direction). Writes into memberIds alongside the
  // requesting kid's own memberId.
  const [withSiblings, setWithSiblings] = useState<string[]>(editEvent?.memberIds?.filter(id => id !== activeMemberId) ?? []);
  const siblings = members.filter(m => m.id !== activeMemberId && (m.role === 'kid' || m.role === 'teen'));
  // Call-style reminder (rings via CallKit at event time, 5, or 10 min
  // before) — full infrastructure already exists (alertCall/
  // alertCallLeadMinutes on FamilyEvent, used by the adult form) but was
  // never exposed here, so a kid had no way to turn it on for their own
  // request. Kept to one toggle, no lead-time picker — defaults to
  // on-time, matching the kid-form's "one clear answer" philosophy rather
  // than the adult form's 3-way picker.
  const [alertCall, setAlertCall] = useState(editEvent?.alertCall ?? false);
  // Seed the existing ride choice + pickup date/time from editEvent so
  // re-opening this in edit mode doesn't silently blank out what was
  // already answered — previously editEvent never fed into these fields at
  // all, so Step 3 always looked unanswered even when a kid was just
  // revising the title/location of an already-fully-specified request.
  const editRideMeta = editEvent ? parseRideMeta(editEvent.returnTime, editEvent.date) : null;
  const [rideChoice, setRideChoice] = useState<RideChoice | null>(() => {
    if (!editEvent) return null;
    if (!editEvent.rideRequired) return 'none';
    if (editRideMeta?.isBothWays) return 'both';
    if (editRideMeta?.isPickup) return 'pickup';
    if (editRideMeta?.isDropoff) return 'dropoff';
    return null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // "Bring me home" and "Both ways" both need a pickup TIME before they can
  // submit — previously left entirely to the parent to guess (+90min
  // stepper at approval time), but a kid usually DOES know roughly when
  // practice/class ends, and a real answer beats a guess. "Both ways" also
  // needs a same-day-vs-different-day answer first (sleepaway trip, multi-
  // day camp) — the app previously just assumed same-day, silently losing
  // a multi-day pickup date entirely.
  const [askingPickupTime, setAskingPickupTime] = useState(false);
  const [pickupDate, setPickupDate] = useState<Date | null>(() => {
    if (editRideMeta?.pickupDate && editRideMeta.pickupDate !== editEvent?.date) {
      const [y, mo, d] = editRideMeta.pickupDate.split('-').map(Number);
      return new Date(y, mo - 1, d);
    }
    return null;
  });
  const [pickupTime, setPickupTime] = useState<Date | null>(() => {
    if (editRideMeta?.pickupTime) {
      const d = new Date();
      const [h, mi] = editRideMeta.pickupTime.split(':').map(Number);
      d.setHours(h, mi, 0, 0);
      return d;
    }
    return null;
  });
  const [showPickupDatePick, setShowPickupDatePick] = useState(false);
  const [showPickupTimePick, setShowPickupTimePick] = useState(true);

  // ── Mic / voice intake — in the header, not a separate chooser screen ──
  // Live transcript shown inline, right where the mic was tapped, so the
  // kid can see what's being captured as they speak. On parse, fills
  // title/category/date and jumps straight to Step 2 for review — it
  // never guesses the ride answer, that's still always an explicit tap in
  // Step 3 (a ride request is the one field too consequential to guess).
  const [micOpen, setMicOpen] = useState(false);
  const voice = useVoiceIntake((result) => {
    if (result.task) {
      setTitle(result.task.title);
      setCategory(guessCategoryFromDomain(result.task.category, result.task.title));
      if (result.task.startAt) setEventDate(new Date(result.task.startAt));
    }
    setMicOpen(false);
    setStep(2);
  });

  const reset = () => {
    if (editEvent) return; // editing closes via onClose directly, no blank-state flash needed
    setStep(1); setCategory(null); setTitle(''); setLocation(''); setNotes('');
    setRideChoice(null); setDone(false); setMicOpen(false); voice.cancel();
    setAskingPickupTime(false);
    setPickupDate(null); setPickupTime(null); setShowPickupDatePick(false);
    setAlertCall(false); setWithSiblings([]);
  };
  const close = () => { reset(); onClose(); };

  const catMeta = category ? [...KID_CATEGORIES, OTHER_CATEGORY].find(c => c.key === category) : null;
  const accentColor = catMeta?.color ?? BRAND.purple;
  const canSubmitStep2 = title.trim().length > 0;

  const submit = async (choice: RideChoice) => {
    if (!active || !category) return;
    setSubmitting(true);
    setRideChoice(choice);

    // Same RIDE: encoding parseRideMeta (features/hub/parent/rideLegs.ts)
    // already decodes. The kid now supplies a real pickup TIME whenever
    // there's a pickup leg ('pickup' or 'both') — a real answer beats the
    // parent's old +90min guess (PickupTimeStepper is now an adjustment,
    // not the primary source). Falls back to the unknown-time sentinel
    // only if somehow no time was captured (shouldn't happen — the picker
    // pre-fills a default the moment its screen opens).
    const pickupDateStr = pickupDate ? localDateStr(pickupDate) : localDateStr(eventDate);
    const pickupTimeStr = pickupTime ? fmtTimeVal(pickupTime) : undefined;
    const returnTime = choice === 'both'
      ? `RIDE:both:${pickupDateStr}T${pickupTimeStr ?? RIDE_PICKUP_TIME_UNKNOWN}`
      : choice === 'pickup'
        ? `RIDE:pickup:${pickupDateStr}T${pickupTimeStr ?? RIDE_PICKUP_TIME_UNKNOWN}`
        : choice === 'dropoff' ? 'RIDE:dropoff' : undefined;

    if (isEditing && editEvent) {
      // A parent may have already acted (driverName/driverStatus set) by
      // the time a kid comes back to tweak wording — this only re-touches
      // fields the kid actually controls (title/when/where/notes/ride
      // choice); it deliberately does NOT reset an already-confirmed
      // driver back to pending just because the kid re-saved the form.
      const rideFieldsChanged = editEvent.rideRequired !== (choice !== 'none') || editEvent.returnTime !== returnTime;
      updateEvent(editEvent.id, {
        title: title.trim(),
        date: localDateStr(eventDate),
        time: fmtTimeVal(eventDate),
        category,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        returnTime,
        rideRequired: choice !== 'none',
        memberIds: withSiblings.length > 0 ? [activeMemberId, ...withSiblings] : undefined,
        alertCall,
        alertCallLeadMinutes: 0,
        ...(rideFieldsChanged && !editEvent.driverName
          ? { driverStatus: choice !== 'none' ? 'pending' as const : undefined }
          : {}),
      });
      setSubmitting(false);
      setDone(true);
      setTimeout(close, 1200);
      return;
    }

    const eventInput: Omit<FamilyEvent, 'id'> = {
      title: title.trim(),
      date: localDateStr(eventDate),
      time: fmtTimeVal(eventDate),
      type: (category === 'Birthday' ? 'birthday' : 'event') as EventType,
      category,
      allDay: false,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      returnTime,
      memberId: activeMemberId,
      memberIds: withSiblings.length > 0 ? [activeMemberId, ...withSiblings] : undefined,
      helperRequestedBy: active.name,
      approvalPending: true,
      conflict: false,
      color: accentColor,
      alertCall,
      alertCallLeadMinutes: 0,
      // The actual D5 fix — every kid ride request now correctly flags
      // rideRequired, routing it to RideRequiredEventCard (which reads
      // driverName/driverStatus) instead of RideRequestCard (which reads
      // helper/helperStatus and is meant only for category:'Ride' events).
      rideRequired: choice !== 'none',
      driverName: undefined,
      driverStatus: choice !== 'none' ? 'pending' : undefined,
    };

    addEvent(eventInput);
    setSubmitting(false);
    setDone(true);
    setTimeout(close, 1600);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          <View style={[f.sheet, { backgroundColor: colors.card, minHeight: '55%' }]}>
            <View style={[f.handle, { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }]} />

            {/* ── Header: back, progress dots, mic, close ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <TouchableOpacity
                onPress={() => {
                  console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "back" on KidRequestModal step=${step} askingPickupTime=${askingPickupTime} [features/calendar/KidRequestModal.tsx:311]`);
                  if (done) return;
                  if (askingPickupTime) { setAskingPickupTime(false); return; }
                  if (step > 1) setStep((step - 1) as 1 | 2);
                  else close();
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ padding: 4 }}>
                <ChevronLeft size={22} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                {!done && [1, 2, 3].map(n => (
                  <View key={n} style={{ width: 8, height: 8, borderRadius: 4,
                    backgroundColor: n === step ? accentColor : colors.border }} />
                ))}
              </View>
              {/* Mic — in the form's own header, not a separate pre-step
                  screen (explicit user preference). Available on every
                  step; parsing always lands the kid on Step 2 to review. */}
              <TouchableOpacity
                onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "mic" on KidRequestModal [features/calendar/KidRequestModal.tsx:331]`); setMicOpen(true); voice.start(); }}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={{ padding: 6, marginRight: 4, borderRadius: 16,
                  backgroundColor: micOpen ? BRAND.purple + '20' : 'transparent' }}>
                <Mic size={20} color={micOpen ? BRAND.purple : colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Close" on KidRequestModal [features/calendar/KidRequestModal.tsx:337]`); close(); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Live transcript box — shown inline right under the header
                the moment the mic is tapped, so the kid sees what's being
                captured as they speak. ── */}
            {micOpen && (
              <View style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1.5, borderColor: BRAND.purple + '50',
                backgroundColor: isDark ? BRAND.purple + '14' : '#F5F0FC', padding: 14, gap: 10 }}>
                {voice.state === 'listening' && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <ActivityIndicator color={BRAND.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>Listening… 🎙️</Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 4 }}>
                        {voice.liveTranscript || 'Try: "Soccer practice Saturday at 9, I need a ride"'}
                      </Text>
                    </View>
                  </View>
                )}
                {voice.state === 'processing' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator color={BRAND.purple} />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Figuring it out…</Text>
                  </View>
                )}
                {voice.state === 'error' && voice.error && (
                  <Text style={{ fontSize: TYPO.label, color: colors.danger }}>{voice.error}</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {voice.state === 'listening' && (
                    <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Done Speaking" on KidRequestModal mic transcript [features/calendar/KidRequestModal.tsx:368]`); voice.stop(); }}
                      style={{ flex: 1, backgroundColor: BRAND.purple, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Done Speaking</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Cancel" on KidRequestModal mic transcript [features/calendar/KidRequestModal.tsx:373]`); voice.cancel(); setMicOpen(false); }}
                    style={{ flex: voice.state === 'listening' ? undefined : 1, paddingVertical: 10, paddingHorizontal: 16,
                      borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {done ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success + '20',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={32} color={colors.success} />
                </View>
                <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>
                  Sent to {parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}!
                </Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 20 }}>
                  {rideChoice && rideChoice !== 'none' ? "They'll pick who drives you." : "They'll take a look and confirm."}
                </Text>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {step === 1 && (
                  <View style={{ gap: 14 }}>
                    <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 }}>
                      What do you need? 🙋
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {KID_CATEGORIES.map(c => (
                        <TouchableOpacity key={c.key} onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${c.label}" for "what do you need" on KidRequestModal [features/calendar/KidRequestModal.tsx:404]`); setCategory(c.key); setStep(2); }}
                          style={{ width: '47%', alignItems: 'center', gap: 6, paddingVertical: 22, borderRadius: 18,
                            backgroundColor: c.color + '14', borderWidth: 2, borderColor: c.color + '40' }}>
                          <Text style={{ fontSize: 32 }}>{c.emoji}</Text>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{c.label}</Text>
                          <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{c.sub}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${OTHER_CATEGORY.label}" for "what do you need" on KidRequestModal [features/calendar/KidRequestModal.tsx:413]`); setCategory(OTHER_CATEGORY.key); setStep(2); }}
                      style={{ alignItems: 'center', paddingVertical: 16, borderRadius: 16,
                        backgroundColor: OTHER_CATEGORY.color + '12', borderWidth: 2, borderColor: OTHER_CATEGORY.color + '30',
                        flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 20 }}>{OTHER_CATEGORY.emoji}</Text>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{OTHER_CATEGORY.label}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {step === 2 && catMeta && (
                  <View style={{ gap: 16 }}>
                    <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Change" category chip on KidRequestModal → back to Step 1 [features/calendar/KidRequestModal.tsx:425]`); setStep(1); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                        backgroundColor: accentColor + '14', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ fontSize: 16 }}>{catMeta.emoji}</Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: accentColor }}>{catMeta.label}</Text>
                      <Text style={{ fontSize: TYPO.micro, color: accentColor, opacity: 0.7 }}>Change</Text>
                    </TouchableOpacity>

                    <View>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>What is it?</Text>
                      <TextInput
                        style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface,
                          borderColor: title.trim() ? colors.borderMed : accentColor + '60' }]}
                        placeholder="e.g. Cricket practice"
                        placeholderTextColor={colors.textTertiary}
                        value={title} onChangeText={setTitle} returnKeyType="next"
                        onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} field="What is it" on "KidRequestModal" newValue=${title} [features/calendar/KidRequestModal.tsx:440]`)}
                      />
                      {category && category !== 'Other' && SUGGESTIONS[category]?.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {SUGGESTIONS[category].slice(0, 4).map((s: { title: string; hint: string }, i: number) => (
                              <TouchableOpacity key={i} onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${s.title}" for "title suggestion" on KidRequestModal [features/calendar/KidRequestModal.tsx:446]`); setTitle(s.title); }}
                                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                                  backgroundColor: title === s.title ? accentColor + '20' : (isDark ? colors.surface : colors.inputBg),
                                  borderWidth: 1.5, borderColor: title === s.title ? accentColor : colors.border }}>
                                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: title === s.title ? accentColor : colors.textPrimary }}>
                                  {s.title}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      )}
                    </View>

                    <View>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>When?</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                          style={[f.dateBtn, { flex: 3, backgroundColor: showDatePick ? accentColor + '20' : colors.surface, borderColor: showDatePick ? accentColor : colors.border }]}
                          onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Date" field on KidRequestModal [features/calendar/KidRequestModal.tsx:465]`); setShowDatePick(p => !p); setShowTimePick(false); }}>
                          <Text style={{ fontSize: 13 }}>📅</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showDatePick ? accentColor : colors.textPrimary }}>
                            {fmtDisplay(eventDate)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[f.dateBtn, { flex: 2, backgroundColor: showTimePick ? accentColor + '20' : colors.surface, borderColor: showTimePick ? accentColor : colors.border }]}
                          onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Time" field on KidRequestModal [features/calendar/KidRequestModal.tsx:473]`); setShowTimePick(p => !p); setShowDatePick(false); }}>
                          <Text style={{ fontSize: 13 }}>🕐</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showTimePick ? accentColor : colors.textPrimary }}>
                            {fmtTimeDisplay(eventDate)}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <PickerOverlay
                        showDate={showDatePick} showTime={showTimePick}
                        value={eventDate}
                        onChangeDate={d => { const m = new Date(d); m.setHours(eventDate.getHours(), eventDate.getMinutes()); setEventDate(m); }}
                        onChangeTime={d => { const m = new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setEventDate(m); }}
                        onDone={() => { setShowDatePick(false); setShowTimePick(false); }}
                        accentColor={accentColor} colors={colors}
                        minimumDate={new Date()}
                      />
                    </View>

                    <View>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Where? (optional)</Text>
                      <TextInput
                        style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                        placeholder="e.g. Riverside Park"
                        placeholderTextColor={colors.textTertiary}
                        value={location} onChangeText={setLocation}
                        onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} field="Where" on "KidRequestModal" newValue=${location} [features/calendar/KidRequestModal.tsx:497]`)}
                      />
                    </View>

                    {siblings.length > 0 && (
                      <View>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                          Going with a sibling? (optional)
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {siblings.map(sib => {
                            const isOn = withSiblings.includes(sib.id);
                            return (
                              <TouchableOpacity key={sib.id}
                                onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${sib.name}" (id=${sib.id}) for "going with a sibling" on KidRequestModal newValue=${!isOn} [features/calendar/KidRequestModal.tsx:511]`); setWithSiblings(prev => isOn ? prev.filter(id => id !== sib.id) : [...prev, sib.id]); }}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
                                  borderRadius: 999, borderWidth: 1.5,
                                  backgroundColor: isOn ? accentColor : (isDark ? colors.surface : '#F9FAFB'),
                                  borderColor: isOn ? accentColor : colors.border }}>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: isOn ? '#fff' : colors.textPrimary }}>
                                  {sib.name.split(' ')[0]}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Phone size={16} color={alertCall ? accentColor : colors.textTertiary} />
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Call to remind me</Text>
                      </View>
                      <Switch value={alertCall} onValueChange={(v) => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} toggled "Call to remind me" on KidRequestModal newValue=${v} [features/calendar/KidRequestModal.tsx:532]`); setAlertCall(v); }}
                        trackColor={{ false: colors.border, true: accentColor + '80' }}
                        thumbColor={alertCall ? accentColor : colors.textTertiary}
                      />
                    </View>

                    <TouchableOpacity
                      disabled={!canSubmitStep2}
                      onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Next" on KidRequestModal Step 2 → Step 3 [features/calendar/KidRequestModal.tsx:540]`); setStep(3); }}
                      style={{ backgroundColor: canSubmitStep2 ? accentColor : colors.border, borderRadius: 14,
                        paddingVertical: 14, alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>Next →</Text>
                    </TouchableOpacity>

                    {/* Withdraw — a kid reaching this screen in edit mode
                        (via long-press on their own still-pending request)
                        previously had no delete affordance at all once the
                        Schedule tab's Month/Week/Agenda views were opened up
                        to kids: those views never had SwipeableEventCard's
                        swipe-delete wired in, only the old kid-only fallback
                        timeline did, and that's no longer where a kid with a
                        real view-mode toolbar actually lands. */}
                    {isEditing && editEvent && (
                      <TouchableOpacity
                        onPress={() => {
                          console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Withdraw this request" on "${editEvent.title}" (id=${editEvent.id}) [features/calendar/KidRequestModal.tsx:556]`);
                          Alert.alert('Withdraw Request', `Withdraw "${editEvent.title}"?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Withdraw', style: 'destructive', onPress: () => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} confirmed "Withdraw" on "${editEvent.title}" (id=${editEvent.id}) → deleteEvent [features/calendar/KidRequestModal.tsx:559]`); deleteEvent(editEvent.id); close(); } },
                          ]);
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
                        <Trash2 size={14} color={colors.danger} />
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Withdraw this request</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {step === 3 && !askingPickupTime && (
                  <View style={{ gap: 14 }}>
                    <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 }}>
                      Do you need a lift? 🚗
                    </Text>

                    {[
                      { key: 'dropoff' as const, icon: '🚗➡️', label: 'Yes, take me there', sub: "I'll find my own way back" },
                      { key: 'pickup'  as const, icon: '⬅️🚗', label: 'Yes, bring me home', sub: 'I can get there myself' },
                      { key: 'both'    as const, icon: '🔄',   label: 'Both ways', sub: 'There and back' },
                      { key: 'none'    as const, icon: '🚶',   label: "No, I'm all set", sub: undefined },
                    ].map(opt => {
                      const isCurrent = isEditing && rideChoice === opt.key;
                      // Editing shows the actual current details right on
                      // the card — drop-off time is always eventDate's own
                      // time; pickup time/date only apply to 'pickup'/'both'
                      // — previously only visible after tapping back into
                      // the sub-screen, so a kid reviewing their own request
                      // couldn't tell what was already set at a glance.
                      const detailLine =
                        opt.key === 'dropoff' ? `Drop-off at ${fmtTimeDisplay(eventDate)}`
                        : opt.key === 'pickup' && pickupTime ? `Pickup at ${fmtTimeDisplay(pickupTime)}${pickupDate ? ` · ${fmtDisplay(pickupDate)}` : ''}`
                        : opt.key === 'both' && pickupTime ? `Drop-off ${fmtTimeDisplay(eventDate)} · Pickup ${fmtTimeDisplay(pickupTime)}${pickupDate ? ` (${fmtDisplay(pickupDate)})` : ''}`
                        : undefined;
                      return (
                      <TouchableOpacity key={opt.key} disabled={submitting}
                        onPress={() => {
                          console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${opt.label}" for "ride choice" on KidRequestModal [features/calendar/KidRequestModal.tsx:596]`);
                          setRideChoice(opt.key);
                          if (opt.key === 'pickup' || opt.key === 'both') {
                            if (!pickupTime) { const d = new Date(eventDate); d.setMinutes(d.getMinutes() + 90); setPickupTime(d); }
                            if (opt.key === 'pickup') setPickupDate(null);
                            setAskingPickupTime(true);
                            return;
                          }
                          console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "${opt.label}" → submit(${opt.key}) [features/calendar/KidRequestModal.tsx:604]`);
                          submit(opt.key);
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
                          backgroundColor: isCurrent ? accentColor + '14' : (isDark ? colors.surface : '#F9FAFB'),
                          borderWidth: 1.5, borderColor: isCurrent ? accentColor : colors.border }}>
                        <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{opt.label}</Text>
                          <Text style={{ fontSize: TYPO.micro, color: detailLine ? accentColor : colors.textTertiary, marginTop: 1, fontWeight: detailLine ? '700' : '400' }}>
                            {detailLine ?? opt.sub}
                          </Text>
                        </View>
                        {submitting && rideChoice === opt.key && <ActivityIndicator color={accentColor} />}
                      </TouchableOpacity>
                      );
                    })}

                    <View>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                        Anything else? (optional)
                      </Text>
                      <TextInput
                        style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                        placeholder="e.g. Practice finishes at 11"
                        placeholderTextColor={colors.textTertiary}
                        value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
                        onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} field="Anything else" on "KidRequestModal Step 3" newValue=${notes} [features/calendar/KidRequestModal.tsx:637]`)}
                        multiline numberOfLines={2} textAlignVertical="top"
                      />
                    </View>
                  </View>
                )}

                {/* One screen for pickup date+time, not three sequential
                    taps — same-day/different-day, the date picker (only
                    when relevant), and the time picker all live together
                    so a kid sees the whole "when's the pickup" question at
                    once instead of being walked through it step by step. */}
                {step === 3 && askingPickupTime && (
                  <View style={{ gap: 14 }}>
                    <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 }}>
                      When's the pickup? 🕐
                    </Text>

                    {rideChoice === 'both' && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "Same day" for "pickup day" on KidRequestModal [features/calendar/KidRequestModal.tsx:658]`); setPickupDate(null); }}
                          style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 14,
                            backgroundColor: !pickupDate ? accentColor + '14' : (isDark ? colors.surface : '#F9FAFB'),
                            borderWidth: 1.5, borderColor: !pickupDate ? accentColor : colors.border }}>
                          <Text style={{ fontSize: 18 }}>🔁</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary, marginTop: 2 }}>Same day</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "Different day" for "pickup day" on KidRequestModal [features/calendar/KidRequestModal.tsx:666]`); if (!pickupDate) { setPickupDate(eventDate); setShowPickupDatePick(true); } else setShowPickupDatePick(true); }}
                          style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 14,
                            backgroundColor: pickupDate ? accentColor + '14' : (isDark ? colors.surface : '#F9FAFB'),
                            borderWidth: 1.5, borderColor: pickupDate ? accentColor : colors.border }}>
                          <Text style={{ fontSize: 18 }}>🗓️</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary, marginTop: 2 }}>
                            {pickupDate ? fmtDisplay(pickupDate) : 'Different day'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {rideChoice === 'both' && (
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center', marginTop: -6 }}>
                        Sleepaway trip, multi-day camp — otherwise same day is right
                      </Text>
                    )}

                    <PickerOverlay
                      showDate={showPickupDatePick} showTime={false}
                      value={pickupDate ?? eventDate}
                      onChangeDate={d => setPickupDate(new Date(d))}
                      onChangeTime={() => {}}
                      onDone={() => setShowPickupDatePick(false)}
                      accentColor={accentColor} colors={colors}
                      minimumDate={eventDate}
                    />

                    <TouchableOpacity
                      style={[f.dateBtn, { alignSelf: 'center', paddingHorizontal: 28, backgroundColor: accentColor + '14', borderColor: accentColor }]}
                      onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Set time" (pickup) on KidRequestModal [features/calendar/KidRequestModal.tsx:695]`); setShowPickupTimePick(true); }}>
                      <Text style={{ fontSize: 16 }}>🕐</Text>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: accentColor }}>
                        {pickupTime ? fmtTimeDisplay(pickupTime) : 'Set time'}
                      </Text>
                    </TouchableOpacity>

                    <PickerOverlay
                      showDate={false} showTime={showPickupTimePick}
                      value={pickupTime ?? eventDate}
                      onChangeDate={() => {}}
                      onChangeTime={d => { const m = new Date(pickupTime ?? eventDate); m.setHours(d.getHours(), d.getMinutes()); setPickupTime(m); }}
                      onDone={() => setShowPickupTimePick(false)}
                      accentColor={accentColor} colors={colors}
                    />

                    <View>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                        Anything else? (optional)
                      </Text>
                      <TextInput
                        style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                        placeholder="e.g. Practice finishes at 11"
                        placeholderTextColor={colors.textTertiary}
                        value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
                        onBlur={() => console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} field="Anything else" on "KidRequestModal Step 3 pickup" newValue=${notes} [features/calendar/KidRequestModal.tsx:719]`)}
                        multiline numberOfLines={2} textAlignVertical="top"
                      />
                    </View>

                    <TouchableOpacity disabled={submitting || !rideChoice} onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "${isEditing ? 'Save changes' : 'Send request'}" on KidRequestModal rideChoice=${rideChoice} [features/calendar/KidRequestModal.tsx:724]`); rideChoice && submit(rideChoice); }}
                      style={{ backgroundColor: accentColor, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                      {submitting ? <ActivityIndicator color="#fff" /> :
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>{isEditing ? 'Save changes' : 'Send request'}</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
