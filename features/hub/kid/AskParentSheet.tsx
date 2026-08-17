import { View, Text, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import AppBottomSheet from '@/components/AppBottomSheet';

export function AskParentSheet({ visible, onClose, colors, isDark, onPick }: {
  visible: boolean; onClose: () => void; colors: any; isDark: boolean;
  onPick: (choice: 'permission' | 'question' | 'medication' | 'grocery' | 'supplies') => void;
}) {
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="💬 Ask Parent"
      subtitle="Pick what you need help with"
      accentColor={BRAND.purple}
      minHeight="55%"
      bodyPaddingBottom={16}
    >
      <View style={{ gap: 10 }}>
        {([
          { key: 'permission', label: 'Ask Permission',   desc: 'Go somewhere, do something',     emoji: '🔓', color: BRAND.purple },
          { key: 'question',   label: 'Ask a Question',   desc: 'Something you want to know',     emoji: '❓', color: '#3B82F6' },
          { key: 'medication', label: 'Medication Alert', desc: "I didn't take my meds",          emoji: '💊', color: '#EF4444' },
          { key: 'grocery',    label: 'Request Grocery',  desc: 'Add items to the shopping list', emoji: '🛒', color: BRAND.teal },
          { key: 'supplies',   label: 'School Supplies',  desc: 'Things I need for school',       emoji: '📚', color: '#6366F1' },
        ] as const).map(({ key, label, desc, emoji, color }) => (
          <Pressable key={key} onPress={() => onPick(key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16,
              backgroundColor: isDark ? colors.surface : color + '08', borderWidth: 1.5, borderColor: color + '30' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24 }}>{emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color }}>{label}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{desc}</Text>
            </View>
            <ChevronRight size={18} color={color} />
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );
}
