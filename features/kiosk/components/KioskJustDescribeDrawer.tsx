/**
 * "Just describe it" for the kitchen display, as two separate right-side
 * drawers that mirror the phone exactly: KioskJustDescribeTaskDrawer
 * (JustDescribeItScreen, opened from Chores) and
 * KioskJustDescribeEventDrawer (JustDescribeItEventScreen, opened from
 * Schedule). Same flow in both:
 *
 *   1. Say or type a sentence ("Leo take out the trash tomorrow 5pm").
 *   2. We detect the category, date and time, who, and recurrence
 *      (detectLocalTask — the same detector the phone uses) and show them as
 *      chips, plus a suggested assignee.
 *   3. "Set up" opens the pre-filled form below; one Save button creates the
 *      chore (addQuest) or event (addEvent / addRecurringEvent, with an
 *      optional pick-up leg) through the same stores the phone writes to.
 *
 * Parent-only: a kid's "+" goes through Ask a parent instead. Times are 12h.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, Animated, Easing, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Mic, Square, Sparkles, Clock, User, Users, Repeat, Coins, Camera, Calendar, CalendarClock, MapPin, Car,
  ClipboardList, Check, ArrowRight, Lightbulb, Gift, Zap, X, type LucideIcon,
} from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore, findLikelyDuplicateChore } from '@/store/choreStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { detectLocalTask } from '@/features/tasks/lib/localTaskDetection';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { previewAssignment } from '@/lib/responsibilityCategories';
import { familyAi } from '@/lib/familyAiService';
import { localDateStr } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, kioskElevation } from '../kioskTheme';
import { useKioskColors, kioskPastels, type KioskColors } from '../kioskPalette';
import { KioskFormDrawer } from './KioskFormDrawer';
import { KioskDueDateTimePicker } from './KioskDueDateTimePicker';
import { KioskAvatar } from './KioskAvatar';
import { Eyebrow, firstName } from './KioskHomeParts';

type Mode = 'chore' | 'event';
type Recur = 'once' | 'daily' | 'weekly' | 'monthly';

const MIN_CHARS = 3;
const COIN_OPTIONS = [10, 20, 30, 50, 100];
const RECUR: { label: string; value: Recur }[] = [
  { label: 'Once', value: 'once' }, { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' }, { label: 'Monthly', value: 'monthly' },
];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const EVENT_CATS: { key: string; emoji: string }[] = [
  { key: 'Event', emoji: '📅' }, { key: 'Medical', emoji: '🏥' }, { key: 'Sports', emoji: '⚽' }, { key: 'School', emoji: '📚' },
  { key: 'Study', emoji: '📖' }, { key: 'Work', emoji: '💼' }, { key: 'Ride', emoji: '🚗' }, { key: 'Birthday', emoji: '🎂' },
];

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fmt12 = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmt12hStr = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const tomorrowAt = (h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d; };
const fromParts = (date?: string | null, time?: string | null, fallback?: Date) => {
  const base = fallback ? new Date(fallback) : tomorrowAt(17);
  if (date) { const [y, mo, d] = date.split('-').map(Number); base.setFullYear(y, mo - 1, d); }
  if (time) { const [h, m] = time.split(':').map(Number); base.setHours(h, m ?? 0, 0, 0); }
  return base;
};
const addMin = (t: string, mins: number) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + mins; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const cleanTitle = (raw: string) => raw
  .replace(/\s+(at|by|@)\s+\d{1,2}(:\d{2})?\s*(am|pm)?/gi, '').replace(/\s+\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
  .replace(/\s+(today|tonight|tomorrow)/gi, '').replace(/\s+(on|next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '')
  .replace(/\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '').replace(/\s+every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month)/gi, '')
  .replace(/\s{2,}/g, ' ').trim();

/** A name in the sentence only says who is involved: it becomes the assignee
 *  or attendee, and is dropped from the title ("Leo take out the trash" →
 *  "Take out the trash"). Also trims the glue words a removed name leaves. */
