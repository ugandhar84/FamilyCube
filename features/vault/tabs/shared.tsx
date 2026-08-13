import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LucideIcon, Check, Clock } from 'lucide-react-native';

export const BRAND = {
  purple:  '#7C3AED',
  teal:    '#14B8A6',
  amber:   '#F59E0B',
  emerald: '#10B981',
  rose:    '#F43F5E',
  blue:    '#3B82F6',
};

export function SCard({ children, colors, isDark, style }: {
  children: React.ReactNode; colors: any; isDark: boolean; style?: any;
}) {
  return (
    <View style={[sh.scard, {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderColor: isDark ? colors.border : '#EDE9FE',
      shadowColor: BRAND.purple, ...style,
    }]}>
      {children}
    </View>
  );
}

export function CardHeader({ Icon, iconColor, title, badge, badgeColor, colors, onAction, actionLabel }: {
  Icon: LucideIcon; iconColor?: string; title: string;
  badge?: string; badgeColor?: string; colors: any;
  onAction?: () => void; actionLabel?: string;
}) {
  const ic = iconColor ?? BRAND.purple;
  return (
    <View style={[sh.cardHeaderRow, { justifyContent: 'space-between' }]}>
      <View style={[sh.cardHeaderRow, { flex: 1 }]}>
        <View style={[sh.cardHeaderIconBox, { backgroundColor: ic + '20' }]}>
          <Icon size={16} color={ic} />
        </View>
        <Text style={[sh.cardHeaderTitle, { color: colors.textPrimary }]}>{title}</Text>
        {badge ? (
          <View style={[sh.badge, { backgroundColor: (badgeColor ?? ic) + '20',
            borderColor: (badgeColor ?? ic) + '50' }]}>
            <Text style={[sh.badgeText, { color: badgeColor ?? ic }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {onAction ? (
        <TouchableOpacity onPress={onAction}
          style={[sh.headerAction, { backgroundColor: ic + '18', borderColor: ic + '50' }]}>
          <Text style={{ fontSize: 18, color: ic, fontWeight: '300', lineHeight: 20 }}>+</Text>
          {actionLabel ? (
            <Text style={{ fontSize: 11, fontWeight: '800', color: ic }}>{actionLabel}</Text>
          ) : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function StatusPill({ label, color, Icon }: {
  label: string; color: string; Icon?: LucideIcon;
}) {
  return (
    <View style={[sh.statusPill, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      {Icon && <Icon size={10} color={color} style={{ marginRight: 3 }} />}
      <Text style={[sh.statusPillText, { color }]}>{label}</Text>
    </View>
  );
}

export function MemberAvatar({ name, color, size = 40 }: {
  name: string; color: string; size?: number;
}) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '25', borderWidth: 2, borderColor: color + '50',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.42, fontWeight: '900', color, lineHeight: size * 0.55 }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function AddBtn({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  const c = color ?? BRAND.purple;
  return (
    <TouchableOpacity onPress={onPress}
      style={[sh.addBtn, { borderColor: c + '60', backgroundColor: c + '10' }]}>
      <Text style={{ fontSize: 18, color: c, fontWeight: '300', marginRight: 6, lineHeight: 22 }}>+</Text>
      <Text style={{ fontSize: 13, fontWeight: '800', color: c }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function EmptyState({ Icon, label, colors }: { Icon: LucideIcon; label: string; colors: any }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
      <Icon size={32} color={colors.textTertiary} />
      <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  scard:           { borderRadius: 22, borderWidth: 1.5, padding: 16,
                     shadowOpacity: 0.06, shadowRadius: 12,
                     shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  cardHeaderRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderIconBox:{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardHeaderTitle: { fontSize: 14, fontWeight: '900', flex: 1 },
  badge:           { borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:       { fontSize: 11, fontWeight: '800' },
  statusPill:      { flexDirection: 'row', alignItems: 'center', borderRadius: 99, borderWidth: 1,
                     paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText:  { fontSize: 11, fontWeight: '800' },
  addBtn:          { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5,
                     paddingHorizontal: 14, paddingVertical: 9, marginTop: 12, alignSelf: 'flex-start' },
  headerAction:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1.5,
                     paddingHorizontal: 10, paddingVertical: 5 },
});
