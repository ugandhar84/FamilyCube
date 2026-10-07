/**
 * TaskFlowChooser — two-tile bottom sheet shown when the parent taps "+"
 * on the Tasks tab. Lets them pick between creating a responsibility (chore/
 * quest) or arranging a ride, as two distinct flows with a clear conversion
 * path between them.
 */
import { View, Text, Pressable, Modal } from 'react-native';
import { ClipboardList, Car } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { RADIUS } from '@/constants/theme';

export function TaskFlowChooser({
  visible,
  onClose,
  onChooseResponsibility,
  onChooseRide,
}: {
  visible: boolean;
  onClose: () => void;
  onChooseResponsibility: () => void;
  onChooseRide: () => void;
}) {
  const { colors, isDark } = useTheme();

  const tiles = [
    {
      key: 'responsibility',
      Icon: ClipboardList,
      tint: colors.primary,
      bg: colors.primaryLight,
      title: 'Assign a task',
      subtitle: 'Chore, quest, errand or care',
      onPress: onChooseResponsibility,
    },
    {
      key: 'ride',
      Icon: Car,
      tint: colors.teal,
      bg: colors.tealLight,
      title: 'Arrange a ride',
      subtitle: 'Pickup or drop-off',
      onPress: onChooseRide,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={e => e.stopPropagation()}>
          <View style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: RADIUS.xxl,
            borderTopRightRadius: RADIUS.xxl,
            padding: 24,
            gap: 12,
            paddingBottom: 40,
          }}>
            {/* Handle */}
            <View style={{
              width: 36, height: 4, borderRadius: 2,
              backgroundColor: colors.border,
              alignSelf: 'center', marginBottom: 8,
            }} />

            <Text style={{
              color: colors.textPrimary, fontSize: 20, fontWeight: '700',
              letterSpacing: -0.4, marginBottom: 4,
            }}>
              What are you adding?
            </Text>

            {tiles.map(tile => {
              const Icon = tile.Icon;
              return (
                <Pressable
                  key={tile.key}
                  onPress={() => { onClose(); tile.onPress(); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    backgroundColor: tile.bg,
                    borderRadius: RADIUS.xl,
                    padding: 18,
                    borderWidth: 1,
                    borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
                  }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 14,
                    backgroundColor: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.6)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={22} color={tile.tint} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>
                      {tile.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                      {tile.subtitle}
                    </Text>
                  </View>
                  <Text style={{ color: tile.tint, fontSize: 18, fontWeight: '300' }}>›</Text>
                </Pressable>
              );
            })}

            <Text style={{
              color: colors.textTertiary, fontSize: 12,
              textAlign: 'center', marginTop: 4,
            }}>
              You can switch between them at any point
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
