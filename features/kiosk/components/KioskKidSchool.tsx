/**
 * KioskKidSchool — one child's school on the kiosk, mirroring the phone's page: Schedule (by day / week grid, term chips,
 * add / edit / delete each class), Holidays (month grid + cards, edit, multi-delete, child picker) and Important dates
 * (add / edit / delete, for one, several or all kids). Also the one-page "Create schedule" (KioskNewSchedule). Same store
 * calls as the phone; right-side drawers per the kiosk rhythm.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import { GraduationCap, Sun, CalendarDays, Plus, School as SchoolIcon } from 'lucide-react-native';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useSchoolStore, type ClassPeriod, type SchoolHoliday } from '@/store/schoolStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { fmtDate, fmtTime, localDateStr } from '@/lib/dates';
import { termsOf, guessCurrentTerm, periodsInTerm, prettySubject } from '@/features/vault/tabs/school/schoolUtils';
import { useFamilySchools } from '@/features/vault/tabs/school/SchoolPicker';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels, type KioskColors } from '../kioskPalette';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KioskFormDrawer, KioskFieldLabel, kioskInputStyle } from './KioskFormDrawer';
import { KioskDateTimePicker, openAndroidPicker } from './KioskDateTimePicker';
import { KioskAvatar } from './KioskAvatar';

const DAYS = [{ key: 'mon', label: 'Mon', full: 'Monday' }, { key: 'tue', label: 'Tue', full: 'Tuesday' }, { key: 'wed', label: 'Wed', full: 'Wednesday' },
  { key: 'thu', label: 'Thu', full: 'Thursday' }, { key: 'fri', label: 'Fri', full: 'Friday' }];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const DAY_OFF_RE = /\b(holiday|break|no school|in-?service|staff (professional|development)|teacher work ?day|school closed)\b/i;

/* ── small shared pieces (module-level so a re-render never remounts a field) ── */
function Btn({ label, onPress, kind = 'pri', Icon, disabled }: { label: string; onPress: () => void; kind?: 'pri' | 'sec' | 'danger'; Icon?: typeof Plus; disabled?: boolean }) {
  const { k } = useKioskColors();
  const bg = kind === 'pri' ? k.primary : kind === 'danger' ? k.danger + '22' : k.well;
  const fg = kind === 'pri' ? k.onPrimary : kind === 'danger' ? k.danger : k.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }]}>
      {Icon && <Icon size={18} color={fg} strokeWidth={2.4} />}<Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}
