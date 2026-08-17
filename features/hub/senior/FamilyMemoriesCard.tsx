import { View, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { Camera, Heart } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { SectionCard } from '../hubComponents';
import { GP } from './seniorTheme';

export function FamilyMemoriesCard({ colors, isDark }: { colors: any; isDark: boolean }) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard large icon={<Camera size={18} color={BRAND.pink} />} title="Family Memories" collapsible defaultExpanded={false} colors={colors} isDark={isDark}>
        <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
          <Heart size={32} color={BRAND.pink} />
          <Text style={{ fontSize: GP.sub, color: colors.textTertiary, textAlign: 'center', fontStyle: 'italic' }}>
            Share photos with the family to see them here
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/chat')} style={{ borderRadius: 12, backgroundColor: BRAND.pink, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Camera size={15} color="#fff" />
          <Text style={{ fontSize: GP.sub, fontWeight: '800', color: '#fff' }}>Share in Family Chat</Text>
        </Pressable>
      </SectionCard>
    </View>
  );
}
