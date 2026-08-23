import { useState } from 'react';
import { View, Text, Pressable, Alert, TextInput } from 'react-native';
import { Car, BookOpen, PartyPopper, HeartHandshake, CheckCircle2, Check, X, Coins } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';

// Money-green — "GP Welcome" confirmed-state accent, distinct from brand
// teal used for this card's main styling. Not colors.success (which IS
// brand teal in this app) — kept as one local constant.
const GP_GREEN = '#22c55e';

// Ride / tutor / cheer request — approve (optionally with a coin reward for
// tutor/cheer), decline with a note back to the kid, or flag it open to a
// grandparent at approval time.
export function ServiceRequestCard({ req, kidName, active, colors, isDark, approveRequest, declineRequest, toggleGPWelcome }: {
  req: any; kidName: string; active: FamilyMember; colors: any; isDark: boolean;
  approveRequest: (id: string, by: string, note?: string) => void;
  declineRequest: (id: string, by: string, note?: string) => void;
  toggleGPWelcome: (id: string, open: boolean) => void;
}) {
  const awardCoins = useFamilyStore(s => s.awardCoins);
  const TypeIcon   = req.type === 'ride' ? Car : req.type === 'tutor' ? BookOpen : PartyPopper;
  const typeLabel  = req.type === 'ride' ? 'Ride Request' : req.type === 'tutor' ? 'Tutor Request' : 'Cheer Request';
  const isGPOpen   = !!req.openToGP;
  const canOfferCoins = req.type === 'tutor' || req.type === 'cheer';
  const [coinOffer, setCoinOffer] = useState('');

  const handleApprove = () => {
    const coins = parseInt(coinOffer, 10);
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Approve" on "${typeLabel}" for ${kidName} (id=${req.id}) coinOffer=${coinOffer || 0} → approveRequest [features/hub/parent/ServiceRequestCard.tsx:90]`);
    if (canOfferCoins && coins > 0) {
      awardCoins(req.fromMemberId, coins, 'mainCoins');
      approveRequest(req.id, active.id, `+${coins} coins for helping!`);
      useChatStore.getState().sendMessage('all', active.id,
        `🪙 ${kidName} earned +${coins} coins for: "${req.detail}"`);
    } else {
      approveRequest(req.id, active.id);
    }
  };

  return (
    <View style={{ borderRadius: 14, borderWidth: 1.5,
      borderColor: colors.parent + '50', backgroundColor: isDark ? colors.parent + '14' : colors.parentLight,
      overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.parent + '20', alignItems: 'center', justifyContent: 'center' }}>
          <TypeIcon size={17} color={colors.parent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.parent }}>{kidName} — {typeLabel}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={2}>{req.detail}</Text>
          {req.scheduledDate || req.scheduledTime ? (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
              {req.scheduledDate ?? ''}{req.scheduledTime ? ` at ${req.scheduledTime}` : ''}
            </Text>
          ) : null}
        </View>
      </View>
      <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "${isGPOpen ? 'GP Welcome' : 'Offer to GP'}" on "${typeLabel}" for ${kidName} (id=${req.id}) → toggleGPWelcome [features/hub/parent/ServiceRequestCard.tsx:60]`); toggleGPWelcome(req.id, !isGPOpen); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
          marginHorizontal: 12, marginBottom: 8, padding: 8, borderRadius: 10,
          backgroundColor: isGPOpen ? (isDark ? '#14291a' : '#DCFCE7') : (isDark ? colors.surface2 : '#F1F5F9'),
          borderWidth: 1, borderColor: isGPOpen ? GP_GREEN : (isDark ? colors.border : '#CBD5E1') }}>
        <HeartHandshake size={14} color={isGPOpen ? GP_GREEN : colors.textSecondary} />
        <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700',
          color: isGPOpen ? GP_GREEN : colors.textSecondary }}>
          {isGPOpen ? 'GP Welcome — grandparent can take this' : 'Offer to GP (grandparent can help)'}
        </Text>
        {isGPOpen && <CheckCircle2 size={13} color={GP_GREEN} />}
      </Pressable>
      {canOfferCoins && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
          marginHorizontal: 12, marginBottom: 8, padding: 8, borderRadius: 10,
          backgroundColor: isDark ? colors.surface2 : '#F1F5F9', borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0' }}>
          <Coins size={14} color={colors.kid} />
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Offer coins (optional):</Text>
          <TextInput
            value={coinOffer}
            onChangeText={t => setCoinOffer(t.replace(/[^0-9]/g, ''))}
            onBlur={() => { console.log(`[UserAction] FORM screen=Hub role=parent member=${active.name} field="coinOffer" on "${typeLabel}" for ${kidName} (id=${req.id}) newValue=${coinOffer} [features/hub/parent/ServiceRequestCard.tsx:80]`); }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            style={{ flex: 1, textAlign: 'right', fontSize: TYPO.label, fontWeight: '800',
              color: colors.textPrimary, paddingVertical: 2 }}
          />
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        <Pressable onPress={handleApprove}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.parent, borderRadius: 10,
            paddingVertical: 9 }}>
          <Check size={13} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
            {canOfferCoins && parseInt(coinOffer, 10) > 0 ? `Approve +${parseInt(coinOffer, 10)}¢` : 'Approve'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Decline" on "${typeLabel}" for ${kidName} (id=${req.id}) [features/hub/parent/ServiceRequestCard.tsx:99]`);
            Alert.prompt(
              'Decline Request',
              `Add a note for ${kidName} — why can't this happen?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send & Decline', style: 'destructive', onPress: (note: string | undefined) => {
                  const finalNote = note?.trim() || undefined;
                  console.log(`[UserAction] screen=Hub role=parent member=${active.name} confirmed "Decline" on "${typeLabel}" for ${kidName} (id=${req.id}) → declineRequest [features/hub/parent/ServiceRequestCard.tsx:106]`);
                  declineRequest(req.id, active.id, finalNote);
                  const msg = `❌ ${active.name.split(' ')[0]} declined your ${req.type} request: "${req.detail}"${finalNote ? `\n📝 "${finalNote}"` : ''}`;
                  useChatStore.getState().sendMessage('all', active.id, msg);
                }},
              ],
              'plain-text',
              '',
            );
          }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: `${colors.danger}15`, borderWidth: 1,
            borderColor: `${colors.danger}40`, borderRadius: 10, paddingVertical: 9 }}>
          <X size={13} color={colors.danger} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger }}>Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}
