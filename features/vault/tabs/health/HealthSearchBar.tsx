import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { X, SlidersHorizontal } from 'lucide-react-native';
import { hf } from './styles';

/**
 * HealthSearchBar — search input + filter icon, extracted out of
 * HealthRecordsList.tsx so HealthTab.tsx can place it in the same row as
 * the CubeAI Health pill (side by side) instead of on its own row below,
 * which left a large dead gap between the two (live-reported).
 */
export default function HealthSearchBar({
  colors, isDark, healthTab,
  medSearch, setMedSearch, vaxSearch, setVaxSearch,
  medActiveFilterCount, vaxActiveFilterCount,
  openFilterSheet,
}: {
  colors: any; isDark: boolean; healthTab: 'meds' | 'vax';
  medSearch: string; setMedSearch: (v: string) => void;
  vaxSearch: string; setVaxSearch: (v: string) => void;
  medActiveFilterCount: number; vaxActiveFilterCount: number;
  openFilterSheet: () => void;
}) {
  const activeCount = healthTab === 'meds' ? medActiveFilterCount : vaxActiveFilterCount;
  const accentColor = healthTab === 'meds' ? colors.danger : colors.teal;
  const placeholder = healthTab === 'meds' ? 'Search meds…' : 'Search vaccines…';
  const currentSearch = healthTab === 'meds' ? medSearch : vaxSearch;
  const setSearch = healthTab === 'meds'
    ? (v: string) => setMedSearch(v)
    : (v: string) => setVaxSearch(v);

  // Matches CubeAI Health pill's own height exactly: that pill's tap
  // target is a 24px icon circle + paddingVertical: 9 (HealthAiAssistant.tsx),
  // so this row uses the same paddingVertical: 9 and a 42px filter button
  // (24 + 9*2), rather than hf.searchRow's own paddingVertical: 9 +
  // marginTop: 12 (the marginTop pushed this row down, and an earlier pass
  // shrank paddingVertical to 6 trying to compact it, actually making the
  // two rows mismatched in height, not matched — fixed here explicitly).
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 140 }}>
      <View style={[hf.searchRow, { flex: 1, marginTop: 0, paddingVertical: 9, borderColor: colors.border,
        backgroundColor: isDark ? colors.card : (healthTab === 'meds' ? colors.surface : colors.tealLight) }]}>
        <TextInput
          value={currentSearch} onChangeText={setSearch}
          placeholder={placeholder} placeholderTextColor={colors.textTertiary}
          style={[hf.searchInput, { color: colors.textPrimary, fontSize: 13 }]}
        />
        {currentSearch.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={13} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter icon button with active-count badge */}
      <TouchableOpacity onPress={openFilterSheet}
        style={[hf.filterIconBtn, {
          width: 42, height: 42,
          borderColor: activeCount ? accentColor : colors.border,
          backgroundColor: activeCount ? accentColor + '15' : 'transparent',
        }]}>
        <SlidersHorizontal size={15} color={activeCount ? accentColor : colors.textSecondary} />
        {activeCount > 0 && (
          <View style={[hf.filterBadge, { backgroundColor: accentColor }]}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: colors.textInverse }}>{activeCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
