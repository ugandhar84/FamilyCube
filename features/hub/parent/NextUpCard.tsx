import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { fmtTime } from '../hubUtils';
import { MapPin } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';

// Opens the platform's own Maps app for an address — Apple Maps on iOS,
// Google Maps (or whatever the device has registered) on Android.
function openInMaps(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === 'ios' ? `maps:0,0?q=${q}` : `geo:0,0?q=${q}`;
  Linking.openURL(url).catch(() => {
    // Fall back to the web Maps URL if no native maps app handles the
    // scheme (e.g. iOS Simulator with no Maps app signed in).
    Linking.openURL(`https://maps.google.com/?q=${q}`);
  });
}

/**
 * NextUpTimeline — pixel-faithful rebuild of the Figma Make prototype's
 * "NEXT UP" section (design/Scrollable Content Design/src/App.tsx lines
 * 177-220, src/index.css lines 304-385): a section-title row ("NEXT UP" /
 * "Your afternoon" / "Full day" link) above a white card listing up to 3
 * events as time + colored dot + title/detail + arrow rows.
 *
 * Was built as a single-event card in an earlier pass — the actual source
 * is a short multi-item timeline, not one card. Rebuilt to match: up to 3
 * upcoming events, each gets one of the 3 dot colors the mock cycles
 * through (periwinkle/mint/peach — colors.pink/teal/amber), in order.
 *
 * Exact values transcribed from index.css: row grid-template-columns
 * 42px 10px 1fr 20px, min-height 72, border-bottom 1px #ecebf0 (last row
 * none); dot 9x9 circle; card radius 22, shadow 0 7px 24px rgba(44,50,68,.055).
 */
// Pulls just the street name out of a full address string — "123 Maple
// Street, Austin, TX 78701" → "Maple Street" — so a ride row reads as a
// quick destination glance instead of a long address the row has no room
// to show in full. Drops a leading house number, keeps everything up to
// the first comma (city/state/zip).
function streetNameOnly(addr: string): string {
  const firstPart = addr.split(',')[0]?.trim() ?? addr;
  return firstPart.replace(/^\d+\s*/, '').trim() || firstPart;
}

