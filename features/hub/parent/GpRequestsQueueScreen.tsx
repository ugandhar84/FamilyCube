/**
 * GpRequestsQueueScreen — the Review inbox's "Grandparent requests" queue: everything a grandparent has asked a parent to decide.
 *  - a chore a grandparent wants to sponsor (safety review before any grandchild can see it), and
 *  - a grandparent's offer to handle an errand ("I'll handle it"), until a parent accepts or sends it back.
 * Each row is the same approve / decline card the parent already used, so nothing about the decision itself changes.
 */
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartHandshake } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { OverlayHeading } from '@/components/OverlayPage';
import { GpSafetyReviewCard } from './ChoreReviewSection';
import { GpOfferReviewCard } from './GpOfferReviewCard';

export function GpRequestsQueueScreen({ onClose }: { onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const chores = useChoreStore(s => s.chores);
  const approveGrandparentQuestAsParent = useChoreStore(s => s.approveGrandparentQuestAsParent);
  const declineGrandparentQuestAsParent = useChoreStore(s => s.declineGrandparentQuestAsParent);
  const acceptGPOffer = useChoreStore(s => s.acceptGPOffer);
  const declineGPOffer = useChoreStore(s => s.declineGPOffer);
  const { members, activeMemberId } = useFamilyStore();
  const active = members.find(m => m.id === activeMemberId);

  const sponsored = chores.filter(c => c.categoryType === 'grandparent_quest' && c.status === 'pending_parent_approval');
  const offers = chores.filter(c => c.status === 'gp_offer_pending');
  const total = sponsored.length + offers.length;
  const canvas = isDark ? '#0E0C13' : GEMINI.canvas;
  const label = { fontSize: 11 as const, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.textTertiary };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <OverlayHeading eyebrow="FAMILY CUBE · REVIEW" title="Grandparent requests" subtitle={total > 0 ? `${total} waiting on you` : 'All caught up'}
        accent="sky" Icon={HeartHandshake} onTitlePress={onClose} topInset={insets.top} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, gap: RHYTHM.section, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {total === 0 && (
          <View style={{ backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 16, padding: RHYTHM.card }}>
            <Text style={{ fontSize: 15, color: isDark ? colors.textSecondary : GEMINI.bodyColor, lineHeight: 22 }}>No grandparent requests right now.</Text>
          </View>
        )}
        {sponsored.length > 0 && active && (
          <View style={{ gap: RHYTHM.item }}>
            <Text style={label}>Chores to sponsor, safety review</Text>
            {sponsored.map(c => (
              <GpSafetyReviewCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                approveGrandparentQuestAsParent={approveGrandparentQuestAsParent} declineGrandparentQuestAsParent={declineGrandparentQuestAsParent} />
            ))}
          </View>
        )}
        {offers.length > 0 && active && (
          <View style={{ gap: RHYTHM.item }}>
            <Text style={label}>Offers to help</Text>
            {offers.map(c => (
              <GpOfferReviewCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                acceptGPOffer={acceptGPOffer} declineGPOffer={declineGPOffer} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
