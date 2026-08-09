import React, { useState, useEffect } from 'react';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { TYPO } from '@/constants/theme';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { formatTime } from '@/lib/units';
import BottomSheet from '@/components/BottomSheet';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { cps } from '@/features/social/socialStyles';
import { IncomingRequest } from '@/features/social/types';

interface CounterProposeSheetProps {
  visible: boolean;
  requestId: string | null;
  onClose: () => void;
  ac: string;
  colors: any;
  setIncomingRequests: React.Dispatch<React.SetStateAction<IncomingRequest[]>>;
}

const makeDefaultDate = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; };
const makeDefaultEnd  = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return d; };

export const CounterProposeSheet = React.memo(function CounterProposeSheet({
  visible, requestId, onClose, ac, colors, setIncomingRequests,
}: CounterProposeSheetProps) {
  const [cpDate,       setCpDate]       = useState<Date>(makeDefaultDate);
  const [cpEndDate,    setCpEndDate]    = useState<Date>(makeDefaultEnd);
  const [cpLocation,   setCpLocation]   = useState('');
  const [cpMessage,    setCpMessage]    = useState('');
  const [cpSending,    setCpSending]    = useState(false);
  const [cpShowPicker, setCpShowPicker] = useState(false);
  const [cpPickerMode, setCpPickerMode] = useState<'date' | 'time' | 'endtime'>('date');

  // Reset form when a new request is opened
  useEffect(() => {
    if (visible && requestId) {
      const d = makeDefaultDate(); const e = makeDefaultEnd();
      setCpDate(d); setCpEndDate(e); setCpLocation(''); setCpMessage('');
    }
  }, [visible, requestId]);

  const sendCounterPropose = async () => {
    if (!requestId || cpSending) return;
    setCpSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: {
          action: 'respond', request_id: requestId, respond_action: 'counter_propose',
          proposed_date:     format(cpDate, 'yyyy-MM-dd'),
          proposed_time:     format(cpDate, 'HH:mm'),
          proposed_end_time: format(cpEndDate, 'HH:mm'),
          proposed_location: cpLocation.trim() || null,
          message:           cpMessage.trim() || undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Failed to send proposal');
      onClose();
      setIncomingRequests(prev => prev.map(r => r.id === requestId ? {
        ...r, status: 'scheduling',
        proposed_date:     format(cpDate, 'yyyy-MM-dd'),
        proposed_time:     format(cpDate, 'HH:mm'),
        proposed_end_time: format(cpEndDate, 'HH:mm'),
        proposed_location: cpLocation.trim() || null,
        message:           cpMessage.trim() || null,
        responder_user_id: data?.responder_user_id ?? r.responder_user_id,
      } : r));
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setCpSending(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Propose New Time"
      titleIcon={<Ionicons name="calendar-outline" size={16} color={ac} />}
      accent={ac}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}>

        <Text style={[cps.label, { color: colors.textSecondary }]}>Date *</Text>
        <TouchableOpacity style={[cps.input, cps.dateBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
          onPress={() => { setCpPickerMode('date'); setCpShowPicker(true); }}>
          <Ionicons name="calendar-outline" size={14} color={ac} />
          <Text style={[cps.dateBtnText, { color: colors.textPrimary }]}>{format(cpDate, 'MMM d, yyyy')}</Text>
        </TouchableOpacity>

        <Text style={[cps.label, { color: colors.textSecondary }]}>Time *</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity style={[cps.input, cps.dateBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            onPress={() => { setCpPickerMode('time'); setCpShowPicker(true); }}>
            <Ionicons name="time-outline" size={14} color={ac} />
            <Text style={[cps.dateBtnText, { color: colors.textPrimary }]}>{formatTime(cpDate)}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>→</Text>
          <TouchableOpacity style={[cps.input, cps.dateBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            onPress={() => { setCpPickerMode('endtime'); setCpShowPicker(true); }}>
            <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
            <Text style={[cps.dateBtnText, { color: colors.textPrimary }]}>{formatTime(cpEndDate)}</Text>
          </TouchableOpacity>
        </View>

        <AppDateTimePicker
          visible={cpShowPicker}
          value={cpPickerMode === 'endtime' ? cpEndDate : cpDate}
          mode={cpPickerMode === 'endtime' ? 'time' : cpPickerMode}
          minimumDate={cpPickerMode === 'date' ? new Date() : undefined}
          accent={ac}
          onCancel={() => setCpShowPicker(false)}
          onConfirm={(date) => {
            setCpShowPicker(false);
            if (cpPickerMode === 'date') {
              setCpDate(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
              setCpEndDate(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
            } else if (cpPickerMode === 'time') {
              setCpDate(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
              setCpEndDate(prev => { const min = new Date(date); min.setHours(date.getHours() + 1, date.getMinutes(), 0, 0); return prev < min ? min : prev; });
            } else {
              setCpEndDate(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
            }
          }}
        />

        <Text style={[cps.label, { color: colors.textSecondary }]}>Place (optional)</Text>
        <LocationAutocompleteInput
          value={cpLocation} onChangeText={setCpLocation}
          placeholder="e.g. Riverside Park dog run"
          colors={colors} style={{ marginBottom: 4 }} />

        <Text style={[cps.label, { color: colors.textSecondary }]}>Note (optional)</Text>
        <TextInput
          style={[cps.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.textPrimary, height: 72, paddingTop: 12, textAlignVertical: 'top' }]}
          placeholder="e.g. Works better in the morning 🐾" placeholderTextColor={colors.placeholder}
          value={cpMessage} onChangeText={setCpMessage} multiline blurOnSubmit />
      </ScrollView>

      <View style={[cps.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={[cps.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
          <Text style={[cps.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cps.saveBtn, { backgroundColor: ac }]} onPress={sendCounterPropose} disabled={cpSending}>
          {cpSending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={cps.saveBtnText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
});
