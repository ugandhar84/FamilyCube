import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import { TAGS, memberColor } from './types';

/**
 * RecordsFilterSheet — member + category filters, extracted out of
 * RecordsTab.tsx's inline expanding panel into a real bottom sheet
 * (AppBottomSheet), matching HealthFilterSheet.tsx's own migration and
 * the app's canonical keyboard-handling/sheet pattern instead of a
 * one-off inline expand.
 */
export default function RecordsFilterSheet({
  visible, onClose,
  colors, isDark, members,
  filterMember, setFilterMember,
  filterTag, setFilterTag,
}: {
  visible: boolean; onClose: () => void;
  colors: any; isDark: boolean; members: any[];
  filterMember: string; setFilterMember: (v: string) => void;
  filterTag: string; setFilterTag: (v: string) => void;
}) {
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Filter Records"
      accentColor={colors.teal}
      minHeight="45%"
      maxHeight="75%"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => { setFilterMember('all'); setFilterTag('all'); }}
            style={{ flex: 1, alignItems: 'center', borderRadius: 20, borderWidth: 1.5, paddingVertical: 12,
              borderColor: colors.primary + '50', backgroundColor: colors.primary + '10' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}
            style={{ flex: 2, alignItems: 'center', borderRadius: 20, paddingVertical: 12, backgroundColor: colors.teal }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textInverse }}>Apply</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: 10, marginBottom: 20 }}>
        <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 0.6, color: colors.textTertiary }}>MEMBER</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[{ id: 'all', name: 'All' }, ...members].map((m, i) => {
              const sel = filterMember === m.id;
              const c   = m.id === 'all' ? colors.textSecondary : memberColor(i - 1);
              return (
                <TouchableOpacity key={m.id} onPress={() => setFilterMember(m.id)}
                  style={{ borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 9,
                    backgroundColor: sel ? c + '20' : 'transparent', borderColor: sel ? c : colors.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? c : colors.textSecondary }}>
                    {m.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 0.6, color: colors.textTertiary }}>CATEGORY</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[{ id: 'all', label: 'All', color: colors.textSecondary }, ...TAGS].map(t => {
            const sel = filterTag === t.id;
            return (
              <TouchableOpacity key={t.id} onPress={() => setFilterTag(t.id)}
                style={{ borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 9,
                  backgroundColor: sel ? t.color + '20' : 'transparent', borderColor: sel ? t.color : colors.border }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? t.color : colors.textSecondary }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </AppBottomSheet>
  );
}
