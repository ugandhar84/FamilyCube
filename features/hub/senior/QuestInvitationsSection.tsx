import { View, Text, Pressable } from 'react-native';
import { HeartHandshake } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useChoreStore } from '@/store/choreStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Grandparent Quest Invitations (Workflow 2 — parent proposed, GP can accept
// or pass with no pressure). Pass is persisted to chore_tasks.
// gp_withdrawn_ids (not local component state) so it survives reload, is
// per-grandparent, and stays in sync with the same button on the Chores
// tab (QuestCard.tsx's canGpClaimPool/gpAlreadyPassed) — passing on either
// screen now flips the button to "🔄 Reconsider?" on both.
export function QuestInvitationsSection({
  invitations,
  active, members, colors, isDark,
  claimGPErrand,
}: {
  invitations: ChoreTask[];
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  claimGPErrand: (choreId: string, gpMemberId: string) => void;
}) {
  if (!invitations.length) return null;

  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: BRAND.purple,
        textTransform: 'uppercase', letterSpacing: 0.8 }}>Quest Invitations</Text>
      {invitations.map(c => {
        const kid = members.find(m => m.id === c.assignedToId);
        const alreadyPassed = (c.gpWithdrawnIds ?? []).includes(active.id);
        return (
          <View key={c.id} style={{ borderRadius: 16, borderWidth: 1,
            borderColor: isDark ? BRAND.purple + '40' : BRAND.purple + '30',
            backgroundColor: isDark ? '#1a0a2e' : '#FAF5FF',
            overflow: 'hidden' }}>
            <View style={{ backgroundColor: BRAND.purple, paddingHorizontal: 14, paddingVertical: 8,
              flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <HeartHandshake size={14} color="#fff" />
              <Text style={{ flex: 1, fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
                QUEST INVITATION
              </Text>
              <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: '#fff' }}>+{c.basePoints} pts</Text>
              </View>
            </View>
            <View style={{ padding: 14, gap: 4 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? '#C4B5FD' : '#5B21B6' }}>
                {c.title}
              </Text>
              {kid && (
                <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>
                  For {kid.name.split(' ')[0]}
                </Text>
              )}
              {c.description && (
                <Text style={{ fontSize: GP.sub, color: colors.textSecondary, marginTop: 2 }}>{c.description}</Text>
              )}
              <Text style={{ fontSize: GP.tiny, color: BRAND.purple, fontWeight: '700', marginTop: 4 }}>
                Invited by parent · no pressure to accept
              </Text>
            </View>
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: isDark ? BRAND.purple + '30' : BRAND.purple + '20' }}>
              <Pressable
                onPress={() => {
                  if (alreadyPassed) {
                    // Now the set_gp_withdrawn RPC — atomic remove instead
                    // of a client-side filter, closing a real race two GPs
                    // passing/reconsidering near-simultaneously could hit.
                    supabase.rpc('set_gp_withdrawn', { p_chore_id: c.id, p_gp_member_id: active.id, p_withdrawn: false })
                      .then(({ error }) => { if (error) console.warn('[QuestInvitationsSection] set_gp_withdrawn failed', error.message); });
                  }
                  // inviteGrandparents errand → claimGPErrand; grandparent_quest → startGrandparentQuest
                  if (c.inviteGrandparents && c.categoryType !== 'grandparent_quest') {
                    claimGPErrand(c.id, active.id);
                  } else {
                    useChoreStore.getState().startGrandparentQuest(c.id, active.id);
                  }
                }}
                style={({ pressed }) => ({ flex: 2, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: BRAND.purple, opacity: pressed ? 0.8 : 1 })}>
                <Text style={{ fontSize: GP.body, fontWeight: '900', color: '#fff' }}>
                  {alreadyPassed ? '🔄 Reconsider?' : "❤️ I'd Love To Help"}
                </Text>
              </Pressable>
              {!alreadyPassed && (
                <>
                  <View style={{ width: 1, backgroundColor: isDark ? BRAND.purple + '30' : BRAND.purple + '20' }} />
                  <Pressable
                    onPress={() => {
                      supabase.rpc('set_gp_withdrawn', { p_chore_id: c.id, p_gp_member_id: active.id, p_withdrawn: true })
                        .then(({ error }) => {
                          if (error) { console.warn('[QuestInvitationsSection] set_gp_withdrawn failed', error.message); return; }
                          showToast('Passed ✓');
                        });
                    }}
                    style={({ pressed }) => ({ flex: 1, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.textSecondary }}>
                      Pass
                    </Text>
                    <Text style={{ fontSize: GP.tiny, color: colors.textTertiary }}>No guilt 💙</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
