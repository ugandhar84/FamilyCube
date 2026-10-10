/**
 * SchoolDayScreen — School Screen 2 ("Your school day"). Kid/teen own
 * view (or a parent drilling into one kid, per the brief). Shows the
 * selected day's full class list + a read-only "after school · your
 * plan" informational card.
 *
 * "After school · your plan" is a STUB per the orchestrating agent's own
 * grep confirmation — no kid-owned "personal plan"/"after school plan"
 * feature or store exists anywhere else in this app (only generic
 * calendar/kiosk event forms and an unrelated HelpRequestModal matched
 * that search). This card is purely informational text; it is NOT backed
 * by any store and has no live "Open your plan →" link — inventing a new
 * store for an informational stub Figma panel would be scope creep this
 * rebuild explicitly avoids.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FullPageOverlay from '@/components/FullPageOverlay';
import { useSchoolStore, type ClassPeriod } from '@/store/schoolStore';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception, 2026-10-10) — see
// SchoolHomeScreen.tsx's own comment for the full rationale.
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
const GREEN_BG = '#EEF7F0';
const GREEN_TEXT = '#2D7A4A';

type DayTab = 'today' | 'week' | 'holidays';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_FULL: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fmtTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function SchoolDayScreen({ visible, colors, isDark, memberId, memberName, yearLabel, onClose, onOpenHolidays, zIndex = 60 }: {
  visible: boolean; colors: any; isDark: boolean;
  memberId: string; memberName: string; yearLabel?: string;
  onClose: () => void;
  onOpenHolidays: () => void;
  zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const { schedules } = useSchoolStore();
  const schedule = schedules.find(s => s.memberId === memberId);

  const [tab, setTab] = useState<DayTab>('today');

  const todayKey = DAY_KEYS[new Date().getDay()];

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  const todayPeriods = useMemo(() => {
    if (!schedule) return [] as ClassPeriod[];
    return schedule.periods
      .filter(p => (p.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']).includes(todayKey))
      .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  }, [schedule, todayKey]);

  const weekByDay = useMemo(() => {
    if (!schedule) return {} as Record<string, ClassPeriod[]>;
    const out: Record<string, ClassPeriod[]> = {};
    for (const key of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      const periods = schedule.periods
        .filter(p => (p.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']).includes(key))
        .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
      if (periods.length) out[key] = periods;
    }
    return out;
  }, [schedule]);

  const close = () => onClose();
  const firstName = memberName.split(' ')[0];
  const dateLine = `${new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${schedule?.school ? ` · ${schedule.school}` : ''}`;

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ School</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
            {firstName}'s school day
          </Text>
          <Text style={{ fontSize: 14, color: bodyC, marginTop: 4 }}>
            Your own schedule{yearLabel ? ` · ${yearLabel}` : ''}
          </Text>

          {/* Sub-card */}
          <View style={{ marginTop: 10, borderWidth: 1, borderColor: border, borderRadius: 12,
            backgroundColor: cardBg, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: 13, color: bodyC }}>{dateLine}</Text>
          </View>

          {/* Segmented tabs */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {([['today', 'Today'], ['week', 'Week'], ['holidays', 'Holidays']] as [DayTab, string][]).map(([key, label]) => (
              <TouchableOpacity key={key}
                onPress={() => key === 'holidays' ? onOpenHolidays() : setTab(key)}
                style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: tab === key ? (isDark ? colors.teal : TITLE_CLR) : (isDark ? colors.surface : SURFACE),
                  borderWidth: tab === key ? 0 : 1, borderColor: border }}>
                <Text style={{ fontSize: 13, fontWeight: '600',
                  color: tab === key ? '#FFFFFF' : bodyC }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48, gap: 14 }}>

          {!schedule ? (
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: cardBg,
              padding: 16 }}>
              <Text style={{ fontSize: 14, color: bodyC }}>No schedule set up yet — ask a parent to add one.</Text>
            </View>
          ) : tab === 'today' ? (
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: cardBg, overflow: 'hidden' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: titleC, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                Today's classes
              </Text>
              {todayPeriods.length === 0 ? (
                <Text style={{ fontSize: 13, color: bodyC, paddingHorizontal: 16, paddingBottom: 14 }}>No classes today.</Text>
              ) : todayPeriods.map((p, i) => (
                <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                  <Text style={{ fontSize: 13, color: bodyC, fontVariant: ['tabular-nums'] }}>
                    {fmtTime12(p.startTime)}–{fmtTime12(p.endTime)}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>{p.subject}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {Object.keys(weekByDay).length === 0 ? (
                <Text style={{ fontSize: 14, color: bodyC }}>No classes this week.</Text>
              ) : DAY_KEYS.filter(k => weekByDay[k]).map(dayKey => (
                <View key={dayKey} style={{ borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: cardBg, overflow: 'hidden' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
                    {DAY_FULL[dayKey] ?? dayKey}{dayKey === todayKey ? ' · today' : ''}
                  </Text>
                  {weekByDay[dayKey].map((p, i) => (
                    <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                      <Text style={{ fontSize: 13, color: bodyC, fontVariant: ['tabular-nums'] }}>
                        {fmtTime12(p.startTime)}–{fmtTime12(p.endTime)}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>{p.subject}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* After school · your plan — read-only stub, no store */}
          <View style={{ borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: cardBg,
            paddingHorizontal: 16, paddingVertical: 14, gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>After school · your plan</Text>
            <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18 }}>
              Pickup, activities and homework time aren't tracked here yet — check with a parent for today's plan.
            </Text>
          </View>

          {/* Own-schedule-only access callout */}
          <View style={{ borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: isDark ? colors.surface : GREEN_BG }}>
            <Text style={{ fontSize: 13, color: isDark ? colors.teal : GREEN_TEXT, lineHeight: 18 }}>
              You can only see your own class schedule here — not other family members' health records or profile settings.
            </Text>
          </View>

          <TouchableOpacity onPress={close}
            style={{ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>Back to your day</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </FullPageOverlay>
  );
}
