import React, { memo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

interface Pet { id: string; name: string; [key: string]: any; }

interface Props {
  pets: Pet[];
  selectedPetId: string | null;
  onSelect: (id: string | null) => void;
  accent: string;
  colors: any;
}

const ExpensePetFilter = memo(function ExpensePetFilter({ pets, selectedPetId, onSelect, accent, colors }: Props) {
  if (pets.length <= 1) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 2, gap: 8 }}>
      <TouchableOpacity onPress={() => onSelect(null)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
          backgroundColor: !selectedPetId ? accent : colors.card,
          borderWidth: 1.5, borderColor: !selectedPetId ? accent : colors.border }}>
        <Ionicons name="paw" size={14} color={!selectedPetId ? '#fff' : colors.textSecondary} />
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: !selectedPetId ? '#fff' : colors.textSecondary }}>All pets</Text>
      </TouchableOpacity>
      {pets.map(p => {
        const sel = selectedPetId === p.id;
        return (
          <TouchableOpacity key={p.id} onPress={() => onSelect(p.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
              backgroundColor: sel ? accent : colors.card,
              borderWidth: 1.5, borderColor: sel ? accent : colors.border }}>
            {p.avatar_url
              ? <Image source={{ uri: p.avatar_url }} cachePolicy="memory-disk" style={{ width: 18, height: 18, borderRadius: 9 }} />
              : <Text style={{ fontSize: TYPO.body }}>{p.emoji ?? '🐾'}</Text>}
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? '#fff' : colors.textPrimary }} numberOfLines={1}>{p.name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});

export default ExpensePetFilter;
