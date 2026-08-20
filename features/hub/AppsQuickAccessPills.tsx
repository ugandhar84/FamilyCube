/**
 * AppsQuickAccessPills — horizontal pill row below the Hub header for
 * jumping straight into an Apps (Family Vault) feature, e.g. Health or
 * Records, without going through the Apps tab's own grid first. Deep-links
 * via /(tabs)/profile?openFeature=<id>, which VaultScreen reads on mount.
 */
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Radio, BookOpen, Heart, ShoppingCart, ChefHat, Coins, Image as ImageIcon, FolderOpen, Users, Gift } from 'lucide-react-native';
import type { MemberRole } from '@/store/familyStore';

type PillId = 'gps' | 'school' | 'health' | 'records' | 'meals' | 'memories' | 'ledger' | 'roster' | 'grocery' | 'store';

const PILLS: { id: PillId; label: string; Icon: any; roles: MemberRole[] }[] = [
  { id: 'gps',      label: 'Radar',    Icon: Radio,        roles: ['parent', 'kid'] },
  { id: 'school',   label: 'School',   Icon: BookOpen,     roles: ['parent', 'kid'] },
  { id: 'health',   label: 'Health',   Icon: Heart,        roles: ['parent', 'kid'] },
  { id: 'grocery',  label: 'Grocery',  Icon: ShoppingCart, roles: ['parent'] },
  { id: 'meals',    label: 'Meals',    Icon: ChefHat,      roles: ['parent'] },
  { id: 'ledger',   label: 'Ledger',   Icon: Coins,        roles: ['parent', 'kid'] },
  { id: 'memories', label: 'Memories', Icon: ImageIcon,    roles: ['parent', 'kid', 'senior'] },
  { id: 'records',  label: 'Records',  Icon: FolderOpen,   roles: ['parent'] },
  { id: 'roster',   label: 'Roster',   Icon: Users,        roles: ['parent'] },
  { id: 'store',    label: 'Perks',    Icon: Gift,         roles: ['parent', 'kid'] },
];

export function AppsQuickAccessPills({ role, colors, isDark }: {
  role: MemberRole; colors: any; isDark: boolean;
}) {
  const router = useRouter();
  const visible = PILLS.filter(p => p.roles.includes(role));
  if (visible.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      // Explicit height — a horizontal ScrollView with no fixed height can
      // collapse below its content's actual rendered height in this layout
      // context, clipping the pills' tops (icons/text cut off).
      style={{ height: 40, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 7, alignItems: 'center' }}>
      {visible.map(p => (
        <TouchableOpacity key={p.id} activeOpacity={0.75}
          onPress={() => router.push({ pathname: '/(tabs)/profile', params: { openFeature: p.id } } as any)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
            backgroundColor: isDark ? colors.surface : '#F2ECE1',
            borderWidth: 1, borderColor: isDark ? colors.border : '#E5DFC8',
          }}>
          <p.Icon size={12} color={colors.textPrimary} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary, lineHeight: 15 }}>{p.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
