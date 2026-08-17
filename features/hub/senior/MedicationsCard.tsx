import { View, Text, Pressable } from 'react-native';
import { Pill, CheckCircle } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { SectionCard } from '../hubComponents';
import { GP } from './seniorTheme';

export type Medication = { id: string; name: string; time: string };

// Money-green — "taken" status accent, distinct from brand teal used
// elsewhere in this card. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

export function MedicationsCard({ meds, medsTaken, toggleMed, colors, isDark }: {
  meds: Medication[];
  medsTaken: Record<string, boolean>;
  toggleMed: (id: string) => void;
  colors: any; isDark: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        large
        icon={<Pill size={18} color={colors.danger} />}
        title="Today's Medications"
        badge={meds.filter(m => !medsTaken[m.id]).length || undefined} badgeColor={colors.danger}
        collapsible defaultExpanded={meds.some(m => !medsTaken[m.id])}
        colors={colors} isDark={isDark}>
        {meds.map((med, i) => {
          const taken = !!medsTaken[med.id];
          return (
            <View key={med.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i < meds.length - 1 ? 1 : 0, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
              <Pill size={22} color={taken ? colors.textTertiary : BRAND.teal} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.sub, fontWeight: '700', color: taken ? colors.textTertiary : colors.textPrimary, textDecorationLine: taken ? 'line-through' : 'none' }}>{med.name}</Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary }}>{med.time}</Text>
              </View>
              <Pressable onPress={() => toggleMed(med.id)} style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: taken ? MONEY_GREEN + '20' : BRAND.teal, borderWidth: taken ? 1 : 0, borderColor: MONEY_GREEN + '40' }}>
                <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: taken ? MONEY_GREEN : '#fff' }}>
                  {taken ? 'Taken' : 'Mark Taken'}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {meds.length > 0 && meds.every(m => medsTaken[m.id]) && (
          <View style={{ alignItems: 'center', paddingVertical: 13, gap: 4 }}>
            <CheckCircle size={26} color={MONEY_GREEN} />
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: MONEY_GREEN }}>All done for today!</Text>
          </View>
        )}
      </SectionCard>
    </View>
  );
}
