/**
 * SchoolHomeScreen — School Screen 1 ("School home"), and the top-level
 * owner of the whole School tab. Replaces SchoolTab.tsx's old body
 * (SchoolScheduleCard + SchoolScheduleModal bottom sheet) with the new
 * full-page architecture: this screen IS the School home by default, and
 * owns which overlay (day detail / create-wizard / period-builder /
 * holidays / flyer-scanner) is open, each rendered via FullPageOverlay
 * with stacked zIndex (60, 61, 62…) — same pattern as
 * features/vault/tabs/homeowner/HomeownerNotesTab.tsx's own screen stack.
 *
 * Keeps SchoolTab.tsx's existing isKid/isTeen (own-schedule-only) vs
 * parent (sees all kids) gating — parents can switch between kids via
 * the per-kid cards; a kid/teen only ever sees their own card and their
 * own SchoolDayScreen.
 *
 * Calls hideTabBar()/showTabBar() on mount/unmount — NOT just
 * useUIStore's setFullBleedScreenActive, which only hides the FAB, not
 * the real tab bar (a previously-fixed, real bug per CLAUDE.md).
 *
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, GraduationCap, PartyPopper, CalendarDays } from 'lucide-react-native';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { fmtDate, fmtDateShort } from '@/lib/dates';
import { RHYTHM } from '@/constants/theme';
import { useUIStore } from '@/store/uiStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useSchoolStore, type ClassPeriod, type SchoolHoliday } from '@/store/schoolStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import FlyerScannerModal from '@/components/FlyerScannerModal';
import { PageHeading } from '@/components/PageHeading';
import { OverlayPage, OverlayHeading } from '@/components/OverlayPage';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { NewScheduleScreen } from './school/NewScheduleScreen';
import { HolidaysScreen } from './school/HolidaysScreen';
import { ClassEditScreen } from './school/ClassEditScreen';
import { termsOf, guessCurrentTerm, periodsInTerm, prettySubject } from './school/schoolUtils';
import { HolidayEditScreen } from './school/HolidayEditScreen';
import { ImportantDateEditScreen } from './school/ImportantDateEditScreen';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception, 2026-10-10) — warm
// cream canvas + bright white shadowed cards + deep forest-slate text,
// not the app's default pure-white/flat-border rhythm. Scoped to this
// screen and its siblings only (see CLAUDE.md).
const CANVAS = '#ECE6DE';
const TITLE_CLR = '#0D1210';
const BODY_CLR = '#3D4D47';
const BODY_CLR_LIGHT = '#4E5C56';
const BLUE = '#5872C4';
const LINK_BLUE = '#23352B';
const BORDER = '#DDD6CC';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F0EDE6';
const CARD_SHADOW = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } as const;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fmtTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

type MainTab = 'schedule' | 'holidays' | 'dates';


const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** A month at a glance: every day inside a holiday is filled; tap one to edit that holiday. */
function HolidayMonthGrid({ holidays, colors, isDark, onPickHoliday }: {
  holidays: SchoolHoliday[]; colors: any; isDark: boolean; onPickHoliday?: (h: SchoolHoliday) => void;
}) {
  const todayStr = localTodayStr();
  const firstUpcoming = holidays.find(h => h.endDate >= todayStr);
  const seed = firstUpcoming ? firstUpcoming.startDate > todayStr ? firstUpcoming.startDate : todayStr : todayStr;
  const [{ y, m }, setCursor] = useState(() => ({ y: +seed.slice(0, 4), m: +seed.slice(5, 7) - 1 }));
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const cardBg = isDark ? colors.card : CARD_BG;
  const first = new Date(y, m, 1).getDay(); // 0 = Sun
  const daysIn = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const holidayOn = (d: string) => holidays.find(h => d >= h.startDate && d <= h.endDate);
  const step = (n: number) => setCursor(c => { const t = new Date(c.y, c.m + n, 1); return { y: t.getFullYear(), m: t.getMonth() }; });

  return (
    <View style={[{ borderRadius: 18, backgroundColor: cardBg, padding: RHYTHM.card, gap: 8 }, !isDark && CARD_SHADOW]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={() => step(-1)} hitSlop={10}><Text style={{ fontSize: 20, fontWeight: '800', color: BLUE }}>‹</Text></TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '800', color: titleC }}>{MONTH_NAMES[m]} {y}</Text>
        <TouchableOpacity onPress={() => step(1)} hitSlop={10}><Text style={{ fontSize: 20, fontWeight: '800', color: BLUE }}>›</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: bodyC }}>{d}</Text>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {w.map((d, di) => {
            if (!d) return <View key={di} style={{ flex: 1, height: 38 }} />;
            const ds = ymd(y, m, d);
            const h = holidayOn(ds);
            const isToday = ds === todayStr;
            const weekend = di === 0 || di === 6;
            return (
              <TouchableOpacity key={di} disabled={!h || !onPickHoliday} onPress={() => h && onPickHoliday?.(h)} activeOpacity={0.7}
                style={{ flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: 1,
                  backgroundColor: h ? (isDark ? colors.amber + '33' : colors.amberLight) : 'transparent',
                  borderWidth: isToday ? 1.5 : 0, borderColor: BLUE }}>
                <Text style={{ fontSize: 13, fontWeight: h || isToday ? '800' : '600', color: h ? colors.amber : weekend ? bodyC + '99' : titleC }}>{d}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: isDark ? colors.amber + '55' : colors.amberLight }} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC }}>No school</Text>
      </View>
    </View>
  );
}

