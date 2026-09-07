/**
 * KioskGroceryPresenceStrip — kiosk-native, WATCH-ONLY port of
 * features/grocery/components/PartnerStatusBar.tsx: shows "Priya is
 * shopping at Costco" (or "is online") when a phone user currently has
 * the grocery screen open, via the same Supabase presence channel
 * (grocery_presence:{familyId}).
 *
 * Live-asked: "does the kiosk person see other person is live in
 * shopping?" — no, this is a separate, ephemeral feature from the
 * "Shopping now at {store}" run-status banner already on this screen
 * (that one reflects a created GroceryRun with status:'active',
 * independent of whether anyone currently has the app open; this one is
 * pure presence — who has the grocery screen open RIGHT NOW, regardless
 * of whether they ever started a run).
 *
 * Confirmed choice: kiosk only WATCHES this channel, it never calls
 * channel.track() to announce its own presence. A kiosk is an always-on
 * shared device — if it joined fully, it would show up as permanently
 * "online" to every phone user checking this strip, which defeats the
 * point of an ephemeral "someone is right now looking at this" signal.
 * subscribe-only + presence 'sync' listening is enough to READ who else
 * is present without adding kiosk itself to that roster.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';

interface PresencePayload {
  memberId: string;
  name: string;
  store?: string;
}

export function KioskGroceryPresenceStrip({ familyId, excludeMemberId }: {
  familyId?: string;
  // The kiosk's own active member id is excluded from the roster too —
  // if that same person also has the phone screen open, kiosk showing
  // "you are online" about the very person standing at it reads as
  // noise, not signal. Real phone-open presence from anyone ELSE in the
  // family still shows.
  excludeMemberId?: string;
}) {
  const { k, isDark } = useKioskColors();
  const [online, setOnline] = useState<PresencePayload[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!familyId) return;
    const channel = supabase.channel(`grocery_presence:${familyId}`);
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>();
        const others = Object.values(state)
          .flatMap(presences => presences)
          .filter(p => p.memberId !== excludeMemberId)
          .slice(0, 3);
        setOnline(others);
      })
      .subscribe();
    // No channel.track() call — watch-only, kiosk never announces its
    // own presence on this channel. See file header.
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyId, excludeMemberId]);

  if (online.length === 0) return null;

  return (
    <View style={[s.bar, { backgroundColor: k.sage + (isDark ? '1F' : '14'), borderColor: k.sage + '40' }]}>
      <View style={[s.dot, { backgroundColor: k.sage }]} />
      <Text style={[s.text, { color: k.sage }]} numberOfLines={1}>
        {online.map(p => {
          const firstName = p.name?.split(' ')[0] ?? 'Someone';
          return p.store ? `${firstName} is shopping at ${p.store}` : `${firstName} is online`;
        }).join(' · ')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, fontSize: 12, fontWeight: '700' },
});
