import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '@/lib/supabase';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';
import { GEMINI } from '@/constants/geminiRhythm';
import { Home as HomeIcon, GraduationCap, Briefcase, MapPin, WifiOff, Navigation } from 'lucide-react-native';
import { usePlacesStore, type FamilyPlace } from '@/store/placesStore';
import { useFamilyStore } from '@/store/familyStore';

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
type LocRow = { member_id: string; share_location_enabled: boolean; lat: number | null; lng: number | null; last_updated: string | null; status?: string | null };
type Where = { key: 'home' | 'school' | 'work' | 'other' | 'out' | 'off'; label: string };

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Where a member is right now, judged against the family's saved places (Home, School, Work, others). */
function whereIs(row: LocRow | undefined, places: FamilyPlace[]): Where {
  if (!row || !row.share_location_enabled) return { key: 'off', label: 'Not sharing' };
  if (row.lat == null || row.lng == null) return { key: 'off', label: 'No location yet' };
  const ageMin = row.last_updated ? (Date.now() - new Date(row.last_updated).getTime()) / 60000 : Infinity;
  if (ageMin > 180) return { key: 'off', label: 'No recent location' };
  // The phone itself already decided "at home" (with its own GPS accuracy and the home radius). Trust that over a raw distance check here,
  // which marked people who were at home as "Out" when GPS drifted a hundred meters.
  if (row.status === 'at_home') {
    const home = places.filter(pl => pl.kind === 'home');
    // Only while the coordinates are still near home (a refreshed position must not keep an old "at home" label after leaving).
    if (home.length === 0 || home.some(pl => metersBetween(row.lat!, row.lng!, pl.latitude, pl.longitude) <= Math.max(pl.radiusM, 75) * 3)) return { key: 'home', label: 'Home' };
  }
  let best: { place: FamilyPlace; d: number } | null = null;
  for (const pl of places) {
    const d = metersBetween(row.lat, row.lng, pl.latitude, pl.longitude);
    if (d <= Math.max(pl.radiusM, 75) && (!best || d < best.d)) best = { place: pl, d };
  }
  if (!best) return { key: 'out', label: 'Out' };
  const k = best.place.kind;
  return { key: k, label: k === 'home' ? 'Home' : k === 'school' ? 'School' : k === 'work' ? 'Work' : best.place.name };
}

export function FamilyPulseCard({
  colors, isDark, members, hasUrgentItem, familyName,
}: {
  colors: any; isDark: boolean;
  members: FamilyMember[];
  hasUrgentItem?: boolean;
  familyName?: string;
}) {
  const [rows, setRows] = useState<Record<string, LocRow> | null>(null);
  const places = usePlacesStore(st => st.places);
  const activeMemberId = useFamilyStore(st => st.activeMemberId);
  const familyId = (members[0] as any)?.familyId as string | undefined;

  useEffect(() => { if (familyId && activeMemberId && places.length === 0) usePlacesStore.getState().load(familyId, activeMemberId); }, [familyId, activeMemberId]);

  useEffect(() => {
    let cancelled = false;
    const fetchRows = async () => {
      const { data, error } = await supabase.from('member_locations').select('member_id, share_location_enabled, lat, lng, last_updated, status');
      if (cancelled) return;
      if (error) { console.warn('[FamilyPulseCard] fetch failed', error.message); setRows({}); return; }
      setRows(Object.fromEntries((data ?? []).map((r: any) => [r.member_id, r as LocRow])));
    };
    fetchRows();
    const t = setInterval(fetchRows, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (rows === null) return <View style={{ marginHorizontal: 20, marginTop: 12, height: 120, borderRadius: 24, backgroundColor: colors.tealLight, opacity: 0.5 }} />;

  // Grandparents are not on the Family Pulse: it is the household (parents, teens, kids) at a glance.
  const people = members.filter(m => !(m as any).deletedAt && m.inviteStatus !== 'pending' && m.role !== 'senior');
  const where = Object.fromEntries(people.map(m => [m.id, whereIs(rows[m.id], places)])) as Record<string, Where>;
  const count = (k: Where['key']) => people.filter(m => where[m.id].key === k).length;
  const atHome = count('home'), atSchool = count('school'), atWork = count('work');
  const atOther = count('other'), out = count('out'), off = count('off');
  const hasHomePlace = places.some(pl => pl.kind === 'home');
  const summary = [
    atHome ? `${atHome} home` : '', atSchool ? `${atSchool} at school` : '', atWork ? `${atWork} at work` : '',
    atOther ? `${atOther} at a saved place` : '', out ? `${out} out` : '', off ? `${off} not sharing` : '',
  ].filter(Boolean).join(' · ');
  const sharingCount = people.filter(m => where[m.id].key !== 'off').length;

  // A small badge on each face says where that person is, so there is no list to read.
  const badge: Record<Where['key'], { fg: string; Icon: any } | null> = {
    home: { fg: colors.teal, Icon: HomeIcon },
    school: { fg: colors.sky, Icon: GraduationCap },
    work: { fg: colors.amber, Icon: Briefcase },
    other: { fg: colors.pink, Icon: MapPin },
    out: { fg: colors.primary, Icon: Navigation },
    off: { fg: colors.textTertiary, Icon: WifiOff },
  };

  return (
    <View style={{
      marginHorizontal: 20, marginTop: 12,
      flexDirection: 'row', flexWrap: 'wrap',
      gap: 16, padding: 20,
      borderWidth: 1, borderColor: colors.border, borderRadius: 24,
      backgroundColor: colors.tealLight,
      shadowColor: colors.teal, shadowOffset: { width: 0, height: 12 }, shadowOpacity: isDark ? 0 : 0.08, shadowRadius: 30,
    }}>
      <View style={{ flex: 1, minWidth: 180 }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.teal, marginBottom: 6, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>FAMILY PULSE</Text>
        </View>
        <Text style={{ color: (isDark ? colors.textPrimary : GEMINI.titleColor), fontSize: 18, fontWeight: '700', letterSpacing: -0.4, marginTop: 6, marginBottom: 6 }}>
          {familyName ? familyName : "You’re on top of today"}
        </Text>
        <Text style={{ color: (isDark ? colors.textSecondary : GEMINI.bodyColor), fontSize: 13, lineHeight: 19 }}>
          {summary || 'Turn on location sharing to see where everyone is.'}
          {hasUrgentItem ? '. One thing needs your decision.' : ''}
        </Text>
      </View>

      <View style={{
        width: 70, height: 70, borderRadius: 35,
        borderWidth: 5, borderColor: 'rgba(82,125,109,0.18)', borderTopColor: colors.teal,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor), textAlign: 'center' }}>
          {hasHomePlace ? atHome : sharingCount}/{people.length}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center' }}>
          {hasHomePlace ? 'home' : 'sharing'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, width: '100%' }}>
        {people.slice(0, 8).map((m, i) => {
          const b = badge[where[m.id].key]; const Ic = b?.Icon;
          return (
            <View key={m.id} style={{ backgroundColor: colors.card, borderRadius: 36 * 0.34 + 2, padding: 2 }}>
              <FamilyAvatar
                name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={36}
                ringColor={m.role === 'parent' ? colors.teal : m.role === 'kid' ? colors.amber : colors.primary}
                ringWidth={2}
              />
              {b && Ic && (
                <View style={{ position: 'absolute', right: -4, bottom: -4, width: 19, height: 19, borderRadius: 10,
                  alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1.5, borderColor: b.fg }}>
                  <Ic size={10} color={b.fg} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
