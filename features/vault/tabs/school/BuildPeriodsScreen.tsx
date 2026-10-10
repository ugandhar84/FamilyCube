/**
 * BuildPeriodsScreen — School wizard Step 2 ("Build [Day]'s periods").
 * Parent-only. Takes the ScheduleDraft from Screen 3 and lets the parent
 * add/edit/remove class periods per chosen teaching day. Periods are held
 * in local draft state (keyed per day) until "Finish & save schedule" —
 * at that point this screen calls addSchedule then addPeriod SEQUENTIALLY
 * for every period across every day, mirroring SchoolScheduleModal.tsx's
 * own save() sequencing (lines 408-466): those actions read/write the
 * same schedules array via get()/set(), so Promise.all would race and
 * silently drop all but the last writer's change.
 *
 * Each draft period stores 'HH:MM' 24h start/end times (ClassPeriod's own
 * shape) — TimeField.tsx handles the 12h-display / 24h-storage split, and
 * every other place this screen shows a time uses fmtTime12 so nothing
 * ever renders raw 24h text (CLAUDE.md's non-negotiable 12h rule).
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FullPageOverlay from '@/components/FullPageOverlay';
import { TimeField, fmtTime12 } from './TimeField';
import { ALL_DAYS, type SchoolDay, type ScheduleDraft } from './CreateScheduleScreen';
import { useSchoolStore, type ClassPeriod, type KidSchedule } from '@/store/schoolStore';

const CANVAS = '#FFFFFF';
const TITLE_CLR = '#172337';
const BODY_CLR = '#657185';
const BLUE = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER = '#E8EBF0';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F5F7FB';
const RED = '#D64545';
const RED_BG = '#FDEEEE';

const DAY_FULL: Record<SchoolDay, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const DAY_SHORT: Record<SchoolDay, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

interface DraftPeriod {
  localId: string;
  name: string;
  startTime: string; // HH:MM 24h, '' = unset
  endTime: string;
}

function timeToMins(t: string): number {
  if (!t) return -1;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function BuildPeriodsScreen({ visible, colors, isDark, draft, onClose, onCancel, onFinished, zIndex = 61 }: {
  visible: boolean; colors: any; isDark: boolean;
  draft: ScheduleDraft | null;
  onClose: () => void;
  /** "Cancel · return to schedule draft" — goes back to Screen 3, draft discarded. */
  onCancel: () => void;
  /** Fires after the whole schedule + every period has been saved. */
  onFinished: () => void;
  zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const { addSchedule, addPeriod } = useSchoolStore();

  const [activeDay, setActiveDay] = useState<SchoolDay>(draft?.days[0] ?? 'mon');
  const [periodsByDay, setPeriodsByDay] = useState<Record<string, DraftPeriod[]>>({});
  const [editing, setEditing] = useState<{ day: SchoolDay; period: DraftPeriod } | null>(null);
  const [removing, setRemoving] = useState<{ day: SchoolDay; period: DraftPeriod } | null>(null);
  const [saving, setSaving] = useState(false);

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  if (!draft) return null;

  const days = draft.days.length ? draft.days : (['mon'] as SchoolDay[]);
  const dayPeriods = (periodsByDay[activeDay] ?? []).slice().sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  const totalPeriodCount = Object.values(periodsByDay).reduce((sum, arr) => sum + arr.length, 0);

  const resetAll = () => {
    setPeriodsByDay({}); setEditing(null); setRemoving(null); setActiveDay(days[0]);
  };

  const startAdd = () => {
    setEditing({ day: activeDay, period: { localId: 'd' + Date.now(), name: '', startTime: '', endTime: '' } });
  };
  const startEdit = (p: DraftPeriod) => setEditing({ day: activeDay, period: p });

  const isInvalid = editing ? (
    !!editing.period.startTime && !!editing.period.endTime &&
    timeToMins(editing.period.endTime) <= timeToMins(editing.period.startTime)
  ) : false;

  const savePeriodEdit = () => {
    if (!editing || isInvalid || !editing.period.name.trim() || !editing.period.startTime || !editing.period.endTime) return;
    const { day, period } = editing;
    setPeriodsByDay(prev => {
      const list = prev[day] ?? [];
      const exists = list.some(p => p.localId === period.localId);
      const next = exists ? list.map(p => p.localId === period.localId ? period : p) : [...list, period];
      return { ...prev, [day]: next };
    });
    setEditing(null);
  };

  const confirmRemove = () => {
    if (!removing) return;
    setPeriodsByDay(prev => ({
      ...prev,
      [removing.day]: (prev[removing.day] ?? []).filter(p => p.localId !== removing.period.localId),
    }));
    setRemoving(null);
  };

  const handleFinish = async () => {
    if (totalPeriodCount === 0 || saving) return;
    setSaving(true);
    try {
      const schedule: KidSchedule = {
        memberId: draft.memberId,
        memberName: draft.memberName,
        semester: 'Fall',
        year: new Date().getFullYear(),
        gradeYear: draft.yearClass || undefined,
        school: draft.school || undefined,
        lunchPeriod: 'B',
        dayType: 'Regular',
        periods: [],
      };
      addSchedule(schedule);

      // Sequential, not Promise.all — addPeriod reads/writes the same
      // shared schedules array via get()/set(); concurrent calls race and
      // silently drop all but the last writer's change (mirrors
      // SchoolScheduleModal.tsx's own save() comment on this exact point).
      for (const day of days) {
        const periods = periodsByDay[day] ?? [];
        for (const p of periods) {
          await addPeriod(draft.memberId, {
            period: 0,
            subject: p.name.trim(),
            room: '',
            startTime: p.startTime,
            endTime: p.endTime,
            days: [day],
          } as Omit<ClassPeriod, 'id'>);
        }
      }
      resetAll();
      onFinished();
    } finally {
      setSaving(false);
    }
  };

  const close = () => { resetAll(); onClose(); };
  const cancel = () => { resetAll(); onCancel(); };

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ School</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
            Build {DAY_FULL[activeDay]}'s periods
          </Text>
        </View>

        {/* Day-tab strip — only chosen days */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginTop: 4, marginBottom: 6 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {days.map(d => {
            const sel = d === activeDay;
            const count = (periodsByDay[d] ?? []).length;
            return (
              <TouchableOpacity key={d} onPress={() => { setActiveDay(d); setEditing(null); setRemoving(null); }}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
                  backgroundColor: sel ? (isDark ? colors.teal : TITLE_CLR) : cardBg,
                  borderWidth: 1, borderColor: sel ? 'transparent' : border }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: sel ? '#FFFFFF' : bodyC }}>
                  {DAY_SHORT[d]}{count > 0 ? ` · ${count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 48, gap: 12 }}>

            {/* Periods card */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: cardBg, overflow: 'hidden' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: titleC, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                {DAY_FULL[activeDay]} periods
              </Text>
              {dayPeriods.length === 0 ? (
                <Text style={{ fontSize: 13, color: bodyC, paddingHorizontal: 16, paddingBottom: 14 }}>
                  No periods added yet for {DAY_FULL[activeDay]}.
                </Text>
              ) : dayPeriods.map((p, i) => (
                <View key={p.localId} style={{ paddingHorizontal: 16, paddingVertical: 12,
                  borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>
                    {p.name} — {fmtTime12(p.startTime)}–{fmtTime12(p.endTime)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                    <TouchableOpacity onPress={() => startEdit(p)}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setRemoving({ day: activeDay, period: p })}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: RED }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Remove confirmation */}
            {removing && removing.day === activeDay && (
              <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: RED, backgroundColor: RED_BG,
                paddingHorizontal: 16, paddingVertical: 14, gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: RED }}>
                  Remove {removing.period.name || 'this period'}?
                </Text>
                <Text style={{ fontSize: 13, color: RED, lineHeight: 18 }}>
                  {DAY_FULL[removing.day]} · {fmtTime12(removing.period.startTime)}–{fmtTime12(removing.period.endTime)}
                </Text>
                <Text style={{ fontSize: 13, color: RED, lineHeight: 18 }}>
                  This removes the period from the draft. You can re-add it before finishing the schedule.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity onPress={confirmRemove}
                    style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Confirm remove period</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setRemoving(null)}
                    style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: RED, backgroundColor: '#FFFFFF' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: RED }}>Keep {removing.period.name || 'period'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Inline editor */}
            {editing && editing.day === activeDay && (
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>
                  {dayPeriods.some(p => p.localId === editing.period.localId) ? `Edit ${editing.period.name || 'period'}` : 'Add a period'}
                </Text>

                <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Class / period name</Text>
                  <TextInput
                    value={editing.period.name}
                    onChangeText={v => setEditing(e => e ? { ...e, period: { ...e.period, name: v } } : e)}
                    placeholder="e.g. Registration"
                    placeholderTextColor="#C0C7D4"
                    style={{ fontSize: 15, color: titleC, padding: 0 }}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <TimeField label="Start time" value={editing.period.startTime || null}
                      onChange={v => setEditing(e => e ? { ...e, period: { ...e.period, startTime: v } } : e)}
                      colors={colors} isDark={isDark} accent={BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TimeField label="End time" value={editing.period.endTime || null}
                      onChange={v => setEditing(e => e ? { ...e, period: { ...e.period, endTime: v } } : e)}
                      colors={colors} isDark={isDark} accent={isInvalid ? RED : BLUE} />
                  </View>
                </View>

                {isInvalid && (
                  <>
                    <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: RED, backgroundColor: RED_BG,
                      paddingHorizontal: 14, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: RED, marginBottom: 2 }}>End time · error</Text>
                      <Text style={{ fontSize: 13, color: RED }}>
                        {fmtTime12(editing.period.endTime)} · must be later than {fmtTime12(editing.period.startTime)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17 }}>
                      End time must be after start time. The draft also checks overlap with adjacent periods.
                      Change the end time before saving this period.
                    </Text>
                  </>
                )}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={savePeriodEdit}
                    disabled={isInvalid || !editing.period.name.trim() || !editing.period.startTime || !editing.period.endTime}
                    style={{ flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isInvalid
                        ? RED_BG
                        : (!editing.period.name.trim() || !editing.period.startTime || !editing.period.endTime)
                          ? (isDark ? colors.surface : SURFACE) : BLUE }}>
                    <Text style={{ fontSize: 14, fontWeight: '700',
                      color: isInvalid ? RED : (!editing.period.name.trim() || !editing.period.startTime || !editing.period.endTime) ? bodyC : '#FFFFFF' }}>
                      {isInvalid ? 'Save period · fix end time first' : 'Save period'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditing(null)}
                    style={{ height: 48, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: bodyC }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!editing && (
              <TouchableOpacity onPress={startAdd}
                style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderStyle: 'dashed', borderColor: BLUE, backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>Add another period</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={cancel} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: bodyC }}>Cancel · return to schedule draft</Text>
            </TouchableOpacity>

            {totalPeriodCount > 0 && (
              <TouchableOpacity onPress={handleFinish} disabled={saving}
                style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: BLUE, opacity: saving ? 0.6 : 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                  {saving ? 'Saving…' : 'Finish & save schedule'}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </FullPageOverlay>
  );
}
