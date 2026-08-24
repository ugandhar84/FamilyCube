import { View, Text, Pressable } from 'react-native';
import { ChevronRight, Unlock, HelpCircle, Pill, ShoppingCart, BookOpen, MessageCircle, Car, ClipboardList } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import AppBottomSheet from '@/components/AppBottomSheet';

// Indigo — distinct accent for "School Supplies", not in the brand palette or
// a semantic token; kept as a single named constant instead of a bare hex.
const INDIGO_ACCENT = '#6366F1';
const AMBER_ACCENT = '#F59E0B';

export function AskParentSheet({ visible, onClose, colors, isDark, onPick }: {
  visible: boolean; onClose: () => void; colors: any; isDark: boolean;
  onPick: (choice: 'ride' | 'permission' | 'question' | 'medication' | 'grocery' | 'supplies' | 'quest' | 'chore') => void;
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
          { key: 'ride',        label: 'Ask for a Ride',   desc: 'Pickup, drop-off, or both',      Icon: Car,          color: AMBER_ACCENT },
          { key: 'permission',  label: 'Ask Permission',   desc: 'Go somewhere, do something',     Icon: Unlock,       color: BRAND.purple },
          { key: 'question',    label: 'Ask a Question',   desc: 'Something you want to know',     Icon: HelpCircle,   color: colors.info },
          { key: 'medication',  label: 'Medication Alert', desc: "I didn't take my meds",          Icon: Pill,         color: colors.danger },
          { key: 'grocery',     label: 'Request Grocery',  desc: 'Add items to the shopping list', Icon: ShoppingCart, color: BRAND.teal },
          { key: 'supplies',    label: 'School Supplies',  desc: 'Things I need for school',       Icon: BookOpen,     color: INDIGO_ACCENT },
          // Scenario 1.4 — a Kid proposing a brand-new quest for coins
          // (self only, kid suggests their own coin amount), distinct from
          // claiming an existing pool quest.
          { key: 'quest',       label: 'Suggest a Chore',  desc: 'For yourself — pick your own coin amount', Icon: HelpCircle,   color: BRAND.purple },
          // propose_kid_chore RPC — can target a sibling, never carries a
          // coin amount from the kid (a parent sets it at approval time);
          // distinct from "Suggest a Chore" above, which is self-only and
          // lets the kid suggest their own coin amount.
          { key: 'chore',       label: 'Propose a Chore',  desc: 'For you or a sibling — a parent sets the coins', Icon: ClipboardList, color: BRAND.purple },
        ] as const).map(({ key, label, desc, Icon, color }) => (
          <Pressable key={key} onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "${label}" on "Ask Parent sheet" (id=${key}) → onPick("${key}") [features/hub/kid/AskParentSheet.tsx:36]`); onPick(key); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16,
              backgroundColor: isDark ? colors.surface : color + '14', borderWidth: 1.5, borderColor: color + '30' }}>
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
