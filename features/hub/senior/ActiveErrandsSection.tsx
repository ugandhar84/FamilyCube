import { View, Text, Pressable } from 'react-native';
import { ShoppingCart, CheckCircle2, Camera } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from './seniorTheme';
import type { ChoreTask } from '@/store/choreStore';

// My active errands (GP claimed, in progress) — buy supplies, then submit
// receipt for reimbursement.
export function ActiveErrandsSection({ errands, onOpenReceiptModal, colors, isDark }: {
  errands: ChoreTask[];
  onOpenReceiptModal: (choreId: string) => void;
  colors: any; isDark: boolean;
}) {
  if (errands.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ShoppingCart size={14} color={BRAND.teal} />
        <Text style={{ fontSize: GP.sub, fontWeight: '800', color: BRAND.teal,
          textTransform: 'uppercase', letterSpacing: 0.8 }}>My Active Errands</Text>
      </View>
      {errands.map(c => (
        <View key={c.id} style={{ borderRadius: 16, borderWidth: 1.5,
          borderColor: BRAND.teal + '40',
          backgroundColor: isDark ? BRAND.teal + '10' : '#ECFDF5',
          overflow: 'hidden' }}>
          <View style={{ backgroundColor: BRAND.teal, paddingHorizontal: 14, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ShoppingCart size={16} color="#fff" />
            <Text style={{ flex: 1, fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
              {c.title}
            </Text>
            <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: '#fff' }}>In Progress</Text>
            </View>
          </View>
          {c.description ? (
            <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
              <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>{c.description}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => onOpenReceiptModal(c.id)}
            style={{ margin: 12, backgroundColor: BRAND.teal, borderRadius: 12,
              paddingVertical: 13, alignItems: 'center', flexDirection: 'row',
              justifyContent: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="#fff" />
            <Text style={{ fontSize: GP.body, fontWeight: '900', color: '#fff' }}>
              Done · Submit Receipt
            </Text>
            <Camera size={16} color="#fff" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
