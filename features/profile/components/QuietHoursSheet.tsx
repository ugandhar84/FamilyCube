/**
 * QuietHoursSheet — drum-roll time-picker for the quiet hours start/end time.
 *
 * Rendered as a BottomSheet floating above the notification settings sheet.
 * The parent (NotificationSettingsSheet) owns the timePicker state; this
 * component only reads it and calls back through setTimePicker / onConfirm.
 */

import React, { memo } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@/components/BottomSheet';

interface TimePickerState {
  target: 'start' | 'end';
  hour: number;
  minute: number;
  ampm: 'AM' | 'PM';
}

interface Props {
  /** null when the picker is closed */
  timePicker: TimePickerState | null;
  /** update a single field in the picker state */
  setTimePicker: React.Dispatch<React.SetStateAction<TimePickerState | null>>;
  /** called when the user taps "Set Time" */
  onConfirm: () => void;
  accent: string;
  colors: any;
}

const QuietHoursSheet = memo(function QuietHoursSheet({ timePicker, setTimePicker, onConfirm, accent, colors }: Props) {
  return (
    <BottomSheet
      visible={!!timePicker}
      onClose={() => setTimePicker(null)}
      title={timePicker?.target === 'start' ? 'Start time' : 'End time'}>
      {timePicker && (
        <View style={{ paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginVertical: 20 }}>

            {/* Hour spinner */}
            <View style={{ alignItems: 'center', gap: 6 }}>
              <TouchableOpacity onPress={() => setTimePicker(p => p && ({ ...p, hour: p.hour === 12 ? 1 : p.hour + 1 }))} style={{ padding: 8 }}>
                <Ionicons name="chevron-up" size={20} color={accent} />
              </TouchableOpacity>
              <View style={[drum, { backgroundColor: colors.inputBg, borderColor: accent }]}>
                <Text style={[drumNum, { color: colors.textPrimary }]}>{String(timePicker.hour).padStart(2, '0')}</Text>
              </View>
              <TouchableOpacity onPress={() => setTimePicker(p => p && ({ ...p, hour: p.hour === 1 ? 12 : p.hour - 1 }))} style={{ padding: 8 }}>
                <Ionicons name="chevron-down" size={20} color={accent} />
              </TouchableOpacity>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>HOUR</Text>
            </View>

            <Text style={{ fontSize: TYPO.hero, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 }}>:</Text>

            {/* Minute spinner — steps of 5 */}
            <View style={{ alignItems: 'center', gap: 6 }}>
              <TouchableOpacity onPress={() => setTimePicker(p => p && ({ ...p, minute: (p.minute + 5) % 60 }))} style={{ padding: 8 }}>
                <Ionicons name="chevron-up" size={20} color={accent} />
              </TouchableOpacity>
              <View style={[drum, { backgroundColor: colors.inputBg, borderColor: accent }]}>
                <Text style={[drumNum, { color: colors.textPrimary }]}>{String(timePicker.minute).padStart(2, '0')}</Text>
              </View>
              <TouchableOpacity onPress={() => setTimePicker(p => p && ({ ...p, minute: (p.minute - 5 + 60) % 60 }))} style={{ padding: 8 }}>
                <Ionicons name="chevron-down" size={20} color={accent} />
              </TouchableOpacity>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>MIN</Text>
            </View>

            {/* AM / PM toggle */}
            <View style={{ alignItems: 'center', gap: 8, marginBottom: 20 }}>
              {(['AM', 'PM'] as const).map(v => (
                <TouchableOpacity key={v}
                  onPress={() => setTimePicker(p => p && ({ ...p, ampm: v }))}
                  style={[ampmBtn, {
                    backgroundColor: timePicker.ampm === v ? accent : colors.inputBg,
                    borderColor: timePicker.ampm === v ? accent : colors.border,
                  }]}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: timePicker.ampm === v ? '#fff' : colors.textSecondary }}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity onPress={onConfirm}
            style={{ marginHorizontal: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: accent, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Set Time</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
});

export default QuietHoursSheet;

const drum:    any = { width: 72, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 };
const drumNum: any = { fontSize: TYPO.hero, fontWeight: '700' };
const ampmBtn: any = { width: 60, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 };
