import { View, Text, Pressable, TextInput } from 'react-native';
import { Star } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { SectionCard, SubCard } from '../hubComponents';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';

// Money-green — "sent!" confirmation accent, distinct from brand teal used
// elsewhere in this tree. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// GP Bonus Dispenser — send coins directly to a grandchild.
export function SendBonusCard({
  kids, allNames, colors, isDark,
  gpKid, setGpKid, gpAmount, setGpAmount, gpNote, setGpNote, gpSent,
  onSend, active,
}: {
  kids: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  gpKid: FamilyMember | null; setGpKid: (k: FamilyMember | null) => void;
  gpAmount: 15 | 25 | 50; setGpAmount: (v: 15 | 25 | 50) => void;
  gpNote: string; setGpNote: (v: string) => void;
  gpSent: boolean;
  onSend: () => void;
  active?: { name: string };
}) {
  const actorName = active?.name ?? 'senior';
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        large
        icon={<Star size={16} color={BRAND.purple} />}
        title="Send Grandparent Bonus"
        subtitle={kids.length === 0
          ? 'No grandchildren added yet'
          : `Tap to send coins to ${kids.map(k => k.name.split(' ')[0]).join(', ')}`}
        collapsible defaultExpanded={false}
        colors={colors} isDark={isDark}>
        {kids.length === 0 ? (
          <SubCard colors={colors} isDark={isDark} style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Text style={{ fontSize: GP.body, color: colors.textTertiary }}>No grandchildren added yet.</Text>
          </SubCard>
        ) : gpSent ? (
          <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
            <Star size={40} color={MONEY_GREEN} />
            <Text style={{ fontSize: GP.body, fontWeight: '900', color: MONEY_GREEN }}>Bonus sent!</Text>
            <Text style={{ fontSize: GP.tiny, color: colors.textSecondary }}>{gpAmount} coins delivered</Text>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Select grandchild</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {kids.map(kid => (
                <Pressable key={kid.id} onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${actorName} selected "${kid.name.split(' ')[0]}" for "Select grandchild" on "Send Grandparent Bonus" [features/hub/senior/SendBonusCard.tsx:53]`); setGpKid(gpKid?.id === kid.id ? null : kid); }}
                  style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: gpKid?.id === kid.id ? BRAND.purple : (isDark ? colors.surface : '#F5F0FF'), borderWidth: 1.5, borderColor: gpKid?.id === kid.id ? BRAND.purple : BRAND.purple + '30' }}>
                  <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={26} ringColor={gpKid?.id === kid.id ? '#fff' : BRAND.purple} ringWidth={1} />
                  <Text style={{ fontSize: GP.body, fontWeight: '700', color: gpKid?.id === kid.id ? '#fff' : BRAND.purple }}>
                    {kid.name.split(' ')[0]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Amount</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {([15, 25, 50] as const).map(amt => (
                <Pressable key={amt} onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${actorName} selected "${amt}" for "Amount" on "Send Grandparent Bonus" [features/hub/senior/SendBonusCard.tsx:65]`); setGpAmount(amt); }} style={{ flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: gpAmount === amt ? BRAND.amber : (isDark ? colors.surface : '#FFF8E8'), borderWidth: 1.5, borderColor: gpAmount === amt ? BRAND.amber : BRAND.amber + '40' }}>
                  <Text style={{ fontSize: GP.body, fontWeight: '900', color: gpAmount === amt ? '#0C0B14' : BRAND.amber }}>{amt}</Text>
                  <Text style={{ fontSize: GP.tiny, color: gpAmount === amt ? '#0C0B14' : colors.textTertiary, fontWeight: '600' }}>${(amt * 0.10).toFixed(2)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Add a note (optional)</Text>
            <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0', backgroundColor: isDark ? colors.surface : '#FAFAFA', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 }}>
              <TextInput value={gpNote} onChangeText={setGpNote} onBlur={() => console.log(`[UserAction] FORM screen=Hub role=senior member=${actorName} field="Note" on "Send Grandparent Bonus" newValue=${gpNote} [features/hub/senior/SendBonusCard.tsx:73]`)} placeholder="Great job on your test!" placeholderTextColor={colors.textTertiary} style={{ fontSize: GP.sub, color: colors.textPrimary, minHeight: 36 }} multiline />
            </View>
            <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=senior member=${actorName} tapped "Send ${gpAmount} GP Coins" on "Send Grandparent Bonus" (to=${gpKid?.name ?? 'none'}) → onSend [features/hub/senior/SendBonusCard.tsx:75]`); onSend(); }} disabled={!gpKid} style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: gpKid ? BRAND.purple : (isDark ? colors.surface : '#EEE'), opacity: gpKid ? 1 : 0.5 }}>
              <Star size={18} color={gpKid ? '#fff' : colors.textTertiary} />
              <Text style={{ fontSize: GP.sub, fontWeight: '900', color: gpKid ? '#fff' : colors.textTertiary }}>
                Send {gpAmount} GP Coins{gpKid ? ` to ${gpKid.name.split(' ')[0]}` : ''}
              </Text>
            </Pressable>
          </>
        )}
      </SectionCard>
    </View>
  );
}
