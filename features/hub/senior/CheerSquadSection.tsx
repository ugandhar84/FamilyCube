import { View, Text, Pressable } from 'react-native';
import { PartyPopper } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { SectionCard } from '../hubComponents';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Cheer Squad — today's un-cheered grandkid wins. Replaces the old
// read-only "Family Kudos Feed", which listed the same completions without
// the one thing GP actually does here.
export function CheerSquadSection({
  kidsCheerable, kids, allNames, colors, isDark,
  cheerChore, awardCoins, active,
}: {
  kidsCheerable: ChoreTask[];
  kids: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  cheerChore: (choreId: string, fromMemberId: string, opts?: { coins?: number; note?: string }) => void;
  awardCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => void;
  active: FamilyMember;
}) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        large
        icon={<PartyPopper size={18} color={BRAND.teal} />}
        title="Cheer Your Grandkids"
        subtitle={kidsCheerable.length === 0
          ? 'Nothing new today'
          : `${kidsCheerable.length} finished a chore today`}
        badge={kidsCheerable.length || undefined} badgeColor={BRAND.teal}
        collapsible defaultExpanded={false}
        colors={colors} isDark={isDark}>
        {kidsCheerable.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
            {/* Mood emoji — expressive empty-state warmth, not chrome. */}
            <Text style={{ fontSize: 32 }}>🌱</Text>
            <Text style={{ fontSize: GP.body, color: colors.textSecondary, textAlign: 'center' }}>
              No chores finished yet today.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {kidsCheerable.map(c => {
              const kid = kids.find(k => k.id === c.assignedToId);
              const firstName = kid?.name?.split(' ')[0] ?? 'They';
              return (
                <View key={c.id} style={{
                  borderRadius: 16, borderWidth: 1.5, borderColor: BRAND.teal + '40',
                  backgroundColor: isDark ? BRAND.teal + '10' : '#F0FDFA',
                  padding: 14, gap: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <FamilyAvatar name={kid?.name ?? 'Kid'} emoji={kid?.emoji} avatarUrl={(kid as any)?.avatarUrl}
                      siblings={allNames} size={46} ringColor={BRAND.teal} ringWidth={2} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: GP.title, fontWeight: '900', color: colors.textPrimary }}>
                        {firstName}
                      </Text>
                      <Text style={{ fontSize: GP.body, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
                        finished "{c.title}"
                      </Text>
                    </View>
                  </View>

                  {/* Big primary action — a cheer with no coins attached. The
                      🎉 here is expressive celebration copy, not chrome — kept. */}
                  <Pressable onPress={() => cheerChore(c.id, active.id)}
                    style={{ borderRadius: 14, paddingVertical: 16, alignItems: 'center', backgroundColor: BRAND.teal }}>
                    <Text style={{ fontSize: GP.title, fontWeight: '900', color: '#fff' }}>🎉 Send a Cheer</Text>
                  </Pressable>

                  {/* Optional coins — spelled out, not a bare number */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[5, 10, 20].map(amt => (
                      <Pressable key={amt}
                        onPress={() => { cheerChore(c.id, active.id, { coins: amt }); if (c.assignedToId) awardCoins(c.assignedToId, amt, 'gpCoins'); }}
                        style={{ flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                          backgroundColor: isDark ? BRAND.amber + '18' : '#FFF8E8',
                          borderWidth: 1.5, borderColor: BRAND.amber + '60' }}>
                        <Text style={{ fontSize: GP.title, fontWeight: '900', color: BRAND.amber }}>+{amt}</Text>
                        <Text style={{ fontSize: GP.tiny, fontWeight: '700', color: BRAND.amber }}>coins</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>
    </View>
  );
}
