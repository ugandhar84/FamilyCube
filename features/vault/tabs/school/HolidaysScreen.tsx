/**
 * HolidaysScreen — School Screen 5 ("A break in the timetable"). Parent-
 * only. Lists each SchoolHoliday for the given kid's schedule and lets
 * the parent add/edit one. schoolStore has no update-in-place holiday
 * action (only addHoliday/removeHoliday, each with its own real
 * materialize/clear side effects on calendar_events — see
 * store/schoolStore.ts's own comments on those two), so "Edit holiday"
 * here is implemented as populating the add-form, then on save doing
 * removeHoliday + addHoliday — never a new store action.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PartyPopper } from 'lucide-react-native';
import FullPageOverlay from '@/components/FullPageOverlay';
import { ScanDateField } from '../health/ScanDateField';
import { useSchoolStore, type SchoolHoliday } from '@/store/schoolStore';
import { fmtDate } from '@/lib/dates';

const CANVAS = '#FFFFFF';
const TITLE_CLR = '#172337';
const BODY_CLR = '#657185';
const BLUE = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER = '#E8EBF0';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F5F7FB';
const AMBER = '#D97706';

function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}

/** "Mon 26–Fri 30 Oct 2026 · whole days" human range, never ISO. */
function fmtRange(startDate: string, endDate: string): string {
  const s = parseLocalDateStr(startDate);
  const e = parseLocalDateStr(endDate);
  const wd = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' });
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (startDate === endDate) {
    return `${wd(s)} ${fmtDate(startDate)} · whole day`;
  }
  if (sameMonth) {
    const month = s.toLocaleDateString('en-US', { month: 'short' });
    return `${wd(s)} ${s.getDate()}–${wd(e)} ${e.getDate()} ${month} ${e.getFullYear()} · whole days`;
  }
  return `${wd(s)} ${fmtDate(startDate)} – ${wd(e)} ${fmtDate(endDate)} · whole days`;
}

function nextSchoolDay(endDate: string): string {
  const d = parseLocalDateStr(endDate);
  d.setDate(d.getDate() + 1);
  return fmtDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
}

export function HolidaysScreen({ visible, colors, isDark, memberId, memberName, onClose, zIndex = 61 }: {
  visible: boolean; colors: any; isDark: boolean;
  memberId: string; memberName: string;
  onClose: () => void;
  zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const { schedules, addHoliday, removeHoliday } = useSchoolStore();
  const schedule = schedules.find(s => s.memberId === memberId);
  const holidays = schedule?.holidays ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  const resetForm = () => { setEditingId(null); setReason(''); setFromDate(null); setToDate(null); };
  const close = () => { resetForm(); onClose(); };

  const startEdit = (h: SchoolHoliday) => {
    setEditingId(h.id);
    setReason(h.reason);
    setFromDate(h.startDate);
    setToDate(h.endDate);
  };

  const save = async () => {
    if (!reason.trim() || !fromDate || !toDate || saving) return;
    setSaving(true);
    try {
      if (editingId) {
        // No update-in-place holiday action in schoolStore — remove then
        // re-add, which lets addHoliday's real retroactive-clear side
        // effect run correctly against the NEW range.
        await removeHoliday(memberId, editingId);
      }
      await addHoliday(memberId, { startDate: fromDate, endDate: toDate, reason: reason.trim() });
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!reason.trim() && !!fromDate && !!toDate;

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ School</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
            A break in the timetable
          </Text>
          <Text style={{ fontSize: 14, color: bodyC, marginTop: 6, lineHeight: 20 }}>
            {schedule?.school ? `${memberName.split(' ')[0]}'s schedule · ${schedule.school}` : `${memberName.split(' ')[0]}'s schedule`}
          </Text>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 48, gap: 12 }}>

            {holidays.length > 0 && holidays.map(h => {
              const resumeDate = nextSchoolDay(h.endDate);
              return (
                <View key={h.id} style={{ borderWidth: 1, borderColor: border, borderRadius: 16,
                  backgroundColor: cardBg, padding: 14, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: isDark ? colors.surface : '#FEF3E0',
                      alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <PartyPopper size={14} color={AMBER} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>{h.reason}</Text>
                      <Text style={{ fontSize: 13, color: bodyC, marginTop: 2 }}>{fmtRange(h.startDate, h.endDate)}</Text>
                      <Text style={{ fontSize: 13, color: bodyC, marginTop: 2 }}>
                        Applies to {memberName.split(' ')[0]} · recurring school periods skipped
                      </Text>
                      <Text style={{ fontSize: 13, color: bodyC, marginTop: 2 }}>
                        Classes resume {resumeDate} →
                      </Text>
                      <TouchableOpacity onPress={() => startEdit(h)} style={{ marginTop: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>Edit holiday →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Add / edit form */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: cardBg,
              padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: titleC }}>
                {editingId ? 'Edit holiday or closure' : 'Add a holiday or closure'}
              </Text>

              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Title</Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="e.g. Winter Break"
                  placeholderTextColor="#C0C7D4"
                  style={{ fontSize: 15, color: titleC, padding: 0 }}
                />
              </View>

              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>School / member</Text>
                <Text style={{ fontSize: 15, color: titleC }}>{memberName}{schedule?.school ? ` · ${schedule.school}` : ''}</Text>
              </View>

              <ScanDateField label="From" value={fromDate} onChange={setFromDate} colors={colors} isDark={isDark} accent={BLUE} />
              <ScanDateField label="To · inclusive" value={toDate} onChange={setToDate} colors={colors} isDark={isDark} accent={BLUE} />

              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Pattern</Text>
                <Text style={{ fontSize: 15, color: titleC }}>All-day exception</Text>
              </View>

              {/* Non-interactive confirmation of addHoliday's real behavior */}
              <View style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE, marginBottom: 3 }}>
                  Pause school periods on these days
                </Text>
                <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17 }}>
                  Every recurring class period on {memberName.split(' ')[0]}'s schedule is skipped for this date range,
                  including occurrences already on the calendar.
                </Text>
              </View>

              <TouchableOpacity onPress={save} disabled={!canSave || saving}
                style={{ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: canSave ? BLUE : (isDark ? colors.surface : SURFACE) }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: canSave ? '#FFFFFF' : bodyC }}>
                  {saving ? 'Saving…' : 'Save holiday exception'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={resetForm} style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: bodyC }}>Cancel holiday entry</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </FullPageOverlay>
  );
}
