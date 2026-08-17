import { View, Text, Pressable, Alert } from 'react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';

// Ride / tutor / cheer request — approve, decline with a note back to the
// kid, or flag it open to a grandparent at approval time.
export function ServiceRequestCard({ req, kidName, active, colors, isDark, approveRequest, declineRequest, toggleGPWelcome }: {
  req: any; kidName: string; active: FamilyMember; colors: any; isDark: boolean;
  approveRequest: (id: string, by: string) => void;
  declineRequest: (id: string, by: string, note?: string) => void;
  toggleGPWelcome: (id: string, open: boolean) => void;
}) {
  const typeEmoji  = req.type === 'ride' ? '🚗' : req.type === 'tutor' ? '📚' : '🎉';
  const typeLabel  = req.type === 'ride' ? 'Ride Request' : req.type === 'tutor' ? 'Tutor Request' : 'Cheer Request';
  const isGPOpen   = !!req.openToGP;

  return (
    <View style={{ borderRadius: 14, borderWidth: 1.5,
      borderColor: BRAND.teal + '50', backgroundColor: isDark ? '#0D2A2A' : '#F0FDFA',
      overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
        <Text style={{ fontSize: 22 }}>{typeEmoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.teal }}>{kidName} — {typeLabel}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={2}>{req.detail}</Text>
          {req.scheduledDate || req.scheduledTime ? (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
              {req.scheduledDate ?? ''}{req.scheduledTime ? ` at ${req.scheduledTime}` : ''}
            </Text>
          ) : null}
        </View>
      </View>
      <Pressable onPress={() => toggleGPWelcome(req.id, !isGPOpen)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
          marginHorizontal: 12, marginBottom: 8, padding: 8, borderRadius: 10,
          backgroundColor: isGPOpen ? (isDark ? '#14291a' : '#DCFCE7') : (isDark ? colors.surface2 : '#F1F5F9'),
          borderWidth: 1, borderColor: isGPOpen ? '#22c55e' : (isDark ? colors.border : '#CBD5E1') }}>
        <Text style={{ fontSize: 14 }}>👴</Text>
        <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700',
          color: isGPOpen ? '#22c55e' : colors.textSecondary }}>
          {isGPOpen ? 'GP Welcome — grandparent can take this' : 'Offer to GP (grandparent can help)'}
        </Text>
        <Text style={{ fontSize: 12 }}>{isGPOpen ? '✅' : '○'}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        <Pressable onPress={() => approveRequest(req.id, active.id)}
          style={{ flex: 1, backgroundColor: BRAND.teal, borderRadius: 10,
            paddingVertical: 9, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>✓ Approve</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Alert.prompt(
              'Decline Request',
              `Add a note for ${kidName} — why can't this happen?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send & Decline', style: 'destructive', onPress: (note: string | undefined) => {
                  const finalNote = note?.trim() || undefined;
                  declineRequest(req.id, active.id, finalNote);
                  const msg = `❌ ${active.name.split(' ')[0]} declined your ${req.type} request: "${req.detail}"${finalNote ? `\n📝 "${finalNote}"` : ''}`;
                  useChatStore.getState().sendMessage('all', active.id, msg);
                }},
              ],
              'plain-text',
              '',
            );
          }}
          style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1,
            borderColor: '#EF444440', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>✕ Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}
