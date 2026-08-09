import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';

interface Props {
  onPress?: () => void;
  color?: string;
  size?: number;
}

export default function BackButton({ onPress, color, size = 20 }: Props) {
  const { colors } = useTheme();
  const handlePress = onPress ?? (() => router.back());

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[ss.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.7}>
      <Ionicons name="chevron-back" size={size} color={color ?? colors.textSecondary} />
    </TouchableOpacity>
  );
}

const ss = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
