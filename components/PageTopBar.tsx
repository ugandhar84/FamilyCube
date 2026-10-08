/**
 * PageTopBar — Figma Scrollable Content Design TopBar, inlined per page.
 * Replaces the legacy AppHeader for screens that follow the new design:
 *   • Avatar (40px, role-color ring) + eyebrow small + name bold — left
 *   • Round '+' card button (42px) — right (parent/senior action)
 *   • Amber bell badge — right always
 *
 * Figma spec (.topbar-row / .household / .round-action):
 *   household small  → 11px, textSecondary
 *   household strong → 14px, 700, textPrimary
 *   round-action     → 42×42 circle, card bg, pink '+' (24px)
 *   bell             → amber bg pill, badge on unread
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useNotifStore } from '@/store/notifStore';

export function PageTopBar({
  onAddPress,
  onBellPress,
  onAvatarPress,
}: {
  onAddPress?: () => void;
  onBellPress?: () => void;
  onAvatarPress?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyName = useFamilyStore(s => s.familyName);
  const unreadCount = useNotifStore(s => s.unreadCount);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const roleColor = activeMember?.role === 'kid' ? colors.kid
    : activeMember?.role === 'teen' ? colors.amber
    : activeMember?.role === 'senior' ? colors.teal
    : colors.parent;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4,
      backgroundColor: isDark ? '#0E0C13' : '#FFFFFF',
    }}>
      {/* Left: avatar + eyebrow/name */}
      <TouchableOpacity
        onPress={onAvatarPress}
        activeOpacity={0.75}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <FamilyAvatar
          name={activeMember?.name ?? ''}
          emoji={activeMember?.emoji}
          avatarUrl={activeMember?.avatarUrl}
          siblings={members.map(m => m.name)}
          size={40}
          ringColor={roleColor}
          ringWidth={2}
        />
        <View>
          {/* Figma .household small — family + role */}
          <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 14 }} numberOfLines={1}>
            {familyName ?? 'Family'} · {(activeMember?.role ?? 'parent').toUpperCase()}
          </Text>
          {/* Figma .household strong — first name */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }} numberOfLines={1}>
            {activeMember?.name?.split(' ')[0] ?? ''}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Right: + button + bell */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onAddPress && (
          <TouchableOpacity
            onPress={onAddPress}
            activeOpacity={0.8}
            style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: colors.card,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: colors.navy,
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: isDark ? 0 : 0.08,
              shadowRadius: 16,
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 24, color: colors.pink, fontWeight: '300', lineHeight: 28, marginTop: -1 }}>+</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onBellPress}
          activeOpacity={0.8}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: isDark ? 'rgba(245,166,35,0.18)' : '#FEF0D3',
            alignItems: 'center', justifyContent: 'center',
          }}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Text style={{ fontSize: 18 }}>🔔</Text>
          {unreadCount > 0 && (
            <View style={{
              position: 'absolute', top: 4, right: 4,
              minWidth: 16, height: 16, borderRadius: 8,
              backgroundColor: colors.danger,
              alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: 3,
            }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
