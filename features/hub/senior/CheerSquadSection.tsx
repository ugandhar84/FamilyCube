import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { PartyPopper, Check } from 'lucide-react-native';
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
            {kidsCheerable.map(c => (
              <CheerCard key={c.id} chore={c} kid={kids.find(k => k.id === c.assignedToId)}
                allNames={allNames} colors={colors} isDark={isDark}
                cheerChore={cheerChore} awardCoins={awardCoins} active={active} />
            ))}
          </View>
        )}
      </SectionCard>
    </View>
  );
}

// Coin amount is a SELECTION, not an instant-submit — tapping +5/+10/+20
// used to fire cheerChore() immediately on tap, so there was no way to
// glance at the amounts without accidentally sending a cheer. Now a chip
// only highlights the chosen amount (or none, for a plain cheer); "Send a
// Cheer" is the one actual submit action, same two-step pattern
// KudosSheet.tsx already uses on the Quests tab.
function CheerCard({ chore: c, kid, allNames, colors, isDark, cheerChore, awardCoins, active }: {
  chore: ChoreTask; kid: FamilyMember | undefined; allNames: string[]; colors: any; isDark: boolean;
  cheerChore: (choreId: string, fromMemberId: string, opts?: { coins?: number; note?: string }) => void;
  awardCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => void;
  active: FamilyMember;
}) {
  const [selectedAmt, setSelectedAmt] = useState<number | null>(null);
  const firstName = kid?.name?.split(' ')[0] ?? 'They';

  const send = () => {
    cheerChore(c.id, active.id, selectedAmt ? { coins: selectedAmt } : undefined);
    if (selectedAmt && c.assignedToId) awardCoins(c.assignedToId, selectedAmt, 'gpCoins');
  };

  return (
    <View style={{
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

      {/* Optional coins — tap just selects the amount, doesn't send anything */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[5, 10, 20].map(amt => {
          const sel = selectedAmt === amt;
          return (
            <Pressable key={amt} onPress={() => setSelectedAmt(sel ? null : amt)}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                backgroundColor: sel ? BRAND.amber : (isDark ? BRAND.amber + '18' : '#FFF8E8'),
                borderWidth: 1.5, borderColor: BRAND.amber + (sel ? '' : '60') }}>
              <Text style={{ fontSize: GP.title, fontWeight: '900', color: sel ? '#fff' : BRAND.amber }}>+{amt}</Text>
              <Text style={{ fontSize: GP.tiny, fontWeight: '700', color: sel ? '#fff' : BRAND.amber }}>coins</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Big primary action — the one actual submit. The 🎉 here is
          expressive celebration copy, not chrome — kept. */}
      <Pressable onPress={send}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          borderRadius: 14, paddingVertical: 16, backgroundColor: BRAND.teal }}>
        {selectedAmt ? <Check size={18} color="#fff" /> : <Text style={{ fontSize: GP.title }}>🎉</Text>}
        <Text style={{ fontSize: GP.title, fontWeight: '900', color: '#fff' }}>
          {selectedAmt ? `Send Cheer + ${selectedAmt} coins` : 'Send a Cheer'}
        </Text>
      </Pressable>
    </View>
  );
}
