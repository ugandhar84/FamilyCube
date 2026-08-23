import { View, Text, Pressable } from 'react-native';
import { HeartHandshake, Car, BookOpen, PartyPopper, CheckCircle2 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { SectionCard } from '../hubComponents';
import type { FamilyMember } from '@/store/familyStore';

export function GpCanHelpSection({ requests, members, colors, isDark, toggleGPWelcome }: {
  requests: any[]; members: FamilyMember[]; colors: any; isDark: boolean;
  toggleGPWelcome: (id: string, open: boolean) => void;
}) {
  if (requests.length === 0) return null;

  console.log(`[UserAction] FILTER screen=Hub role=parent list=GpCanHelpSection.requests totalSource=${requests.length} afterFilter=${requests.length} [features/hub/parent/GpCanHelpSection.tsx:13]`);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={<HeartHandshake size={16} color={colors.parent} />}
        title="GP Can Help"
        subtitle="Approved requests a grandparent could handle"
        accent={colors.parent}
        badge={requests.length} badgeLabel="Open" badgeColor={colors.parent}
        colors={colors} isDark={isDark}>
        <View style={{ gap: 8 }}>
          {requests.map(req => {
            const kid = members.find(m => m.id === req.fromMemberId);
            const kidName = kid?.name.split(' ')[0] ?? 'Kid';
            const TypeIcon = req.type === 'ride' ? Car : req.type === 'tutor' ? BookOpen : PartyPopper;
            const isOpen = !!req.openToGP;
            return (
              <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                borderRadius: 12, padding: 10,
                backgroundColor: isOpen
                  ? (isDark ? colors.parent + '18' : colors.parentLight)
                  : colors.surface,
                borderWidth: 1,
                borderColor: isOpen ? colors.parent + '50' : colors.border }}>
                <TypeIcon size={18} color={colors.parent} />
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
                  onPress={() => { console.log(`[UserAction] screen=Hub role=parent tapped "${isOpen ? 'GP Open' : 'Offer GP'}" on "${req.detail}" (id=${req.id}) → toggleGPWelcome(${req.id}, ${!isOpen}) [features/hub/parent/GpCanHelpSection.tsx:48]`); toggleGPWelcome(req.id, !isOpen); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                    backgroundColor: isOpen
                      ? (isDark ? colors.parent + '25' : colors.parentLight)
                      : (isDark ? colors.surface2 : colors.surface),
                    borderWidth: 1,
                    borderColor: isOpen ? colors.parent : colors.border }}>
                  {isOpen ? <CheckCircle2 size={12} color={colors.parent} /> : <HeartHandshake size={12} color={colors.textSecondary} />}
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                    color: isOpen ? colors.parent : colors.textSecondary }}>
                    {isOpen ? 'GP Open' : 'Offer GP'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </SectionCard>
    </View>
  );
}
