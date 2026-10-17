/**
 * HolidayEditScreen — add, edit or delete ONE holiday or closure for a child (title + From / To dates).
 * schoolStore has no update-in-place action, so an edit removes the old range and adds the new one; both already clear or
 * restore the class periods in those days.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayPage, OverlayHeading } from '@/components/OverlayPage';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { useSchoolStore, type SchoolHoliday } from '@/store/schoolStore';
import { ScanDateField } from '../health/ScanDateField';
import { fmtDate } from '@/lib/dates';

export function HolidayEditScreen({ colors, isDark, memberId, memberName, holiday, onClose, zIndex = 59 }: {
  colors: any; isDark: boolean;
  memberId: string; memberName: string;
  /** The holiday being edited; null adds a new one. */
  holiday: SchoolHoliday | null;
  onClose: () => void;
  zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState(holiday?.reason ?? '');
  const [from, setFrom] = useState<string | null>(holiday?.startDate ?? null);
  const [to, setTo] = useState<string | null>(holiday?.endDate ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canvas = isDark ? colors.background : GEMINI.canvas;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const BLUE = GEMINI.blue;

  const save = async () => {
    if (busy) return;
    if (!reason.trim()) { setError('Give the holiday a name.'); return; }
    if (!from) { setError('Pick the first day.'); return; }
    const last = to ?? from;
    if (last < from) { setError('The last day can\'t be before the first day.'); return; }
    setBusy(true);
    try {
      const st = useSchoolStore.getState();
      if (holiday) await st.removeHoliday(memberId, holiday.id);
      await st.addHoliday(memberId, { startDate: from, endDate: last, reason: reason.trim() });
      onClose();
    } finally { setBusy(false); }
  };

  const remove = () => {
    if (!holiday || busy) return;
    Alert.alert(`Delete ${holiday.reason}?`, `${fmtDate(holiday.startDate)}${holiday.endDate !== holiday.startDate ? ` – ${fmtDate(holiday.endDate)}` : ''}. Classes on those days go back on ${memberName.split(' ')[0]}'s schedule.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await useSchoolStore.getState().removeHoliday(memberId, holiday.id); onClose(); } finally { setBusy(false); }
      } },
    ]);
  };

  return (
    <OverlayPage visible onDismiss={onClose} zIndex={zIndex} backgroundColor={canvas}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <OverlayHeading eyebrow="FAMILY CUBE · SCHOOL" title={holiday ? 'Edit holiday' : 'Add a holiday'}
          subtitle={`${memberName.split(' ')[0]}'s school calendar`} accent="amber" topInset={insets.top} onTitlePress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, paddingBottom: insets.bottom + RHYTHM.section, gap: RHYTHM.item }}>
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.4, color: bodyC, marginBottom: 4, textTransform: 'uppercase' }}>Name</Text>
              <TextInput value={reason} onChangeText={t => { setReason(t); setError(''); }} placeholder="e.g. Winter Break"
                placeholderTextColor={bodyC + '88'} style={{ fontSize: 16, color: titleC, padding: 0 }} />
            </View>
            <ScanDateField label="First day" value={from} onChange={v => { setFrom(v); setError(''); if (v && (!to || to < v)) setTo(v); }} colors={colors} isDark={isDark} accent={BLUE} />
            <ScanDateField label="Last day · inclusive" value={to} onChange={v => { setTo(v); setError(''); }} colors={colors} isDark={isDark} accent={BLUE} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: bodyC, lineHeight: 17 }}>
              For a single day, set the last day to the same date. Class periods on these days are skipped on {memberName.split(' ')[0]}'s schedule.
            </Text>
            {error ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>{error}</Text> : null}

            <TouchableOpacity onPress={save} disabled={busy} accessibilityRole="button"
              style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: BLUE, opacity: busy ? 0.7 : 1 }}>
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{busy ? 'Saving…' : holiday ? 'Save changes' : 'Add holiday'}</Text>
            </TouchableOpacity>
            {holiday && (
              <TouchableOpacity onPress={remove} disabled={busy} accessibilityRole="button"
                style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger + '1A' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.danger }}>Delete this holiday</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </OverlayPage>
  );
}