function stripNames(raw: string, names: string[]): string {
  let t = raw;
  for (const n of names.filter(Boolean)) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\b${esc}(?:'s|’s)?\\b`, 'gi'), ' ');
  }
  t = t.replace(/\s{2,}/g, ' ').trim()
    .replace(/^(?:for|to|and|with|please|ask|tell|remind)\s+/i, '')
    .replace(/\s+(?:for|to|and|with)$/i, '')
    .replace(/^[,\-–:]+\s*/, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : raw.trim();
}

export function KioskJustDescribeTaskDrawer(p: { visible: boolean; onClose: () => void; active: FamilyMember; members: FamilyMember[] }) {
  return <JustDescribeDrawer {...p} mode="chore" />;
}
export function KioskJustDescribeEventDrawer(p: { visible: boolean; onClose: () => void; active: FamilyMember; members: FamilyMember[] }) {
  return <JustDescribeDrawer {...p} mode="event" />;
}

function JustDescribeDrawer({ visible, onClose, active, members, mode }: {
  visible: boolean; onClose: () => void; active: FamilyMember; members: FamilyMember[]; mode: Mode;
}) {
  const { k, isDark } = useKioskColors();
  const pastels = kioskPastels(k);
  const { addQuest } = useQuestStore();
  const allChores = useChoreStore(s => s.chores);
  const { addEvent, addRecurringEvent, updateEvent } = useEventStore();
  const dictation = useVoiceDictation();
  const people = useMemo(() => members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'), [members]);
  const parents = people.filter(m => m.role === 'parent');

  // ── shared ──
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [detection, setDetection] = useState<ReturnType<typeof detectLocalTask>>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [suggest, setSuggest] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<Date>(tomorrowAt(17));
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [recur, setRecur] = useState<Recur>('once');
  const [recurDays, setRecurDays] = useState<number[]>([]);
  const [who, setWho] = useState<string[]>([]);
  // ── chore ──
  const [desc, setDesc] = useState('');
  const [coins, setCoins] = useState(30);
  const [customCoins, setCustomCoins] = useState('');
  const [pool, setPool] = useState(true);
  const [bonusOn, setBonusOn] = useState(false);
  const [bonus, setBonus] = useState('25');
  const [proof, setProof] = useState(false);
  const [dupAck, setDupAck] = useState(false);
  // ── event ──
  const [category, setCategory] = useState('Event');
  const [endWhen, setEndWhen] = useState<Date>(() => { const d = tomorrowAt(18); return d; });
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [rideOn, setRideOn] = useState(false);
  const [rideFrom, setRideFrom] = useState('');
  const [rideTo, setRideTo] = useState('');
  const [driverId, setDriverId] = useState<string | undefined>(undefined);
  const [pickupOn, setPickupOn] = useState(false);
  const [conflicts, setConflicts] = useState<Record<string, string | null>>({});

  const scrollRef = useRef<any>(null);
  void scrollRef;

  const reset = () => {
    setInput(''); setFocused(false); setDetection(null); setFormOpen(false); setSuggest(null); setSaving(false);
    setTitle(''); setWhen(tomorrowAt(17)); setEndWhen(tomorrowAt(18)); setRecur('once'); setRecurDays([]); setWho([]);
    setDesc(''); setCoins(30); setCustomCoins(''); setPool(true); setBonusOn(false); setBonus('25'); setProof(false); setDupAck(false);
    setCategory('Event'); setAllDay(false); setLocation(''); setNotes(''); setRideOn(false); setRideFrom(''); setRideTo('');
    setDriverId(undefined); setPickupOn(false); setConflicts({});
    setShowDate(false); setShowTime(false); dictation.reset();
  };
  const close = () => { reset(); onClose(); };

  // Live detection
  useEffect(() => {
    if (input.trim().length < MIN_CHARS) { setDetection(null); setFormOpen(false); return; }
    setDetection(detectLocalTask(input, people.map(m => ({ id: m.id, name: m.name, role: m.role }))));
  }, [input, people]);

  // Suggested assignee for the detected category
  useEffect(() => {
    if (!detection || !active.familyId) return;
    const cat = detection.category.kind === 'event' ? detection.category.eventCategory : detection.category.questCategory;
    if (!cat) return;
    let off = false;
    previewAssignment({ taskId: 'preview', taskType: mode === 'event' ? 'event' : 'chore', familyId: active.familyId, category: cat })
      .then(s => { if (off || !s.selectedMemberId) return; const m = people.find(x => x.id === s.selectedMemberId); if (m) setSuggest({ id: m.id, name: firstName(m) }); })
      .catch(() => {});
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detection?.category.eventCategory, detection?.category.questCategory, mode]);

  const detectedWho = useMemo(() => people.filter(m => detection?.memberNames.some(n => firstName(m).toLowerCase() === n.toLowerCase() || m.name.toLowerCase() === n.toLowerCase())), [detection, people]);

  // First and full names of everyone detected in the sentence.
  const nameTokens = useMemo(() => detectedWho.flatMap(m => [m.name.trim(), firstName(m)]), [detectedWho]);

  const openForm = () => {
    if (!detection) return;
    setTitle(stripNames(detection.title || cleanTitle(input), nameTokens));
    setWhen(fromParts(detection.when.date, detection.when.time?.slice(0, 5), when));
    if (detection.when.time) setEndWhen(fromParts(detection.when.date, addMin(detection.when.time.slice(0, 5), 60), when));
    if (detection.recurrence !== 'once') setRecur(detection.recurrence);
    if (detection.recurrenceDays.length) setRecurDays(detection.recurrenceDays);
    if (detection.category.kind === 'event' && detection.category.eventCategory) setCategory(detection.category.eventCategory);
    if (detectedWho.length) { setWho(detectedWho.map(m => m.id)); setPool(false); }
    if (detection.locations.dropoff) setRideTo(detection.locations.dropoff);
    if (detection.locations.pickup) setRideFrom(detection.locations.pickup);
    setFormOpen(true);
  };

  const aiFill = async () => {
    if (!input.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const r = await familyAi.extractResponsibility(input.trim(), people.map(m => ({ id: m.id, name: m.name, role: m.role })));
      if (r?.task?.title) { if (!formOpen) openForm(); setTitle(stripNames(r.task.title, nameTokens)); }
    } catch { /* silent: the local detection still works */ }
    finally { setAiBusy(false); }
  };

  const stopVoice = async () => { const t = await dictation.stop(); if (t) setInput(t); };
  const listening = dictation.state === 'listening';

  // Event: per-member conflict check (same query the phone runs)
  useEffect(() => {
    if (mode !== 'event' || !formOpen || allDay || who.length === 0) return;
    const date = localDateStr(when), s = hhmm(when), e = hhmm(endWhen);
    const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    who.forEach(async id => {
      const fid = people.find(m => m.id === id)?.familyId;
      if (!fid) return;
      try {
        const { data } = await supabase.from('calendar_events').select('title, time, end_time').eq('family_id', fid).eq('date', date).or(`member_id.eq.${id},member_ids.cs.{${id}}`);
        const hit = (data ?? []).find(ev => ev.time && toM(s) < (ev.end_time ? toM(ev.end_time) : toM(ev.time) + 60) && toM(e) > toM(ev.time));
        setConflicts(p => ({ ...p, [id]: hit ? `Conflicts with "${hit.title}" at ${fmt12hStr(hit.time)}` : null }));
      } catch { setConflicts(p => ({ ...p, [id]: null })); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, formOpen, allDay, when, endWhen, who.join(',')]);

  // Adults don't earn coins: when the chore is assigned only to adults the
  // Reward section is hidden and nothing is paid (same as the phone's
  // adult tasks). A pool or any kid/teen keeps it.
  const adultsOnly = !pool && who.length > 0 && who.every(id => { const r = people.find(m => m.id === id)?.role; return r !== 'kid' && r !== 'teen'; });
  const finalCoins = adultsOnly ? 0 : customCoins ? (parseInt(customCoins, 10) || coins) : coins;
  const dup = mode === 'chore' && formOpen
    ? findLikelyDuplicateChore(allChores, { title, assignedToId: !pool && who.length ? who[0] : undefined, dueDate: localDateStr(when), dueTime: hhmm(when) })
    : undefined;
  useEffect(() => { setDupAck(false); }, [title, when, pool, who.join(',')]);

  const toggleWho = (id: string) => setWho(w => (w.includes(id) ? w.filter(x => x !== id) : [...w, id]));

  const saveChore = async () => {
    if (!title.trim() || saving) return;
    if (dup && !dupAck) { setDupAck(true); return; }
    setSaving(true);
    try {
      const bonusAmt = bonusOn ? (parseInt(bonus, 10) || 0) : 0;
      await addQuest({
        title: title.trim(), description: desc.trim() || undefined, coins: finalCoins,
        bonusCoins: !adultsOnly && bonusAmt > 0 ? bonusAmt : undefined, photoRequired: !adultsOnly && proof ? true : undefined,
        assignedToIds: !pool && who.length ? who : undefined, isPool: pool || who.length === 0,
        dueDate: localDateStr(when), dueTime: hhmm(when),
        recurrence: recur !== 'once' ? recur : undefined,
        recurrenceDays: recur === 'weekly' && recurDays.length ? recurDays : undefined,
        familyId: active.familyId ?? '', createdBy: active.id,
        category: detection?.category.questCategory as any,
      } as any);
      showToast('Chore added ✓'); close();
    } catch { setSaving(false); showToast('Could not save the chore. Try again.'); }
  };

  const saveEvent = async () => {
    if (!title.trim() || saving) return;
    if (pickupOn && !allDay && recur !== 'once') { Alert.alert('Pick-up needs a single event', 'Add the pick-up ride separately for repeating events.'); return; }
    setSaving(true);
    const familyId = active.familyId ?? '';
    const date = localDateStr(when);
    const driver = people.find(m => m.id === driverId);
    const selfDrive = driverId === active.id;
    try {
      const base = {
        title: title.trim(), date, time: allDay ? undefined : hhmm(when), endTime: allDay ? undefined : hhmm(endWhen),
        allDay: allDay || undefined, category, type: 'event',
        memberIds: who.length ? who : undefined, memberId: who[0],
        notes: notes.trim() || undefined, location: location.trim() || undefined,
        rideRequired: rideOn || undefined,
        pickupLocation: rideOn && rideFrom.trim() ? rideFrom.trim() : undefined,
        dropLocation: rideOn && rideTo.trim() ? rideTo.trim() : undefined,
        driverId: rideOn ? driverId : undefined, driverName: rideOn && driver ? driver.name : undefined,
        driverStatus: rideOn && driverId ? (selfDrive ? 'confirmed' : 'pending') : undefined,
        familyId, createdBy: active.id,
      } as Omit<FamilyEvent, 'id'>;
      let id: string;
      if (recur !== 'once') {
        const end = new Date(when); end.setMonth(end.getMonth() + 2);
        id = await addRecurringEvent(base, { frequency: recur, endDate: localDateStr(end), ...(recur === 'weekly' && recurDays.length ? { days: recurDays } : {}) } as any);
      } else id = await addEvent(base);
      if (pickupOn && id && !allDay) {
        const t = hhmm(endWhen);
        const leg = await addEvent({
          title: `Pick-up · ${title.trim()}`, date, time: t, endTime: addMin(t, 30), category, type: 'event',
          memberIds: who.length ? who : undefined, memberId: who[0], rideRequired: true,
          pickupLocation: rideTo.trim() || undefined, dropLocation: rideFrom.trim() || undefined,
          linkedLegId: id, familyId, createdBy: active.id,
        } as Omit<FamilyEvent, 'id'>);
        if (leg) await updateEvent(id, { linkedLegId: leg });
      }
      showToast('Event added ✓'); close();
    } catch { setSaving(false); showToast('Could not save the event. Try again.'); }
  };

  const canSetup = input.trim().length >= MIN_CHARS && !!detection;
  const submit = !formOpen ? openForm : mode === 'chore' ? saveChore : saveEvent;
  const submitLabel = !formOpen ? 'Set it up' : saving ? 'Saving…' : dup && !dupAck ? 'Add anyway' : mode === 'chore' ? 'Add chore' : 'Add event';
  const canSubmit = !formOpen ? canSetup : !!title.trim();

  // ── premium UI helpers ──
  const people_ = (multi: boolean, ids: string[], onPick: (id: string) => void, list: FamilyMember[]) =>
    list.map(m => <PersonChip key={m.id} m={m} i={Math.max(0, people.findIndex(x => x.id === m.id))} on={ids.includes(m.id)} onPress={() => onPick(m.id)} />);
  const recurRow = () => (
    <View style={{ gap: 10 }}>
      <Text style={[s.fieldLabel, { color: k.textFaint }]}>REPEATS</Text>
      <View style={s.wrapRow}>{RECUR.map(r => <Chip key={r.value} label={r.label} on={recur === r.value} onPress={() => setRecur(r.value)} tone={k.purple} Icon={r.value === 'once' ? undefined : Repeat} />)}</View>
      {recur === 'weekly' && (
        <View style={s.wrapRow}>
          {DAYS.map((d, i) => (
            <Pressable key={i} onPress={() => setRecurDays(p => (p.includes(i) ? p.filter(x => x !== i) : [...p, i]))} accessibilityRole="button" accessibilityLabel={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}
              style={[s.dayDot, { backgroundColor: recurDays.includes(i) ? k.purple : k.well, borderColor: recurDays.includes(i) ? k.purple : k.cardBorder }]}>
              <Text style={[s.chipText, { color: recurDays.includes(i) ? k.onAccent : k.textMuted }]}>{d}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const detCat = detection ? ((detection.category.kind === 'event' ? detection.category.eventCategory : detection.category.questCategory) ?? detection.category.label) : '';
  // Example sentences are built from THIS family's own people and rotate
  // each time the drawer opens, so they always feel current.
  const seed = useRef(0);
  useEffect(() => { if (visible) seed.current = Math.floor(Math.random() * 997); }, [visible]);
  const examples = useMemo(() => {
    const kids = people.filter(m => m.role === 'kid' || m.role === 'teen').map(firstName);
    const adults = people.filter(m => m.role === 'parent').map(firstName);
    const pick = (list: string[], i: number) => (list.length ? list[(seed.current + i) % list.length] : undefined);
    const k1 = pick(kids, 0), k2 = pick(kids, 1) ?? k1, ad = pick(adults, 0) ?? k1;
    const w = (n: string | undefined, rest: string) => (n ? `${n} ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));
    const choreSet = [
      w(k1, 'take out the trash tomorrow at 5 PM'), w(k2, 'water the plants every Sunday'), w(k1, 'clean up their room before dinner'),
      w(k2, 'feed the dog every morning at 7 AM'), w(k1, 'do the dishes tonight'), w(k2, 'pack the school bag tonight'),
    ];
    const eventSet = [
      w(k1, 'piano lesson Thursday 3:30 PM'), 'Family dinner Sunday 5:30 PM', w(ad, 'dentist Friday 4 PM'),
      w(k2, 'soccer practice Saturday 10 AM at the field'), w(ad, 'parent-teacher meeting next Tuesday 6 PM'), 'Movie night Friday 7 PM',
    ];
    const set = mode === 'chore' ? choreSet : eventSet;
    const start = seed.current % set.length;
    return [0, 1, 2].map(i => set[(start + i) % set.length]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, people, visible]);
  const whoNames = who.map(id => firstName(people.find(m => m.id === id))).filter(Boolean).join(', ');

  return (
    <KioskFormDrawer
      visible={visible} variant="drawer"
      title={mode === 'chore' ? 'Just describe your task' : 'Just describe your event'}
      subtitle="Type a thought. Speak a thought. Make it a plan."
      accent={k.primary} Icon={Sparkles} k={k} onClose={close}
      submitLabel={submitLabel} onSubmit={submit} canSubmit={canSubmit} submitting={saving}
      error={dup && dupAck && formOpen && mode === 'chore' ? `Looks like “${dup.title}” already exists. Tap “Add anyway” to create it.` : null}
    >
      <View style={s.body}>
        {/* Resting hero */}
        {!formOpen && (
          <LinearGradient colors={[k.pastelLavCard, k.pastelPrimaryCard]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={[s.heroIcon, { backgroundColor: k.card }]}><Sparkles size={26} color={k.purple} strokeWidth={2.2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.heroTitle, { color: k.text }]}>{mode === 'chore' ? 'One sentence is enough' : 'Say it once, we do the rest'}</Text>
              <Text style={[s.heroText, { color: k.textMuted }]}>
                {mode === 'chore' ? 'Who, what and when. We pick the category, the reward and the assignee.' : 'What, who and when. We fill in the date, time, people and any ride.'}
              </Text>
            </View>
          </LinearGradient>
        )}

        {/* Composer */}
        <View style={[s.composer, { backgroundColor: k.card, borderColor: focused || listening ? k.primary : k.cardBorder }, kioskElevation(k.primary, isDark, 2)]}>
          <TextInput
            value={listening ? (dictation.liveTranscript || input) : input} onChangeText={setInput} multiline
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            placeholder={examples[0]}
            placeholderTextColor={k.textFaint} style={[s.composerInput, { color: k.text, paddingRight: input ? 44 : 0 }]}
          />
          {!!input && (
            <Pressable onPress={() => { if (listening) dictation.reset(); setInput(''); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear"
              style={[s.clearBtn, { backgroundColor: k.well }]}>
              <X size={18} color={k.textMuted} strokeWidth={2.5} />
            </Pressable>
          )}
          <View style={s.composerBar}>
            <Pressable onPress={listening ? stopVoice : () => dictation.start()} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Speak'}
              style={({ pressed }) => [s.micBtn, { backgroundColor: listening ? k.danger : k.primary }, pressed && { opacity: 0.85 }]}>
              {listening ? <Square size={18} color={k.onAccent} fill={k.onAccent} /> : <Mic size={24} color={k.onPrimary} strokeWidth={2.2} />}
              {listening && <Waveform color={k.onAccent} />}
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={aiFill} disabled={!input.trim() || aiBusy} accessibilityRole="button" accessibilityLabel="Auto-fill with AI"
              style={({ pressed }) => [s.aiBtn, { backgroundColor: k.pastelAmberCard, opacity: input.trim() ? 1 : 0.45 }, pressed && { opacity: 0.8 }]}>
              {aiBusy ? <ActivityIndicator size="small" color={k.gold} /> : <Sparkles size={22} color={k.gold} strokeWidth={2.2} />}
            </Pressable>
          </View>
        </View>

        {/* What we understood */}
        {detection && (
          <View style={{ gap: 10 }}>
            <Eyebrow label="WE UNDERSTOOD" accent={k.sage} k={k} />
            <View style={s.wrapRow}>
              <Pill bg={k.pastelLavCard} fg={k.purple} label={`${detection.category.emoji}  ${detCat}`} />
              {(detection.when.date || detection.when.time) && (
                <Pill bg={k.pastelAmberCard} fg={k.gold} Icon={Clock}
                  label={`${detection.when.date ? fmtDay(fromParts(detection.when.date, null, when)) : 'Today'}${detection.when.time ? ` · ${fmt12hStr(detection.when.time.slice(0, 5))}` : ''}`} />
              )}
              {detectedWho.map(m => <Pill key={m.id} bg={k.pastelSageCard} fg={k.sage} Icon={User} label={firstName(m)} />)}
              {detection.recurrence !== 'once' && <Pill bg={k.pastelLavCard} fg={k.purple} Icon={Repeat} label={detection.recurrence} />}
              {!!suggest && !detectedWho.length && (
                <Pressable onPress={() => { setWho([suggest.id]); setPool(false); }} accessibilityRole="button" style={[s.pill, { backgroundColor: k.well, borderColor: k.cardBorder, borderWidth: 1 }]}>
                  <Sparkles size={15} color={k.textMuted} /><Text style={[s.pillText, { color: k.textMuted }]}>Suggested: {suggest.name}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Try saying */}
        {!formOpen && !detection && (
          <View style={{ gap: 10 }}>
            <Eyebrow label="TRY SAYING" accent={k.gold} k={k} />
            {examples.map(e => (
              <Pressable key={e} onPress={() => setInput(e)} accessibilityRole="button" accessibilityLabel={`Use example: ${e}`}
                style={({ pressed }) => [s.example, { backgroundColor: k.pastelAmber, borderColor: k.pastelAmberCard }, pressed && { opacity: 0.75 }]}>
                <Lightbulb size={18} color={k.gold} strokeWidth={2.2} />
                <Text style={[s.exampleText, { color: k.text }]} numberOfLines={2}>{e}</Text>
                <ArrowRight size={16} color={k.textFaint} />
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Chore form ── */}
        {formOpen && mode === 'chore' && (
          <>
            <Card title="What" hint="Name it and add any detail" Icon={ClipboardList} tone={{ card: k.pastelLavCard, fg: k.purple }}>
              <Field label="TITLE" value={title} set={setTitle} placeholder="Chore title" />
              <Field label="NOTES" value={desc} set={setDesc} placeholder="Anything they should know (optional)" multiline />
            </Card>
            <Card title="When" hint="Due date and how often" Icon={CalendarClock} tone={{ card: k.pastelSageCard, fg: k.sage }}>
              <KioskDueDateTimePicker value={when} setValue={setWhen} showDatePick={showDate} setShowDatePick={setShowDate}
                showTimePick={showTime} setShowTimePick={setShowTime} fmtDateLabel={fmtDay} fmtTimeLabel={fmt12} accentColor={k.sage} label="DUE" />
              {recurRow()}
            </Card>
            <Card title="Who's on it" hint="Pick people, or open it to the pool" Icon={Users} tone={{ card: k.pastelAmberCard, fg: k.gold }}>
              <View style={s.wrapRow}>
                <Chip label="Pool" on={pool} onPress={() => { setPool(v => !v); setWho([]); }} tone={k.gold} Icon={Zap} />
                {!pool && people_(true, who, id => { setPool(false); toggleWho(id); }, people.filter(m => m.role !== 'senior'))}
              </View>
              {pool && <Text style={[s.cardHint, { color: k.gold }]}>Any kid or teen can claim it. First to grab it gets the coins.</Text>}
              {!pool && who.length === 0 && <Text style={[s.cardHint, { color: k.textMuted }]}>Tap to assign, or turn on Pool.</Text>}
            </Card>
            {!adultsOnly && (
              <Card title="Reward" hint="Coins for finishing it" Icon={Coins} tone={{ card: k.pastelPrimaryCard, fg: k.terracotta }}>
                <View style={s.wrapRow}>{COIN_OPTIONS.map(c => <Chip key={c} label={`${c} coins`} on={!customCoins && coins === c} onPress={() => { setCoins(c); setCustomCoins(''); }} tone={k.gold} Icon={Coins} />)}</View>
                <Field label="OR A CUSTOM AMOUNT" value={customCoins} set={t => setCustomCoins(t.replace(/\D/g, ''))} placeholder="e.g. 45" />
                <View style={s.wrapRow}>
                  <Chip label="Bonus coins" on={bonusOn} onPress={() => setBonusOn(v => !v)} tone={k.gold} Icon={Gift} />
                  <Chip label="Photo proof" on={proof} onPress={() => setProof(v => !v)} tone={k.purple} Icon={Camera} />
                </View>
                {bonusOn && <Field label="BONUS AMOUNT" value={bonus} set={t => setBonus(t.replace(/\D/g, ''))} placeholder="25" />}
              </Card>
            )}
            <Preview k={k} title={title} lines={[
              [Clock, `${fmtDay(when)} · ${fmt12(when)}${recur !== 'once' ? ` · ${recur}` : ''}`],
              [Users, pool || !who.length ? 'Anyone can claim it' : whoNames],
              ...(adultsOnly ? [] : [[Coins, `${finalCoins} coins${bonusOn ? ` + ${bonus || 0} bonus` : ''}`] as [LucideIcon, string]]),
            ]} />
          </>
        )}

        {/* ── Event form ── */}
        {formOpen && mode === 'event' && (
          <>
            <Card title="What" hint="Name it and choose a type" Icon={CalendarClock} tone={{ card: k.pastelSageCard, fg: k.sage }}>
              <Field label="TITLE" value={title} set={setTitle} placeholder="Event title" />
              <View style={s.wrapRow}>{EVENT_CATS.map(c => <Chip key={c.key} label={`${c.emoji}  ${c.key}`} on={category === c.key} onPress={() => setCategory(c.key)} tone={k.sage} />)}</View>
            </Card>
            <Card title="When" hint="Start, end and how often" Icon={Clock} tone={{ card: k.pastelAmberCard, fg: k.gold }}>
              <View style={s.wrapRow}><Chip label="All day" on={allDay} onPress={() => setAllDay(v => !v)} tone={k.gold} Icon={Calendar} /></View>
              <KioskDueDateTimePicker value={when} setValue={v => { const d = typeof v === 'function' ? v(when) : v; setWhen(d); setEndWhen(e => { const n = new Date(d); n.setHours(e.getHours(), e.getMinutes(), 0, 0); return n <= d ? new Date(d.getTime() + 3600000) : n; }); }}
                showDatePick={showDate} setShowDatePick={setShowDate} showTimePick={showTime} setShowTimePick={setShowTime}
                fmtDateLabel={fmtDay} fmtTimeLabel={fmt12} accentColor={k.gold} label={allDay ? 'DATE' : 'STARTS'} />
              {!allDay && (
                <View style={{ gap: 6 }}>
                  <Text style={[s.fieldLabel, { color: k.textFaint }]}>ENDS · {fmt12(endWhen)}</Text>
                  <View style={s.wrapRow}>
                    {[-30, 30, 60].map(delta => <Chip key={delta} label={delta < 0 ? '−30 min' : `+${delta} min`} on={false} onPress={() => setEndWhen(e => new Date(e.getTime() + delta * 60000))} tone={k.gold} />)}
                  </View>
                </View>
              )}
              {recurRow()}
            </Card>
            <Card title="Who" hint="Everyone this is for" Icon={Users} tone={{ card: k.pastelLavCard, fg: k.purple }}>
              <View style={s.wrapRow}>{people_(true, who, toggleWho, people)}</View>
              {who.map(id => !!conflicts[id] && (
                <View key={id} style={[s.warnRow, { backgroundColor: k.pastelPrimary }]}>
                  <Text style={[s.warn, { color: k.danger }]}>{firstName(people.find(m => m.id === id))}: {conflicts[id]}</Text>
                </View>
              ))}
            </Card>
            <Card title="Where & notes" hint="Optional details" Icon={MapPin} tone={{ card: k.pastelPrimaryCard, fg: k.terracotta }}>
              <Field label="LOCATION" value={location} set={setLocation} placeholder="Address or place" />
              <Field label="NOTES" value={notes} set={setNotes} placeholder="Anything to remember" multiline />
            </Card>
            <Card title="Ride" hint="Arrange a drop-off and pick-up" Icon={Car} tone={{ card: k.pastelSageCard, fg: k.sage }}>
              <View style={s.wrapRow}>
                <Chip label="Needs a ride" on={rideOn} onPress={() => setRideOn(v => !v)} tone={k.sage} Icon={Car} />
                {rideOn && <Chip label="Add pick-up" on={pickupOn} onPress={() => setPickupOn(v => !v)} tone={k.sage} Icon={Repeat} />}
              </View>
              {rideOn && (
                <>
                  <Field label="PICK UP AT" value={rideFrom} set={setRideFrom} placeholder="From" />
                  <Field label="DROP OFF AT" value={rideTo} set={setRideTo} placeholder="To" />
                  <Text style={[s.fieldLabel, { color: k.textFaint }]}>DRIVER</Text>
                  <View style={s.wrapRow}>{people_(false, driverId ? [driverId] : [], id => setDriverId(d => (d === id ? undefined : id)), parents)}</View>
                </>
              )}
            </Card>
            <Preview k={k} title={title} lines={[
              [Clock, allDay ? `${fmtDay(when)} · all day` : `${fmtDay(when)} · ${fmt12(when)} – ${fmt12(endWhen)}${recur !== 'once' ? ` · ${recur}` : ''}`],
              [Users, whoNames || 'Everyone'],
              ...(location.trim() ? [[MapPin, location.trim()] as [LucideIcon, string]] : []),
              ...(rideOn ? [[Car, `Ride${driverId ? ` with ${firstName(people.find(m => m.id === driverId))}` : ' needed'}${pickupOn ? ' + pick-up' : ''}`] as [LucideIcon, string]] : []),
            ]} />
          </>
        )}
      </View>
    </KioskFormDrawer>
  );
}

/* Form building blocks live at module level on purpose: defined inside the
 * drawer they would be a NEW component type every render, so every keystroke
 * remounted the text field and dropped the keyboard. */
function Chip({ label, on, onPress, tone, Icon }: { label: string; on: boolean; onPress: () => void; tone?: string; Icon?: LucideIcon }) {
  const { k } = useKioskColors();
  const t = tone ?? k.primary;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={({ pressed }) => [s.chip, { backgroundColor: on ? t : k.well, borderColor: on ? t : k.cardBorder }, pressed && { opacity: 0.8 }]}>
      {Icon && <Icon size={16} color={on ? k.onAccent : k.textMuted} strokeWidth={2.2} />}
      <Text style={[s.chipText, { color: on ? k.onAccent : k.text }]}>{label}</Text>
    </Pressable>
  );
}

function PersonChip({ m, i, on, onPress }: { m: FamilyMember; i: number; on: boolean; onPress: () => void }) {
  const { k } = useKioskColors();
  const tone = kioskPastels(k)[i % 4];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={firstName(m)}
      style={({ pressed }) => [s.person, { backgroundColor: on ? tone.fg : tone.card, borderColor: on ? tone.fg : 'transparent' }, pressed && { opacity: 0.8 }]}>
      <KioskAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={28} bgColor={k.card} k={k} />
      <Text style={[s.chipText, { color: on ? k.onAccent : tone.fg }]}>{firstName(m)}</Text>
      {on && <Check size={15} color={k.onAccent} strokeWidth={3} />}
    </Pressable>
  );
}

function Card({ title, hint, Icon, tone, children }: { title: string; hint?: string; Icon: LucideIcon; tone: { card: string; fg: string }; children: React.ReactNode }) {
  const { k, isDark } = useKioskColors();
  return (
    <View style={[s.card, { backgroundColor: k.card, borderColor: k.cardBorder }, kioskElevation(tone.fg, isDark)]}>
      <View style={s.cardHead}>
        <View style={[s.iconTile, { backgroundColor: tone.card }]}><Icon size={20} color={tone.fg} strokeWidth={2.2} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cardTitle, { color: k.text }]}>{title}</Text>
          {!!hint && <Text style={[s.cardHint, { color: k.textMuted }]}>{hint}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

function Field({ label, value, set, placeholder, multiline }: { label?: string; value: string; set: (t: string) => void; placeholder: string; multiline?: boolean }) {
  const { k } = useKioskColors();
  return (
    <View style={{ gap: 6 }}>
      {!!label && <Text style={[s.fieldLabel, { color: k.textFaint }]}>{label}</Text>}
      <TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={k.textFaint} multiline={multiline}
        style={[s.field, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder }, multiline && { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]} />
    </View>
  );
}

function Pill({ bg, fg, label, Icon }: { bg: string; fg: string; label: string; Icon?: LucideIcon }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {Icon && <Icon size={15} color={fg} strokeWidth={2.2} />}
      <Text style={[s.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function Preview({ k, title, lines }: { k: KioskColors; title: string; lines: [LucideIcon, string][] }) {
  return (
    <LinearGradient colors={[k.pastelSageCard, k.pastelLavCard]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.preview}>
      <Eyebrow label="PREVIEW" accent={k.sage} k={k} />
      <Text style={[s.previewTitle, { color: k.text }]} numberOfLines={2}>{title.trim() || 'Untitled'}</Text>
      {lines.map(([Icon, text], i) => (
        <View key={i} style={s.previewLine}>
          <Icon size={16} color={k.textMuted} strokeWidth={2.2} />
          <Text style={[s.previewText, { color: k.text }]} numberOfLines={2}>{text}</Text>
        </View>
      ))}
    </LinearGradient>
  );
}

/** Listening indicator, like the phone's waveform. */
function Waveform({ color }: { color: string }) {
  const bars = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = bars.map((b, i) => Animated.loop(Animated.sequence([
      Animated.timing(b, { toValue: 1, duration: 260 + i * 70, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(b, { toValue: 0.25, duration: 260 + i * 50, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [bars]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 }}>
      {bars.map((b, i) => <Animated.View key={i} style={{ width: 4, borderRadius: 2, backgroundColor: color, height: b.interpolate({ inputRange: [0, 1], outputRange: [5, 22] }) }} />)}
    </View>
  );
}

const s = StyleSheet.create({
  body: { gap: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xl },
  hero: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, borderRadius: 28, padding: KIOSK_SPACE.lg },
  heroIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.4 },
  heroText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', lineHeight: 20, marginTop: 4 },
  composer: { borderRadius: 28, borderWidth: 2, padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.md },
  composerInput: { minHeight: 96, fontSize: KIOSK_TYPO.heading, fontWeight: '600', letterSpacing: -0.2, textAlignVertical: 'top' },
  clearBtn: { position: 'absolute', top: KIOSK_SPACE.md, right: KIOSK_SPACE.md, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  composerBar: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  micBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minWidth: 56, minHeight: 56, borderRadius: 28, paddingHorizontal: 16 },
  micText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  aiBtn: { alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 28 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 9 },
  pillText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  example: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, padding: KIOSK_SPACE.md },
  exampleText: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  card: { borderRadius: 26, borderWidth: 1, padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  iconTile: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: KIOSK_TYPO.subheading + 1, fontWeight: '800', letterSpacing: -0.3 },
  cardHint: { fontSize: KIOSK_TYPO.label, fontWeight: '600', marginTop: 1 },
  fieldLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1 },
  field: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 46, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
  chipText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 16, borderWidth: 2, paddingLeft: 8, paddingRight: 14 },
  dayDot: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  warnRow: { borderRadius: 14, padding: 12 },
  warn: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  preview: { borderRadius: 26, padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.sm },
  previewTitle: { fontSize: KIOSK_TYPO.title - 2, fontWeight: '800', letterSpacing: -0.5 },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewText: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },
});
export type { KioskColors };
