import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import { f } from './styles';

// ─── Multi-select member picker ────────────────────────────────────────────────
export default function MemberPicker({ label, selectedIds, members, onToggle, onSelectAll, colors, isDark, siblings, lockedIds }: {
  label: string; selectedIds: string[];
  members: any[]; onToggle: (id: string) => void; onSelectAll?: () => void;
  colors: any; isDark: boolean; siblings: string[];
  lockedIds?: string[];  // IDs that cannot be deselected
}) {
  const locked = lockedIds ?? [];
  const allSelected = members.length > 0 && members.every(m => selectedIds.includes(m.id));
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={[f.label, { color: colors.textSecondary }]}>{label}</Text>
        {onSelectAll && members.length > 1 && (
          <TouchableOpacity onPress={onSelectAll}
            style={{ backgroundColor: allSelected ? BRAND.purple + '22' : (isDark ? '#1E293B' : '#F1F5F9'), borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: allSelected ? BRAND.purple : (isDark ? '#334155' : '#E2E8F0') }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: allSelected ? BRAND.purple : colors.textTertiary }}>
              {allSelected ? '✓ All' : 'All'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 12 }}>
        {members.map(m => {
          const sel = selectedIds.includes(m.id);
          const isLocked = locked.includes(m.id);
          return (
            <TouchableOpacity
              key={m.id}
              style={{ alignItems: 'center', gap: 4, opacity: isLocked ? 1 : 1 }}
              onPress={() => !isLocked && onToggle(m.id)}
              disabled={isLocked}
            >
              <View style={{ position: 'relative' }}>
                <FamilyAvatar
                  name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
                  siblings={siblings} size={44}
                  ringColor={sel ? BRAND.purple : (isDark ? '#64748B' : '#94A3B8')}
                  ringWidth={sel ? 2.5 : 0}
                  bgColor={sel ? BRAND.purple + '20' : (isDark ? '#1E293B' : '#F1F5F9')}
                />
                {isLocked && sel && (
                  <View style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 9, color: colors.textInverse, fontWeight: '900' }}>🔒</Text>
                  </View>
                )}
                {!isLocked && sel && (
                  <View style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 9, color: colors.textInverse, fontWeight: '900' }}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? BRAND.purple : colors.textTertiary }} numberOfLines={1}>
                {m.name.split(' ')[0]}
              </Text>
              {isLocked && (
                <Text style={{ fontSize: 8, color: colors.warning, fontWeight: '800', marginTop: -2 }}>Locked</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
