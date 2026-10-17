/**
 * KioskSchoolTab — School on the kiosk as an area menu (Today, Week,
 * Schedules, Holidays & exceptions, Scan a flyer) beside the content, in the
 * pastel tablet rhythm. Same data and permissions as the phone's School home:
 *   · a parent manages every child's schedule, breaks and flyers
 *   · a kid or teen sees only their own schedule (no create, scan or breaks)
 * Create / Edit periods reuse KioskSchoolScheduleModal (same store calls as
 * the phone); breaks use useSchoolStore.addHoliday/removeHoliday, which also
 * clear and restore the matching calendar events.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform } from 'react-native';
import { CalendarDays, GraduationCap, Sun, Camera, BookOpen, Plus } from 'lucide-react-native';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useSchoolStore, type ClassPeriod } from '@/store/schoolStore';
import FlyerScannerModal from '@/components/FlyerScannerModal';
import { fmtDate, fmtTime, localDateStr } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels, type KioskColors } from '../kioskPalette';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KioskAreaMenu, type AreaItem } from '../components/KioskAreaMenu';
import { KioskFormDrawer, KioskFieldLabel, kioskInputStyle } from '../components/KioskFormDrawer';
import { KioskSchoolScheduleModal } from '../components/KioskSchoolScheduleModal';
import { KioskDateTimePicker, openAndroidPicker } from '../components/KioskDateTimePicker';
import { KioskAvatar } from '../components/KioskAvatar';
import { Eyebrow } from '../components/KioskHomeParts';

type Area = 'today' | 'week' | 'schedules' | 'holidays' | 'scan';
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const periodsOn = (periods: ClassPeriod[], day: string) =>
  periods.filter(p => (p.days ?? DEFAULT_DAYS).includes(day)).sort((a, b) => mins(a.startTime) - mins(b.startTime));

/* Module-level so a re-render never remounts a text field. */
function KidChip({ kid, on, onPress, tone }: { kid: FamilyMember; on: boolean; onPress: () => void; tone: { card: string; fg: string } }) {
  const { k } = useKioskColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[s.kidChip, { backgroundColor: on ? k.primary : tone.card }]}>
      <KioskAvatar name={kid.name} size={32} bgColor={k.card} k={k} />
      <Text style={[s.chipText, { color: on ? k.onPrimary : tone.fg }]}>{kid.name.split(' ')[0]}</Text>
    </Pressable>
  );
}
function Btn({ label, onPress, kind = 'pri', Icon }: { label: string; onPress: () => void; kind?: 'pri' | 'sec' | 'pst'; Icon?: typeof Plus }) {
  const { k } = useKioskColors();
  const bg = kind === 'pri' ? k.primary : kind === 'pst' ? k.pastelLavCard : k.well;
  const fg = kind === 'pri' ? k.onPrimary : kind === 'pst' ? k.purple : k.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[s.btn, { backgroundColor: bg }]}>
      {Icon && <Icon size={18} color={fg} strokeWidth={2.4} />}<Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}
