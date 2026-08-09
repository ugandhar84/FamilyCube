import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, isValid } from 'date-fns';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

interface DatePickerFieldProps {
  value: string;
  onChange: (iso: string) => void;
  placeholder: string;
  ac: string;
  maxDate?: Date;
  minDate?: Date;
}

export const DatePickerField = React.memo(function DatePickerField({
  value, onChange, placeholder, ac, maxDate, minDate,
}: DatePickerFieldProps) {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const date = value && isValid(parseISO(value)) ? parseISO(value) : null;

  const openPicker = () => { setTempDate(date ?? new Date()); setShow(true); };

  return (
    <>
      <TouchableOpacity
        onPress={openPicker}
        style={[dpf.field, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
        activeOpacity={0.75}>
        <Text style={[dpf.text, { color: date ? colors.textPrimary : colors.placeholder }]}>
          {date ? format(date, 'MMMM d, yyyy') : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={date ? ac : colors.placeholder} />
      </TouchableOpacity>

      <AppDateTimePicker
        visible={show}
        value={tempDate}
        mode="date"
        maximumDate={maxDate}
        minimumDate={minDate}
        accent={ac}
        onCancel={() => setShow(false)}
        onConfirm={(d) => { onChange(format(d, 'yyyy-MM-dd')); setShow(false); }}
      />
    </>
  );
});

const dpf = StyleSheet.create({
  field:   { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13,
             flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  text:    { fontSize: TYPO.body, flex: 1 },
});
