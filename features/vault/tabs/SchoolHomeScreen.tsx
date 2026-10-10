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
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera } from 'lucide-react-native';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useSchoolStore, type ClassPeriod } from '@/store/schoolStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import FlyerScannerModal from '@/components/FlyerScannerModal';
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
const BLUE = '#3B5FE4';
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

type MainTab = 'today' | 'week' | 'schedules';

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
          {schedule ? 'Open full day  →' : 'Create schedule  →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SchoolHomeScreen({ colors, isDark, isKid, isTeen }: {
  colors: any; isDark: boolean; isKid: boolean; isTeen?: boolean;
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
  const parentLabel = activeMember ? `${activeMember.name.split(' ')[0]} · ${
    activeMember.role === 'parent' ? 'Parent' : activeMember.role === 'teen' ? 'Teen' : activeMember.role === 'senior' ? 'Grandparent' : 'Kid'
  }` : '';

  const [mainTab, setMainTab] = useState<MainTab>('today');
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

        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: isDark ? bodyC : BODY_CLR_LIGHT, textTransform: 'uppercase' }}>
              FAMILY CUBE / {(activeMember?.familyId ? 'FAMILY' : 'HOME').toUpperCase()}
            </Text>
            {!!parentLabel && (
              <Text style={{ fontSize: 12, fontWeight: '800', color: titleC }}>{parentLabel.toUpperCase()}</Text>
            )}
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE, marginTop: 10 }}>‹ Family</Text>
          <Text style={{ fontSize: 32, fontWeight: '800', color: titleC, marginTop: 8, lineHeight: 38, letterSpacing: -0.5 }}>
            School
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: bodyC, marginTop: 4, lineHeight: 20 }}>{subtitle}</Text>

          {/* Segmented tabs — fully pill-shaped (half of row height), not
              just rounded-rect, matching the Gemini rhythm's chip style. */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {([['today', 'Today'], ['week', 'Week'], ['schedules', 'Schedules']] as [MainTab, string][]).map(([key, label]) => (
              <TouchableOpacity key={key} onPress={() => setMainTab(key)}
                style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                  backgroundColor: mainTab === key ? (isDark ? colors.teal : TITLE_CLR) : (isDark ? colors.surface : SURFACE) }}>
                <Text style={{ fontSize: 13, fontWeight: '700',
                  color: mainTab === key ? '#FFFFFF' : bodyC }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Kid cards */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 12 }}>
          {kids.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
              <Text style={{ fontSize: 32 }}>📚</Text>
              <Text style={{ fontSize: 14, color: bodyC, textAlign: 'center' }}>No kids in this family yet.</Text>
            </View>
          ) : kids.map(kid => (
            <KidDayCard
              key={kid.id}
              kid={kid}
              isOwnScheduleOnly={isOwnScheduleOnly}
              colors={colors} isDark={isDark}
              onOpenDay={() => setOpenDayMemberId(kid.id)}
              onCreateSchedule={() => setCreateOpen(true)}
            />
          ))}
        </View>

        {/* Action buttons — parent only for create/holidays/pickup */}
        {!isOwnScheduleOnly && (
          <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 10 }}>
            <TouchableOpacity onPress={() => setCreateOpen(true)}
              style={[{ height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE },
                !isDark && { shadowColor: BLUE, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>Create school schedule</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setFlyerOpen(true)}
              style={[{ height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
                borderWidth: isDark ? 1.5 : 0, borderColor: BLUE, backgroundColor: cardBg },
                !isDark && CARD_SHADOW]}>
              <Camera size={18} color={isDark ? BLUE : BLUE} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: titleC }}>Scan a flyer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => kids[0] && setHolidaysMemberId(kids[0].id)}
              disabled={kids.length === 0}
              style={[{ height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
                borderWidth: isDark ? 1 : 0, borderColor: border, backgroundColor: cardBg },
                !isDark && CARD_SHADOW]}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: titleC }}>Holidays &amp; exceptions</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: titleC }}>→</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Caption */}
        <View style={{ paddingHorizontal: 21, paddingTop: 18 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: bodyC, lineHeight: 16 }}>
            Minor accounts see only their own schedule, not health records or profile administration.
          </Text>
        </View>
      </ScrollView>

      {/* ── Overlays ── */}
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
