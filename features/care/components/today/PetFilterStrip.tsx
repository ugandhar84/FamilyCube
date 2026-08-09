import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import type { Pet } from '@/lib/types';
import { careProgressColor } from '@/lib/careProgress';
import { TYPO } from '@/constants/theme';

const RING_R = 31, RING_SZ = 70, RING_C2 = 2 * Math.PI * RING_R;

interface Props {
  pets: Pet[];
  filterIds: Set<string>;
  petCompletion: Record<string, number>;
  hasUrgent: (petId: string) => boolean;
  petColor: (p: Pet) => string;
  onToggle: (petId: string) => void;
  onAddPet: () => void;
  colors: any;
}

export default function PetFilterStrip({
  pets, filterIds, petCompletion, hasUrgent, petColor, onToggle, onAddPet, colors,
}: Props) {
  const multiPet = pets.length > 1;

  return (
    <View style={s.stripOuter}>
      {multiPet && (
        <Text style={[s.filterHint, { color: colors.textSecondary }]}>Tap to filter</Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        contentContainerStyle={s.stripRow}>
        {pets.map((pet) => {
          const pct  = petCompletion[pet.id] ?? 0;
          const pc   = petColor(pet);
          const sel  = filterIds.has(pet.id);
          return (
            <TouchableOpacity key={pet.id} onPress={() => onToggle(pet.id)}
              activeOpacity={0.6}
              style={[s.filterChip, {
                backgroundColor: sel ? pc + '12' : colors.card,
                borderColor: sel ? pc : colors.border,
                borderWidth: sel ? 1.5 : StyleSheet.hairlineWidth,
                opacity: sel ? 1 : 0.45,
              }]}>
              <View style={{ width: RING_SZ, height: RING_SZ }}>
                <Svg width={RING_SZ} height={RING_SZ} style={{ position: 'absolute' }}>
                  <Circle cx={RING_SZ/2} cy={RING_SZ/2} r={RING_R} stroke={colors.border} strokeWidth={5} fill="none" />
                  <Circle cx={RING_SZ/2} cy={RING_SZ/2} r={RING_R}
                    stroke={careProgressColor(pct)} strokeWidth={5} fill="none"
                    strokeDasharray={`${RING_C2}`}
                    strokeDashoffset={RING_C2 * (1 - pct / 100)}
                    strokeLinecap="round"
                    rotation={-90} origin={`${RING_SZ/2},${RING_SZ/2}`}
                  />
                </Svg>
                <View style={s.avatarInner}>
                  {(pet as any).avatar_url
                    ? <Image source={{ uri: (pet as any).avatar_url }} style={s.petAvatar} />
                    : <Text style={s.petEmoji}>{(pet as any).emoji ?? '🐾'}</Text>}
                </View>
                <View style={[s.pctBadge, { backgroundColor: careProgressColor(pct) }]}>
                  <Text style={s.pctBadgeText}>{pct}%</Text>
                </View>
                {hasUrgent(pet.id) && sel && (
                  <View style={[s.urgentDot, { backgroundColor: colors.danger }]} />
                )}
              </View>
              <Text style={[s.chipName, { color: sel ? pc : colors.textSecondary }]} numberOfLines={1}>
                {pet.name}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Add baby chip */}
        <TouchableOpacity
          onPress={onAddPet}
          activeOpacity={0.7}
          style={[s.filterChip, s.addChip, { borderColor: colors.border }]}>
          <View style={[s.addRing, { borderColor: colors.border }]}>
            <Ionicons name="add" size={22} color={colors.textSecondary} />
          </View>
          <Text style={[s.chipName, { color: colors.textSecondary }]}>Add baby</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  stripOuter:  { paddingTop: 14, paddingBottom: 10 },
  filterHint:  { fontSize: TYPO.label, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 8 },
  stripRow:    { gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  filterChip:  { alignItems: 'center', borderRadius: 18, padding: 10, gap: 4, minWidth: 78 },
  addChip:     { borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: 'transparent', opacity: 0.7 },
  addRing:     { width: RING_SZ, height: RING_SZ, borderRadius: RING_SZ / 2, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  avatarInner: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  petAvatar:   { width: 52, height: 52, borderRadius: 26 },
  petEmoji:    { fontSize: TYPO.title },
  chipName:    { fontSize: TYPO.label, fontWeight: '700', letterSpacing: -0.2 },
  pctBadge:    { position: 'absolute', bottom: -4, alignSelf: 'center', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2.5 },
  pctBadgeText:{ fontSize: TYPO.label, fontWeight: '900', color: '#fff', letterSpacing: 0.1 },
  urgentDot:   { position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: 5 },
});
