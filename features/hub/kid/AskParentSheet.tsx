import { View, Text, Pressable } from 'react-native';
import { ChevronRight, Unlock, HelpCircle, Pill, ShoppingCart, BookOpen, MessageCircle } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import AppBottomSheet from '@/components/AppBottomSheet';

// Indigo — distinct accent for "School Supplies", not in the brand palette or
// a semantic token; kept as a single named constant instead of a bare hex.
const INDIGO_ACCENT = '#6366F1';

export function AskParentSheet({ visible, onClose, colors, isDark, onPick }: {
  visible: boolean; onClose: () => void; colors: any; isDark: boolean;
  onPick: (choice: 'permission' | 'question' | 'medication' | 'grocery' | 'supplies' | 'quest') => void;
}) {
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Ask Parent"
      subtitle="Pick what you need help with"
      accentColor={BRAND.purple}
      minHeight="55%"
      bodyPaddingBottom={16}
    >
      <View style={{ gap: 10 }}>
        {([
          { key: 'permission', label: 'Ask Permission',   desc: 'Go somewhere, do something',     Icon: Unlock,       color: BRAND.purple },
          { key: 'question',   label: 'Ask a Question',   desc: 'Something you want to know',     Icon: HelpCircle,   color: colors.info },
          { key: 'medication', label: 'Medication Alert', desc: "I didn't take my meds",          Icon: Pill,         color: colors.danger },
          { key: 'grocery',    label: 'Request Grocery',  desc: 'Add items to the shopping list', Icon: ShoppingCart, color: BRAND.teal },
          { key: 'supplies',   label: 'School Supplies',  desc: 'Things I need for school',       Icon: BookOpen,     color: INDIGO_ACCENT },
          // Scenario 1.4 — a Kid proposing a brand-new quest for coins,
          // distinct from claiming an existing pool quest.
          { key: 'quest',      label: 'Propose a Quest',  desc: 'Suggest a chore to earn coins',  Icon: HelpCircle,   color: BRAND.purple },
        ] as const).map(({ key, label, desc, Icon, color }) => (
          <Pressable key={key} onPress={() => onPick(key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16,
              backgroundColor: isDark ? colors.surface : color + '08', borderWidth: 1.5, borderColor: color + '30' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={22} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: KID.body, fontWeight: '900', color }}>{label}</Text>
              <Text style={{ fontSize: KID.sub, color: colors.textSecondary, marginTop: 2 }}>{desc}</Text>
            </View>
            <ChevronRight size={18} color={color} />
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );
}
