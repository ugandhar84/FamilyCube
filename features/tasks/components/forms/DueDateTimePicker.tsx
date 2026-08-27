/**
 * DueDateTimePicker — the date pill + time pill + native spinner modal.
 *
 * This block existed three times near-identically: AddQuestModal's "Due
 * Date & Time", EditQuestModal's byte-identical copy of it, and (in a
 * PickerOverlay-based variant) AddEventModal's "Date & Time". The two
 * chores copies are the ones unified here — they share the same Modal +
 * spinner + "Done" header shape down to the emoji. AddEventModal keeps its
 * existing PickerOverlay component (a genuinely different inline-overlay
 * presentation with its own onDone/minimumDate contract) rather than being
 * forced into this one.
 *
 * State stays with the caller: one Date value plus the two open/closed
 * booleans, so the caller's own reset()/submit() keep working untouched.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TYPO } from '@/constants/theme';

export function DueDateTimePicker({
  value, setValue,
  showDatePick, setShowDatePick,
  showTimePick, setShowTimePick,
  fmtDateLabel, fmtTimeLabel,
  accentColor, colors, isDark,
  label = 'Due Date & Time',
  pillStyle, overlayStyle, cardStyle,
  minimumDate,
}: {
  value: Date;
  setValue: React.Dispatch<React.SetStateAction<Date>>;
  showDatePick: boolean; setShowDatePick: React.Dispatch<React.SetStateAction<boolean>>;
  showTimePick: boolean; setShowTimePick: React.Dispatch<React.SetStateAction<boolean>>;
  fmtDateLabel: (d: Date) => string;
  fmtTimeLabel: (d: Date) => string;
  accentColor: string;
  colors: any; isDark: boolean;
  label?: string;
  pillStyle?: any; overlayStyle?: any; cardStyle?: any;
  minimumDate?: Date;
}) {
  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';

  // Date change keeps the existing time-of-day; time change keeps the
  // existing calendar date — same merge both original copies did.
  const onDateChange = (_: any, selected?: Date) => {
    setShowDatePick(Platform.OS === 'ios'); // stays open inline on iOS, closes on Android
    if (selected) {
      const merged = new Date(selected);
      merged.setHours(value.getHours(), value.getMinutes(), 0, 0);
      setValue(merged);
    }
  };
  const onTimeChange = (_: any, selected?: Date) => {
    setShowTimePick(Platform.OS === 'ios');
    if (selected) {
      const merged = new Date(value);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setValue(merged);
    }
  };

  const closeAll = () => { setShowDatePick(false); setShowTimePick(false); };

  return (
    <>
      {!!label && (
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 5 }}>
          {label}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity
          style={[pillStyle, { backgroundColor: showDatePick ? accentColor + '20' : pillBg, borderColor: showDatePick ? accentColor : pillBdr }]}
          onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}
        >
          <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>📅</Text>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showDatePick ? accentColor : colors.textPrimary }}>
            {fmtDateLabel(value)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[pillStyle, { backgroundColor: showTimePick ? accentColor + '20' : pillBg, borderColor: showTimePick ? accentColor : pillBdr }]}
          onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}
        >
          <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>🕐</Text>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showTimePick ? accentColor : colors.textPrimary }}>
            {fmtTimeLabel(value)}
          </Text>
        </TouchableOpacity>
      </View>

      {(showDatePick || showTimePick) && (
        <Modal transparent animationType="fade" visible onRequestClose={closeAll}>
          <TouchableOpacity style={overlayStyle} activeOpacity={1} onPress={closeAll}>
            <TouchableOpacity activeOpacity={1} style={[cardStyle, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>
                  {showDatePick ? '📅 Pick a Date' : '🕐 Pick a Time'}
                </Text>
                <TouchableOpacity onPress={closeAll}>
                  <Text style={{ color: accentColor, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
                </TouchableOpacity>
              </View>
              {showDatePick && (
                <DateTimePicker
                  value={value} mode="date" display="spinner"
                  minimumDate={minimumDate ?? new Date()}
                  onChange={onDateChange}
                  textColor={colors.textPrimary}
                  style={{ height: 180, width: '100%' }}
                />
              )}
              {showTimePick && (
                <DateTimePicker
                  value={value} mode="time" display="spinner" is24Hour={false}
                  onChange={onTimeChange}
                  textColor={colors.textPrimary}
                  style={{ height: 180, width: '100%' }}
                />
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}
