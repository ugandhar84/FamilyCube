import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import LazyImage from '@/components/LazyImage';
import { QRGrid } from '@/features/pet/components/QRGrid';
import { fmtDate } from '@/features/pet/utils';
import { TYPO } from '@/constants/theme';

interface ShareCardProps {
  pet: any;
  ac: string;
  age: string;
  together: string | null;
  vaccineStatus: string;
  vaccineColor: string;
  allergies: { allergen: string; severity: string }[];
  ownerName: string | null;
}

export const ShareCard = React.memo(function ShareCard({
  pet, ac, age, together, vaccineStatus, vaccineColor,
  allergies, ownerName,
}: ShareCardProps) {
  const avatarUrl = pet.avatar_url as string | null;
  const genderVal = pet.gender as string | null;
  const genderLabel = genderVal === 'male' ? 'Male' : genderVal === 'female' ? 'Female' : null;

  const rows: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }[] = [];
  if (pet.breed)            rows.push({ icon: 'ribbon-outline',       label: 'Breed',       value: pet.breed });
  if (pet.color_coat)       rows.push({ icon: 'color-palette-outline', label: 'Coat colour', value: pet.color_coat });
  if (pet.birthday)         rows.push({ icon: 'calendar-outline',     label: 'Birthday',    value: fmtDate(pet.birthday) });
  if (pet.adoption_date)    rows.push({ icon: 'home-outline',         label: 'Homecoming',  value: fmtDate(pet.adoption_date) });
  if (genderLabel)          rows.push({ icon: genderVal === 'male' ? 'male-outline' : 'female-outline',
                                        label: 'Gender',     value: genderLabel + (pet.neutered ? ' · neutered' : '') });
  if (pet.microchip_id)    rows.push({ icon: 'hardware-chip-outline', label: 'Microchip',   value: pet.microchip_id });
  if (pet.insurance_policy) rows.push({ icon: 'shield-outline',       label: 'Insurance',   value: pet.insurance_policy });
  if (pet.diet_type)        rows.push({ icon: 'nutrition-outline',    label: 'Diet',        value: pet.diet_type });

  return (
    <View style={sc.card}>
      {/* Header gradient */}
      <LinearGradient colors={[ac, `${ac}CC`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sc.header}>
        {/* Decorative blobs */}
        <View style={[sc.blob, { width: 160, height: 160, top: -60, right: -40 }]} />
        <View style={[sc.blob, { width: 80, height: 80, bottom: 0, left: 10, opacity: 0.12 }]} />

        {/* Avatar */}
        <View style={sc.avatarRing}>
          {avatarUrl
            ? <LazyImage uri={avatarUrl} style={sc.avatar} resizeMode="cover" />
            : <View style={[sc.avatar, { backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="paw-outline" size={36} color="rgba(255,255,255,0.8)" />
              </View>
          }
        </View>

        <Text style={sc.name}>{pet.name}</Text>
        <Text style={sc.sub}>
          {pet.species ? (pet.species as string).charAt(0).toUpperCase() + (pet.species as string).slice(1) : ''}
          {pet.breed ? ` · ${pet.breed}` : ''}
        </Text>
        {age ? <Text style={sc.age}>{age}</Text> : null}

        {/* Pills */}
        <View style={sc.pillRow}>
          {together && (
            <View style={sc.pill}>
              <Ionicons name="heart" size={10} color={ac} />
              <Text style={[sc.pillText, { color: ac }]}>{together}</Text>
            </View>
          )}
          <View style={sc.pill}>
            <Ionicons name="shield-checkmark" size={10} color={vaccineColor} />
            <Text style={[sc.pillText, { color: vaccineColor }]}>{vaccineStatus}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Details grid */}
      <View style={sc.body}>
        {rows.map((r, i) => (
          <View key={r.label} style={[sc.row, i > 0 && sc.rowBorder]}>
            <View style={[sc.rowIcon, { backgroundColor: `${ac}14` }]}>
              <Ionicons name={r.icon} size={13} color={ac} />
            </View>
            <Text style={sc.rowLabel}>{r.label}</Text>
            <Text style={sc.rowValue} numberOfLines={1}>{r.value}</Text>
          </View>
        ))}

        {/* Allergies warning */}
        {allergies.length > 0 && (
          <View style={[sc.row, sc.rowBorder]}>
            <View style={[sc.rowIcon, { backgroundColor: '#FEF3C710' }]}>
              <Ionicons name="warning-outline" size={13} color="#F59E0B" />
            </View>
            <Text style={sc.rowLabel}>Allergies</Text>
            <Text style={[sc.rowValue, { color: '#F59E0B' }]} numberOfLines={1}>
              {allergies.map(a => a.allergen).join(', ')}
            </Text>
          </View>
        )}
      </View>

      {/* QR + footer */}
      <View style={[sc.qrRow, { borderTopColor: `${ac}18`, backgroundColor: `${ac}07` }]}>
        <QRGrid value={`https://pawbond.app/pet/${pet.id}`} size={64} color={ac} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="paw-outline" size={13} color={ac} />
            <Text style={[sc.footerApp, { color: ac }]}>PawBond</Text>
          </View>
          {ownerName && <Text style={sc.footerOwner}>by {ownerName}</Text>}
          <View style={[sc.privacyBadge, { backgroundColor: `${ac}10`, borderColor: `${ac}28` }]}>
            <Ionicons name="lock-closed-outline" size={9} color={ac} />
            <Text style={[sc.privacyText, { color: ac }]}>Scan to view full passport</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const sc = StyleSheet.create({
  card:       { width: 340, backgroundColor: '#fff', borderRadius: 24, overflow: 'hidden' },
  blob:       { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  header:     { paddingTop: 28, paddingBottom: 20, paddingHorizontal: 20, alignItems: 'center', overflow: 'hidden' },
  avatarRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 3,
                borderColor: 'rgba(255,255,255,0.6)', padding: 3, marginBottom: 12,
                shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  avatar:     { width: '100%', height: '100%', borderRadius: 38 },
  name:       { fontSize: TYPO.hero, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  sub:        { fontSize: TYPO.body, color: 'rgba(255,255,255,0.82)', marginTop: 3, fontWeight: '500' },
  age:        { fontSize: TYPO.body, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  pillRow:    { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' },
  pill:       { flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)' },
  pillText:   { fontSize: TYPO.body, fontWeight: '700' },
  body:       { backgroundColor: '#fff' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingVertical: 10 },
  rowBorder:  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F1F5F9' },
  rowIcon:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { fontSize: TYPO.body, color: '#94A3B8', width: 82 },
  rowValue:   { flex: 1, fontSize: TYPO.body, fontWeight: '600', color: '#1E293B', textAlign: 'right' },
  qrRow:      { flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1 },
  footerApp:  { fontSize: TYPO.body, fontWeight: '800' },
  footerOwner:{ fontSize: TYPO.body, color: '#64748B', fontWeight: '500' },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6,
                  borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  privacyText:  { fontSize: TYPO.body, fontWeight: '600' },
});
