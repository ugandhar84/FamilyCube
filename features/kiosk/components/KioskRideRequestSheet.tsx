/**
 * KioskRideRequestSheet — kiosk-native replacement for
 * features/calendar/KidRequestModal.tsx, the kid's "Ask for a Ride" flow.
 *
 * The most involved of the six: the phone component is a three-step wizard
 * (category → details → ride choice, plus a pickup-time sub-screen), and
 * this preserves that flow, its validation and its exact event write —
 * only re-shelled into kiosk's narrow right-anchored drawer with kiosk
 * sizing and palette.
 *
 * ── Shape: 'drawer' (deliberately NOT shrunk) ───────────────────────────
 * Reviewed in the dialog/drawer resize pass and kept full-height. Its
 * content varies more than any other kiosk form: step 1 is a card GRID of
 * every ride category, step 2 stacks four field groups (what / when /
 * where / siblings), step 3 is another card pick, and the pickup-time
 * sub-screen adds a day picker plus a time picker. A centered dialog would
 * resize on every step transition — the card visibly jumping and
 * re-centering between steps — which is exactly the jitter a fixed-height
 * panel avoids. Steady chrome across a multi-step flow is worth the height
 * here, so this one keeps the drawer.
 *
 * ── Submission parity with KidRequestModal (verified line by line) ──────
 * addEvent(eventInput) on useEventStore, with the same fields:
 *   title (trimmed) · date localDateStr(eventDate) · time fmtTime(eventDate)
 *   type: category==='Birthday' ? 'birthday' : 'event' · category
 *   allDay: false · location/notes trimmed-or-undefined
 *   returnTime: the SAME `RIDE:` encoding parseRideMeta decodes —
 *     'RIDE:both:<pickupDate>T<pickupTime|UNKNOWN>' /
 *     'RIDE:pickup:<pickupDate>T<pickupTime|UNKNOWN>' /
 *     'RIDE:dropoff' / undefined for 'none'
 *   memberId: activeMemberId · memberIds: [self, ...siblings] when any
 *   helperRequestedBy: active.name · approvalPending: TRUE (the
 *     approval-pending semantic is preserved exactly — a kiosk ride
 *     request lands in the parent's queue identically to a phone one)
 *   conflict: false · color: the category accent
 *   alertCall · alertCallLeadMinutes: 0
 *   rideRequired: choice !== 'none'   ← the real D5 fix the phone comment
 *     documents; routes to RideRequiredEventCard, not RideRequestCard
 *   driverName: undefined · driverStatus: choice!=='none' ? 'pending' : undefined
 *
 * Pickup time pre-fills at drop-off + 90 minutes, same as the phone, and
 * 'both' keeps the same-day / different-day question (sleepaway trip,
 * multi-day camp). Date and time pickers are the shared PickerOverlay every
 * app form uses — KioskEventEditor already uses it on kiosk, so this is not
 * a new dependency for this surface.
 *
 * ── What is NOT ported ──────────────────────────────────────────────────
 *   • Voice intake (useVoiceIntake in the phone header) — same reasoning as
 *     the other five: dictation on a shared, out-of-arm's-reach device.
 *     It only ever pre-filled title/category/date for review; every field it
 *     touched is typeable here.
 *   • Edit mode (`editEvent`) — the kiosk Ask-Parent entry point only ever
 *     CREATES a request; a kid editing their own pending request goes
 *     through kiosk's Schedule tab, not this drawer. Nothing on kiosk
 *     passes editEvent today, so the branch would be dead code.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, StyleSheet } from 'react-native';
import { Car, Check, Phone, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent, EventType } from '@/store/eventStore';
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';
import {
  SUGGESTIONS, localDateStr, fmtTime, fmtDisplay, fmtTimeDisplay,
} from '@/features/calendar/components/eventForm/types';
import type { EventCategory } from '@/features/calendar/components/eventForm/types';
import { RIDE_PICKUP_TIME_UNKNOWN } from '@/features/hub/parent/rideLegs';
import { useKioskColors } from '../kioskPalette';
import type { KioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';

type RideChoice = 'none' | 'dropoff' | 'pickup' | 'both';

// Same four kid categories + "Something else", with kiosk-palette accents
// replacing the phone's app-palette hexes.
const KID_CATEGORIES: {
  key: EventCategory; emoji: string; label: string; sub: string;
  accent: (k: KioskColors) => string;
}[] = [
  { key: 'Sports',   emoji: '🏅', label: 'Sports',    sub: 'practice, game', accent: k => k.gold },
  { key: 'Study',    emoji: '📚', label: 'Study',     sub: 'class, tutor',   accent: k => k.blue },
  { key: 'Event',    emoji: '🎉', label: 'Hang out',  sub: 'party, friend',  accent: k => k.purple },
  { key: 'Birthday', emoji: '🎂', label: 'Birthday',  sub: 'a party',        accent: k => k.primary },
];
const OTHER_CATEGORY: { key: EventCategory; emoji: string; label: string; sub: string; accent: (k: KioskColors) => string } =
  { key: 'Other', emoji: '✨', label: 'Something else', sub: 'anything', accent: k => k.textMuted };

const ALL_CATEGORIES = [...KID_CATEGORIES, OTHER_CATEGORY];

const RIDE_OPTIONS: { key: RideChoice; icon: string; label: string; sub: string }[] = [
  { key: 'dropoff', icon: '🚗➡️', label: 'Yes, take me there', sub: "I'll find my own way back" },
  { key: 'pickup',  icon: '⬅️🚗', label: 'Yes, bring me home', sub: 'I can get there myself' },
  { key: 'both',    icon: '🔄',   label: 'Both ways',          sub: 'There and back' },
  { key: 'none',    icon: '🚶',   label: "No, I'm all set",    sub: 'No ride needed' },
];

export function KioskRideRequestSheet({ visible, onClose, activeMemberId }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
}) {
  const { k } = useKioskColors();
  // PickerOverlay is a shared app component and takes the APP palette (it
  // is the same spinner sheet every phone form uses, and kiosk's own
  // KioskEventEditor already hands it useTheme() colors for exactly this
  // reason). Everything kiosk draws itself uses `k`.
  const { colors } = useTheme();
  const addEvent = useEventStore(s => s.addEvent);
  const members = useFamilyStore(s => s.members);
  const active = members.find(m => m.id === activeMemberId);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);
  const siblings = members.filter(m => m.id !== activeMemberId && (m.role === 'kid' || m.role === 'teen'));

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<EventCategory | null>(null);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState<Date>(() => {
    // Same "next :00 or :30" seed the phone uses.
    const d = new Date(); const m = d.getMinutes();
    d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1);
    return d;
  });
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [withSiblings, setWithSiblings] = useState<string[]>([]);
  const [alertCall, setAlertCall] = useState(false);
  const [rideChoice, setRideChoice] = useState<RideChoice | null>(null);
  const [askingPickupTime, setAskingPickupTime] = useState(false);
  const [pickupDate, setPickupDate] = useState<Date | null>(null);
  const [pickupTime, setPickupTime] = useState<Date | null>(null);
  const [showPickupDatePick, setShowPickupDatePick] = useState(false);
  const [showPickupTimePick, setShowPickupTimePick] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const catMeta = category ? ALL_CATEGORIES.find(c => c.key === category) ?? null : null;
  const accent = catMeta ? catMeta.accent(k) : k.gold;
  const input = kioskInputStyle(k);
  const canSubmitStep2 = title.trim().length > 0;

  const reset = () => {
    setStep(1); setCategory(null); setTitle(''); setLocation(''); setNotes('');
    setRideChoice(null); setDone(false); setAskingPickupTime(false);
    setPickupDate(null); setPickupTime(null);
    setShowPickupDatePick(false); setShowPickupTimePick(false);
    setShowDatePick(false); setShowTimePick(false);
    setAlertCall(false); setWithSiblings([]); setSubmitting(false);
    setEventDate(() => {
      const d = new Date(); const m = d.getMinutes();
      d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1);
      return d;
    });
  };
  const close = () => { reset(); onClose(); };

  const submit = (choice: RideChoice) => {
    if (!active || !category || submitting) return;
    setSubmitting(true);
    setRideChoice(choice);

    // Same RIDE: encoding parseRideMeta (features/hub/parent/rideLegs.ts)
    // decodes. Falls back to the unknown-time sentinel only if somehow no
    // time was captured.
    const pickupDateStr = pickupDate ? localDateStr(pickupDate) : localDateStr(eventDate);
    const pickupTimeStr = pickupTime ? fmtTime(pickupTime) : undefined;
    const returnTime = choice === 'both'
      ? `RIDE:both:${pickupDateStr}T${pickupTimeStr ?? RIDE_PICKUP_TIME_UNKNOWN}`
      : choice === 'pickup'
        ? `RIDE:pickup:${pickupDateStr}T${pickupTimeStr ?? RIDE_PICKUP_TIME_UNKNOWN}`
        : choice === 'dropoff' ? 'RIDE:dropoff' : undefined;

    const eventInput: Omit<FamilyEvent, 'id'> = {
      title: title.trim(),
      date: localDateStr(eventDate),
      time: fmtTime(eventDate),
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
      color: accent,
      alertCall,
      alertCallLeadMinutes: 0,
      rideRequired: choice !== 'none',
      driverName: undefined,
      driverStatus: choice !== 'none' ? 'pending' : undefined,
    };

    addEvent(eventInput);
    setSubmitting(false);
    setDone(true);
    setTimeout(close, 1600);
  };

  const pickRide = (choice: RideChoice) => {
    setRideChoice(choice);
    if (choice === 'pickup' || choice === 'both') {
      // Pre-fill at drop-off + 90 minutes, same starting guess the phone
      // offers, which the kid can then adjust.
      if (!pickupTime) { const d = new Date(eventDate); d.setMinutes(d.getMinutes() + 90); setPickupTime(d); }
      if (choice === 'pickup') setPickupDate(null);
      setAskingPickupTime(true);
      return;
    }
    submit(choice);
  };

  const back = () => {
    if (done) return;
    if (askingPickupTime) { setAskingPickupTime(false); return; }
    if (step > 1) setStep((step - 1) as 1 | 2);
    else close();
  };

  // Header title/subtitle track the step so the drawer's chrome carries the
  // wizard state, in place of the phone's progress dots.
  const headerTitle = done ? 'Sent!' : askingPickupTime ? "When's the pickup?"
    : step === 1 ? 'Ask for a Ride' : step === 2 ? 'Tell us about it' : 'Do you need a lift?';
  const headerSub = done ? undefined
    : step === 1 ? 'What do you need? Pick one'
      : `Step ${step} of 3 · a parent approves it`;

  // The sticky footer's action changes by step: Step 2 advances, the pickup
  // sub-screen submits, and Steps 1/3 are card-pick screens with no footer.
  const footerProps = done || step === 1 || (step === 3 && !askingPickupTime)
    ? {}
    : askingPickupTime
      ? {
          onSubmit: () => rideChoice && submit(rideChoice),
          canSubmit: !!rideChoice, submitting, submitLabel: 'Send request',
        }
      : {
          onSubmit: () => setStep(3),
          canSubmit: canSubmitStep2, submitLabel: 'Next',
          footerNote: 'Next: do you need a ride?',
        };

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title={headerTitle}
      subtitle={headerSub}
      accent={accent}
      Icon={Car}
      k={k}
      onClose={close}
      headerRight={!done && (step > 1 || askingPickupTime) ? (
        <Pressable
          onPress={back}
          hitSlop={12}
          style={[s.backBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityHint="Returns to the previous step"
        >
          <ChevronLeft size={20} color={k.textMuted} />
        </Pressable>
      ) : undefined}
      {...footerProps}
    >
      {done ? (
        <View style={s.doneWrap} accessible accessibilityLiveRegion="polite">
          <View style={[s.doneIcon, { backgroundColor: k.sageSoft, borderColor: k.sageEdge }]}>
            <Check size={34} color={k.sage} />
          </View>
          <Text style={[s.doneTitle, { color: k.text }]} numberOfLines={2}>
            Sent to {parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}!
          </Text>
          <Text style={[s.doneSub, { color: k.textMuted }]} numberOfLines={2}>
            {rideChoice && rideChoice !== 'none'
              ? "They'll pick who drives you."
              : "They'll take a look and confirm."}
          </Text>
        </View>
      ) : (
        <>
          {/* ── Step 1: category ── */}
          {step === 1 && (
            <View style={s.cardGrid}>
              {ALL_CATEGORIES.map(c => {
                const tone = c.accent(k);
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => { setCategory(c.key); setStep(2); }}
                    style={({ pressed }) => [
                      s.catCard,
                      {
                        backgroundColor: pressed ? k.cardHover : tone + '14',
                        borderColor: tone + '4D',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.label}. ${c.sub}`}
                    accessibilityHint="Chooses what kind of thing this is"
                  >
                    <Text style={s.catEmoji}>{c.emoji}</Text>
                    <Text style={[s.catLabel, { color: k.text }]} numberOfLines={1}>{c.label}</Text>
                    <Text style={[s.catSub, { color: k.textMuted }]} numberOfLines={1}>{c.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* ── Step 2: details ── */}
          {step === 2 && catMeta && (
            <>
              <Pressable
                onPress={() => setStep(1)}
                style={[s.catChip, { backgroundColor: accent + '1A', borderColor: accent + '3D' }]}
                accessibilityRole="button"
                accessibilityLabel={`Category: ${catMeta.label}. Change`}
              >
                <Text style={s.catChipEmoji}>{catMeta.emoji}</Text>
                <Text style={[s.catChipText, { color: accent }]} numberOfLines={1}>{catMeta.label}</Text>
                <Text style={[s.catChipChange, { color: accent }]} numberOfLines={1}>Change</Text>
              </Pressable>

              <View style={s.section}>
                <KioskFieldLabel k={k}>WHAT IS IT?</KioskFieldLabel>
                <TextInput
                  style={input}
                  placeholder="e.g. Cricket practice"
                  placeholderTextColor={k.textFaint}
                  value={title}
                  onChangeText={setTitle}
                  accessibilityLabel="What is it"
                />
                {category && category !== 'Other' && (SUGGESTIONS[category]?.length ?? 0) > 0 && (
                  <View style={s.wrap}>
                    {SUGGESTIONS[category].slice(0, 4).map(su => (
                      <KioskPill
                        key={su.title} label={su.title} selected={title === su.title}
                        accent={accent} k={k}
                        onPress={() => setTitle(su.title)}
                        hint="Fills in the title"
                      />
                    ))}
                  </View>
                )}
              </View>

              <View style={s.section}>
                <KioskFieldLabel k={k}>WHEN?</KioskFieldLabel>
                <View style={s.row}>
                  <Pressable
                    onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}
                    style={[s.dateBtn, {
                      flex: 3,
                      backgroundColor: showDatePick ? accent + '1A' : k.well,
                      borderColor: showDatePick ? accent : k.cardBorder,
                    }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Date: ${fmtDisplay(eventDate)}`}
                    accessibilityHint="Opens the date picker"
                  >
                    <Text style={s.dateEmoji}>📅</Text>
                    <Text style={[s.dateText, { color: showDatePick ? accent : k.text }]} numberOfLines={1}>
                      {fmtDisplay(eventDate)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}
                    style={[s.dateBtn, {
                      flex: 2,
                      backgroundColor: showTimePick ? accent + '1A' : k.well,
                      borderColor: showTimePick ? accent : k.cardBorder,
                    }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Time: ${fmtTimeDisplay(eventDate)}`}
                    accessibilityHint="Opens the time picker"
                  >
                    <Text style={s.dateEmoji}>🕐</Text>
                    <Text style={[s.dateText, { color: showTimePick ? accent : k.text }]} numberOfLines={1}>
                      {fmtTimeDisplay(eventDate)}
                    </Text>
                  </Pressable>
                </View>
                <PickerOverlay
                  showDate={showDatePick} showTime={showTimePick}
                  value={eventDate}
                  onChangeDate={d => { const m = new Date(d); m.setHours(eventDate.getHours(), eventDate.getMinutes()); setEventDate(m); }}
                  onChangeTime={d => { const m = new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setEventDate(m); }}
                  onDone={() => { setShowDatePick(false); setShowTimePick(false); }}
                  accentColor={accent} colors={colors}
                  minimumDate={new Date()}
                />
              </View>

              <View style={s.section}>
                <KioskFieldLabel k={k}>WHERE? (OPTIONAL)</KioskFieldLabel>
                <TextInput
                  style={input}
                  placeholder="e.g. Riverside Park"
                  placeholderTextColor={k.textFaint}
                  value={location}
                  onChangeText={setLocation}
                  accessibilityLabel="Where"
                />
              </View>

              {siblings.length > 0 && (
                <View style={s.section}>
                  <KioskFieldLabel k={k}>GOING WITH A SIBLING? (OPTIONAL)</KioskFieldLabel>
                  <View style={s.wrap}>
                    {siblings.map(sib => (
                      <KioskPill
                        key={sib.id}
                        label={sib.name.split(' ')[0]}
                        selected={withSiblings.includes(sib.id)}
                        accent={accent} k={k}
                        onPress={() => setWithSiblings(prev =>
                          prev.includes(sib.id) ? prev.filter(id => id !== sib.id) : [...prev, sib.id])}
                        hint="Adds this sibling to the same trip"
                      />
                    ))}
                  </View>
                </View>
              )}

              <View style={[s.switchRow, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
                <Phone size={18} color={alertCall ? accent : k.textFaint} />
                <Text style={[s.switchLabel, { color: k.text }]} numberOfLines={1}>Call to remind me</Text>
                <Switch
                  value={alertCall}
                  onValueChange={setAlertCall}
                  trackColor={{ false: k.cardBorder, true: accent + '80' }}
                  thumbColor={alertCall ? accent : k.textFaint}
                  accessibilityLabel="Call to remind me"
                  accessibilityHint="Rings this device at event time"
                />
              </View>
            </>
          )}

          {/* ── Step 3: ride choice ── */}
          {step === 3 && !askingPickupTime && (
            <>
              {RIDE_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  disabled={submitting}
                  onPress={() => pickRide(opt.key)}
                  style={({ pressed }) => [
                    s.rideCard,
                    {
                      backgroundColor: pressed ? k.cardHover : k.well,
                      borderColor: rideChoice === opt.key ? accent : k.cardBorder,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: rideChoice === opt.key, disabled: submitting }}
                  accessibilityLabel={`${opt.label}. ${opt.sub}`}
                >
                  <Text style={s.rideIcon}>{opt.icon}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.rideLabel, { color: k.text }]} numberOfLines={1}>{opt.label}</Text>
                    <Text style={[s.rideSub, { color: k.textMuted }]} numberOfLines={1}>{opt.sub}</Text>
                  </View>
                </Pressable>
              ))}

              <View style={s.section}>
                <KioskFieldLabel k={k}>ANYTHING ELSE? (OPTIONAL)</KioskFieldLabel>
                <TextInput
                  style={[input, { minHeight: 88, textAlignVertical: 'top' }]}
                  placeholder="e.g. Practice finishes at 11"
                  placeholderTextColor={k.textFaint}
                  value={notes}
                  onChangeText={t => setNotes(t.slice(0, 200))}
                  multiline
                  accessibilityLabel="Anything else"
                />
              </View>
            </>
          )}

          {/* ── Step 3b: pickup date + time ── */}
          {step === 3 && askingPickupTime && (
            <>
              {rideChoice === 'both' && (
                <View style={s.section}>
                  <KioskFieldLabel k={k}>WHICH DAY?</KioskFieldLabel>
                  <View style={s.row}>
                    <Pressable
                      onPress={() => setPickupDate(null)}
                      style={[s.dayBtn, {
                        backgroundColor: !pickupDate ? accent + '1A' : k.well,
                        borderColor: !pickupDate ? accent : k.cardBorder,
                      }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: !pickupDate }}
                      accessibilityLabel="Same day"
                    >
                      <Text style={s.dayEmoji}>🔁</Text>
                      <Text style={[s.dayText, { color: k.text }]} numberOfLines={1}>Same day</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { if (!pickupDate) setPickupDate(eventDate); setShowPickupDatePick(true); }}
                      style={[s.dayBtn, {
                        backgroundColor: pickupDate ? accent + '1A' : k.well,
                        borderColor: pickupDate ? accent : k.cardBorder,
                      }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: !!pickupDate }}
                      accessibilityLabel={pickupDate ? `Different day: ${fmtDisplay(pickupDate)}` : 'Different day'}
                      accessibilityHint="Opens the pickup date picker"
                    >
                      <Text style={s.dayEmoji}>🗓️</Text>
                      <Text style={[s.dayText, { color: k.text }]} numberOfLines={1}>
                        {pickupDate ? fmtDisplay(pickupDate) : 'Different day'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={[s.hint, { color: k.textFaint }]} numberOfLines={2}>
                    Sleepaway trip, multi-day camp — otherwise same day is right
                  </Text>
                </View>
              )}

              <PickerOverlay
                showDate={showPickupDatePick} showTime={false}
                value={pickupDate ?? eventDate}
                onChangeDate={d => setPickupDate(new Date(d))}
                onChangeTime={() => {}}
                onDone={() => setShowPickupDatePick(false)}
                accentColor={accent} colors={colors}
                minimumDate={eventDate}
              />

              <View style={s.section}>
                <KioskFieldLabel k={k}>PICKUP TIME</KioskFieldLabel>
                <Pressable
                  onPress={() => setShowPickupTimePick(true)}
                  style={[s.dateBtn, { backgroundColor: accent + '1A', borderColor: accent, alignSelf: 'flex-start', paddingHorizontal: KIOSK_SPACE.xl }]}
                  accessibilityRole="button"
                  accessibilityLabel={pickupTime ? `Pickup at ${fmtTimeDisplay(pickupTime)}` : 'Set pickup time'}
                  accessibilityHint="Opens the pickup time picker"
                >
                  <Text style={s.dateEmoji}>🕐</Text>
                  <Text style={[s.dateText, { color: accent }]} numberOfLines={1}>
                    {pickupTime ? fmtTimeDisplay(pickupTime) : 'Set time'}
                  </Text>
                </Pressable>
              </View>

              <PickerOverlay
                showDate={false} showTime={showPickupTimePick}
                value={pickupTime ?? eventDate}
                onChangeDate={() => {}}
                onChangeTime={d => { const m = new Date(pickupTime ?? eventDate); m.setHours(d.getHours(), d.getMinutes()); setPickupTime(m); }}
                onDone={() => setShowPickupTimePick(false)}
                accentColor={accent} colors={colors}
              />

              <View style={s.section}>
                <KioskFieldLabel k={k}>ANYTHING ELSE? (OPTIONAL)</KioskFieldLabel>
                <TextInput
                  style={[input, { minHeight: 88, textAlignVertical: 'top' }]}
                  placeholder="e.g. Practice finishes at 11"
                  placeholderTextColor={k.textFaint}
                  value={notes}
                  onChangeText={t => setNotes(t.slice(0, 200))}
                  multiline
                  accessibilityLabel="Anything else"
                />
              </View>
            </>
          )}
        </>
      )}
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
  row: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  hint: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  backBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },

  // Step 1 — category cards, two up in a 520px drawer.
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  catCard: {
    flexGrow: 1, flexBasis: 190, minWidth: 0,
    alignItems: 'center', gap: KIOSK_SPACE.xs,
    paddingVertical: KIOSK_SPACE.lg, paddingHorizontal: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.lg, borderWidth: 1.5,
    minHeight: KIOSK_HIT.primary + 48,
  },
  catEmoji: { fontSize: 30 },
  catLabel: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  catSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },

  // Step 2 — the "you picked X, change it" chip.
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    alignSelf: 'flex-start', borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.min,
  },
  catChipEmoji: { fontSize: 18 },
  catChipText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  catChipChange: { fontSize: KIOSK_TYPO.micro, fontWeight: '700', opacity: 0.75 },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: KIOSK_SPACE.xs, minHeight: KIOSK_HIT.control,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1, paddingHorizontal: KIOSK_SPACE.md,
  },
  dateEmoji: { fontSize: 16 },
  dateText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.control,
  },
  switchLabel: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },

  // Step 3 — ride choice cards.
  rideCard: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    padding: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5,
    minHeight: KIOSK_HIT.primary + 12,
  },
  rideIcon: { fontSize: 24 },
  rideLabel: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  rideSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },

  dayBtn: {
    flex: 1, alignItems: 'center', gap: 2,
    paddingVertical: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5,
    minHeight: KIOSK_HIT.control,
  },
  dayEmoji: { fontSize: 20 },
  dayText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },

  // Confirmation.
  doneWrap: { alignItems: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xxl },
  doneIcon: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  doneTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '900', textAlign: 'center' },
  doneSub: { fontSize: KIOSK_TYPO.body, fontWeight: '600', textAlign: 'center' },
});
