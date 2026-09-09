/**
 * ScanDateField — a labeled date-only field for the scan review cards
 * (ScanReviewSheet.tsx, and kiosk's own KioskScanReviewForm.tsx). Was a
 * plain TextInput expecting the user to type "YYYY-MM-DD" by hand with no
 * validation or formatting [live-requested: "sorry need date picker" /
 * "show dates in out app format like sting readable"] — this opens the
 * real native date spinner (same @react-native-community/datetimepicker
 * every other date field in the app uses) and displays the value through
 * fmtDate ("Aug 27, 2026") instead of the raw machine string.
 *
 * Deliberately NOT DueDateTimePicker (features/tasks/components/forms/
 * DueDateTimePicker.tsx) — that component pairs a date pill with a time
 * pill and defaults minimumDate to today(), which would block picking a
 * vaccine/prescription date in the past (the overwhelmingly common case
 * here). This is a lighter, date-only, no-minimum equivalent for exactly
 * this use case.
 *
 * Values are YYYY-MM-DD strings (or null/empty), matching ParsedVaccine/
 * ParsedMedication's own field shape — never a Date object — so callers
 * can keep storing/diffing plain strings same as before.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { fmtDate } from '@/lib/dates';

function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ScanDateField({ label, value, onChange, colors, isDark, accent }: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  colors: any; isDark: boolean; accent: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const current = value ? parseLocalDateStr(value) : new Date();

  return (
    <View>
      <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#666' : '#999', marginBottom: 4, letterSpacing: 0.4 }}>
        {label.toUpperCase()}
      </Text>
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1.5, borderColor: isDark ? '#2A2A3E' : '#E5E7EB',
          borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
          backgroundColor: isDark ? '#1A1A2E' : '#fff',
        }}
      >
        <Calendar size={14} color={value ? accent : (isDark ? '#555' : '#ccc')} />
        <Text style={{ fontSize: 14, fontWeight: '500', color: value ? (isDark ? '#fff' : '#111') : (isDark ? '#555' : '#ccc') }}>
          {value ? fmtDate(value) : 'Not set'}
        </Text>
        {!!value && (
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>Clear</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {showPicker && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setShowPicker(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            activeOpacity={1} onPress={() => setShowPicker(false)}>
            <TouchableOpacity activeOpacity={1}
              style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24, backgroundColor: colors.card }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>{label}</Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={{ color: accent, fontWeight: '900', fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={current}
                mode="date" display="spinner"
                onChange={(_, d) => { if (d) onChange(toDateStr(d)); }}
                textColor={colors.textPrimary} style={{ height: 180, width: '100%' }}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}
