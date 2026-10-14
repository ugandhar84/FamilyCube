import { View } from 'react-native';
import { HubTimelineSection } from '../HubTimelineSection';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// "Today" — just HubTimelineSection's own strip now. The check-in tiles
// (I'm Home!/I'm Ready!/Running Late) and Ask Parent that used to live here
// as their own grid moved into KidActionGrid, merged with the old More
// row's tiles into one grid [live direction: "need more simpler like the
// parents" — two separate tile grids back-to-back read as redundant].
export function KidTodaySection({
  active, members, events, updateEvent, colors, isDark,
}: {
  active: FamilyMember; members: FamilyMember[]; events: FamilyEvent[];
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  return (
    // NextUpTimeline (rendered inside HubTimelineSection) hardcodes its own
    // marginHorizontal: 20 / marginTop: 26 for Parent's Hub rhythm — this
    // negative-margin wrapper pulls it back to the 16px horizontal inset /
    // 14px vertical gap used by every other Kid Hub section, without
    // touching NextUpCard.tsx (shared with Parent).
    <View style={{ marginHorizontal: -4, marginTop: -12 }}>
      <HubTimelineSection active={active} members={members} events={events} colors={colors} isDark={isDark} />
    </View>
  );
}
