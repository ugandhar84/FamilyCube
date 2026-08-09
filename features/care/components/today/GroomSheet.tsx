import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { groomTypesForSpecies, GROOM_PHOTO_TYPES } from '@/lib/groomTypes';
import type { Pet } from '@/lib/types';
import { TYPO } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  pets: Pet[];
  selectedPetId: string | null;
  onSelectPet: (id: string) => void;
  groomingLogs: Record<string, any[]>;
  today: string;
  petColor: (p: Pet) => string;
  colors: any;
  isDark: boolean;
  onGroomLog: (petId: string, type: string) => void;
}

export default function GroomSheet({
  visible, onClose, pets, selectedPetId, onSelectPet,
  groomingLogs, today, petColor, colors, isDark, onGroomLog,
}: Props) {
  // Tiles sit inside the sheet (colors.card). Use a slightly elevated surface
  // so they're visually distinct without going pitch-black on dark purple sheets.
  const tileBg = isDark ? '#1E1A2E' : colors.background;
  const pet = pets.find(p => p.id === selectedPetId) ?? pets[0];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="🛁 Grooming">
      {pets.length > 1 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
          <Text style={[s.sub, { color: colors.textSecondary }]}>Which baby?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {pets.map(p => {
              const pc = petColor(p);
              const selected = selectedPetId === p.id;
              return (
                <TouchableOpacity key={p.id} onPress={() => onSelectPet(p.id)} activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: selected ? pc : pc + '18',
                    borderWidth: 1.5, borderColor: selected ? pc : pc + '40',
                  }}>
                  <Text style={{ fontSize: TYPO.subheading }}>{(p as any).emoji ?? '🐾'}</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: selected ? '#fff' : pc }}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {pet && (() => {
        const species = (pet as any).species as string | undefined;
        const types   = groomTypesForSpecies(species);
        const pc      = petColor(pet);
        return (
          <>
            <Text style={[s.sub, { color: colors.textSecondary, paddingHorizontal: 20, marginBottom: 10 }]}>
              {pets.length > 1 ? `${pet.name}'s grooming types` : 'What type of grooming?'}
            </Text>
            <View style={[s.grid, { paddingHorizontal: 16, paddingBottom: 20 }]}>
              {types.map(({ key: type, emoji, label }) => {
                const doneToday = (groomingLogs[pet.id] ?? [])
                  .some(g => (g as any).type === type && g.done_at.substring(0, 10) === today);
                return (
                  <TouchableOpacity key={type}
                    onPress={() => {
                      if (doneToday) return;
                      onClose();
                      onGroomLog(pet.id, type);
                    }}
                    activeOpacity={doneToday ? 1 : 0.75}
                    style={[s.tile, {
                      backgroundColor: doneToday ? pc + '18' : tileBg,
                      borderColor:     doneToday ? pc + '60' : colors.border,
                      opacity: doneToday ? 0.75 : 1,
                    }]}>
                    <Text style={{ fontSize: TYPO.hero }}>{emoji}</Text>
                    <Text style={[s.tileLabel, { color: doneToday ? pc : colors.textPrimary }]}>
                      {label}
                    </Text>
                    {doneToday
                      ? <Text style={{ fontSize: TYPO.label, color: pc, fontWeight: '700', marginTop: 2 }}>✓ Done</Text>
                      : GROOM_PHOTO_TYPES.has(type)
                        ? <Text style={[s.photoHint, { color: colors.textSecondary }]}>photo</Text>
                        : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );
      })()}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sub:       { fontSize: TYPO.caption, textAlign: 'center', marginBottom: 8, opacity: 0.7 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  tile:      { width: '30%', flexGrow: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 5 },
  tileLabel: { fontSize: TYPO.caption, fontWeight: '700', textAlign: 'center' },
  photoHint: { fontSize: TYPO.micro, fontWeight: '500', letterSpacing: 0.3, textTransform: 'uppercase' },
});
