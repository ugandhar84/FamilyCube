import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SubscriptionTier } from '@/store/subscriptionStore';

const CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  pro: {
    label: 'PRO',
    bg:    '#7B2FBE',
    text:  '#fff',
    icon:  'star',
  },
  ultimate: {
    label: 'ULTIMATE',
    bg:    '#B45309',
    text:  '#FEF3C7',
    icon:  'sparkles',
  },
};

interface Props {
  tier: SubscriptionTier | string | null | undefined;
  size?: 'sm' | 'md';
}

export default function SubscriptionBadge({ tier, size = 'sm' }: Props) {
  if (!tier || tier === 'free') return null;
  const conf = CONFIG[tier];
  if (!conf) return null;

  const isMd = size === 'md';

  return (
    <View style={[s.badge, { backgroundColor: conf.bg, paddingHorizontal: isMd ? 8 : 5, paddingVertical: isMd ? 3 : 2, gap: isMd ? 4 : 3 }]}>
      <Ionicons name={conf.icon} size={isMd ? 10 : 8} color={conf.text} />
      <Text style={[s.label, { color: conf.text, fontSize: isMd ? 10 : 8 }]}>{conf.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   20,
  },
  label: {
    fontWeight:    '800',
    letterSpacing:  0.4,
  },
});
