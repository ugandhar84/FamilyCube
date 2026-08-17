import { View, Text, Pressable } from 'react-native';
import { HeartHandshake, Car, BookOpen, PartyPopper, CheckCircle2 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';

export function GpCanHelpSection({ requests, members, colors, isDark, toggleGPWelcome }: {
  requests: any[]; members: FamilyMember[]; colors: any; isDark: boolean;
  toggleGPWelcome: (id: string, open: boolean) => void;
}) {
  if (requests.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ backgroundColor: colors.card,
        borderRadius: 18, borderWidth: 1, borderColor: isDark ? '#3b5a3b' : '#BBF7D0',
        overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 10,
          borderBottomWidth: 1, borderBottomColor: isDark ? '#1a2e1a' : '#D1FAE5' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16,
            backgroundColor: isDark ? '#14291a' : '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
            <HeartHandshake size={16} color={isDark ? '#86efac' : '#166534'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isDark ? '#86efac' : '#166534' }}>
              GP Can Help
            </Text>
            <Text style={{ fontSize: TYPO.label, color: isDark ? '#4ade80' : '#166534', opacity: 0.8 }}>
              Approved requests a grandparent could handle
            </Text>
          </View>
        </View>
        <View style={{ padding: 12, gap: 8 }}>
          {requests.map(req => {
            const kid = members.find(m => m.id === req.fromMemberId);
            const kidName = kid?.name.split(' ')[0] ?? 'Kid';
            const TypeIcon = req.type === 'ride' ? Car : req.type === 'tutor' ? BookOpen : PartyPopper;
            const isOpen = !!req.openToGP;
            return (
              <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                borderRadius: 12, padding: 10,
                backgroundColor: isOpen
                  ? (isDark ? '#14291a' : '#F0FDF4')
                  : (isDark ? colors.surface : '#F8FAFC'),
                borderWidth: 1,
                borderColor: isOpen
                  ? (isDark ? '#166534' : '#86EFAC')
                  : (isDark ? colors.border : '#E2E8F0') }}>
                <TypeIcon size={18} color={isDark ? '#4ade80' : '#166534'} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                    {kidName} — {req.detail}
                  </Text>
                  {req.scheduledDate || req.scheduledTime ? (
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }}>
                      {req.scheduledDate ?? ''}{req.scheduledTime ? ` at ${req.scheduledTime}` : ''}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => toggleGPWelcome(req.id, !isOpen)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                    backgroundColor: isOpen
                      ? (isDark ? '#14291a' : '#DCFCE7')
                      : (isDark ? colors.surface2 : '#F1F5F9'),
                    borderWidth: 1,
                    borderColor: isOpen ? '#22c55e' : (isDark ? colors.border : '#CBD5E1') }}>
                  {isOpen ? <CheckCircle2 size={12} color="#22c55e" /> : <HeartHandshake size={12} color={colors.textSecondary} />}
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                    color: isOpen ? '#22c55e' : colors.textSecondary }}>
                    {isOpen ? 'GP Open' : 'Offer GP'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
