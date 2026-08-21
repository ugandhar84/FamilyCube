import { View, Text, Pressable, Alert } from 'react-native';
import { CheckCircle2, Hand } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Scenario 1.6 — a grandparent/senior offered to handle an openToGP chore
// ("I'll Handle It") and it's sitting in gp_offer_pending until a parent
// decides. Nothing is assigned yet (gpOfferById only, not assignedToId) —
// Accept makes it real (assignedToId + in_progress), Decline sends it back
// to the open pool for any GP to pick up again.
//
// Standalone file (not defined inside ChoreReviewSection.tsx, which is
// where it originally lived) so both ChoreReviewSection.tsx (parent's own
// Hub) AND ParentReviewDeck.tsx (the review surface a caregiver-mode GP
// with a temporary-approver grant actually sees, per SeniorView.tsx) can
// render it without ChoreReviewSection ↔ ParentReviewDeck importing from
// each other — ParentReviewDeck already imports FROM ChoreReviewSection's
// sibling QuestApprovalCard.tsx pattern, and ChoreReviewSection itself
// imports ParentReviewDeck, so a card defined inside ChoreReviewSection.tsx
// would have made that a circular import.
export function GpOfferReviewCard({ c, members, colors, isDark, active, acceptGPOffer, declineGPOffer }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  acceptGPOffer: (choreId: string, parentId: string) => void;
  declineGPOffer: (choreId: string, parentId: string, reason?: string) => void;
}) {
  const gp = members.find(m => m.id === c.gpOfferById);

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? colors.teal + '10' : colors.tealLight,
      borderWidth: 1.5, borderColor: colors.teal + '40' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Hand size={15} color={colors.teal} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
            {gp?.name?.split(' ')[0] ?? 'A grandparent'} offered to handle this
          </Text>
        </View>
      </View>
      {c.description ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 18 }}>{c.description}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => Alert.prompt
            ? Alert.prompt('Decline Offer',
                `Let ${gp?.name?.split(' ')[0] ?? 'them'} know why (optional) — "${c.title}" goes back to the open pool.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Decline', style: 'destructive', onPress: (reason?: string) => declineGPOffer(c.id, active.id, reason?.trim() || undefined) },
                ],
                'plain-text')
            : declineGPOffer(c.id, active.id)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
            borderWidth: 1.5, borderColor: colors.danger + '50' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger }}>Decline</Text>
        </Pressable>
        <Pressable onPress={() => acceptGPOffer(c.id, active.id)}
          style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 10, borderRadius: 10, backgroundColor: colors.teal }}>
          <CheckCircle2 size={13} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Accept Offer</Text>
        </Pressable>
      </View>
    </View>
  );
}
