import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { usePickerLoadingStore } from '@/lib/pickerLoading';
import { useTheme } from '@/lib/ThemeContext';

export default function PickerLoadingOverlay() {
  const visible = usePickerLoadingStore(s => s.visible);
  const message = usePickerLoadingStore(s => s.message);
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <View style={s.backdrop}>
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <ActivityIndicator size="large" color={colors.primaryText ?? colors.primary} />
        <Text style={[s.label, { color: colors.textPrimary }]}>{message}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  label: { fontSize: 14, fontWeight: '600' },
});
