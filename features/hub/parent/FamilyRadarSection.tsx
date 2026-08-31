/**
 * FamilyRadarSection — compact read-only "where is everyone" list at the
 * bottom of the Parent Hub, right after the Family Leaderboard. Tapping the
 * section header (seeAll) deep-links into the full Radar map in Apps.
 * Reads the same encrypted member_locations rows as GpsTab.tsx — decrypted
 * with the same family chat key so this list shows real addresses, not
 * ciphertext.
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Radio, Battery, Zap } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';
import FamilyAvatar from '@/components/FamilyAvatar';
import { SectionCard } from '../hubComponents';
import type { FamilyMember } from '@/store/familyStore';

interface RadarRow {
  member_id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  battery_level: number | null;
  is_charging: boolean | null;
  last_updated: string;
  share_location_enabled?: boolean;
}

function fmtRelative(iso: string): string {
  try {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return '--'; }
}

export function FamilyRadarSection({ members, colors, isDark }: {
  members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('member_locations')
      .select('member_id, address, lat, lng, battery_level, is_charging, last_updated, share_location_enabled');
    const decrypted = await Promise.all((data ?? []).map(async (r: any) => ({
      ...r, address: r.address ? await decryptLocationText(r.member_id, r.address) : r.address,
    })));
    setRows(decrypted);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // A fixed channel name ('hub_family_radar') collides if this effect
    // ever runs twice before the first subscription's cleanup completes —
    // React Strict Mode's dev-only double-invoke of effects hits this
    // directly, throwing "cannot add postgres_changes callbacks... after
    // subscribe()" the moment a second .on()/.subscribe() targets the same
    // still-active channel. A unique name per mount means two concurrent
    // instances (real or Strict-Mode-doubled) never target the same channel.
    const channelName = `hub_family_radar_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // share_location_enabled === false means an explicit opt-out — the row
  // still exists (last-known data isn't deleted) but must stop reading as
  // "live" here, same gate GpsTab.tsx already applies to its own pin/roster.
  // This section skipped that gate entirely, so someone who turned sharing
  // off kept showing up here with their last address/battery as if current.
  const liveCount = rows.filter(r => r.lat != null && r.lng != null && r.share_location_enabled !== false).length;
  const roster = members
    .map(m => {
      const raw = rows.find(r => r.member_id === m.id);
      const loc = raw && raw.share_location_enabled !== false ? raw : undefined;
      return { member: m, loc };
    })
    .sort((a, b) => (b.loc?.lat != null ? 1 : 0) - (a.loc?.lat != null ? 1 : 0));

  if (loading || members.length === 0) return null;

  return (
    <SectionCard
      icon={<Radio size={16} color={colors.teal} />}
      title="Family Radar"
      accent={colors.teal}
      badge={liveCount} badgeLabel="Live" badgeColor={colors.teal}
      seeAll={() => router.push('/(tabs)/gps' as any)}
      seeAllLabel="Open Map"
      collapsible defaultExpanded={false}
      colors={colors} isDark={isDark}>
      <View style={{ gap: 2 }}>
        {roster.map(({ member, loc }, i) => {
          const isLive = loc?.lat != null && loc?.lng != null;
          const rc = member.role === 'parent' ? colors.parent : member.role === 'senior' ? colors.primary : colors.kid;
          return (
            <View key={member.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingVertical: 9, paddingHorizontal: 10,
              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
            }}>
              <FamilyAvatar name={member.name} emoji={member.emoji} avatarUrl={member.avatarUrl}
                siblings={members.map(m => m.name)} ringColor={rc} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                  {member.name.split(' ')[0]}
                </Text>
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
                  {isLive ? (loc?.address ?? 'Location unavailable') : 'Not sharing location'}
                </Text>
              </View>
              {isLive && (
                <View style={{ alignItems: 'flex-end' }}>
                  {loc?.battery_level != null && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      {loc.is_charging
                        ? <Zap size={10} color={colors.amber} />
                        : <Battery size={10} color={loc.battery_level > 30 ? colors.textTertiary : colors.danger} />}
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700',
                        color: loc.battery_level > 30 ? colors.textTertiary : colors.danger }}>
                        {loc.battery_level}%
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
                    {fmtRelative(loc!.last_updated)}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}