/** A steady colour per subject, so the same class always looks the same. */
function subjectTone(subject: string, colors: any): { fg: string; bg: string } {
  const tones = [
    { fg: colors.primary, bg: colors.primaryLight },
    { fg: colors.teal, bg: colors.tealLight },
    { fg: colors.amber, bg: colors.amberLight },
    { fg: colors.pink, bg: colors.pinkLight },
  ];
  const key = subject.toUpperCase().replace(/\b(A|B)$/, '').replace(/\s+\d*[AB]?$/, '').trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

/** One class as a card: time on the left, coloured subject block on the right. */
function ClassRow({ p, colors, isDark, now, onPress }: { p: ClassPeriod; colors: any; isDark: boolean; now?: boolean; onPress?: () => void }) {
  const tone = subjectTone(p.subject, colors);
  const mins = timeToMins(p.endTime) - timeToMins(p.startTime);
  const sub = [p.room, p.teacher].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'stretch', gap: 12 }}>
      <View style={{ width: 62, alignItems: 'flex-end', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? colors.textPrimary : TITLE_CLR, fontVariant: ['tabular-nums'] }}>{fmtTime12(p.startTime)}</Text>
        <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? colors.textTertiary : BODY_CLR_LIGHT, fontVariant: ['tabular-nums'] }}>{fmtTime12(p.endTime)}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', borderRadius: 14, overflow: 'hidden', backgroundColor: isDark ? tone.fg + '22' : tone.bg,
        borderWidth: now ? 2 : 0, borderColor: tone.fg }}>
        <View style={{ width: 5, backgroundColor: tone.fg }} />
        <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? colors.textPrimary : TITLE_CLR }} numberOfLines={2}>{prettySubject(p.subject)}</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? colors.textSecondary : BODY_CLR }} numberOfLines={1}>
            {sub ? `${sub} · ` : ''}{mins > 0 ? `${mins} min` : ''}
          </Text>
        </View>
        {onPress ? <Text style={{ alignSelf: 'center', paddingRight: 12, fontSize: 12, fontWeight: '800', color: tone.fg }}>Edit</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// Days off (not a class day) — used to keep them out of the "other important dates" list.
const DAY_OFF_RE = /\b(holiday|break|no school|in-?service|staff (professional|development)|teacher work ?day|school closed)\b/i;

function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEK_DAYS: { key: string; label: string; full: string }[] = [
  { key: 'mon', label: 'Mon', full: 'Monday' }, { key: 'tue', label: 'Tue', full: 'Tuesday' }, { key: 'wed', label: 'Wed', full: 'Wednesday' },
  { key: 'thu', label: 'Thu', full: 'Thursday' }, { key: 'fri', label: 'Fri', full: 'Friday' },
];

/** A kid's whole school week at a glance: each weekday with its periods. */
function KidWeekCard({ kid, colors, isDark, onOpenDay, onCreateSchedule }: {
  kid: FamilyMember; colors: any; isDark: boolean; onOpenDay: () => void; onCreateSchedule: () => void;
}) {
  const schedule = useSchoolStore(s => s.schedules.find(sc => sc.memberId === kid.id));
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const todayKey = DAY_KEYS[new Date().getDay()];
  return (
    <View style={[{ borderWidth: isDark ? 1 : 0, borderColor: border, borderRadius: 18, backgroundColor: cardBg, padding: RHYTHM.card, gap: 10 }, !isDark && CARD_SHADOW]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} size={32} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: titleC }}>{kid.name.split(' ')[0]}{schedule?.gradeYear ? ` · ${schedule.gradeYear}` : ''}</Text>
        <TouchableOpacity onPress={schedule ? onOpenDay : onCreateSchedule}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: BLUE }}>{schedule ? 'Open' : 'Create'} →</Text>
        </TouchableOpacity>
      </View>
      {!schedule ? (
        <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC }}>No schedule set up yet.</Text>
      ) : WEEK_DAYS.map(d => {
        const ps = schedule.periods
          .filter(p => !p.isLunch && (p.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']).includes(d.key))
          .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
        const isToday = d.key === todayKey;
        return (
          <View key={d.key} style={{ flexDirection: 'row', gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: border }}>
            <Text style={{ width: 36, fontSize: 13, fontWeight: '800', color: isToday ? BLUE : bodyC }}>{d.label}</Text>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: ps.length ? titleC : bodyC }} numberOfLines={2}>
              {ps.length ? `${fmtTime12(ps[0].startTime)}–${fmtTime12(ps[ps.length - 1].endTime)} · ${ps.length} class${ps.length !== 1 ? 'es' : ''}` : 'No classes'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function KidDayCard({ kid, isOwnScheduleOnly, colors, isDark, onOpenDay, onCreateSchedule }: {
  kid: FamilyMember; isOwnScheduleOnly: boolean; colors: any; isDark: boolean;
  onOpenDay: () => void; onCreateSchedule: () => void;
}) {
  const { schedules } = useSchoolStore();
  const schedule = schedules.find(s => s.memberId === kid.id);
  const todayKey = DAY_KEYS[new Date().getDay()];
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;

  const todayPeriods = useMemo(() => {
    if (!schedule) return [] as ClassPeriod[];
    return periodsInTerm(schedule.periods, guessCurrentTerm(termsOf(schedule.periods)))
      .filter(p => (p.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']).includes(todayKey))
      .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  }, [schedule, todayKey]);

  const lastPeriod = todayPeriods[todayPeriods.length - 1];

  return (
    <View style={[{ borderWidth: isDark ? 1 : 0, borderColor: border, borderRadius: 18, backgroundColor: cardBg, overflow: 'hidden' },
      !isDark && CARD_SHADOW]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: titleC }}>
            {kid.name.split(' ')[0]}{schedule?.gradeYear ? ` · ${schedule.gradeYear}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {schedule?.school ? (
              <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: isDark ? colors.surface : SURFACE }}>
                <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.3, color: isDark ? bodyC : BODY_CLR_LIGHT, textTransform: 'uppercase' }}>{schedule.school}</Text>
              </View>
            ) : null}
            <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: isDark ? colors.surface : SURFACE }}>
              <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.3, color: isDark ? bodyC : BODY_CLR_LIGHT, textTransform: 'uppercase' }}>
                {isOwnScheduleOnly ? 'Own view' : 'Parent-managed'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {!schedule ? (
        <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC, paddingHorizontal: 16, paddingBottom: 14 }}>
          No schedule set up yet.
        </Text>
      ) : todayPeriods.length === 0 ? (
        <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC, paddingHorizontal: 16, paddingBottom: 14 }}>
          No classes today.
        </Text>
      ) : (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          {todayPeriods.map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              paddingVertical: 7, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC, fontVariant: ['tabular-nums'] }}>
                {fmtTime12(p.startTime)}–{fmtTime12(p.endTime)}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>{p.subject}</Text>
            </View>
          ))}
          {lastPeriod && (
            <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC, marginTop: 8 }}>
              Dismissal around {fmtTime12(lastPeriod.endTime)}
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={onOpenDay}
        style={{ paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: border,
          backgroundColor: isDark ? colors.surface : '#FCFBF9' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: titleC }}>
          Manage  →
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** One child's own School page: Schedule (today / week), Holidays (from – to) and Important dates. */
function KidSchoolPage({ kid, colors, isDark, canEdit, onClose, onOpenHolidays, onCreateSchedule }: {
  kid: FamilyMember; colors: any; isDark: boolean; canEdit: boolean;
  onClose: () => void; onOpenHolidays: () => void; onCreateSchedule: () => void;
}) {
  const insets = useSafeAreaInsets();
  const schedule = useSchoolStore(s => s.schedules.find(sc => sc.memberId === kid.id));
  const events = useEventStore(s => s.events);
  const [tab, setTab] = useState<MainTab>('schedule');
  const [view, setView] = useState<'day' | 'week'>('day');
  const [dayPick, setDayPick] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<ClassPeriod | 'new' | null>(null);
  const [editingDate, setEditingDate] = useState<FamilyEvent | 'new' | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<SchoolHoliday | 'new' | null>(null);
  const terms = termsOf(schedule?.periods ?? []);
  const [termPick, setTermPick] = useState<string | undefined>(undefined);
  const term = termPick ?? guessCurrentTerm(terms);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  // Full page: cover the tab bar while this page is open.
  useEffect(() => {
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => { showTabBar(); useUIStore.getState().setFullBleedScreenActive(false); };
  }, []);
  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const card = [{ borderWidth: isDark ? 1 : 0, borderColor: border, borderRadius: 18, backgroundColor: cardBg, padding: RHYTHM.card, gap: 10 }, !isDark && CARD_SHADOW];

  const holidays = [...(schedule?.holidays ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = localTodayStr();
  const dates = events
    .filter(e => e.date >= today && (e.category === 'School' || e.category === 'Study') && !DAY_OFF_RE.test(e.title)
      && !e.seriesId && (e.memberId === kid.id || e.memberIds?.includes(kid.id)))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    .filter((e, i, arr) => arr.findIndex(x => x.title === e.title && x.date === e.date) === i)
    .slice(0, 40);

  const todayKey = DAY_KEYS[new Date().getDay()];
  const dayPeriods = (key: string) => periodsInTerm(schedule?.periods ?? [], term)
    .filter(p => !p.isLunch && (p.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']).includes(key))
    .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  return (
    <OverlayPage visible onDismiss={onClose} zIndex={58} backgroundColor={canvas}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <OverlayHeading
          eyebrow="FAMILY CUBE · SCHOOL"
          title={`${kid.name.split(' ')[0]}'s school`}
          subtitle={[schedule?.gradeYear, schedule?.school].filter(Boolean).join(' · ') || 'Schedule, holidays and important dates'}
          accent="amber" Icon={GraduationCap}
          onTitlePress={onClose} topInset={insets.top}
        />
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: RHYTHM.page, marginTop: 4 }}>
          {([['schedule', 'Schedule'], ['holidays', 'Holidays'], ['dates', 'Important dates']] as [MainTab, string][]).map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setTab(key)}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                backgroundColor: tab === key ? (isDark ? colors.teal : TITLE_CLR) : (isDark ? colors.surface : SURFACE) }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: tab === key ? '#FFFFFF' : bodyC }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: RHYTHM.item, paddingBottom: insets.bottom + RHYTHM.section, gap: RHYTHM.item }}>
          {tab === 'schedule' ? (
            !schedule ? (
              <View style={card as any}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>No schedule set up yet</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC }}>Add the classes so rides, reminders and the calendar know the school day.</Text>
                {canEdit && (
                  <TouchableOpacity onPress={onCreateSchedule} style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Create schedule</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                {terms.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {terms.map(t => (
                      <TouchableOpacity key={t} onPress={() => setTermPick(t)}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                          borderColor: term === t ? BLUE : border, backgroundColor: term === t ? BLUE + '18' : 'transparent' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: term === t ? BLUE : bodyC }}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <View style={{ flexDirection: 'row', backgroundColor: isDark ? colors.surface : SURFACE, borderRadius: 14, padding: 3 }}>
                  {([['day', 'By day'], ['week', 'Week grid']] as const).map(([key, label]) => (
                    <TouchableOpacity key={key} onPress={() => setView(key)}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11, backgroundColor: view === key ? (isDark ? colors.card : '#FFFFFF') : 'transparent' }}>
                      <Text style={{ fontSize: 13, fontWeight: view === key ? '800' : '600', color: view === key ? titleC : bodyC }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {view === 'day' ? (() => {
                  const selDay = dayPick ?? (WEEK_DAYS.some(d => d.key === todayKey) ? todayKey : 'mon');
                  const list = dayPeriods(selDay);
                  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
                  return (
                    <>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {WEEK_DAYS.map(d => {
                          const on = d.key === selDay;
                          return (
                            <TouchableOpacity key={d.key} onPress={() => setDayPick(d.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
                              style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14,
                                backgroundColor: on ? (isDark ? colors.teal : TITLE_CLR) : (isDark ? colors.surface : SURFACE) }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: on ? '#FFFFFF' : bodyC }}>{d.label}</Text>
                              {d.key === todayKey ? <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: on ? '#FFFFFF' : BLUE }} /> : <View style={{ height: 8 }} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {list.length === 0 ? (
                        <View style={card as any}><Text style={{ fontSize: 13, fontWeight: '600', color: bodyC }}>No classes on this day.</Text></View>
                      ) : (
                        <View style={{ gap: 8 }}>
                          {list.map(p => (
                            <ClassRow key={p.id} p={p} colors={colors} isDark={isDark} onPress={canEdit ? () => setEditing(p) : undefined}
                              now={selDay === todayKey && nowMin >= timeToMins(p.startTime) && nowMin < timeToMins(p.endTime)} />
                          ))}
                        </View>
                      )}
                    </>
                  );
                })() : (() => {
                  // Week at a glance: a row per class slot (by start time), a column per weekday.
                  const termPeriods = periodsInTerm(schedule?.periods ?? [], term).filter(p => !p.isLunch);
                  const slots = [...new Set(termPeriods.map(p => p.startTime))].sort((a, b) => timeToMins(a) - timeToMins(b));
                  const cell = (slot: string, key: string) => termPeriods.find(p => p.startTime === slot && (p.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']).includes(key));
                  return (
                    <View style={[card as any, { padding: 10, gap: 6 }]}>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <View style={{ width: 44 }} />
                        {WEEK_DAYS.map(d => (
                          <Text key={d.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: d.key === todayKey ? BLUE : bodyC }}>{d.label}</Text>
                        ))}
                      </View>
                      {slots.map(slot => (
                        <View key={slot} style={{ flexDirection: 'row', gap: 4, alignItems: 'stretch' }}>
                          <View style={{ width: 44, justifyContent: 'center' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: bodyC, fontVariant: ['tabular-nums'] }}>{fmtTime12(slot).replace(' ', '')}</Text>
                          </View>
                          {WEEK_DAYS.map(d => {
                            const p = cell(slot, d.key);
                            const tone = p ? subjectTone(p.subject, colors) : null;
                            return (
                              <TouchableOpacity key={d.key} disabled={!p || !canEdit} onPress={() => p && setEditing(p)} activeOpacity={0.7} style={{ flex: 1, minHeight: 40, borderRadius: 8, padding: 3, justifyContent: 'center',
                                backgroundColor: tone ? (isDark ? tone.fg + '22' : tone.bg) : (isDark ? colors.surface : '#FAF8F4') }}>
                                {p && <Text style={{ fontSize: 9, fontWeight: '800', color: tone!.fg, textAlign: 'center' }} numberOfLines={3}>{prettySubject(p.subject)}</Text>}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  );
                })()}
                {canEdit && (
                  <TouchableOpacity onPress={() => setEditing('new')} style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>+ Add a class</Text>
                  </TouchableOpacity>
                )}
                {canEdit && (
                  <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
                    <TouchableOpacity onPress={onCreateSchedule} style={{ flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>New schedule</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => Alert.alert(`Delete ${kid.name.split(' ')[0]}'s schedule?`, 'All its classes (and their calendar entries), holidays and homework are removed.', [
                        { text: 'Keep it', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => {
                          const st = useSchoolStore.getState();
                          // Take each class's recurring calendar series off the calendar first, then drop the schedule.
                          (st.schedules.find(sc => sc.memberId === kid.id)?.periods ?? []).forEach(p => st.deletePeriod(kid.id, p.id));
                          useSchoolStore.getState().removeSchedule(kid.id);
                        } },
                      ])}
                      style={{ flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger + '1A' }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.danger }}>Delete schedule</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )
          ) : tab === 'holidays' ? (
            <>
              {holidays.length > 0 && canEdit && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <TouchableOpacity onPress={() => { setSelecting(v => !v); setPicked(new Set()); }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: BLUE }}>{selecting ? 'Done' : 'Select'}</Text>
                  </TouchableOpacity>
                  {selecting && (
                    <TouchableOpacity onPress={() => setPicked(picked.size === holidays.length ? new Set() : new Set(holidays.map(h => h.id)))}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: BLUE }}>{picked.size === holidays.length ? 'Clear all' : 'Select all'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <HolidayMonthGrid holidays={holidays} colors={colors} isDark={isDark}
                onPickHoliday={canEdit && !selecting ? (h) => setEditingHoliday(h) : undefined} />
              {holidays.length === 0 ? (
                <View style={card as any}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC }}>No holidays added yet. Scan a school calendar flyer or add one.</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {holidays.map(h => {
                    const on = picked.has(h.id);
                    const n = Math.round((new Date(h.endDate + 'T12:00:00').getTime() - new Date(h.startDate + 'T12:00:00').getTime()) / 86400000) + 1;
                    const past = h.endDate < localTodayStr();
                    return (
                      <TouchableOpacity key={h.id} activeOpacity={selecting || canEdit ? 0.7 : 1}
                        onPress={() => { if (selecting) setPicked(prev => { const nx = new Set(prev); on ? nx.delete(h.id) : nx.add(h.id); return nx; }); else if (canEdit) setEditingHoliday(h); }}
                        style={{ flexDirection: 'row', alignItems: 'stretch', gap: 12, opacity: past ? 0.55 : 1 }}>
                        <View style={{ width: 62, alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: titleC }}>{fmtDateShort(h.startDate)}</Text>
                          {h.endDate !== h.startDate ? <Text style={{ fontSize: 11, fontWeight: '600', color: bodyC }}>{fmtDateShort(h.endDate)}</Text> : null}
                        </View>
                        <View style={{ flex: 1, flexDirection: 'row', borderRadius: 14, overflow: 'hidden', backgroundColor: isDark ? colors.amber + '22' : colors.amberLight,
                          borderWidth: selecting && on ? 2 : 0, borderColor: BLUE }}>
                          <View style={{ width: 5, backgroundColor: colors.amber }} />
                          <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 2 }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: titleC }} numberOfLines={2}>{h.reason}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC }}>{n} day{n !== 1 ? 's' : ''}{h.startDate !== h.endDate ? ` · ${fmtDate(h.startDate)} – ${fmtDate(h.endDate)}` : ` · ${fmtDate(h.startDate)}`}</Text>
                          </View>
                          {selecting ? (
                            <View style={{ alignSelf: 'center', marginRight: 12, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                              borderColor: on ? BLUE : border, backgroundColor: on ? BLUE : 'transparent' }}>
                              {on && <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                            </View>
                          ) : canEdit ? <Text style={{ alignSelf: 'center', paddingRight: 12, fontSize: 12, fontWeight: '800', color: colors.amber }}>Edit</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {selecting && picked.size > 0 && (
                <TouchableOpacity disabled={deleting}
                  onPress={() => Alert.alert(`Delete ${picked.size} holiday${picked.size !== 1 ? 's' : ''}?`, `Classes on those days are put back on ${kid.name.split(' ')[0]}'s schedule.`, [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: async () => {
                      setDeleting(true);
                      for (const id of picked) { try { await useSchoolStore.getState().removeHoliday(kid.id, id); } catch { /* keep going */ } }
                      setDeleting(false); setPicked(new Set()); setSelecting(false);
                    } },
                  ])}
                  style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: colors.danger }}>
                  {deleting ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{deleting ? 'Deleting…' : `Delete ${picked.size} selected`}</Text>
                </TouchableOpacity>
              )}
              {canEdit && !selecting && (
                <TouchableOpacity onPress={() => setEditingHoliday('new')} style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>+ Add a holiday</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {dates.length === 0 ? (
                <View style={card as any}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>No important dates yet</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC }}>Early release, picture day, conferences and other school dates show here. Add one, or scan a school calendar flyer.</Text>
                </View>
              ) : (
                <View style={card as any}>
                  {dates.map((e, i) => (
                    <TouchableOpacity key={e.id} activeOpacity={canEdit ? 0.6 : 1} disabled={!canEdit} onPress={() => setEditingDate(e)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: i > 0 ? 10 : 0, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                      <CalendarDays size={16} color={BLUE} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }} numberOfLines={2}>{e.title}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC, marginTop: 1 }}>{fmtDateShort(e.date)}{e.time ? ` · ${fmtTime12(e.time)}` : ' · All day'}</Text>
                      </View>
                      {canEdit ? <Text style={{ fontSize: 12, fontWeight: '800', color: BLUE }}>Edit</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {canEdit && (
                <TouchableOpacity onPress={() => setEditingDate('new')} style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>+ Add a school date</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </View>
      {editingDate && (
        <ImportantDateEditScreen
          colors={colors} isDark={isDark}
          memberId={kid.id} memberName={kid.name}
          event={editingDate === 'new' ? null : editingDate}
          onClose={() => setEditingDate(null)}
        />
      )}
      {editingHoliday && (
        <HolidayEditScreen
          colors={colors} isDark={isDark}
          memberId={kid.id} memberName={kid.name}
          holiday={editingHoliday === 'new' ? null : editingHoliday}
          onClose={() => setEditingHoliday(null)}
        />
      )}
      {editing && (
        <ClassEditScreen
          colors={colors} isDark={isDark}
          memberId={kid.id} memberName={kid.name}
          period={editing === 'new' ? null : editing}
          terms={terms} defaultTerm={term}
          onClose={() => setEditing(null)}
        />
      )}
    </OverlayPage>
  );
}

export default function SchoolHomeScreen({ colors, isDark, isKid, isTeen, onClose }: {
  colors: any; isDark: boolean; isKid: boolean; isTeen?: boolean; onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const isOwnScheduleOnly = !!(isKid || isTeen);

  useEffect(() => {
    hideTabBar();
    return () => showTabBar();
  }, []);

  // Refresh from the phone and the server each time School opens, so what was saved always shows.
  useEffect(() => { useSchoolStore.getState().loadFromStorage(); }, []);

  const kids: FamilyMember[] = useMemo(() => {
    if (isOwnScheduleOnly) {
      const me = members.find(m => m.id === activeMemberId);
      return me ? [me] : [];
    }
    return members.filter(m => m.role === 'kid' || m.role === 'teen');
  }, [members, activeMemberId, isOwnScheduleOnly]);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  const [manageKidId, setManageKidId] = useState<string | null>(null);
  const schedules = useSchoolStore(s => s.schedules);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKidId, setCreateKidId] = useState<string | undefined>(undefined);
  const [holidaysMemberId, setHolidaysMemberId] = useState<string | null>(null);
  const [flyerOpen, setFlyerOpen] = useState(false);

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  const todayLine = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const subtitle = isOwnScheduleOnly
    ? `${todayLine} · your own school records`
    : `${todayLine} · All children · parent-managed school records`;

  const holidaysMember = members.find(m => m.id === holidaysMemberId);

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Header — same PageHeading shell as Grocery/Home Care (eyebrow +
            title + subtitle + pastel icon badge), title-tap plays the same
            slide-out-right animation as the rest of the app instead of the
            old non-tappable breadcrumb/title text. */}
        <View style={{ backgroundColor: canvas }}>
          <PageHeading
            eyebrow="FAMILY CUBE · SCHOOL"
            title="School"
            subtitle={subtitle}
            accent="amber"
            Icon={GraduationCap}
            onTitlePress={onClose}
            topInset={insets.top}
          />
        </View>

        {/* Create-schedule banner — says what it is for, with the action inside it (parents). */}
        {!isOwnScheduleOnly && (
          <View style={[{ marginHorizontal: RHYTHM.page, marginTop: 4, borderRadius: 18, padding: RHYTHM.card, gap: RHYTHM.item, backgroundColor: isDark ? colors.card : CARD_BG },
            !isDark && CARD_SHADOW]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.surface : '#F9E5C1' }}>
                <GraduationCap size={22} color={colors.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: titleC }}>
                  {kids.some(k => !schedules.find(sc => sc.memberId === k.id)) ? 'Build a school schedule' : 'Add another schedule'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', lineHeight: 18, color: bodyC, marginTop: 2 }}>
                  Add each class once (name, room, teacher, times and days) or scan the timetable. Rides, reminders and the calendar then know the school day.
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
              <TouchableOpacity onPress={() => setCreateOpen(true)} accessibilityRole="button"
                style={{ flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Create schedule</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFlyerOpen(true)} accessibilityRole="button"
                style={{ flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
                  borderWidth: 1, borderColor: border, backgroundColor: isDark ? colors.surface : SURFACE }}>
                <Camera size={16} color={BLUE} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Scan a flyer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Kids — tap Manage to open that child's own page (schedule, holidays, important dates). */}
        <View style={{ paddingHorizontal: RHYTHM.page, paddingTop: RHYTHM.item, gap: RHYTHM.item }}>
          {kids.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
              <Text style={{ fontSize: 32 }}>📚</Text>
              <Text style={{ fontSize: 14, color: bodyC, textAlign: 'center' }}>No kids in this family yet.</Text>
            </View>
          ) : kids.map(kid => (
            <KidDayCard key={kid.id} kid={kid} isOwnScheduleOnly={isOwnScheduleOnly} colors={colors} isDark={isDark}
              onOpenDay={() => setManageKidId(kid.id)} onCreateSchedule={() => setCreateOpen(true)} />
          ))}
        </View>

        {/* Caption */}
        <View style={{ paddingHorizontal: 21, paddingTop: 18 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: bodyC, lineHeight: 16 }}>
            Minor accounts see only their own schedule, not health records or profile administration.
          </Text>
        </View>
      </ScrollView>

      {/* ── Overlays ── */}
      {manageKidId && members.find(m => m.id === manageKidId) && (
        <KidSchoolPage
          kid={members.find(m => m.id === manageKidId)!}
          colors={colors} isDark={isDark} canEdit={!isOwnScheduleOnly}
          onClose={() => setManageKidId(null)}
          onOpenHolidays={() => setHolidaysMemberId(manageKidId)}
          onCreateSchedule={() => { setCreateKidId(manageKidId ?? undefined); setCreateOpen(true); }}
        />
      )}

      {createOpen && (
        <NewScheduleScreen
          colors={colors} isDark={isDark}
          presetMemberId={createKidId}
          onClose={() => { setCreateOpen(false); setCreateKidId(undefined); }}
          zIndex={61}
        />
      )}

      {holidaysMember && (
        <HolidaysScreen
          visible={!!holidaysMemberId}
          colors={colors} isDark={isDark}
          memberId={holidaysMember.id}
          memberName={holidaysMember.name}
          kids={kids}
          onClose={() => setHolidaysMemberId(null)}
          zIndex={62}
        />
      )}

      <FlyerScannerModal visible={flyerOpen} onClose={() => setFlyerOpen(false)} />
    </View>
  );
}
