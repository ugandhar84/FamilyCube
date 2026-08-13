import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Radio, MapPin, Battery, Zap, Signal, RefreshCw, Navigation, Check, ChevronDown } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { SCard, CardHeader, StatusPill, MemberAvatar, BRAND } from './shared';

type LocStatus = 'at_home' | 'at_school' | 'at_work' | 'in_transit' | 'at_activity';

interface MemberLocation {
  member_id: string;
  address: string;
  neighborhood: string;
  battery_level: number;
  is_charging: boolean;
  speed_mph: number;
  status: LocStatus;
  status_text: string | null;
  distance_from_home_miles: number;
  safe_zone_name: string | null;
  last_updated: string;
  // joined
  name: string;
  role: string;
}

const STATUS_LABELS: Record<LocStatus, string> = {
  at_home:     'Home',
  at_school:   'School',
  at_work:     'Work',
  in_transit:  'In Transit',
  at_activity: 'Activity',
};

const STATUS_COLORS: Record<LocStatus, string> = {
  at_home:     BRAND.teal,
  at_school:   BRAND.blue,
  at_work:     BRAND.purple,
  in_transit:  BRAND.amber,
  at_activity: BRAND.emerald,
};

const RADAR_POSITIONS = [
  { top: 18,  left: 18 },
  { top: 18,  right: 22 },
  { top: '42%' as any, left: '36%' as any },
  { bottom: 22, right: 18 },
  { bottom: 26, left: 26 },
];

