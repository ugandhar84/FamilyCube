import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { format } from 'date-fns';
import { formatTime } from '@/lib/units';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import BottomSheet from '@/components/BottomSheet';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

interface Props {
  visible: boolean;
  action: 'counter' | 'reschedule';
  sheetDate: Date;
  sheetEndDate: Date;
  sheetLocation: string;
  sheetMessage: string;
  pickerMode: 'date' | 'time' | 'endtime';
  showPicker: boolean;
  ac: string;
  working: boolean;
  onClose: () => void;
  onSend: () => void;
  onSetPickerMode: (mode: 'date' | 'time' | 'endtime') => void;
  onSetShowPicker: (v: boolean) => void;
  onSetSheetDate: (d: Date) => void;
  onSetSheetEndDate: (d: Date) => void;
  onSetLocation: (v: string) => void;
  onSetMessage: (v: string) => void;
}

function ProposalSheet({
  visible, action, sheetDate, sheetEndDate, sheetLocation, sheetMessage,
  pickerMode, showPicker, ac, working,
  onClose, onSend, onSetPickerMode, onSetShowPicker,
  onSetSheetDate, onSetSheetEndDate, onSetLocation, onSetMessage,
}: Props) {
  const { colors } = useTheme();

  const handlePickerConfirm = (date: Date) => {
    onSetShowPicker(false);
    if (pickerMode === 'date') {
      onSetSheetDate((() => { const n = new Date(sheetDate); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; })());
      onSetSheetEndDate((() => { const n = new Date(sheetEndDate); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; })());
    } else if (pickerMode === 'time') {
      onSetSheetDate((() => { const n = new Date(sheetDate); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; })());
      onSetSheetEndDate((() => {
        const minEnd = new Date(date); minEnd.setHours(date.getHours() + 1, date.getMinutes(), 0, 0);
        return sheetEndDate < minEnd ? minEnd : sheetEndDate;
      })());
    } else {
      onSetSheetEndDate((() => { const n = new Date(sheetEndDate); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; })());
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={action === 'counter' ? '📅 Propose New Time' : '📅 Reschedule'}
      accent={ac}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, paddingTop: 4, paddingBottom: 8 }}>

        {/* WHEN card */}
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${ac}30`, overflow: 'hidden', backgroundColor: `${ac}0A` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8 }}>
            <Ionicons name="calendar" size={13} color={ac} />
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac }}>WHEN</Text>
          </View>
          <TouchableOpacity onPress={() => { onSetPickerMode('date'); onSetShowPicker(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              marginHorizontal: 10, marginBottom: 8, backgroundColor: colors.inputBg,
              borderRadius: 12, borderWidth: 1.5,
              borderColor: pickerMode === 'date' && showPicker ? ac : colors.border,
              paddingHorizontal: 14, paddingVertical: 12 }}>
            <Ionicons name="calendar-outline" size={16} color={ac} />
            <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{format(sheetDate, 'EEEE, MMMM d, yyyy')}</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginBottom: 12 }}>
            <TouchableOpacity onPress={() => { onSetPickerMode('time'); onSetShowPicker(true); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                borderColor: pickerMode === 'time' && showPicker ? ac : colors.border,
                paddingHorizontal: 12, paddingVertical: 12 }}>
              <Ionicons name="time-outline" size={15} color={ac} />
              <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{formatTime(sheetDate)}</Text>
            </TouchableOpacity>
            <Ionicons name="arrow-forward" size={13} color={colors.textTertiary} />
            <TouchableOpacity onPress={() => { onSetPickerMode('endtime'); onSetShowPicker(true); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                borderColor: pickerMode === 'endtime' && showPicker ? ac : colors.border,
                paddingHorizontal: 12, paddingVertical: 12 }}>
              <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
              <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{formatTime(sheetEndDate)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Place */}
        <LocationAutocompleteInput
          value={sheetLocation} onChangeText={onSetLocation}
          placeholder="Place (optional)"
          colors={colors} />

        {/* Note */}
        <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
          <TextInput style={{ fontSize: TYPO.body, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
            placeholder="Add a note (optional)" placeholderTextColor={colors.placeholder}
            value={sheetMessage} onChangeText={t => onSetMessage(t.slice(0, 500))} multiline blurOnSubmit maxLength={500} />
          <Text style={{ fontSize: 11, color: sheetMessage.length >= 480 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: 2 }}>
            {sheetMessage.length}/500
          </Text>
        </View>

        {/* Summary strip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: `${ac}12`, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${ac}25` }}>
          <Text style={{ fontSize: 20 }}>📅</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
              {format(sheetDate, 'EEE, MMM d')} · {formatTime(sheetDate)} – {formatTime(sheetEndDate)}
            </Text>
            {sheetLocation.trim() ? (
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>📍 {sheetLocation.trim()}</Text>
            ) : null}
          </View>
        </View>

        {/* Send button */}
        <TouchableOpacity onPress={onSend} disabled={working}
          style={{ backgroundColor: ac, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
          {working
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Send Proposal</Text>}
        </TouchableOpacity>

        <AppDateTimePicker
          visible={showPicker}
          value={pickerMode === 'endtime' ? sheetEndDate : sheetDate}
          mode={pickerMode === 'endtime' ? 'time' : pickerMode}
          minimumDate={pickerMode === 'date' ? new Date() : undefined}
          accent={ac}
          onCancel={() => onSetShowPicker(false)}
          onConfirm={handlePickerConfirm}
        />
      </ScrollView>
    </BottomSheet>
  );
}

export default React.memo(ProposalSheet);
