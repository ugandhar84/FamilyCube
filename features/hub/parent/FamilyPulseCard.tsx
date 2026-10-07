import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '@/lib/supabase';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';

/**
 * FamilyPulseCard — pixel-faithful rebuild of the Figma Make prototype's
 * `.calm-card` (design/Scrollable Content Design/src/App.tsx lines 139-160,
 * src/index.css lines 165-239): gradient card, headline copy, a presence
 * ring, and a row of overlapping family face avatars with a status line.
 * Exact values transcribed from index.css, not approximated:
 *   - card: grid-template-columns 1fr 70px, gap 16, padding 20,
 *     border 1px #d9e8df, radius 24, background
 *     linear-gradient(145deg, #e8f4ef, #edf2ec), shadow 0 12px 30px rgba(72,94,82,.08)
 *   - ring: 70x70, border 5px rgba(82,125,109,.18) with top #648b7d, radius 50%
 *   - avatars: 32x32, -7px overlap, 3px border #edf3ef
 *
 * Deviation from the mock, by necessity not choice: the ring shows real
 * data from member_locations.share_location_enabled ("N sharing"), not a
 * literal "home" count — this app has no stored family home address/geofence
 * anywhere (checked: familyStore.ts, GpsTab.tsx, every location migration),
 * so there is no real coordinate to test "home" against. Showing "4/5 home"
 * against data that doesn't mean that would be worse than this honest label.
 */
export function FamilyPulseCard({
  colors, isDark, members, hasUrgentItem, familyName,
}: {
  colors: any; isDark: boolean;
  members: FamilyMember[];
  hasUrgentItem?: boolean;
  familyName?: string;
}) {
  const [sharingIds, setSharingIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('member_locations')
        .select('member_id, share_location_enabled');
      if (cancelled) return;
      if (error) { console.warn('[FamilyPulseCard] fetch failed', error.message); setSharingIds(new Set()); return; }
      setSharingIds(new Set((data ?? []).filter((r: any) => r.share_location_enabled).map((r: any) => r.member_id)));
    })();
    return () => { cancelled = true; };
  }, []);

  // Show a low-height placeholder while loading so cards below it still render
  if (sharingIds === null) return <View style={{ marginHorizontal: 20, marginTop: 18, height: 120, borderRadius: 24, backgroundColor: isDark ? colors.card : '#EDF3EF', opacity: 0.5 }} />;

  const sharingCount = members.filter(m => sharingIds.has(m.id)).length;
  const mostRecent = members.find(m => sharingIds.has(m.id));

  return (
    <View style={{
      // CSS margin-collapse note: Figma's siblings use ONE margin-top each
      // (block-level DOM, margins collapse to the larger value) — RN never
      // collapses margins, so only marginTop is set here (no marginBottom)
      // to avoid doubling every inter-card gap versus the Figma source.
      marginHorizontal: 20, marginTop: 18,
      flexDirection: 'row', flexWrap: 'wrap',
      gap: 16, padding: 20,
      borderWidth: 1, borderColor: '#D9E8DF', borderRadius: 24,
      // Pastel intensity bumped per explicit direction ("increase the
      // pastel color intensity lil bit 20%") — was the exact Figma source
      // value #E8F4EF, now a more saturated step toward the same hue.
      backgroundColor: isDark ? colors.card : '#DCEEE7',
      shadowColor: '#485E52', shadowOffset: { width: 0, height: 12 }, shadowOpacity: isDark ? 0 : 0.08, shadowRadius: 30,
    }}>
      <View style={{ flex: 1, minWidth: 180 }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.teal, marginBottom: 6, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>FAMILY PULSE</Text>
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 21, fontWeight: '700', letterSpacing: -0.5, marginTop: 6, marginBottom: 6 }}>
          {familyName ? `Welcome to ${familyName}` : "You’re on top of today"}
        </Text>
        <Text style={{ color: isDark ? colors.textSecondary : '#667168', fontSize: 13, lineHeight: 19 }}>
          {hasUrgentItem
            ? 'Everyone is accounted for. One thing needs your decision.'
            : 'Everyone is accounted for.'}
        </Text>
      </View>

      <View style={{
        width: 70, height: 70, borderRadius: 35,
        borderWidth: 5, borderColor: 'rgba(82,125,109,0.18)', borderTopColor: colors.teal,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' }}>
          {sharingCount}/{members.length}
        </Text>
        <Text style={{ fontSize: 10, color: isDark ? colors.textSecondary : '#6C786F', textAlign: 'center' }}>
          sharing
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        {members.slice(0, 5).map((m, i) => (
          <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -7, borderWidth: 3, borderColor: isDark ? colors.card : '#EDF3EF', borderRadius: 999 }}>
            <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={32} />
          </View>
        ))}
        {mostRecent && (
          <Text style={{ marginLeft: 8, color: isDark ? colors.textSecondary : '#667168', fontSize: 11 }}>
            {mostRecent.name.split(' ')[0]} checked in
          </Text>
        )}
      </View>
    </View>
  );
}
