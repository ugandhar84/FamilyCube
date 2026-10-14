/**
 * DropRow — the expand-in-place dropdown row used by the Home Care / School
 * / Health "Gemini rhythm" forms (features/vault/tabs/homeowner/
 * AddHomeownerNoteSheet.tsx originated this pattern). Promoted here so the
 * Ask-Parent forms reuse the identical look instead of a plain chip row,
 * per explicit user direction to match that rhythm.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { GEMINI } from '@/constants/geminiRhythm';

export function DropRow({ label, value, options, onSelect, isDark, colors }: {
  label: string; value: string; options: { key: string; label: string }[];
  onSelect: (k: string) => void; isDark: boolean; colors: any;
}) {
  const [open, setOpen] = useState(false);
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC = isDark ? colors.textSecondary : GEMINI.bodyColorLight;
  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: bodyC, marginBottom: 4 }}>{label}</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>
          {options.find(o => o.key === value)?.label ?? value} ▾
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: border }}>
          {options.map(opt => (
            <TouchableOpacity key={opt.key} onPress={() => { onSelect(opt.key); setOpen(false); }}
              style={{ paddingHorizontal: 16, paddingVertical: 10,
                backgroundColor: opt.key === value ? (isDark ? colors.surface : GEMINI.surface) : cardBg }}>
              <Text style={{ fontSize: 14, color: opt.key === value ? colors.primary : titleC,
                fontWeight: opt.key === value ? '700' : '400' }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
