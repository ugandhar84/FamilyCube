import { View, Text, Pressable, TextInput, Modal } from 'react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';

export function SavingsMatchModal({
  visible, onClose,
  kids, colors, isDark,
  matchKidId, setMatchKidId,
  matchType, setMatchType,
  matchValue, setMatchValue,
  maxMonthly, setMaxMonthly,
  onSave,
}: {
  visible: boolean; onClose: () => void;
  kids: FamilyMember[]; colors: any; isDark: boolean;
  matchKidId: string; setMatchKidId: (id: string) => void;
  matchType: 'FIXED_PERCENTAGE' | 'FIXED_AMOUNT'; setMatchType: (t: 'FIXED_PERCENTAGE' | 'FIXED_AMOUNT') => void;
  matchValue: string; setMatchValue: (v: string) => void;
  // Was hardcoded to 500 with no UI control at all — a grandparent had no
  // way to set their own monthly contribution cap (QA sweep,
  // grandparent-role audit, Low L1).
  maxMonthly: string; setMaxMonthly: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#00000060' }} onPress={onClose} />
      <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 }}>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>Set Up Savings Match</Text>
        <Text style={{ fontSize: GP.body, color: colors.textSecondary }}>
          You'll automatically add a match to their Save Jar when they earn points.
        </Text>
        {/* Kid selector */}
        <View>
          <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>For grandchild</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {kids.map(k => (
              <Pressable key={k.id} onPress={() => setMatchKidId(k.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                  borderColor: matchKidId === k.id ? BRAND.purple : colors.border,
                  backgroundColor: matchKidId === k.id ? BRAND.purple + '15' : 'transparent' }}>
                <Text style={{ fontSize: GP.body, fontWeight: '600', color: matchKidId === k.id ? BRAND.purple : colors.textPrimary }}>
                  {k.name.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {/* Match type */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['FIXED_PERCENTAGE', 'FIXED_AMOUNT'] as const).map(t => (
            <Pressable key={t} onPress={() => setMatchType(t)}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1.5,
                borderColor: matchType === t ? BRAND.purple : colors.border,
                backgroundColor: matchType === t ? BRAND.purple + '12' : 'transparent' }}>
              <Text style={{ fontSize: GP.body, fontWeight: '700', color: matchType === t ? BRAND.purple : colors.textSecondary }}>
                {t === 'FIXED_PERCENTAGE' ? '% Match' : 'Fixed Amount'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TextInput
            style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
              backgroundColor: isDark ? colors.surface : '#F8FAFC',
              padding: 12, fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}
            keyboardType="numeric"
            value={matchValue}
            onChangeText={setMatchValue}
          />
          <Text style={{ fontSize: GP.body, color: colors.textSecondary }}>
            {matchType === 'FIXED_PERCENTAGE' ? '% of each earn' : 'pts per earn'}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Monthly cap</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TextInput
              style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
                backgroundColor: isDark ? colors.surface : '#F8FAFC',
                padding: 12, fontSize: GP.body, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}
              keyboardType="numeric"
              value={maxMonthly}
              onChangeText={setMaxMonthly}
              placeholder="500"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={{ fontSize: GP.body, color: colors.textSecondary }}>pts / month max</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={onClose}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border }}>
            <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={onSave}
            style={{ flex: 2, alignItems: 'center', paddingVertical: 13, borderRadius: 14,
              backgroundColor: matchKidId ? BRAND.purple : (isDark ? '#374151' : '#D1D5DB') }}>
            <Text style={{ fontSize: GP.body, fontWeight: '900', color: '#fff' }}>Save Match Rule</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
