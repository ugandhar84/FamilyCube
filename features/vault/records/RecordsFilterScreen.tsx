/**
 * RecordsFilterScreen — full-page replacement for RecordsFilterSheet.tsx's
 * AppBottomSheet, per the standing app-wide "no bottom sheets" rule and
 * matching HealthFilterScreen.tsx's exact same migration/pattern. Drives
 * the SAME real filterMember/filterTag state RecordsTab.tsx already owns —
 * not a second, parallel filter system. RecordsFilterSheet.tsx is left in
 * place (unused by RecordsTab.tsx after this change) rather than deleted,
 * in case anything else still imports it.
 */
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { TAGS, memberColor } from './types';

const PAGE_BG   = '#F3F5F2';
const TITLE_CLR = '#172337';
const BODY_CLR  = '#657185';
const BLUE      = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER    = '#DFE5EF';
const CARD_BG   = '#FFFFFF';

function contentGroupStyle(cardBg: string, isDark: boolean, border: string) {
  return isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: 16, gap: 12 as const }
    : {
        backgroundColor: cardBg, borderRadius: 22, padding: 16, gap: 12 as const,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      };
}

function SelectionRow({ label, selected, onPress, color, cardBg, border, titleC }: {
  label: string; selected: boolean; onPress: () => void; color: string;
  cardBg: string; border: string; titleC: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 14, padding: 12,
        backgroundColor: selected ? color + '15' : cardBg,
        borderWidth: selected ? 0 : 1, borderColor: border,
      }}>
      <View style={{
        width: 20, height: 20, borderRadius: 6,
        borderWidth: 1.8, borderColor: selected ? color : BODY_CLR,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: selected ? color : 'transparent',
      }}>
        {selected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
      </View>
      <Text style={{ fontSize: 14, fontWeight: '600', color: titleC, flex: 1 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function RecordsFilterScreen({
  colors, isDark, members,
  filterMember, setFilterMember,
  filterTag, setFilterTag,
  recordCount,
  onClose,
}: {
  colors: any; isDark: boolean; members: any[];
  filterMember: string; setFilterMember: (v: string) => void;
  filterTag: string; setFilterTag: (v: string) => void;
  recordCount: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const pageBg = isDark ? colors.background : PAGE_BG;

  const handleReset = () => { setFilterMember('all'); setFilterTag('all'); };

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Health records</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 10, lineHeight: 36 }}>
          Filter records
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 24, gap: 14 }}>

        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>
            Health documents · {recordCount} records
          </Text>
          <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17 }}>
            Changes what you see here — not who can access records.
          </Text>
        </View>

        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 2 }}>Member</Text>
          <SelectionRow label="All members" selected={filterMember === 'all'} onPress={() => setFilterMember('all')}
            color={BLUE} cardBg={cardBg} border={border} titleC={titleC} />
          {members.map((m, i) => (
            <SelectionRow key={m.id} label={m.name} selected={filterMember === m.id} onPress={() => setFilterMember(m.id)}
              color={memberColor(i)} cardBg={cardBg} border={border} titleC={titleC} />
          ))}
        </View>

        <View style={contentGroupStyle(cardBg, isDark, border)}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginBottom: 2 }}>Category</Text>
          <SelectionRow label="All categories" selected={filterTag === 'all'} onPress={() => setFilterTag('all')}
            color={BLUE} cardBg={cardBg} border={border} titleC={titleC} />
          {TAGS.map(t => (
            <SelectionRow key={t.id} label={t.label} selected={filterTag === t.id} onPress={() => setFilterTag(t.id)}
              color={t.color} cardBg={cardBg} border={border} titleC={titleC} />
          ))}
        </View>

        <View style={{ gap: 10, marginTop: 4 }}>
          <TouchableOpacity onPress={onClose}
            style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Apply filters</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleReset}
            style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: cardBg, borderWidth: 1, borderColor: border }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? BLUE : LINK_BLUE }}>Reset filters</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
