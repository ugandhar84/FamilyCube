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
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, GraduationCap, PartyPopper, CalendarDays } from 'lucide-react-native';
import { useEventStore } from '@/store/eventStore';
import { fmtDate, fmtDateShort } from '@/lib/dates';
import { RHYTHM } from '@/constants/theme';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useSchoolStore, type ClassPeriod } from '@/store/schoolStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import FlyerScannerModal from '@/components/FlyerScannerModal';
import { PageHeading } from '@/components/PageHeading';
import { OverlayPage, OverlayHeading } from '@/components/OverlayPage';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { CreateScheduleScreen, type ScheduleDraft } from './school/CreateScheduleScreen';
import { BuildPeriodsScreen } from './school/BuildPeriodsScreen';
import { HolidaysScreen } from './school/HolidaysScreen';
import { SchoolDayScreen } from './school/SchoolDayScreen';

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

// Days off (not a class day) — used to keep them out of the "other important dates" list.
const DAY_OFF_RE = /\b(holiday|break|no school|in-?service|staff (professional|development)|teacher work ?day|school closed)\b/i;

function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEK_DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' },
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
    return schedule.periods
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
        onPress={schedule ? onOpenDay : onCreateSchedule}
        style={{ paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: border,
          backgroundColor: isDark ? colors.surface : '#FCFBF9' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: titleC }}>
          {schedule ? 'Manage  →' : 'Create schedule  →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** One child's own School page: Schedule (today / week), Holidays (from – to) and Important dates. */
function KidSchoolPage({ kid, colors, isDark, canEdit, onClose, onOpenDay, onOpenHolidays, onCreateSchedule }: {
  kid: FamilyMember; colors: any; isDark: boolean; canEdit: boolean;
  onClose: () => void; onOpenDay: () => void; onOpenHolidays: () => void; onCreateSchedule: () => void;
}) {
  const insets = useSafeAreaInsets();
  const schedule = useSchoolStore(s => s.schedules.find(sc => sc.memberId === kid.id));
  const events = useEventStore(s => s.events);
  const [tab, setTab] = useState<MainTab>('schedule');
  const [view, setView] = useState<'day' | 'week'>('day');
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
      && (e.memberId === kid.id || e.memberIds?.includes(kid.id)))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    .filter((e, i, arr) => arr.findIndex(x => x.title === e.title && x.date === e.date) === i)
    .slice(0, 40);

  const todayKey = DAY_KEYS[new Date().getDay()];
  const dayPeriods = (key: string) => (schedule?.periods ?? [])
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
                <View style={{ flexDirection: 'row', backgroundColor: isDark ? colors.surface : SURFACE, borderRadius: 14, padding: 3 }}>
                  {([['day', 'Today'], ['week', 'This week']] as const).map(([key, label]) => (
                    <TouchableOpacity key={key} onPress={() => setView(key)}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11, backgroundColor: view === key ? (isDark ? colors.card : '#FFFFFF') : 'transparent' }}>
                      <Text style={{ fontSize: 13, fontWeight: view === key ? '800' : '600', color: view === key ? titleC : bodyC }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {view === 'day' ? (
                  <View style={card as any}>
                    {dayPeriods(todayKey).length === 0 ? (
                      <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC }}>No classes today.</Text>
                    ) : dayPeriods(todayKey).map((p, i) => (
                      <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: i > 0 ? 10 : 0, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC }}>{fmtTime12(p.startTime)}–{fmtTime12(p.endTime)}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>{p.subject}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={card as any}>
                    {WEEK_DAYS.map((d, i) => {
                      const ps = dayPeriods(d.key);
                      return (
                        <View key={d.key} style={{ flexDirection: 'row', gap: 10, paddingTop: i > 0 ? 10 : 0, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                          <Text style={{ width: 36, fontSize: 13, fontWeight: '800', color: d.key === todayKey ? BLUE : bodyC }}>{d.label}</Text>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: ps.length ? titleC : bodyC }}>
                            {ps.length ? `${fmtTime12(ps[0].startTime)}–${fmtTime12(ps[ps.length - 1].endTime)} · ${ps.map(p => p.subject).join(', ')}` : 'No classes'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                <TouchableOpacity onPress={onOpenDay} style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>{canEdit ? 'Edit classes & open the full day →' : 'Open the full day →'}</Text>
                </TouchableOpacity>
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
              <View style={card as any}>
                {holidays.length === 0 ? (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC }}>No holidays added yet. Scan a school calendar flyer or add one.</Text>
                ) : holidays.map((h, i) => (
                  <View key={h.id} style={{ flexDirection: 'row', gap: 10, paddingTop: i > 0 ? 10 : 0, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                    <PartyPopper size={16} color={colors.amber} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>{h.reason}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC, marginTop: 1 }}>
                        {h.startDate === h.endDate ? fmtDate(h.startDate) : `${fmtDate(h.startDate)} – ${fmtDate(h.endDate)}`}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              {canEdit && (
                <TouchableOpacity onPress={onOpenHolidays} style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Add or edit holidays</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            dates.length === 0 ? (
              <View style={card as any}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>No important dates yet</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC }}>Early release, picture day, conferences and other school dates show here. Scan a school calendar flyer to add them.</Text>
              </View>
            ) : (
              <View style={card as any}>
                {dates.map((e, i) => (
                  <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: i > 0 ? 10 : 0, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                    <CalendarDays size={16} color={BLUE} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }} numberOfLines={2}>{e.title}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC, marginTop: 1 }}>{fmtDateShort(e.date)}{e.time ? ` · ${fmtTime12(e.time)}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )
          )}
        </ScrollView>
      </View>
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
  const [openDayMemberId, setOpenDayMemberId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [holidaysMemberId, setHolidaysMemberId] = useState<string | null>(null);
  const [flyerOpen, setFlyerOpen] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  const todayLine = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const subtitle = isOwnScheduleOnly
    ? `${todayLine} · your own school records`
    : `${todayLine} · All children · parent-managed school records`;

  const openDayScreenMember = members.find(m => m.id === openDayMemberId);
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
                  {kids.some(k => !schedules.find(sc => sc.memberId === k.id)) ? 'Set up the school schedule' : 'Add or change a schedule'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', lineHeight: 18, color: bodyC, marginTop: 2 }}>
                  Classes, holidays and key dates for each child, so rides, reminders and the calendar know the school day.
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
          onOpenDay={() => setOpenDayMemberId(manageKidId)}
          onOpenHolidays={() => setHolidaysMemberId(manageKidId)}
          onCreateSchedule={() => setCreateOpen(true)}
        />
      )}

      {openDayScreenMember && (
        <SchoolDayScreen
          visible={!!openDayMemberId}
          colors={colors} isDark={isDark}
          memberId={openDayScreenMember.id}
          memberName={openDayScreenMember.name}
          onClose={() => setOpenDayMemberId(null)}
          onOpenHolidays={() => { setHolidaysMemberId(openDayScreenMember.id); }}
          zIndex={60}
        />
      )}

      <CreateScheduleScreen
        visible={createOpen}
        colors={colors} isDark={isDark}
        parentName={activeMember?.name ?? ''}
        onClose={() => setCreateOpen(false)}
        onContinue={(d) => { setDraft(d); setCreateOpen(false); setBuildOpen(true); }}
        zIndex={60}
      />

      <BuildPeriodsScreen
        visible={buildOpen}
        colors={colors} isDark={isDark}
        draft={draft}
        onClose={() => { setBuildOpen(false); setDraft(null); }}
        onCancel={() => { setBuildOpen(false); setCreateOpen(true); }}
        onFinished={() => { setBuildOpen(false); setDraft(null); }}
        zIndex={61}
      />

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
