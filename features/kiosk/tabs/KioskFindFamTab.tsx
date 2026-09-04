/**
 * KioskFindFamTab — read-only family location roster for kiosk mode (no map
 * SDK view here, just a clear status list — the phone's GpsScreen owns the
 * actual map component). Reads the same `member_locations` table GpsTab.tsx
 * reads, with the same fetch-on-mount + realtime-refetch-on-change pattern,
 * kept fully independent of that screen's file.
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { MapPin, BatteryLow } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';
import type { FamilyMember } from '@/store/familyStore';

interface MemberLocation {
  member_id: string;
  address: string | null;
  neighborhood: string | null;
  status: 'at_home' | 'at_school' | 'at_work' | 'in_transit' | 'at_activity';
  status_text: string | null;
  battery_level: number | null;
  last_updated: string;
  share_location_enabled?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  at_home: 'At home',
  at_school: 'At school',
  at_work: 'At work',
  in_transit: 'On the move',
  at_activity: 'At an activity',
};

export function KioskFindFamTab({ members, colors, isDark }: {
  members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('member_locations').select('*');
    setLoading(false);
    if (data) {
      // Decrypt address/neighborhood (per-device envelope, same as every
      // other member_locations reader) — this was rendering raw ciphertext
      // directly on the kiosk screen, the one surface here that skipped
      // decryptLocationText entirely.
      const decrypted = await Promise.all((data as any[]).map(async (r) => ({
        ...r,
        address: r.address ? await decryptLocationText(r.member_id, r.address) : r.address,
        neighborhood: r.neighborhood ? await decryptLocationText(r.member_id, r.neighborhood) : r.neighborhood,
      })));
      setLocations(decrypted as MemberLocation[]);
    }
  }, []);

  useEffect(() => {
    load();
    const channelName = `kiosk_member_locations_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const locFor = (id: string) => locations.find(l => l.member_id === id);

  return (
    <View style={s.root}>
      <Text style={[s.title, { color: colors.textPrimary }]}>Find Family</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        {members.map(m => {
          const rawLoc = locFor(m.id);
          // A member who explicitly turned "Share my location" off still
          // has a member_locations row (last-known data isn't deleted) —
          // GpsTab.tsx already gates its own "isLive" state on this same
          // flag so the pin/roster stop reading as current the instant
          // sharing is off; this kiosk view read the row unconditionally,
          // so it kept showing someone's last status/battery/neighborhood
          // as if it were live even after they opted out.
          const loc = rawLoc && rawLoc.share_location_enabled !== false ? rawLoc : null;
          return (
            <View key={m.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.avatar, { backgroundColor: colors.primaryLight }]}>
                <Text style={s.avatarEmoji}>{m.emoji ?? '👤'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>{m.name}</Text>
                {loc ? (
                  <>
                    <View style={s.metaRow}>
                      <MapPin size={12} color={colors.teal} />
                      <Text style={[s.status, { color: colors.teal }]} numberOfLines={1}>
                        {loc.status_text || STATUS_LABEL[loc.status] || 'Unknown'}
                      </Text>
                    </View>
                    {!!loc.neighborhood && (
                      <Text style={[s.addr, { color: colors.textSecondary }]} numberOfLines={1}>{loc.neighborhood}</Text>
                    )}
                    {loc.battery_level != null && loc.battery_level <= 20 && (
                      <View style={s.metaRow}>
                        <BatteryLow size={12} color={colors.danger} />
                        <Text style={[s.lowBattery, { color: colors.danger }]}>{loc.battery_level}%</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={[s.addr, { color: colors.textTertiary }]}>Location not shared</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, width: 300, borderRadius: 16, borderWidth: 1, padding: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 22 },
  name: { fontSize: TYPO.body, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  status: { fontSize: 12, fontWeight: '700' },
  addr: { fontSize: 11.5, fontWeight: '600', marginTop: 3 },
  lowBattery: { fontSize: 11, fontWeight: '800' },
});
