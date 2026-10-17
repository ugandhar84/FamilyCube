/**
 * ImportantDateEditScreen — add, edit or delete ONE school date for a child (early release, picture day, conference, field
 * trip…). It is a normal calendar event in the School category, so it shows on the Schedule too.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayPage, OverlayHeading } from '@/components/OverlayPage';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { ScanDateField } from '../health/ScanDateField';
import { TimeField } from './TimeField';
import { fmtDate } from '@/lib/dates';

export function ImportantDateEditScreen({ colors, isDark, memberId, memberName, event, onClose, zIndex = 59 }: {
  colors: any; isDark: boolean;
  memberId: string; memberName: string;
  /** The date being edited; null adds a new one. */
  event: FamilyEvent | null;
  onClose: () => void;
  zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState<string | null>(event?.date ?? null);
  const [allDay, setAllDay] = useState(event ? (!event.time || !!event.allDay) : true);
  const [start, setStart] = useState<string | null>(event?.time ?? '09:00');
  const [end, setEnd] = useState<string | null>(event?.endTime ?? null);
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canvas = isDark ? colors.background : GEMINI.canvas;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const BLUE = GEMINI.blue;
  const field = { borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: cardBg } as const;
  const label = { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4, color: bodyC, marginBottom: 4, textTransform: 'uppercase' as const };
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  const save = async () => {
    if (busy) return;
    if (!title.trim()) { setError('Give it a name.'); return; }
    if (!date) { setError('Pick the date.'); return; }
    if (!allDay && (!start || (end && toMin(end) <= toMin(start)))) { setError('The end time has to be after the start time.'); return; }
    setBusy(true);
    try {
      const st = useEventStore.getState();
      const fields = {
        title: title.trim(), date,
        time: allDay ? undefined : start ?? undefined,
        endTime: allDay ? undefined : end ?? undefined,
        allDay: allDay || undefined,
        notes: notes.trim() || undefined,
      };
      if (event) {
        await st.updateEvent(event.id, { ...fields, allDay: allDay });
      } else {
        const me = useFamilyStore.getState().activeMemberId ?? undefined;
        const id = await st.addEvent({ ...fields, category: 'School', type: 'event', memberId, createdBy: me, approvalPending: false } as any);
        if (!id) { setError('Could not save. Check your connection and try again.'); return; }
      }
      onClose();
    } finally { setBusy(false); }
  };

  const remove = () => {
    if (!event || busy) return;
    Alert.alert(`Delete ${event.title}?`, `${fmtDate(event.date)} is removed from ${memberName.split(' ')[0]}'s school dates and the calendar.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { useEventStore.getState().deleteEvent(event.id); onClose(); } },
    ]);
  };

  return (
    <OverlayPage visible onDismiss={onClose} zIndex={zIndex} backgroundColor={canvas}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <OverlayHeading eyebrow="FAMILY CUBE · SCHOOL" title={event ? 'Edit school date' : 'Add a school date'}
          subtitle={`${memberName.split(' ')[0]}'s school calendar`} accent="amber" topInset={insets.top} onTitlePress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, paddingBottom: insets.bottom + RHYTHM.section, gap: RHYTHM.item }}>
            <View style={field}>
              <Text style={label}>What is it</Text>
              <TextInput value={title} onChangeText={t => { setTitle(t); setError(''); }} placeholder="e.g. Picture day, Early release, Parent conference"
                placeholderTextColor={bodyC + '88'} style={{ fontSize: 16, color: titleC, padding: 0 }} />
            </View>
            <ScanDateField label="Date" value={date} onChange={v => { setDate(v); setError(''); }} colors={colors} isDark={isDark} accent={BLUE} />
            <View style={[field, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>All day</Text>
              <Switch value={allDay} onValueChange={setAllDay} />
            </View>
            {!allDay && (
              <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
                <View style={{ flex: 1 }}><TimeField label="Starts" value={start} onChange={setStart} colors={colors} isDark={isDark} accent={BLUE} /></View>
                <View style={{ flex: 1 }}><TimeField label="Ends (optional)" value={end} onChange={setEnd} colors={colors} isDark={isDark} accent={BLUE} /></View>
              </View>
            )}
            <View style={field}>
              <Text style={label}>Notes</Text>
              <TextInput value={notes} onChangeText={setNotes} placeholder="Anything to remember" placeholderTextColor={bodyC + '88'}
                multiline style={{ fontSize: 15, color: titleC, padding: 0, minHeight: 44, textAlignVertical: 'top' }} />
            </View>
            {error ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>{error}</Text> : null}

            <TouchableOpacity onPress={save} disabled={busy} accessibilityRole="button"
              style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: BLUE, opacity: busy ? 0.7 : 1 }}>
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{busy ? 'Saving…' : event ? 'Save changes' : 'Add school date'}</Text>
            </TouchableOpacity>
            {event && (
              <TouchableOpacity onPress={remove} disabled={busy} accessibilityRole="button"
                style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger + '1A' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.danger }}>Delete this date</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </OverlayPage>
  );
}
