import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Cheer kids — today's un-cheered grandkid wins, one Gemini field card each (cream canvas, white shadowed card, slate text).
export function CheerSquadSection({
  kidsCheerable, kids, allNames, colors, isDark,
  cheerChore, active,
}: {
  kidsCheerable: ChoreTask[];
  kids: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  cheerChore: (choreId: string, fromMemberId: string, opts?: { coins?: number; note?: string }) => void;
  active: FamilyMember;
}) {
  const title = isDark ? colors.textPrimary : GEMINI.titleColor;
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  if (kidsCheerable.length === 0) {
    return (
      <View style={{ backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 22, padding: RHYTHM.card, alignItems: 'center', gap: 8, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
        <Text style={{ fontSize: 32 }}>🌱</Text>
        <Text style={{ fontSize: GP.body, fontWeight: '800', color: title, textAlign: 'center' }}>Nothing to cheer yet</Text>
        <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body, textAlign: 'center' }}>When a grandkid finishes a chore today, it shows up here.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: RHYTHM.item }}>
      {kidsCheerable.map(c => (
        <CheerCard key={c.id} chore={c} kid={kids.find(k => k.id === c.assignedToId)}
          allNames={allNames} colors={colors} isDark={isDark} cheerChore={cheerChore} active={active} />
      ))}
    </View>
  );
}

// Coin amount is a SELECTION (not an instant send); "Send a cheer" is the one submit.
function CheerCard({ chore: c, kid, allNames, colors, isDark, cheerChore, active }: {
  chore: ChoreTask; kid: FamilyMember | undefined; allNames: string[]; colors: any; isDark: boolean;
  cheerChore: (choreId: string, fromMemberId: string, opts?: { coins?: number; note?: string }) => void;
  active: FamilyMember;
}) {
  const [selectedAmt, setSelectedAmt] = useState<number | null>(null);
  const firstName = kid?.name?.split(' ')[0] ?? 'They';
  const title = isDark ? colors.textPrimary : GEMINI.titleColor;
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const send = () => cheerChore(c.id, active.id, selectedAmt ? { coins: selectedAmt } : undefined);

  return (
    <View style={{ backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 22, padding: RHYTHM.card, gap: RHYTHM.item, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <FamilyAvatar name={kid?.name ?? 'Kid'} emoji={kid?.emoji} avatarUrl={(kid as any)?.avatarUrl} siblings={allNames} size={46} ringColor={colors.primary} ringWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: GP.title, fontWeight: '800', color: title }}>{firstName}</Text>
          <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body, marginTop: 2 }} numberOfLines={2}>finished "{c.title}"</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[5, 10, 20].map(amt => {
          const sel = selectedAmt === amt;
          return (
            <Pressable key={amt} onPress={() => setSelectedAmt(sel ? null : amt)} accessibilityRole="button" accessibilityLabel={`${amt} coins`}
              style={{ flex: 1, minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                backgroundColor: sel ? colors.primary : (isDark ? colors.surface : GEMINI.surface),
                borderWidth: 1, borderColor: sel ? colors.primary : (isDark ? colors.border : GEMINI.border) }}>
              <Text style={{ fontSize: GP.title, fontWeight: '800', color: sel ? colors.textInverse : title }}>+{amt}</Text>
              <Text style={{ fontSize: GP.tiny, fontWeight: '700', color: sel ? colors.textInverse : body }}>coins</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={send} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52, borderRadius: 14, backgroundColor: colors.primary }}>
        {selectedAmt ? <Check size={18} color={colors.textInverse} /> : <Text style={{ fontSize: GP.title }}>🎉</Text>}
        <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textInverse }}>
          {selectedAmt ? `Send cheer + ${selectedAmt} coins` : 'Send a cheer'}
        </Text>
      </Pressable>
    </View>
  );
}