export default function GpsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const [locations, setLocations]   = useState<MemberLocation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<string | null>(null); // member_id whose picker is open

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('member_locations').select('*');
    if (data) {
      const merged: MemberLocation[] = data.map((loc: any) => {
        const m = members.find(mb => mb.id === loc.member_id);
        return { ...loc, name: m?.name ?? loc.member_id, role: m?.role ?? 'parent' };
      });
      // Seed rows for any member without a location
      const missing = members.filter(m => !data.some((d: any) => d.member_id === m.id));
      for (const m of missing) {
        merged.push({
          member_id: m.id, name: m.name, role: m.role,
          address: 'Unknown', neighborhood: 'Unknown',
          battery_level: 100, is_charging: false, speed_mph: 0,
          status: 'at_home', status_text: null,
          distance_from_home_miles: 0, safe_zone_name: 'Home',
          last_updated: new Date().toISOString(),
        });
      }
      setLocations(merged);
    }
    setLoading(false);
  }, [members]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (memberId: string, status: LocStatus) => {
    setUpdatingId(memberId);
    setOpenPicker(null);
    const statusText = STATUS_LABELS[status];
    const { error } = await supabase.from('member_locations').upsert({
      member_id: memberId, status, status_text: statusText,
      last_updated: new Date().toISOString(),
      address: statusText, neighborhood: statusText,
    }, { onConflict: 'member_id' });
    if (!error) {
      setLocations(prev => prev.map(l =>
        l.member_id === memberId ? { ...l, status, status_text: statusText } : l
      ));
    }
    setUpdatingId(null);
  };

  const roleColor = (role: string) =>
    role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.blue : BRAND.emerald;

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '--'; }
  };

  if (loading) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={Radio} iconColor={BRAND.teal} title="Household Safety Radar"
        badge="Loading…" badgeColor={BRAND.teal} colors={colors} />
      <ActivityIndicator color={BRAND.teal} style={{ marginTop: 24, marginBottom: 24 }} />
    </SCard>
  );

  return (
    <>
      <SCard colors={colors} isDark={isDark}>
        <View style={g.headerRow}>
          <CardHeader Icon={Radio} iconColor={BRAND.teal} title="Household Safety Radar"
            badge="Live" badgeColor={BRAND.teal} colors={colors} />
          <TouchableOpacity onPress={load} style={g.refreshBtn}>
            <RefreshCw size={15} color={BRAND.teal} />
          </TouchableOpacity>
        </View>

        {/* Radar canvas */}
        <View style={g.radarMap}>
          <View style={[g.radarRing, { width: 210, height: 210, borderColor: BRAND.teal + '18' }]} />
          <View style={[g.radarRing, { width: 140, height: 140, borderColor: BRAND.teal + '28' }]} />
          <View style={[g.radarRing, { width:  70, height:  70, borderColor: BRAND.teal + '45' }]} />
          <View style={g.radarCrossH} />
          <View style={g.radarCrossV} />

          {locations.slice(0, 5).map((loc, i) => {
            const rc = roleColor(loc.role);
            const sc = STATUS_COLORS[loc.status] ?? BRAND.teal;
            return (
              <View key={loc.member_id} style={[g.radarPin, RADAR_POSITIONS[i]]}>
                <View style={[g.radarPinDot, { borderColor: sc, backgroundColor: sc + '30' }]}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: rc }}>
                    {loc.name.charAt(0)}
                  </Text>
                </View>
                <View style={g.radarPinLabel}>
                  <Text style={g.radarPinName}>{loc.name.split(' ')[0]}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    {loc.is_charging
                      ? <Zap size={7} color={BRAND.amber} />
                      : <Battery size={7} color={loc.battery_level > 30 ? BRAND.teal : BRAND.rose} />}
                    <Text style={[g.radarPinBatt, {
                      color: loc.battery_level > 30 ? BRAND.teal : BRAND.rose }]}>
                      {loc.battery_level}%
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          <View style={g.radarFootnoteRow}>
            <Signal size={9} color={BRAND.teal + 'AA'} />
            <Text style={g.radarFootnote}>GPS Active · {locations.length} tracked</Text>
          </View>
        </View>
      </SCard>

      {/* Telemetry cards */}
      {locations.map(loc => {
        const rc  = roleColor(loc.role);
        const sc  = STATUS_COLORS[loc.status] ?? BRAND.teal;
        const isMe = loc.member_id === activeMemberId;
        const isParent = activeMember?.role === 'parent';
        const canEdit = isMe || isParent;
        const isUpdating = updatingId === loc.member_id;

        return (
          <SCard key={loc.member_id} colors={colors} isDark={isDark}>
            <View style={g.telRow}>
              <MemberAvatar name={loc.name} color={rc} size={42} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                  {loc.name}
                  {isMe && <Text style={{ fontSize: 11, color: BRAND.purple }}> (you)</Text>}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <MapPin size={11} color={sc} />
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {loc.status_text ?? STATUS_LABELS[loc.status]}
                    {loc.distance_from_home_miles > 0
                      ? ` · ${loc.distance_from_home_miles.toFixed(1)} mi`
                      : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
                  Updated {fmtTime(loc.last_updated)}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <StatusPill label={STATUS_LABELS[loc.status]} color={sc} Icon={Check} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  {loc.is_charging
                    ? <Zap size={11} color={BRAND.amber} />
                    : <Battery size={11} color={loc.battery_level > 30 ? BRAND.teal : BRAND.rose} />}
                  <Text style={{ fontSize: 11, fontWeight: '700',
                    color: loc.battery_level > 30 ? BRAND.teal : BRAND.rose }}>
                    {loc.battery_level}%
                  </Text>
                </View>
              </View>
            </View>

            {/* Status picker — only for self or if parent */}
            {canEdit && (
              <View style={{ marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => setOpenPicker(openPicker === loc.member_id ? null : loc.member_id)}
                  style={[g.pickerToggle, { borderColor: sc + '50', backgroundColor: sc + '10' }]}>
                  <Navigation size={13} color={sc} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: sc, flex: 1, marginLeft: 6 }}>
                    Update Status
                  </Text>
                  {isUpdating
                    ? <ActivityIndicator size="small" color={sc} />
                    : <ChevronDown size={14} color={sc} />}
                </TouchableOpacity>

                {openPicker === loc.member_id && (
                  <View style={[g.pickerMenu, {
                    backgroundColor: isDark ? colors.surface : '#F5F3FF',
                    borderColor: colors.border,
                  }]}>
                    {(Object.keys(STATUS_LABELS) as LocStatus[]).map(st => (
                      <TouchableOpacity
                        key={st}
                        onPress={() => updateStatus(loc.member_id, st)}
                        style={[g.pickerItem, {
                          backgroundColor: loc.status === st ? STATUS_COLORS[st] + '20' : 'transparent',
                          borderColor: loc.status === st ? STATUS_COLORS[st] + '50' : 'transparent',
                        }]}>
                        <View style={[g.statusDot, { backgroundColor: STATUS_COLORS[st] }]} />
                        <Text style={{ fontSize: 13, fontWeight: loc.status === st ? '800' : '600',
                          color: loc.status === st ? STATUS_COLORS[st] : colors.textSecondary }}>
                          {STATUS_LABELS[st]}
                        </Text>
                        {loc.status === st && <Check size={13} color={STATUS_COLORS[st]} style={{ marginLeft: 'auto' as any }} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </SCard>
        );
      })}
    </>
  );
}

const g = StyleSheet.create({
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn:   { padding: 6, borderRadius: 10, borderWidth: 1, borderColor: BRAND.teal + '40',
                  backgroundColor: BRAND.teal + '10' },
  radarMap:     { height: 190, borderRadius: 18, marginVertical: 14, backgroundColor: '#030712',
                  borderWidth: 1, borderColor: '#14B8A620', position: 'relative',
                  overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  radarRing:    { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  radarCrossH:  { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth,
                  backgroundColor: '#14B8A618', top: '50%' },
  radarCrossV:  { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth,
                  backgroundColor: '#14B8A618', left: '50%' },
  radarPin:     { position: 'absolute', alignItems: 'center' },
  radarPinDot:  { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5,
                  alignItems: 'center', justifyContent: 'center' },
  radarPinLabel:{ backgroundColor: 'rgba(15,23,42,0.88)', borderRadius: 7,
                  paddingHorizontal: 5, paddingVertical: 2, marginTop: 3, alignItems: 'center' },
  radarPinName: { fontSize: 8, fontWeight: '800', color: '#fff' },
  radarPinBatt: { fontSize: 7, fontWeight: '700' },
  radarFootnoteRow: { position: 'absolute', bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  radarFootnote:{ fontSize: 9, color: '#14B8A680', fontWeight: '700' },

  telRow:       { flexDirection: 'row', alignItems: 'flex-start' },
  pickerToggle: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
                  paddingHorizontal: 12, paddingVertical: 8 },
  pickerMenu:   { borderRadius: 14, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  pickerItem:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
                  borderRadius: 10, margin: 4, borderWidth: 1 },
  statusDot:    { width: 8, height: 8, borderRadius: 4 },
});
