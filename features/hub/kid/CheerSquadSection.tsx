import { View, Text, Pressable } from 'react-native';
import { PartyPopper, CheckCircle2 } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { KID } from './kidTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

// Money-green — "sibling's win, already paid out" accent, distinct from
// brand teal (used elsewhere for confirmed/assigned state). Not colors.success
// (which IS brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// Today's sibling wins still waiting on a cheer from me — drops off the list
// once cheered (or once the day passes), so this stays a to-do, not a feed.
export function CheerSquadSection({ cheerable, siblingKids, colors, isDark, onCheer }: {
  cheerable: Quest[]; siblingKids: FamilyMember[]; colors: any; isDark: boolean;
  onCheer: (questId: string) => void;
}) {
  if (cheerable.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <View style={{ borderRadius: 18, backgroundColor: colors.card,
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PartyPopper size={17} color={MONEY_GREEN} />
          <Text style={{ fontSize: KID.body, fontWeight: '900', color: colors.textPrimary }}>Cheer Squad</Text>
          <View style={{ backgroundColor: MONEY_GREEN, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
            <Text style={{ fontSize: KID.tiny, fontWeight: '900', color: '#fff' }}>{cheerable.length}</Text>
          </View>
        </View>
        {cheerable.map(q => {
          const sib = siblingKids.find(s => s.id === q.assignedToId);
          return (
            <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14,
              backgroundColor: isDark ? '#052E16' : '#F0FDF4', borderWidth: 1, borderColor: `${MONEY_GREEN}30`, padding: 11 }}>
              <FamilyAvatar name={sib?.name ?? 'Kid'} emoji={sib?.emoji} avatarUrl={(sib as any)?.avatarUrl} size={32}
                ringColor={MONEY_GREEN} ringWidth={0} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>{q.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <CheckCircle2 size={12} color={MONEY_GREEN} />
                  <Text style={{ fontSize: KID.tiny, color: MONEY_GREEN }}>{sib?.name?.split(' ')[0] ?? 'They'} finished it!</Text>
                </View>
              </View>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "Cheer" on "${q.title}" (id=${q.id}) → onCheer("${q.id}") [features/hub/kid/CheerSquadSection.tsx:46]`); onCheer(q.id); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: MONEY_GREEN }}>
                <PartyPopper size={13} color="#fff" />
                <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: '#fff' }}>Cheer</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
