/**
 * TimeField — a labeled time-of-day field for the School wizard screens
 * (CreateScheduleScreen isn't a caller, BuildPeriodsScreen is — "Start
 * time"/"End time" per period). Modeled structurally on
 * features/vault/tabs/health/ScanDateField.tsx (same native spinner +
 * bottom-sheet "Done" pattern) but for time-of-day instead of date-only.
 *
 * Values are 'HH:MM' 24h strings (or null/empty) — matching
 * store/schoolStore.ts's ClassPeriod.startTime/endTime shape exactly, so
 * callers can keep storing/diffing plain strings same as ScanDateField's
 * own YYYY-MM-DD convention. The DISPLAYED text is always 12h
 * ("10:15 AM") — CLAUDE.md's non-negotiable 12h/human rule — only the
 * underlying stored string stays 24h for store compatibility.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Clock } from 'lucide-react-native';

function parseHHMM(hhmm: string | null | undefined): Date {
  const d = new Date();
  if (!hhmm) { d.setHours(8, 0, 0, 0); return d; }
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(Number.isFinite(h) ? h : 8, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'HH:MM' (24h) -> "10:15 AM" (12h, no leading zero on hour) — the only
 * acceptable on-screen format per CLAUDE.md rule 9. */
export function fmtTime12(hhmm: string | null | undefined): string {
  if (!hhmm) return 'Not set';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 'Not set';
  const h12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function TimeField({ label, value, onChange, colors, isDark, accent }: {
  label: string;
  value: string | null | undefined; // 'HH:MM' 24h
  onChange: (v: string) => void;
  colors: any; isDark: boolean; accent: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const current = parseHHMM(value);

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
        <Clock size={14} color={value ? accent : (isDark ? '#555' : '#ccc')} />
        <Text style={{ fontSize: 14, fontWeight: '500', color: value ? (isDark ? '#fff' : '#111') : (isDark ? '#555' : '#ccc') }}>
          {fmtTime12(value)}
        </Text>
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
                mode="time" display="spinner"
                onChange={(_, d) => { if (d) onChange(toHHMM(d)); }}
                textColor={colors.textPrimary} style={{ height: 180, width: '100%' }}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}
