import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

// ─── Shared chip ───────────────────────────────────────────────────────────────
export default function Chip({ label, active, color, onPress, small }: {
  label: string; active: boolean; color: string;
  onPress: () => void; small?: boolean;
}) {
  const { colors, isDark } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => { console.log(`[UserAction] FORM screen=Schedule selected "${label}" for "chip" newValue=${!active} [features/calendar/components/eventForm/Chip.tsx:14]`); onPress(); }}
      style={{
        borderRadius: 20, borderWidth: 1.5, paddingHorizontal: small ? 10 : 12, paddingVertical: small ? 5 : 7,
        backgroundColor: active ? color + '20' : (isDark ? colors.surface : colors.inputBg),
        borderColor: active ? color : (isDark ? colors.border : '#E2E8F0'),
      }}
    >
      <Text style={{ fontSize: small ? TYPO.micro : TYPO.label, fontWeight: '700', color: active ? color : colors.textSecondary }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
