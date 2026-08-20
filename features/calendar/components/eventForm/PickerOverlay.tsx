import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TYPO } from '@/constants/theme';
import { f } from './styles';

// ─── Shared floating date/time picker overlay ──────────────────────────────────
// Used for the main event date/time, return pickup, and kid drop-off/pickup
// pickers. Renders nothing when neither showDate nor showTime is true.
export default function PickerOverlay({
  showDate, showTime, value, onChangeDate, onChangeTime, onDone, accentColor, colors,
  dateLabel = '📅 Pick a Date', timeLabel = '🕐 Pick a Time',
  minimumDate,
}: {
  showDate: boolean;
  showTime: boolean;
  value: Date;
  onChangeDate: (d: Date) => void;
  onChangeTime: (d: Date) => void;
  onDone: () => void;
  accentColor: string;
  colors: any;
  dateLabel?: string;
  timeLabel?: string;
  minimumDate?: Date;
}) {
  if (!showDate && !showTime) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDone}>
      <TouchableOpacity style={f.pickerOverlay} activeOpacity={1} onPress={onDone}>
        <TouchableOpacity activeOpacity={1} style={[f.pickerCard, { backgroundColor: colors.card }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>
              {showDate ? dateLabel : timeLabel}
            </Text>
            <TouchableOpacity onPress={onDone}>
              <Text style={{ color: accentColor, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
            </TouchableOpacity>
          </View>
          {showDate && (
            <DateTimePicker
              value={value} mode="date" display="spinner"
              minimumDate={minimumDate}
              onChange={(_, d) => { if (d) onChangeDate(d); }}
              textColor={colors.textPrimary}
              style={{ height: 180, width: '100%' }}
            />
          )}
          {showTime && (
            <DateTimePicker
              value={value} mode="time" display="spinner"
              is24Hour={false}
              onChange={(_, d) => { if (d) onChangeTime(d); }}
              textColor={colors.textPrimary}
              style={{ height: 180, width: '100%' }}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