export function NextUpTimeline({
  colors, isDark, events, conflictReasons,
}: {
  colors: any; isDark: boolean;
  // Up to 3 upcoming events today, already sorted by the caller.
  events: FamilyEvent[];
  conflictReasons?: Map<string, string>;
}) {
  const shown = events.slice(0, 3);
  const dotColors = [colors.pink, colors.teal, colors.amber];
  const { selectDate } = useEventStore();
  const members = useFamilyStore(s => s.members);

  function goToSchedule(ev?: FamilyEvent) {
    // Was routing to the stale standalone /calendar route (a separate,
    // unused full-page screen with its own header outside the real 5-tab
    // bar) instead of the Tasks tab's embedded Schedule segment, which is
    // where the app's actual calendar lives today — landed on a page the
    // user doesn't otherwise navigate to, looking like a broken "new page."
    if (ev) selectDate(ev.date);
    useUIStore.getState().setRequestedTasksSegment('schedule');
    // Tapping a specific event should open its own detail page directly,
    // not just land on Schedule's default day view and make the user find
    // and tap it again themselves.
    if (ev) useUIStore.getState().setRequestedEventDetailId(ev.id);
    router.push('/(tabs)/tasks' as any);
  }

  // Was hardcoded to "Your afternoon" regardless of actual time of day —
  // this label itself has no device-clock dependency (unlike the greeting
  // text elsewhere, which reads a live clock correctly already); it's a
  // plain string bug, always wrong outside the afternoon.
  const h = new Date().getHours();
  const todayLabel = h < 12 ? 'Your morning' : h < 17 ? 'Your afternoon' : 'Your evening';
  // Same bug, second occurrence: the empty-state copy below hardcoded
  // "afternoon" too — e.g. in the morning it read "Nothing scheduled —
  // enjoy the clear afternoon", which doesn't match the heading above it.
  const periodWord = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';

  return (
    <View style={{ marginHorizontal: 20, marginTop: 26 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <View style={{ alignSelf: 'flex-start' }}>
            <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.pink, marginBottom: 6, opacity: 0.6 }} />
            <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>NEXT UP</Text>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '400', letterSpacing: -0.5, marginTop: 4 }}>
            {todayLabel}
          </Text>
        </View>
        <Pressable onPress={() => goToSchedule()}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Full day →</Text>
        </Pressable>
      </View>

      <View style={{
        marginTop: 11,
        paddingHorizontal: 16, paddingVertical: shown.length === 0 ? 18 : 5, borderRadius: 22,
        backgroundColor: colors.card,
        borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
        shadowColor: colors.navy, shadowOffset: { width: 0, height: 7 }, shadowOpacity: isDark ? 0 : 0.055, shadowRadius: 24,
      }}>
        {shown.length === 0 ? (
          <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center' }}>Nothing scheduled — enjoy the clear {periodWord}</Text>
        ) : shown.map((ev, i) => {
          // Who's involved — attendees (memberIds/memberId) plus a
          // driver/helper if this is a ride/escort-type event. Previously
          // nothing here at all: the row showed only title + location
          // text, with no avatars and no indication of who the event
          // actually concerns — a parent had to tap in just to see that.
          const attendeeIds = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
          const attendees = attendeeIds.map(id => members.find(m => m.id === id)).filter(Boolean) as typeof members;
          const assignee = eventAssignee(ev);
          const assigneeMember = assignee.id ? members.find(m => m.id === assignee.id) : undefined;
          const avatarPeople = [
            ...attendees,
            ...(assigneeMember && !attendees.some(a => a.id === assigneeMember.id) ? [assigneeMember] : []),
          ].slice(0, 3);

          // Leg-aware address: a Pick-up leg (its own event, title-tagged
          // "Pick-up · …" by the create/edit flow) is about the FROM
          // address — where the driver is heading to pick someone up — so
          // it must show pickupLocation, not dropLocation. Every other
          // event (the drop-off leg, or a plain non-ride event) is about
          // the TO/destination address, so dropLocation takes priority.
          // Previously both legs always preferred dropLocation regardless,
          // so a pick-up leg displayed its destination's address instead of
          // where it was actually picking up from.
          const isPickupLeg = ev.title.toLowerCase().startsWith('pick-up');
          const rawAddress = isPickupLeg
            ? (ev.pickupLocation || ev.dropLocation || ev.location)
            : (ev.dropLocation || ev.pickupLocation || ev.location);
          // A full street address doesn't fit this row, so show just the
          // street name ("Maple Street" rather than "123 Maple Street,
          // Austin, TX 78701") — but keep the full address for the Maps tap.
          const displayLocation = rawAddress ? streetNameOnly(rawAddress) : undefined;
          // No address set at all (not a display bug — the event just has
          // none) for a category where one is actually relevant — show a
          // tappable prompt instead of silently omitting the row, same
          // empty state EventDetailScreen now shows.
          const wantsAddress = !displayLocation && !conflictReasons?.get(ev.id) &&
            (ev.category === 'Ride' || ev.category === 'Sports' || ev.category === 'School' || ev.category === 'Medical' || ev.rideRequired);

          return (
          <AnimatedPressable
            key={ev.id}
            onPress={() => goToSchedule(ev)}
            style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              minHeight: 72, paddingVertical: 10,
              borderBottomWidth: i === shown.length - 1 ? 0 : 1,
              borderBottomColor: colors.border,
            }}
          >
            {/* Raw "HH:MM" violated the app's non-negotiable 12h-format rule
                (CLAUDE.md §9) — every other time display in the app uses
                fmtTime; this card was the one outlier still showing "14:00"
                style strings. */}
            <Text style={{ width: 42, color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{fmtTime(ev.time)}</Text>
            <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: dotColors[i % 3], marginTop: 6 }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '400' }} numberOfLines={1}>
                {ev.title}
              </Text>
              {displayLocation && !conflictReasons?.get(ev.id) ? (
                // Address itself opens Maps directly — previously just
                // plain text, no way to actually navigate there without
                // first opening the full event detail page.
                <Pressable onPress={() => openInMaps(rawAddress!)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <MapPin size={11} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 11, flex: 1, textDecorationLine: 'underline' }} numberOfLines={1}>
                    {displayLocation}
                  </Text>
                </Pressable>
              ) : conflictReasons?.get(ev.id) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <MapPin size={11} color={colors.textTertiary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 11, flex: 1 }} numberOfLines={1}>
                    {conflictReasons.get(ev.id)}
                  </Text>
                </View>
              ) : wantsAddress ? (
                <Pressable onPress={() => goToSchedule(ev)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <MapPin size={11} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>+ Add address</Text>
                </Pressable>
              ) : null}
              {avatarPeople.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                  {avatarPeople.map((m, idx) => (
                    <View key={m.id} style={{ marginLeft: idx === 0 ? 0 : -8 }}>
                      <FamilyAvatar name={m.name} emoji={(m as any).emoji} avatarUrl={(m as any).avatarUrl}
                        size={20} ringColor={colors.card} ringWidth={2} />
                    </View>
                  ))}
                  <Text style={{ fontSize: 10, color: colors.textTertiary, marginLeft: 5 }} numberOfLines={1}>
                    {avatarPeople.map(m => m.name.split(' ')[0]).join(', ')}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: colors.primary, marginTop: 2 }}>→</Text>
          </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}