function Chip({ label, on, onPress, sub }: { label: string; on: boolean; onPress: () => void; sub?: string }) {
  const { k } = useKioskColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[s.chip, { backgroundColor: on ? k.primary : k.well }]}>
      <Text style={[s.chipText, { color: on ? k.onPrimary : k.text }]}>{label}</Text>
      {!!sub && <Text style={{ fontSize: 11, fontWeight: '700', color: on ? k.onPrimary : k.textMuted }}>{sub}</Text>}
    </Pressable>
  );
}
function KidChips({ kids, picked, onToggle, hint }: { kids: FamilyMember[]; picked: string[]; onToggle: (id: string) => void; hint?: (id: string) => string | undefined }) {
  const { k } = useKioskColors();
  return (
    <View style={s.chips}>
      {kids.map(kd => {
        const on = picked.includes(kd.id);
        return (
          <Pressable key={kd.id} onPress={() => onToggle(kd.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[s.kidChip, { backgroundColor: on ? k.primary : k.well }]}>
            <KioskAvatar name={kd.name} size={32} bgColor={k.card} k={k} />
            <View>
              <Text style={[s.chipText, { color: on ? k.onPrimary : k.text }]}>{kd.name.split(' ')[0]}</Text>
              {!!hint?.(kd.id) && <Text style={{ fontSize: 11, fontWeight: '700', color: on ? k.onPrimary : k.textMuted }}>{hint(kd.id)}</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  const { k, isDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const [open, setOpen] = useState(false);
  const press = () => {
    registerActivity();
    if (Platform.OS === 'android') openAndroidPicker({ mode: 'date', value: new Date((value ?? localDateStr()) + 'T00:00:00'), onChange: d => onChange(localDateStr(d)) });
    else setOpen(o => !o);
  };
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <KioskFieldLabel k={k}>{label}</KioskFieldLabel>
      <Pressable onPress={press} accessibilityRole="button" style={[kioskInputStyle(k), { justifyContent: 'center' }]}>
        <Text style={{ color: value ? k.text : k.textFaint, fontSize: KIOSK_TYPO.body, fontWeight: '700' }}>{value ? fmtDate(value) : 'Pick a date'}</Text>
      </Pressable>
      {open && <KioskDateTimePicker mode="date" visible k={k} isDark={isDark} value={new Date((value ?? localDateStr()) + 'T00:00:00')} onChange={d => onChange(localDateStr(d))} onDone={() => setOpen(false)} />}
    </View>
  );
}
function TimeFieldK({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  const { k, isDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const [open, setOpen] = useState(false);
  const base = () => { const d = new Date(); const [h, m] = (value ?? '08:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
  const press = () => {
    registerActivity();
    if (Platform.OS === 'android') openAndroidPicker({ mode: 'time', value: base(), onChange: d => onChange(hhmm(d)) });
    else setOpen(o => !o);
  };
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <KioskFieldLabel k={k}>{label}</KioskFieldLabel>
      <Pressable onPress={press} accessibilityRole="button" style={[kioskInputStyle(k), { justifyContent: 'center' }]}>
        <Text style={{ color: value ? k.text : k.textFaint, fontSize: KIOSK_TYPO.body, fontWeight: '700' }}>{value ? fmtTime(value) : 'Not set'}</Text>
      </Pressable>
      {open && <KioskDateTimePicker mode="time" visible k={k} isDark={isDark} value={base()} onChange={d => onChange(hhmm(d))} onDone={() => setOpen(false)} />}
    </View>
  );
}
function Field({ label, value, onChangeText, placeholder, multiline }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const { k } = useKioskColors();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <KioskFieldLabel k={k}>{label}</KioskFieldLabel>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={k.textFaint} multiline={multiline}
        style={[kioskInputStyle(k), { color: k.text }, multiline && { minHeight: 80, textAlignVertical: 'top' }]} />
    </View>
  );
}

/* ── Class editor (also used while creating a schedule, in draft mode) ── */
export function KioskClassEditor({ kid, period, terms, defaultTerm, onClose, draft }: {
  kid: FamilyMember; period: ClassPeriod | null; terms: string[]; defaultTerm?: string; onClose: () => void;
  draft?: { onSave: (p: ClassPeriod) => void; onDelete?: () => void };
}) {
  const { k } = useKioskColors();
  useKioskLockSuspended(true);
  const [subject, setSubject] = useState(period?.subject ?? '');
  const [room, setRoom] = useState(period?.room ?? '');
  const [teacher, setTeacher] = useState(period?.teacher ?? '');
  const [start, setStart] = useState<string | null>(period?.startTime ?? '08:00');
  const [end, setEnd] = useState<string | null>(period?.endTime ?? '08:50');
  const [days, setDays] = useState<string[]>(period?.days ?? DAYS.map(d => d.key));
  const [term, setTerm] = useState<string | undefined>(period ? period.term : defaultTerm);
  const [error, setError] = useState('');

  const save = () => {
    if (!subject.trim()) { setError('Give the class a name.'); return; }
    if (!start || !end || mins(end) <= mins(start)) { setError('The end time has to be after the start time.'); return; }
    if (days.length === 0) { setError('Pick at least one day.'); return; }
    const patch = { subject: subject.trim(), room: room.trim(), teacher: teacher.trim() || undefined, startTime: start, endTime: end, days, term };
    if (draft) { draft.onSave({ id: period?.id ?? 'p' + Date.now() + Math.floor(Math.random() * 1000), period: period?.period ?? 0, ...patch } as ClassPeriod); onClose(); return; }
    const st = useSchoolStore.getState();
    const sc = st.schedules.find(x => x.memberId === kid.id);
    if (!sc) return;
    if (period) {
      if (period.linkedEventId) st.updatePeriod(kid.id, period.id, patch);
      else st.updateSchedule(kid.id, { periods: sc.periods.map(p => p.id === period.id ? { ...p, ...patch } : p) });
    } else {
      st.updateSchedule(kid.id, { periods: [...sc.periods, { id: 'p' + Date.now(), period: sc.periods.length + 1, ...patch } as ClassPeriod].sort((a, b) => a.startTime.localeCompare(b.startTime)) });
    }
    onClose();
  };
  const remove = () => {
    if (!period) return;
    Alert.alert(`Delete ${period.subject}?`, `It's removed from ${kid.name.split(' ')[0]}'s timetable.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { if (draft) draft.onDelete?.(); else useSchoolStore.getState().deletePeriod(kid.id, period.id); onClose(); } },
    ]);
  };
  return (
    <KioskFormDrawer visible variant="drawer" title={period ? 'Edit class' : 'Add a class'} subtitle={`${kid.name.split(' ')[0]}'s timetable`}
      accent={k.gold} Icon={GraduationCap} k={k} onClose={onClose} submitLabel={period ? 'Save changes' : 'Add class'} onSubmit={save} canSubmit error={error || undefined}>
      <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
        <Field label="CLASS" value={subject} onChangeText={t => { setSubject(t); setError(''); }} placeholder="e.g. Math" />
        <View style={s.two}><Field label="ROOM" value={room} onChangeText={setRoom} placeholder="Optional" /><Field label="TEACHER" value={teacher} onChangeText={setTeacher} placeholder="Optional" /></View>
        <View style={s.two}><TimeFieldK label="STARTS" value={start} onChange={v => { setStart(v); setError(''); }} /><TimeFieldK label="ENDS" value={end} onChange={v => { setEnd(v); setError(''); }} /></View>
        <View style={{ gap: 6 }}>
          <KioskFieldLabel k={k}>DAYS</KioskFieldLabel>
          <View style={s.chips}>{DAYS.map(d => <Chip key={d.key} label={d.label} on={days.includes(d.key)} onPress={() => setDays(p => p.includes(d.key) ? p.filter(x => x !== d.key) : [...p, d.key])} />)}</View>
        </View>
        {draft && <Field label="TERM (OPTIONAL)" value={term ?? ''} onChangeText={t => setTerm(t.trim() ? t : undefined)} placeholder="e.g. Fall, Term 1, Q1" />}
        {!draft && terms.length > 0 && (
          <View style={{ gap: 6 }}>
            <KioskFieldLabel k={k}>TERM</KioskFieldLabel>
            <View style={s.chips}>{[...terms, undefined].map(t => <Chip key={t ?? 'all'} label={t ?? 'All year'} on={term === t} onPress={() => setTerm(t)} />)}</View>
          </View>
        )}
        {period && <Btn kind="danger" label="Delete this class" onPress={remove} />}
      </View>
    </KioskFormDrawer>
  );
}

/* ── Holiday editor ── */
function KioskHolidayEditor({ kid, kids, holiday, onClose }: { kid: FamilyMember; kids: FamilyMember[]; holiday: SchoolHoliday | null; onClose: () => void }) {
  const { k } = useKioskColors();
  useKioskLockSuspended(true);
  const schedules = useSchoolStore(x => x.schedules);
  const twinOf = (id: string) => holiday ? schedules.find(sc => sc.memberId === id)?.holidays?.find(h => h.reason === holiday.reason && h.startDate === holiday.startDate && h.endDate === holiday.endDate) : undefined;
  const [picked, setPicked] = useState<string[]>(() => { if (!holiday) return [kid.id]; const w = kids.filter(x => twinOf(x.id)).map(x => x.id); return w.length ? w : [kid.id]; });
  const [reason, setReason] = useState(holiday?.reason ?? '');
  const [from, setFrom] = useState<string | null>(holiday?.startDate ?? null);
  const [to, setTo] = useState<string | null>(holiday?.endDate ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy) return;
    if (!reason.trim()) { setError('Give the holiday a name.'); return; }
    if (!from) { setError('Pick the first day.'); return; }
    const last = to ?? from;
    if (last < from) { setError("The last day can't be before the first day."); return; }
    if (picked.length === 0) { setError('Choose at least one child.'); return; }
    setBusy(true);
    try {
      const st = useSchoolStore.getState();
      if (holiday) for (const x of kids) { const old = twinOf(x.id); if (old) await st.removeHoliday(x.id, old.id); }
      for (const id of picked) {
        const kd = kids.find(x => x.id === id); if (!kd) continue;
        if (!useSchoolStore.getState().schedules.find(sc => sc.memberId === id)) {
          st.addSchedule({ memberId: id, memberName: kd.name, semester: 'Fall' as any, year: new Date().getFullYear(), lunchPeriod: 'B' as any, dayType: 'Regular' as any, periods: [] });
        }
        await useSchoolStore.getState().addHoliday(id, { startDate: from, endDate: last, reason: reason.trim() });
      }
      onClose();
    } finally { setBusy(false); }
  };
  const remove = () => {
    if (!holiday || busy) return;
    Alert.alert(`Delete ${holiday.reason}?`, `Classes on those days go back on the schedule.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { for (const id of picked) { const old = twinOf(id); if (old) await useSchoolStore.getState().removeHoliday(id, old.id); } onClose(); } finally { setBusy(false); }
      } },
    ]);
  };
  return (
    <KioskFormDrawer visible variant="drawer" title={holiday ? 'Edit holiday' : 'Add a holiday'} subtitle="Classes on these days are skipped" accent={k.gold} Icon={Sun} k={k}
      onClose={onClose} submitLabel={busy ? 'Saving…' : holiday ? 'Save changes' : 'Add holiday'} onSubmit={save} canSubmit={!busy} error={error || undefined}>
      <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
        {kids.length > 1 && (
          <View style={{ gap: 6 }}>
            <KioskFieldLabel k={k}>{holiday ? 'CHANGES APPLY TO' : 'ADD FOR'}</KioskFieldLabel>
            <KidChips kids={kids} picked={picked} onToggle={id => { setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); setError(''); }} hint={id => holiday && twinOf(id) ? 'has this holiday' : undefined} />
          </View>
        )}
        <Field label="NAME" value={reason} onChangeText={t => { setReason(t); setError(''); }} placeholder="e.g. Winter Break" />
        <View style={s.two}>
          <DateField label="FIRST DAY" value={from} onChange={v => { setFrom(v); setError(''); if (!to || to < v) setTo(v); }} />
          <DateField label="LAST DAY · INCLUSIVE" value={to} onChange={v => { setTo(v); setError(''); }} />
        </View>
        {holiday && <Btn kind="danger" label="Delete this holiday" onPress={remove} />}
      </View>
    </KioskFormDrawer>
  );
}

/* ── Important date editor ── */
function KioskDateEditor({ kid, kids, event, onClose }: { kid: FamilyMember; kids: FamilyMember[]; event: FamilyEvent | null; onClose: () => void }) {
  const { k } = useKioskColors();
  useKioskLockSuspended(true);
  const [picked, setPicked] = useState<string[]>(() => {
    const ids = event?.memberIds?.length ? event.memberIds : event?.memberId ? [event.memberId] : [kid.id];
    const ok = ids.filter(id => kids.some(x => x.id === id)); return ok.length ? ok : [kid.id];
  });
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState<string | null>(event?.date ?? null);
  const [allDay, setAllDay] = useState(event ? (!event.time || !!event.allDay) : true);
  const [start, setStart] = useState<string | null>(event?.time ?? '09:00');
  const [end, setEnd] = useState<string | null>(event?.endTime ?? null);
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy) return;
    if (!title.trim()) { setError('Give it a name.'); return; }
    if (!date) { setError('Pick the date.'); return; }
    if (picked.length === 0) { setError('Choose at least one child.'); return; }
    if (!allDay && (!start || (end && mins(end) <= mins(start)))) { setError('The end time has to be after the start time.'); return; }
    setBusy(true);
    try {
      const st = useEventStore.getState();
      const fields = { title: title.trim(), date, time: allDay ? undefined : start ?? undefined, endTime: allDay ? undefined : end ?? undefined,
        allDay: allDay || undefined, notes: notes.trim() || undefined, memberId: picked[0], memberIds: picked.length > 1 ? picked : undefined };
      if (event) await st.updateEvent(event.id, { ...fields, memberIds: picked.length > 1 ? picked : [], allDay });
      else {
        const id = await st.addEvent({ ...fields, category: 'School', type: 'event', createdBy: useFamilyStore.getState().activeMemberId ?? undefined, approvalPending: false } as any);
        if (!id) { setError('Could not save. Check the connection and try again.'); return; }
      }
      onClose();
    } finally { setBusy(false); }
  };
  const remove = () => {
    if (!event) return;
    Alert.alert(`Delete ${event.title}?`, 'It is removed from the school dates and the calendar.', [
      { text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { useEventStore.getState().deleteEvent(event.id); onClose(); } },
    ]);
  };
  return (
    <KioskFormDrawer visible variant="drawer" title={event ? 'Edit school date' : 'Add a school date'} subtitle="Early release, picture day, conferences…" accent={k.gold} Icon={CalendarDays} k={k}
      onClose={onClose} submitLabel={busy ? 'Saving…' : event ? 'Save changes' : 'Add school date'} onSubmit={save} canSubmit={!busy} error={error || undefined}>
      <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
        {kids.length > 0 && (
          <View style={{ gap: 6 }}>
            <KioskFieldLabel k={k}>FOR</KioskFieldLabel>
            <KidChips kids={kids} picked={picked} onToggle={id => { setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); setError(''); }} />
            {kids.length > 1 && <Btn kind="sec" label={picked.length === kids.length ? 'Clear' : 'All kids'} onPress={() => setPicked(picked.length === kids.length ? [] : kids.map(x => x.id))} />}
          </View>
        )}
        <Field label="WHAT IS IT" value={title} onChangeText={t => { setTitle(t); setError(''); }} placeholder="e.g. Picture day" />
        <DateField label="DATE" value={date} onChange={v => { setDate(v); setError(''); }} />
        <View style={s.chips}><Chip label="All day" on={allDay} onPress={() => setAllDay(true)} /><Chip label="At a time" on={!allDay} onPress={() => setAllDay(false)} /></View>
        {!allDay && <View style={s.two}><TimeFieldK label="STARTS" value={start} onChange={setStart} /><TimeFieldK label="ENDS (OPTIONAL)" value={end} onChange={setEnd} /></View>}
        <Field label="NOTES" value={notes} onChangeText={setNotes} placeholder="Anything to remember" multiline />
        {event && <Btn kind="danger" label="Delete this date" onPress={remove} />}
      </View>
    </KioskFormDrawer>
  );
}

/* ── One-page "Create schedule" ── */
export function KioskNewSchedule({ kids, presetKidId, onClose }: { kids: FamilyMember[]; presetKidId?: string; onClose: () => void }) {
  const { k } = useKioskColors();
  useKioskLockSuspended(true);
  const familySchools = useFamilySchools();
  const [kidId, setKidId] = useState(presetKidId ?? (kids.length === 1 ? kids[0].id : ''));
  const [school, setSchool] = useState(() => useSchoolStore.getState().schedules.find(x => x.school?.trim())?.school?.trim() ?? '');
  const [addingSchool, setAddingSchool] = useState(familySchools.length === 0);
  const [grade, setGrade] = useState('');
  const [classes, setClasses] = useState<ClassPeriod[]>([]);
  const [editing, setEditing] = useState<ClassPeriod | 'new' | null>(null);
  const [error, setError] = useState('');
  const kid = kids.find(x => x.id === kidId);
  const terms = [...new Set(classes.map(c => c.term).filter((t): t is string => !!t))];

  const doSave = () => {
    if (!kid) return;
    const sorted = [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((c, i) => ({ ...c, period: i + 1 }));
    useSchoolStore.getState().addSchedule({ memberId: kid.id, memberName: kid.name, semester: 'Fall' as any, year: new Date().getFullYear(),
      gradeYear: grade.trim() || undefined, school: school.trim() || undefined, lunchPeriod: 'B' as any, dayType: 'Regular' as any, periods: sorted,
      holidays: useSchoolStore.getState().schedules.find(x => x.memberId === kid.id)?.holidays ?? [] });
    onClose();
  };
  const save = () => {
    if (!kid) { setError('Choose who this schedule is for.'); return; }
    if (classes.length === 0) { setError('Add at least one class.'); return; }
    const ex = useSchoolStore.getState().schedules.find(x => x.memberId === kid.id);
    if (ex && ex.periods.length > 0) { Alert.alert(`Replace ${kid.name.split(' ')[0]}'s schedule?`, `They have ${ex.periods.length} classes. This replaces them (holidays are kept).`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: doSave }]); return; }
    doSave();
  };
  return (
    <>
      <KioskFormDrawer visible variant="drawer" title="Create schedule" subtitle="Who it's for, the school and the classes" accent={k.gold} Icon={GraduationCap} k={k}
        onClose={onClose} submitLabel="Save schedule" onSubmit={save} canSubmit error={error || undefined}>
        <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
          <View style={{ gap: 6 }}>
            <KioskFieldLabel k={k}>FOR</KioskFieldLabel>
            <KidChips kids={kids} picked={kidId ? [kidId] : []} onToggle={id => { setKidId(id); setError(''); }} />
          </View>
          <View style={{ gap: 6 }}>
            <KioskFieldLabel k={k}>SCHOOL</KioskFieldLabel>
            <View style={s.chips}>
              {familySchools.map(n => <Chip key={n} label={n} on={school.trim().toLowerCase() === n.toLowerCase()} onPress={() => { setSchool(n); setAddingSchool(false); }} />)}
              <Chip label="+ New school" on={false} onPress={() => { setAddingSchool(true); setSchool(''); }} />
            </View>
            {addingSchool && <TextInput value={school} onChangeText={setSchool} placeholder="School name (added once, then one tap)" placeholderTextColor={k.textFaint} style={[kioskInputStyle(k), { color: k.text }]} />}
          </View>
          <Field label="GRADE" value={grade} onChangeText={setGrade} placeholder="e.g. 8th Grade" />
          <KioskFieldLabel k={k}>{`CLASSES · ${classes.length}`}</KioskFieldLabel>
          {[...classes].sort((a, b) => a.startTime.localeCompare(b.startTime)).map(c => (
            <Pressable key={c.id} onPress={() => setEditing(c)} accessibilityRole="button" style={[s.row, { backgroundColor: k.well }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.perName, { color: k.text }]} numberOfLines={1}>{c.subject}</Text>
                <Text style={[s.muted, { color: k.textMuted }]}>{fmtTime(c.startTime)} – {fmtTime(c.endTime)} · {(c.days ?? []).map(d => d.slice(0, 3)).join(' ')}{c.term ? ` · ${c.term}` : ''}</Text>
              </View>
              <Text style={[s.muted, { color: k.primary }]}>Edit</Text>
            </Pressable>
          ))}
          <Btn kind="sec" Icon={Plus} label="Add a class" onPress={() => setEditing('new')} />
        </View>
      </KioskFormDrawer>
      {editing && kid !== undefined || editing ? (
        <KioskClassEditor kid={kid ?? kids[0]} period={editing === 'new' || !editing ? null : editing} terms={terms} defaultTerm={terms[0]} onClose={() => setEditing(null)}
          draft={{ onSave: c => setClasses(p => p.some(x => x.id === c.id) ? p.map(x => x.id === c.id ? c : x) : [...p, c]),
            onDelete: editing && editing !== 'new' ? () => setClasses(p => p.filter(x => x.id !== (editing as ClassPeriod).id)) : undefined }} />
      ) : null}
    </>
  );
}

/* ── The child's page ── */
export function KioskKidSchool({ kid, kids, canEdit, onClose, onCreate }: { kid: FamilyMember; kids: FamilyMember[]; canEdit: boolean; onClose: () => void; onCreate: () => void }) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const { registerActivity } = useKioskActivity();
  const schedule = useSchoolStore(x => x.schedules.find(sc => sc.memberId === kid.id));
  const events = useEventStore(x => x.events);
  const [tab, setTab] = useState<'schedule' | 'holidays' | 'dates'>('schedule');
  const [view, setView] = useState<'day' | 'week'>('day');
  const [dayPick, setDayPick] = useState<string | undefined>();
  const terms = termsOf(schedule?.periods ?? []);
  const [termPick, setTermPick] = useState<string | undefined>();
  const term = termPick ?? guessCurrentTerm(terms);
  const todayKey = DAY_KEYS[new Date().getDay()];
  const selDay = dayPick ?? (DAYS.some(d => d.key === todayKey) ? todayKey : 'mon');
  const termPeriods = periodsInTerm(schedule?.periods ?? [], term).filter(p => !p.isLunch);
  const onDay = (key: string) => termPeriods.filter(p => (p.days ?? DAYS.map(d => d.key)).includes(key)).sort((a, b) => mins(a.startTime) - mins(b.startTime));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const [editClass, setEditClass] = useState<ClassPeriod | 'new' | null>(null);
  const [editHoliday, setEditHoliday] = useState<SchoolHoliday | 'new' | null>(null);
  const [editDate, setEditDate] = useState<FamilyEvent | 'new' | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [pickedH, setPickedH] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const holidays = [...(schedule?.holidays ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = localDateStr();
  const dates = useMemo(() => events
    .filter(e => e.date >= today && (e.category === 'School' || e.category === 'Study') && !DAY_OFF_RE.test(e.title) && !e.seriesId && (e.memberId === kid.id || e.memberIds?.includes(kid.id)))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    .filter((e, i, arr) => arr.findIndex(x => x.title === e.title && x.date === e.date) === i).slice(0, 40), [events, kid.id, today]);

  // Month grid
  const seed = (holidays.find(h => h.endDate >= today)?.startDate ?? today) > today ? holidays.find(h => h.endDate >= today)!.startDate : today;
  const [cur, setCur] = useState(() => ({ y: +seed.slice(0, 4), m: +seed.slice(5, 7) - 1 }));
  const first = new Date(cur.y, cur.m, 1).getDay(); const daysIn = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const holidayOn = (d: string) => holidays.find(h => d >= h.startDate && d <= h.endDate);
  const step = (n: number) => setCur(c => { const t = new Date(c.y, c.m + n, 1); return { y: t.getFullYear(), m: t.getMonth() }; });

  const tabs = [{ id: 'schedule' as const, label: 'Schedule' }, { id: 'holidays' as const, label: 'Holidays' }, { id: 'dates' as const, label: 'Important dates' }];

  return (
    <>
      <KioskFormDrawer visible variant="drawer" title={`${kid.name.split(' ')[0]}'s school`} subtitle={[schedule?.gradeYear, schedule?.school].filter(Boolean).join(' · ') || 'Schedule, holidays and important dates'}
        accent={k.gold} Icon={GraduationCap} k={k} onClose={onClose}>
        <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
          <View style={s.chips}>{tabs.map(t => <Chip key={t.id} label={t.label} on={tab === t.id} onPress={() => { registerActivity(); setTab(t.id); }} />)}</View>

          {tab === 'schedule' && (!schedule ? (
            <View style={[s.card, { backgroundColor: k.well }]}>
              <Text style={[s.perName, { color: k.text }]}>No schedule set up yet</Text>
              <Text style={[s.muted, { color: k.textMuted }]}>Add the classes so rides, reminders and the calendar know the school day.</Text>
              {canEdit && <Btn label="Create schedule" onPress={onCreate} />}
            </View>
          ) : (
            <>
              {terms.length > 1 && <View style={s.chips}>{terms.map(t => <Chip key={t} label={t} on={term === t} onPress={() => setTermPick(t)} />)}</View>}
              <View style={s.chips}><Chip label="By day" on={view === 'day'} onPress={() => setView('day')} /><Chip label="Week grid" on={view === 'week'} onPress={() => setView('week')} /></View>
              {view === 'day' ? (
                <>
                  <View style={s.chips}>{DAYS.map(d => <Chip key={d.key} label={d.label} sub={d.key === todayKey ? 'today' : undefined} on={d.key === selDay} onPress={() => setDayPick(d.key)} />)}</View>
                  {onDay(selDay).length === 0 ? <Text style={[s.muted, { color: k.textMuted }]}>No classes on this day.</Text> : onDay(selDay).map((p, i) => {
                    const now = selDay === todayKey && nowMin >= mins(p.startTime) && nowMin < mins(p.endTime);
                    const tone = pastels[i % 4];
                    return (
                      <Pressable key={p.id} onPress={() => canEdit && setEditClass(p)} disabled={!canEdit} accessibilityRole="button"
                        style={[s.per, { backgroundColor: tone.col, borderColor: now ? k.primary : tone.card, borderWidth: now ? 2.5 : 1.5 }]}>
                        <View style={{ minWidth: 118 }}>
                          <Text style={[s.perTime, { color: k.text }]}>{fmtTime(p.startTime)}</Text>
                          <Text style={[s.muted, { color: k.textMuted }]}>{fmtTime(p.endTime)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.perName, { color: k.text }]} numberOfLines={2}>{prettySubject(p.subject)}</Text>
                          <Text style={[s.muted, { color: k.textMuted }]}>{[p.room, p.teacher, `${mins(p.endTime) - mins(p.startTime)} min`].filter(Boolean).join(' · ')}</Text>
                        </View>
                        {canEdit && <Text style={[s.muted, { color: tone.fg }]}>Edit</Text>}
                      </Pressable>
                    );
                  })}
                </>
              ) : (
                <View style={[s.card, { backgroundColor: k.well, gap: 6 }]}>
                  <View style={{ flexDirection: 'row', gap: 6 }}><View style={{ width: 70 }} />{DAYS.map(d => <Text key={d.key} style={[s.muted, { flex: 1, textAlign: 'center', color: d.key === todayKey ? k.primary : k.textMuted }]}>{d.label}</Text>)}</View>
                  {[...new Set(termPeriods.map(p => p.startTime))].sort((a, b) => mins(a) - mins(b)).map(slot => (
                    <View key={slot} style={{ flexDirection: 'row', gap: 6, alignItems: 'stretch' }}>
                      <View style={{ width: 70, justifyContent: 'center' }}><Text style={[s.muted, { color: k.textMuted, fontSize: 12 }]}>{fmtTime(slot)}</Text></View>
                      {DAYS.map((d, di) => {
                        const p = termPeriods.find(x => x.startTime === slot && (x.days ?? DAYS.map(z => z.key)).includes(d.key));
                        const tone = pastels[(p ? p.subject.length : di) % 4];
                        return (
                          <Pressable key={d.key} disabled={!p || !canEdit} onPress={() => p && setEditClass(p)}
                            style={{ flex: 1, minHeight: 46, borderRadius: 10, padding: 5, justifyContent: 'center', backgroundColor: p ? tone.card : k.card }}>
                            {p && <Text style={{ fontSize: 12, fontWeight: '800', color: k.text, textAlign: 'center' }} numberOfLines={3}>{prettySubject(p.subject)}</Text>}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}
              {canEdit && <Btn Icon={Plus} label="Add a class" onPress={() => setEditClass('new')} />}
              {canEdit && (
                <View style={s.two}>
                  <Btn kind="sec" label="New schedule" onPress={onCreate} />
                  <Btn kind="danger" label="Delete schedule" onPress={() => Alert.alert(`Delete ${kid.name.split(' ')[0]}'s schedule?`, 'All its classes (and their calendar entries), holidays and homework are removed.', [
                    { text: 'Keep it', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => { const st = useSchoolStore.getState(); (st.schedules.find(sc => sc.memberId === kid.id)?.periods ?? []).forEach(p => st.deletePeriod(kid.id, p.id)); useSchoolStore.getState().removeSchedule(kid.id); } },
                  ])} />
                </View>
              )}
            </>
          ))}

          {tab === 'holidays' && (
            <>
              {holidays.length > 0 && canEdit && (
                <View style={s.chips}>
                  <Btn kind="sec" label={selecting ? 'Done' : 'Select'} onPress={() => { setSelecting(v => !v); setPickedH(new Set()); }} />
                  {selecting && <Btn kind="sec" label={pickedH.size === holidays.length ? 'Clear all' : 'Select all'} onPress={() => setPickedH(pickedH.size === holidays.length ? new Set() : new Set(holidays.map(h => h.id)))} />}
                </View>
              )}
              <View style={[s.card, { backgroundColor: k.well }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Pressable onPress={() => step(-1)} hitSlop={12}><Text style={[s.h2, { color: k.primary }]}>‹</Text></Pressable>
                  <Text style={[s.perName, { color: k.text, flex: 0 }]}>{MONTHS[cur.m]} {cur.y}</Text>
                  <Pressable onPress={() => step(1)} hitSlop={12}><Text style={[s.h2, { color: k.primary }]}>›</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row' }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={[s.muted, { flex: 1, textAlign: 'center', color: k.textMuted }]}>{d}</Text>)}</View>
                {Array.from({ length: cells.length / 7 }, (_, wi) => (
                  <View key={wi} style={{ flexDirection: 'row' }}>
                    {cells.slice(wi * 7, wi * 7 + 7).map((d, di) => {
                      if (!d) return <View key={di} style={{ flex: 1, height: 44 }} />;
                      const ds = ymd(cur.y, cur.m, d); const h = holidayOn(ds);
                      return (
                        <Pressable key={di} disabled={!h || !canEdit || selecting} onPress={() => h && setEditHoliday(h)}
                          style={{ flex: 1, height: 44, margin: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: h ? k.pastelAmberCard : 'transparent', borderWidth: ds === today ? 2 : 0, borderColor: k.primary }}>
                          <Text style={{ fontSize: KIOSK_TYPO.caption, fontWeight: h || ds === today ? '800' : '600', color: h ? k.text : k.textMuted }}>{d}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
              {holidays.length === 0 ? <Text style={[s.muted, { color: k.textMuted }]}>No holidays added yet. Scan a school calendar flyer or add one.</Text> : holidays.map(h => {
                const on = pickedH.has(h.id);
                const n = Math.round((new Date(h.endDate + 'T12:00:00').getTime() - new Date(h.startDate + 'T12:00:00').getTime()) / 86400000) + 1;
                return (
                  <Pressable key={h.id} accessibilityRole="button" disabled={!canEdit}
                    onPress={() => selecting ? setPickedH(p => { const nx = new Set(p); on ? nx.delete(h.id) : nx.add(h.id); return nx; }) : setEditHoliday(h)}
                    style={[s.per, { backgroundColor: k.pastelAmber, borderColor: on ? k.primary : k.pastelAmberCard, borderWidth: on ? 2.5 : 1.5, opacity: h.endDate < today ? 0.6 : 1 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.perName, { color: k.text }]} numberOfLines={2}>{h.reason}</Text>
                      <Text style={[s.muted, { color: k.textMuted }]}>{n} day{n !== 1 ? 's' : ''} · {fmtDate(h.startDate)}{h.endDate !== h.startDate ? ` – ${fmtDate(h.endDate)}` : ''}</Text>
                    </View>
                    {selecting ? <Text style={[s.perName, { color: on ? k.primary : k.textFaint, flex: 0 }]}>{on ? '✓' : '○'}</Text> : canEdit ? <Text style={[s.muted, { color: k.terracotta }]}>Edit</Text> : null}
                  </Pressable>
                );
              })}
              {selecting && pickedH.size > 0 && (
                deleting ? <ActivityIndicator /> : <Btn kind="danger" label={`Delete ${pickedH.size} selected`} onPress={() => Alert.alert(`Delete ${pickedH.size} holiday${pickedH.size !== 1 ? 's' : ''}?`, 'Classes on those days are put back on the schedule.', [
                  { text: 'Keep', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => { setDeleting(true); for (const id of pickedH) { try { await useSchoolStore.getState().removeHoliday(kid.id, id); } catch { /* keep going */ } } setDeleting(false); setPickedH(new Set()); setSelecting(false); } },
                ])} />
              )}
              {canEdit && !selecting && <Btn Icon={Plus} label="Add a holiday" onPress={() => setEditHoliday('new')} />}
            </>
          )}

          {tab === 'dates' && (
            <>
              {dates.length === 0 ? (
                <View style={[s.card, { backgroundColor: k.well }]}>
                  <Text style={[s.perName, { color: k.text }]}>No important dates yet</Text>
                  <Text style={[s.muted, { color: k.textMuted }]}>Early release, picture day, conferences and other school dates show here.</Text>
                </View>
              ) : dates.map((e, i) => (
                <Pressable key={e.id} disabled={!canEdit} onPress={() => setEditDate(e)} accessibilityRole="button" style={[s.per, { backgroundColor: pastels[i % 4].col, borderColor: pastels[i % 4].card, borderWidth: 1.5 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.perName, { color: k.text }]} numberOfLines={2}>{e.title}</Text>
                    <Text style={[s.muted, { color: k.textMuted }]}>{fmtDate(e.date)}{e.time ? ` · ${fmtTime(e.time)}` : ' · All day'}</Text>
                  </View>
                  {canEdit && <Text style={[s.muted, { color: pastels[i % 4].fg }]}>Edit</Text>}
                </Pressable>
              ))}
              {canEdit && <Btn Icon={Plus} label="Add a school date" onPress={() => setEditDate('new')} />}
            </>
          )}
        </View>
      </KioskFormDrawer>

      {editClass && <KioskClassEditor kid={kid} period={editClass === 'new' ? null : editClass} terms={terms} defaultTerm={term} onClose={() => setEditClass(null)} />}
      {editHoliday && <KioskHolidayEditor kid={kid} kids={kids} holiday={editHoliday === 'new' ? null : editHoliday} onClose={() => setEditHoliday(null)} />}
      {editDate && <KioskDateEditor kid={kid} kids={kids} event={editDate === 'new' ? null : editDate} onClose={() => setEditDate(null)} />}
    </>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  two: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  chip: { minHeight: 46, borderRadius: 100, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  kidChip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 100, paddingLeft: 6, paddingRight: 16 },
  chipText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 18, flexGrow: 1 },
  btnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  card: { borderRadius: 20, padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  per: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  perTime: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  perName: { fontSize: KIOSK_TYPO.body, fontWeight: '800', flex: 1 },
  muted: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  h2: { fontSize: 28, fontWeight: '800' },
});
