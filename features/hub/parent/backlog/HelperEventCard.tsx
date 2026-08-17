import { View, Text, Pressable, Alert } from 'react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// A calendar event where this parent is the driver/helper and hasn't
// confirmed yet — take it over from a co-parent, or confirm your own slot.
export function HelperEventCard({ ev, members, active, colors, isDark, updateEvent }: {
  ev: FamilyEvent; members: FamilyMember[]; active: FamilyMember; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
}) {
  const catEmoji = ev.category === 'Sports' ? '🏅' : ev.category === 'Medical' ? '🏥' : ev.category === 'Study' ? '📚' : ev.category === 'Ride' ? '🚗' : '📅';
  const kidName = members.find(m => m.id === ev.memberId)?.name.split(' ')[0] ?? '';

  return (
    <View style={{ borderRadius: 14, borderWidth: 1,
      borderColor: BRAND.teal + '40', backgroundColor: isDark ? '#0D2020' : '#F0FDFA',
      padding: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 16 }}>{catEmoji}</Text>
        <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
        <View style={{ backgroundColor: ev.helperStatus === 'confirmed' ? '#22c55e20' : '#F59E0B20',
          borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '700',
            color: ev.helperStatus === 'confirmed' ? '#22c55e' : '#D97706' }}>
            {ev.helperStatus === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginLeft: 24 }}>
        {ev.date}{ev.time ? ` · ${ev.time}` : ''}
        {kidName ? ` · for ${kidName}` : ''}
        {ev.pickupLocation ? ` · From: ${ev.pickupLocation}` : ''}
        {ev.dropLocation ? ` → ${ev.dropLocation}` : ev.location ? ` → ${ev.location}` : ''}
      </Text>
      {ev.notes ? (
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginLeft: 24 }} numberOfLines={1}>
          📝 {ev.notes}
        </Text>
      ) : null}
      {ev.helperStatus !== 'confirmed' && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginLeft: 24 }}>
          {ev.helper !== active.name && (
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Take Over',
                  `Reassign this from ${ev.helper} to yourself?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: "Yes, I'll do it", onPress: () => {
                      updateEvent(ev.id, { helper: active.name, helperStatus: 'confirmed' });
                      const msg = `✅ ${active.name.split(' ')[0]} has taken over "${ev.title}" — you're off the hook.`;
                      useChatStore.getState().sendMessage('all', active.id, msg);
                    }},
                  ]
                );
              }}
              style={{ backgroundColor: BRAND.teal + '20', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                borderWidth: 1, borderColor: BRAND.teal + '40' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal }}>🔄 Take Over</Text>
            </Pressable>
          )}
          {ev.helper === active.name && (
            <Pressable
              onPress={() => updateEvent(ev.id, { helperStatus: 'confirmed' })}
              style={{ backgroundColor: '#22c55e20', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                borderWidth: 1, borderColor: '#22c55e40' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#22c55e' }}>{"✓ Confirm I'll do it"}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
