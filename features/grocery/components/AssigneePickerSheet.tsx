/**
 * AssigneePickerSheet — single-select "who's doing this" bottom sheet.
 *
 * Replaces ReturnModeToolbar's native Alert.alert member list (live-
 * requested: "instead popup show the bottomsheet with picker one
 * selection allowed") — a plain OS alert stacks one button per family
 * member with no avatar/role context and no visual polish, and doesn't
 * match this app's own sheet-based picker patterns used everywhere else.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

export default function AssigneePickerSheet({
  visible, onClose, title, subtitle, members, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  members: { id: string; name: string; emoji?: string; avatarUrl?: string; role: string }[];
  onSelect: (memberId: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const siblings = members.map(m => m.name);

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      minHeight="40%"
      footer={
        <TouchableOpacity
          onPress={() => { if (selectedId) { onSelect(selectedId); setSelectedId(null); } }}
          disabled={!selectedId}
          style={{
            borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center',
            backgroundColor: selectedId ? BRAND.purple : colors.border,
          }}
        >
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Create Chore</Text>
        </TouchableOpacity>
      }
    >
      <View style={{ gap: 8 }}>
        {members.map(m => {
          const sel = selectedId === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => setSelectedId(m.id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderRadius: RADIUS.md, borderWidth: 1.5,
                borderColor: sel ? BRAND.purple : colors.border,
                backgroundColor: sel ? (isDark ? BRAND.purple + '22' : BRAND.purple + '10') : colors.card,
                paddingVertical: 12, paddingHorizontal: 14,
              }}
            >
              <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} siblings={siblings} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{m.name}</Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textTransform: 'capitalize' }}>{m.role}</Text>
              </View>
              <View style={{
                width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                borderColor: sel ? BRAND.purple : (isDark ? '#475569' : '#CBD5E1'),
                backgroundColor: sel ? BRAND.purple : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {sel && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </AppBottomSheet>
  );
}
