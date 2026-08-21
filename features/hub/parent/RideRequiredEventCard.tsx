import { View, Text, Pressable } from 'react-native';
import { Medal, HeartPulse, BookOpen, Calendar, Car, CheckCircle2, HandHelping } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import { fmtTime } from '../hubUtils';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// A non-Ride event (Sports/Study/Medical/etc) that separately flagged
// "needs a ride" (rideRequired) — distinct from RideRequestCard, which only
// ever handles category:'Ride' events using the helper/helperStatus field
// pair. This uses driverName/driverStatus instead, and deliberately shows
// the REAL event title ("Cricket match", not generic "Ride needed") since
// what the event actually is matters when a parent is deciding whether to
// volunteer to drive.
export function RideRequiredEventCard({ ev, active, colors, isDark, updateEvent, updateEventScoped }: {
  ev: FamilyEvent; active: FamilyMember; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  updateEventScoped?: (id: string, patch: Partial<FamilyEvent>, scope: 'this' | 'following' | 'all') => void;
}) {
  const CatIcon = ev.category === 'Sports' ? Medal : ev.category === 'Medical' ? HeartPulse : ev.category === 'Study' ? BookOpen : Calendar;

  // Naming yourself as the driver here IS the "yes, I'm driving this
  // series going forward" moment — propagates to future occurrences the
  // same way RideRequestCard's own "I'll Drive" does for Ride events. A
  // later one-off swap for just one occurrence happens through
  // HelperEventCard's Take-Over action instead, which stays scoped to
  // 'this' only.
  const iDrive = () => {
    const patch = { driverName: active.name, driverStatus: 'confirmed' as const };
    if (ev.seriesId && updateEventScoped) updateEventScoped(ev.id, patch, 'following');
    else updateEvent(ev.id, patch);
  };

  // A parent who can't drive this themselves previously had no path at
  // all — this card offered only "I'll Drive," a dead end. RideRequestCard
  // (the category:'Ride' equivalent) already pairs its own "I'll Drive"
  // with "Open to Helpers"; this mirrors that for the driverName/
  // driverStatus field pair (QA Round 11, High Finding H1). Deliberately
  // NOT scoped to the series — opening just this occurrence to helpers
  // isn't a fixed assignment worth forcing onto every future date, same
  // reasoning RideRequestCard's own openToHelpers already documents.
  const openToHelpers = () => {
    updateEvent(ev.id, { isOpenToGrandparents: true, isOpenToTeens: true, driverName: undefined, driverStatus: undefined });
  };

  return (
    <CollapsibleCard flat accent={colors.warning} colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CatIcon size={16} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.warning }} numberOfLines={1}>
              {ev.title}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.warning, opacity: 0.8 }}>
              {ev.time ? fmtTime(ev.time) : 'time TBD'}{ev.location ? ` · ${ev.location}` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.warning + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Car size={11} color={colors.warning} />
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.warning }}>Needs a ride</Text>
          </View>
        </View>
      }>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={iDrive}
          style={{ flex: 1, backgroundColor: colors.warning, paddingVertical: 11, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <CheckCircle2 size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
        </Pressable>
        <Pressable onPress={openToHelpers}
          style={{ flex: 1, backgroundColor: colors.warning + '20', borderWidth: 1.5, borderColor: colors.warning + '50', paddingVertical: 11, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
          <HandHelping size={14} color={colors.warning} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.warning }}>Open to Helpers</Text>
        </Pressable>
      </View>
    </CollapsibleCard>
  );
}