function DateRow({ label, date, k, onPress }: { label: string; date: string; k: KioskColors; onPress: () => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <KioskFieldLabel k={k}>{label}</KioskFieldLabel>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${fmtDate(date)}`} style={[kioskInputStyle(k), { justifyContent: 'center' }]}>
        <Text style={{ color: k.text, fontSize: KIOSK_TYPO.body, fontWeight: '700' }}>{fmtDate(date)}</Text>
      </Pressable>
    </View>
  );
}

export function KioskSchoolTab({ isKid, isTeen, colors, isDark }: {
  isKid: boolean; isTeen?: boolean; colors: any; isDark: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const pastels = kioskPastels(k);
  const { registerActivity } = useKioskActivity();
  const { members, activeMemberId } = useFamilyStore();
  const { schedules, addHoliday, removeHoliday } = useSchoolStore();
  const own = !!(isKid || isTeen);
  const isParent = !own;

  const kids = useMemo(() => own
    ? members.filter(m => m.id === activeMemberId)
    : members.filter(m => m.role === 'kid' || m.role === 'teen'), [members, activeMemberId, own]);

  const [area, setArea] = useState<Area>('today');
  const [weekKid, setWeekKid] = useState<string | undefined>(kids[0]?.id);
  const [dayFor, setDayFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [pickCreate, setPickCreate] = useState(false);
  const [flyer, setFlyer] = useState(false);
  const [addBreak, setAddBreak] = useState(false);
  const [hKid, setHKid] = useState<string | undefined>(undefined);
  const [hReason, setHReason] = useState('');
  const [hFrom, setHFrom] = useState(localDateStr());
  const [hTo, setHTo] = useState(localDateStr());
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  useKioskLockSuspended(!!editFor || flyer || addBreak);

  const todayKey = DAY_KEYS[new Date().getDay()];
  const scheduleOf = (id: string) => schedules.find(x => x.memberId === id);
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const todayLine = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const holidays = kids.flatMap(kd => (scheduleOf(kd.id)?.holidays ?? []).map(h => ({ ...h, kid: kd })));

  const items: AreaItem<Area>[] = [
    { id: 'today', label: 'Today', Icon: BookOpen },
    { id: 'week', label: 'Week', Icon: CalendarDays },
    { id: 'schedules', label: 'Schedules', Icon: GraduationCap },
    { id: 'holidays', label: isParent ? 'Holidays & exceptions' : 'Breaks', Icon: Sun, badge: holidays.length || undefined },
    ...(isParent ? [{ id: 'scan' as Area, label: 'Scan a flyer', Icon: Camera }] : []),
  ];

  const openBreak = () => { setHKid(kids[0]?.id); setHReason(''); setHFrom(localDateStr()); setHTo(localDateStr()); setAddBreak(true); };
  const saveBreak = async () => {
    if (!hKid) return;
    await addHoliday(hKid, { startDate: hFrom, endDate: hTo < hFrom ? hFrom : hTo, reason: hReason.trim() || 'School break' });
    setAddBreak(false);
  };
  const pickDate = (which: 'from' | 'to') => {
    registerActivity();
    if (Platform.OS === 'android') {
      openAndroidPicker({ mode: 'date', value: new Date((which === 'from' ? hFrom : hTo) + 'T00:00:00'), onChange: d => (which === 'from' ? setHFrom(localDateStr(d)) : setHTo(localDateStr(d))) });
    } else setPicker(p => (p === which ? null : which));
  };

  const dayCard = (kid: FamilyMember, i: number) => {
    const sc = scheduleOf(kid.id);
    const tone = pastels[(i + 1) % 4];
    const list = sc ? periodsOn(sc.periods, todayKey) : [];
    const last = list[list.length - 1];
    return (
      <View key={kid.id} style={[s.kc, { backgroundColor: tone.col, borderColor: tone.card }]}>
        <View style={s.kcTop}>
          <KioskAvatar name={kid.name} size={46} bgColor={tone.card} k={k} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.kcName, { color: k.text }]} numberOfLines={1}>{kid.name.split(' ')[0]}{sc?.gradeYear ? ` · ${sc.gradeYear}` : ''}</Text>
            <View style={s.pills}>
              {!!sc?.school && <View style={[s.pill, { backgroundColor: k.card }]}><Text style={[s.pillText, { color: k.textMuted }]}>{sc.school.toUpperCase()}</Text></View>}
              <View style={[s.pill, { backgroundColor: k.card }]}><Text style={[s.pillText, { color: k.textMuted }]}>{own ? 'OWN VIEW' : 'PARENT-MANAGED'}</Text></View>
            </View>
          </View>
        </View>
        {!sc ? <Text style={[s.muted, { color: k.textMuted }]}>No schedule set up yet.</Text>
          : list.length === 0 ? <Text style={[s.muted, { color: k.textMuted }]}>No classes today.</Text>
          : list.map(p => {
            const now = nowMins >= mins(p.startTime) && nowMins < mins(p.endTime);
            return (
              <View key={p.id} style={[s.per, { backgroundColor: k.card }, now && { borderWidth: 2.5, borderColor: k.primary }]}>
                <Text style={[s.perTime, { color: k.textMuted }]}>{fmtTime(p.startTime)} – {fmtTime(p.endTime)}</Text>
                <Text style={[s.perName, { color: k.text }]} numberOfLines={1}>{p.subject}</Text>
                <Text style={[s.muted, { color: k.textMuted }]}>{[p.room, now ? 'now' : ''].filter(Boolean).join(' · ')}</Text>
              </View>
            );
          })}
        {!!last && <Text style={[s.muted, { color: k.textMuted }]}>Dismissal around {fmtTime(last.endTime)}</Text>}
        <Btn label={sc ? 'Open full day →' : 'Create schedule →'} onPress={() => { registerActivity(); sc ? setDayFor(kid.id) : setEditFor(kid.id); }} />
      </View>
    );
  };

  const dayKid = members.find(m => m.id === dayFor);
  const dayList = dayFor ? periodsOn(scheduleOf(dayFor)?.periods ?? [], todayKey) : [];
  const wk = weekKid ?? kids[0]?.id;
  const wkSchedule = wk ? scheduleOf(wk) : undefined;
  const editMember = members.find(m => m.id === editFor);

  return (
    <View style={s.shell}>
      <KioskAreaMenu title="School" items={items} area={area} onPick={a => { registerActivity(); setArea(a); }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} onScrollBeginDrag={registerActivity}>
        {area === 'today' && (
          <>
            <View style={s.head}><Text style={[s.h1, { color: k.text }]}>Today</Text><View style={[s.pill, { backgroundColor: k.well }]}><Text style={[s.pillText, { color: k.textMuted }]}>{todayLine}</Text></View></View>
            {kids.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No kids in this family yet.</Text> : <View style={s.grid}>{kids.map(dayCard)}</View>}
            {!own && <Text style={[s.muted, { color: k.textMuted }]}>Minor accounts see only their own schedule, not health records or profile administration.</Text>}
          </>
        )}

        {area === 'week' && (
          <>
            <Text style={[s.h1, { color: k.text }]}>Week</Text>
            {!own && <View style={s.chips}>{kids.map((kd, i) => <KidChip key={kd.id} kid={kd} on={wk === kd.id} onPress={() => setWeekKid(kd.id)} tone={pastels[(i + 1) % 4]} />)}</View>}
            {!wkSchedule ? <Text style={[s.empty, { color: k.textMuted }]}>No schedule set up yet.</Text> : (
              <View style={s.week}>
                {WEEK.map(d => {
                  const today = d === todayKey;
                  const list = periodsOn(wkSchedule.periods, d);
                  return (
                    <View key={d} style={[s.wcol, { backgroundColor: today ? k.primarySoft : k.well }]}>
                      <Text style={[s.wh, { color: k.textFaint }]}>{d.toUpperCase()}{today ? ' · TODAY' : ''}</Text>
                      {list.length === 0 ? <Text style={[s.muted, { color: k.textMuted }]}>No classes</Text> : list.map((p, j) => (
                        <View key={p.id} style={[s.wp, { backgroundColor: pastels[j % 4].card }]}>
                          <Text style={[s.perName, { color: k.text, fontSize: KIOSK_TYPO.caption }]} numberOfLines={1}>{p.subject}</Text>
                          <Text style={[s.muted, { color: k.textMuted, fontSize: 11.5 }]}>{fmtTime(p.startTime)}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {area === 'schedules' && (
          <>
            <View style={s.head}><Text style={[s.h1, { color: k.text, flex: 1 }]}>Schedules</Text>{isParent && <Btn label="Create school schedule" Icon={Plus} onPress={() => { registerActivity(); setPickCreate(true); }} />}</View>
            {kids.map((kd, i) => {
              const sc = scheduleOf(kd.id); const tone = pastels[i % 4];
              return (
                <View key={kd.id} style={[s.row, { backgroundColor: tone.col, borderColor: tone.card }]}>
                  <KioskAvatar name={kd.name} size={46} bgColor={tone.card} k={k} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.perName, { color: k.text }]} numberOfLines={1}>{kd.name.split(' ')[0]}{sc?.gradeYear ? ` · ${sc.gradeYear}` : ''}</Text>
                    <Text style={[s.muted, { color: k.textMuted }]}>{sc ? `${sc.school ?? 'School'} · ${sc.periods.length} periods` : 'No schedule yet'}</Text>
                  </View>
                  {isParent ? <Btn kind="sec" label={sc ? 'Edit periods' : 'Create'} onPress={() => { registerActivity(); setEditFor(kd.id); }} />
                    : sc ? <Btn kind="sec" label="View day" onPress={() => setDayFor(kd.id)} /> : null}
                </View>
              );
            })}
            {!isParent && <Text style={[s.muted, { color: k.textMuted }]}>A parent manages the timetable. Ask them to change anything.</Text>}
          </>
        )}

        {area === 'holidays' && (
          <>
            <View style={s.head}><Text style={[s.h1, { color: k.text, flex: 1 }]}>{isParent ? 'Holidays & exceptions' : 'Breaks'}</Text>{isParent && <Btn label="Add a break" Icon={Plus} onPress={openBreak} />}</View>
            {holidays.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No breaks planned.</Text> : holidays.map((h, i) => {
              const tone = pastels[i % 4];
              return (
                <View key={h.id} style={[s.row, { backgroundColor: tone.col, borderColor: tone.card }]}>
                  <View style={[s.tile, { backgroundColor: tone.card }]}><Sun size={22} color={tone.fg} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.perName, { color: k.text }]} numberOfLines={1}>{h.reason}</Text>
                    <Text style={[s.muted, { color: k.textMuted }]}>{h.kid.name.split(' ')[0]} · {fmtDate(h.startDate)}{h.endDate !== h.startDate ? ` – ${fmtDate(h.endDate)}` : ''} · All day</Text>
                  </View>
                  {isParent && <Btn kind="sec" label="Remove" onPress={() => removeHoliday(h.kid.id, h.id)} />}
                </View>
              );
            })}
          </>
        )}

        {area === 'scan' && isParent && (
          <>
            <Text style={[s.h1, { color: k.text }]}>Scan a flyer</Text>
            <View style={[s.scan, { backgroundColor: k.pastelLav, borderColor: k.pastelLavCard }]}>
              <Camera size={48} color={k.purple} />
              <Text style={[s.perName, { color: k.purple }]}>Point the camera at a school flyer</Text>
              <Text style={[s.muted, { color: k.textMuted }]}>Dates, events and closures land on the calendar.</Text>
            </View>
            <View style={s.chips}><Btn label="Scan a flyer" Icon={Camera} onPress={() => { registerActivity(); setFlyer(true); }} /></View>
          </>
        )}
      </ScrollView>

      {/* Full day */}
      <KioskFormDrawer visible={!!dayFor} variant="drawer" title={`${dayKid?.name.split(' ')[0] ?? ''}'s full day`} subtitle={todayLine}
        accent={k.gold} Icon={BookOpen} k={k} onClose={() => setDayFor(null)}>
        <View style={{ gap: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.xl }}>
          {dayList.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No classes today.</Text> : dayList.map((p, i) => (
            <View key={p.id} style={[s.per, { backgroundColor: pastels[i % 4].col }]}>
              <Text style={[s.perTime, { color: k.textMuted }]}>{fmtTime(p.startTime)}</Text>
              <Text style={[s.perName, { color: k.text }]} numberOfLines={1}>{p.subject}</Text>
              <Text style={[s.muted, { color: k.textMuted }]}>{[p.room, p.teacher].filter(Boolean).join(' · ')}</Text>
            </View>
          ))}
        </View>
      </KioskFormDrawer>

      {/* Which child to create a schedule for */}
      <KioskFormDrawer visible={pickCreate} variant="drawer" title="Create school schedule" subtitle="Pick a child" accent={k.gold} Icon={GraduationCap} k={k} onClose={() => setPickCreate(false)}>
        <View style={{ gap: KIOSK_SPACE.sm }}>
          {kids.map((kd, i) => (
            <Pressable key={kd.id} onPress={() => { setPickCreate(false); setEditFor(kd.id); }} accessibilityRole="button" style={[s.row, { backgroundColor: pastels[i % 4].col, borderColor: pastels[i % 4].card }]}>
              <KioskAvatar name={kd.name} size={40} bgColor={pastels[i % 4].card} k={k} />
              <Text style={[s.perName, { color: k.text, flex: 1 }]}>{kd.name.split(' ')[0]}</Text>
              <Text style={[s.muted, { color: k.textMuted }]}>{scheduleOf(kd.id) ? 'Has a schedule' : 'No schedule'}</Text>
            </Pressable>
          ))}
        </View>
      </KioskFormDrawer>

      {/* Add a break */}
      <KioskFormDrawer visible={addBreak} variant="drawer" title="Add a break" subtitle="Classes on these days are cleared from the calendar" accent={k.gold} Icon={Sun} k={k}
        onClose={() => { setAddBreak(false); setPicker(null); }} submitLabel="Save break" onSubmit={saveBreak} canSubmit={!!hKid && !!scheduleOf(hKid ?? '')}>
        <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
          <View style={{ gap: 6 }}>
            <KioskFieldLabel k={k}>CHILD</KioskFieldLabel>
            <View style={s.chips}>{kids.map((kd, i) => <KidChip key={kd.id} kid={kd} on={hKid === kd.id} onPress={() => setHKid(kd.id)} tone={pastels[(i + 1) % 4]} />)}</View>
            {!!hKid && !scheduleOf(hKid) && <Text style={[s.muted, { color: k.danger }]}>Create a schedule for this child first.</Text>}
          </View>
          <View style={{ gap: 6 }}>
            <KioskFieldLabel k={k}>REASON</KioskFieldLabel>
            <TextInput value={hReason} onChangeText={setHReason} placeholder="e.g. Winter Break" placeholderTextColor={k.textFaint} style={[kioskInputStyle(k), { color: k.text }]} />
          </View>
          <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm }}>
            <DateRow label="FROM" date={hFrom} k={k} onPress={() => pickDate('from')} />
            <DateRow label="TO · INCLUSIVE" date={hTo} k={k} onPress={() => pickDate('to')} />
          </View>
          {picker && (
            <KioskDateTimePicker mode="date" visible k={k} isDark={kioskDark}
              value={new Date((picker === 'from' ? hFrom : hTo) + 'T00:00:00')}
              onChange={d => (picker === 'from' ? setHFrom(localDateStr(d)) : setHTo(localDateStr(d)))}
              onDone={() => setPicker(null)} />
          )}
        </View>
      </KioskFormDrawer>

      {!!editFor && editMember && (
        <KioskSchoolScheduleModal visible memberId={editMember.id} memberName={editMember.name} isParent={isParent}
          colors={colors} isDark={isDark} onClose={() => setEditFor(null)} />
      )}
      <FlyerScannerModal visible={flyer} onClose={() => setFlyer(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', minHeight: 0 },
  scroll: { padding: KIOSK_SPACE.xl, paddingBottom: 120, gap: KIOSK_SPACE.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md, alignItems: 'flex-start' },
  kc: { flexGrow: 1, flexBasis: 360, borderRadius: 26, borderWidth: 1.5, padding: 16, gap: 10 },
  kcTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kcName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  pill: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  per: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  perTime: { fontSize: KIOSK_TYPO.label, fontWeight: '800', minWidth: 128 },
  perName: { fontSize: KIOSK_TYPO.body, fontWeight: '800', flex: 1 },
  muted: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  kidChip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 100, paddingLeft: 6, paddingRight: 16 },
  chipText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 18 },
  btnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, padding: 14 },
  tile: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  wcol: { flex: 1, borderRadius: 20, padding: 10, gap: 7 },
  wh: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  wp: { borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8 },
  scan: { minHeight: 220, borderRadius: 24, borderWidth: 2.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
