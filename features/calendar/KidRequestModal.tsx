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
 *      nested toggles. Selecting one submits immediately.
 *
 * Deliberately asks for NO pickup time — a kid rarely knows precisely when
 * practice ends, and QA Round 12 Finding C-2 is exactly the bug class that
 * produces (a picker a kid never opens, silently dropping the whole leg).
 * The parent fills in pickup time with a one-tap stepper when they review
 * the request (RideRequestCard/RideRequiredEventCard's PickupTimeStepper),
 * pre-filled at drop-off + 90 minutes — a better input, from someone with
 * better information, at the moment they're already deciding the ride.
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
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Mic, ChevronLeft, X, Check } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useVoiceIntake } from '@/lib/hooks/useVoiceIntake';
import PickerOverlay from './components/eventForm/PickerOverlay';
import { f } from './components/eventForm/styles';
import { SUGGESTIONS, localDateStr, fmtTime as fmtTimeVal, fmtDisplay, fmtTimeDisplay } from './components/eventForm/types';
import { RIDE_PICKUP_TIME_UNKNOWN } from '../hub/parent/rideLegs';
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

export function KidRequestModal({ visible, onClose, activeMemberId }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
}) {
  const { colors, isDark } = useTheme();
  const { addEvent } = useEventStore();
  const members = useFamilyStore(s => s.members);
  const active = members.find(m => m.id === activeMemberId);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<EventCategory | null>(null);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState<Date>(() => {
    const d = new Date(); const m = d.getMinutes();
    d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1);
    return d;
  });
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [rideChoice, setRideChoice] = useState<RideChoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // "Both ways" needs one more answer before it can submit: same day (the
  // common case — practice ends, someone picks you up a couple hours
  // later) vs a different day (sleepaway trip, multi-day camp) — the app
  // previously just assumed same-day, silently losing a multi-day pickup
  // date entirely. Only asked for 'both', since a single-leg request has
  // no second date to place.
  const [askingPickupDay, setAskingPickupDay] = useState(false);
  const [pickupDate, setPickupDate] = useState<Date | null>(null);
  const [showPickupDatePick, setShowPickupDatePick] = useState(false);

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
    setStep(1); setCategory(null); setTitle(''); setLocation(''); setNotes('');
    setRideChoice(null); setDone(false); setMicOpen(false); voice.cancel();
    setAskingPickupDay(false); setPickupDate(null); setShowPickupDatePick(false);
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
    // already decodes — deliberately NEVER includes a TIME for a kid (see
    // PickupTimeStepper for where the parent fills that in), but DOES
    // carry a pickup DATE when the kid said "different day" — parseRideMeta
    // reads `RIDE:both:YYYY-MM-DDTHH:MM`, so a bare date-only pickup uses a
    // placeholder time here that PickupTimeStepper overwrites regardless.
    const returnTime = choice === 'both'
      ? (pickupDate ? `RIDE:both:${localDateStr(pickupDate)}T${RIDE_PICKUP_TIME_UNKNOWN}` : 'RIDE:both')
      : choice === 'dropoff' ? 'RIDE:dropoff' : choice === 'pickup' ? 'RIDE:pickup' : undefined;

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
      helperRequestedBy: active.name,
      approvalPending: true,
      conflict: false,
      color: accentColor,
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
                  if (done) return;
                  if (askingPickupDay) { setAskingPickupDay(false); setPickupDate(null); setShowPickupDatePick(false); return; }
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
                onPress={() => { setMicOpen(true); voice.start(); }}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={{ padding: 6, marginRight: 4, borderRadius: 16,
                  backgroundColor: micOpen ? BRAND.purple + '20' : 'transparent' }}>
                <Mic size={20} color={micOpen ? BRAND.purple : colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
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
                    <TouchableOpacity onPress={() => voice.stop()}
                      style={{ flex: 1, backgroundColor: BRAND.purple, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Done Speaking</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => { voice.cancel(); setMicOpen(false); }}
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
                        <TouchableOpacity key={c.key} onPress={() => { setCategory(c.key); setStep(2); }}
                          style={{ width: '47%', alignItems: 'center', gap: 6, paddingVertical: 22, borderRadius: 18,
                            backgroundColor: c.color + '14', borderWidth: 2, borderColor: c.color + '40' }}>
                          <Text style={{ fontSize: 32 }}>{c.emoji}</Text>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{c.label}</Text>
                          <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{c.sub}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity onPress={() => { setCategory(OTHER_CATEGORY.key); setStep(2); }}
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
                    <TouchableOpacity onPress={() => setStep(1)}
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
                      />
                      {category && category !== 'Other' && SUGGESTIONS[category]?.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {SUGGESTIONS[category].slice(0, 4).map((s: { title: string; hint: string }, i: number) => (
                              <TouchableOpacity key={i} onPress={() => setTitle(s.title)}
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
                          onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}>
                          <Text style={{ fontSize: 13 }}>📅</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showDatePick ? accentColor : colors.textPrimary }}>
                            {fmtDisplay(eventDate)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[f.dateBtn, { flex: 2, backgroundColor: showTimePick ? accentColor + '20' : colors.surface, borderColor: showTimePick ? accentColor : colors.border }]}
                          onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}>
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
                      />
                    </View>

                    <TouchableOpacity
                      disabled={!canSubmitStep2}
                      onPress={() => setStep(3)}
                      style={{ backgroundColor: canSubmitStep2 ? accentColor : colors.border, borderRadius: 14,
                        paddingVertical: 14, alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>Next →</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {step === 3 && !askingPickupDay && (
                  <View style={{ gap: 14 }}>
                    <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 }}>
                      Do you need a lift? 🚗
                    </Text>

                    {[
                      { key: 'dropoff' as const, icon: '🚗➡️', label: 'Yes, take me there', sub: "I'll find my own way back" },
                      { key: 'pickup'  as const, icon: '⬅️🚗', label: 'Yes, bring me home', sub: 'I can get there myself' },
                      { key: 'both'    as const, icon: '🔄',   label: 'Both ways', sub: 'There and back' },
                      { key: 'none'    as const, icon: '🚶',   label: "No, I'm all set", sub: undefined },
                    ].map(opt => (
                      <TouchableOpacity key={opt.key} disabled={submitting}
                        onPress={() => opt.key === 'both' ? setAskingPickupDay(true) : submit(opt.key)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
                          backgroundColor: isDark ? colors.surface : '#F9FAFB', borderWidth: 1.5, borderColor: colors.border }}>
                        <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{opt.label}</Text>
                          {opt.sub && <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>{opt.sub}</Text>}
                        </View>
                        {submitting && rideChoice === opt.key && <ActivityIndicator color={accentColor} />}
                      </TouchableOpacity>
                    ))}

                    <View>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
                        Anything else? (optional)
                      </Text>
                      <TextInput
                        style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed }]}
                        placeholder="e.g. Practice finishes at 11"
                        placeholderTextColor={colors.textTertiary}
                        value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
                        multiline numberOfLines={2} textAlignVertical="top"
                      />
                    </View>
                  </View>
                )}

                {step === 3 && askingPickupDay && (
                  <View style={{ gap: 14 }}>
                    <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 }}>
                      When's the pickup? 📅
                    </Text>

                    <TouchableOpacity disabled={submitting} onPress={() => submit('both')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
                        backgroundColor: isDark ? colors.surface : '#F9FAFB', borderWidth: 1.5,
                        borderColor: !pickupDate ? accentColor : colors.border }}>
                      <Text style={{ fontSize: 22 }}>🔁</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Same day</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>A parent will pick a pickup time</Text>
                      </View>
                      {submitting && !pickupDate && <ActivityIndicator color={accentColor} />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { setShowPickupDatePick(true); if (!pickupDate) setPickupDate(eventDate); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
                        backgroundColor: isDark ? colors.surface : '#F9FAFB', borderWidth: 1.5,
                        borderColor: pickupDate ? accentColor : colors.border }}>
                      <Text style={{ fontSize: 22 }}>🗓️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                          {pickupDate ? `Different day — ${fmtDisplay(pickupDate)}` : 'A different day'}
                        </Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>Sleepaway trip, multi-day camp</Text>
                      </View>
                    </TouchableOpacity>

                    <PickerOverlay
                      showDate={showPickupDatePick} showTime={false}
                      value={pickupDate ?? eventDate}
                      onChangeDate={d => setPickupDate(new Date(d))}
                      onChangeTime={() => {}}
                      onDone={() => setShowPickupDatePick(false)}
                      accentColor={accentColor} colors={colors}
                      minimumDate={eventDate}
                    />

                    {pickupDate && !showPickupDatePick && (
                      <TouchableOpacity disabled={submitting} onPress={() => submit('both')}
                        style={{ backgroundColor: accentColor, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                        {submitting ? <ActivityIndicator color="#fff" /> :
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>Confirm pickup day →</Text>}
                      </TouchableOpacity>
                    )}
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
