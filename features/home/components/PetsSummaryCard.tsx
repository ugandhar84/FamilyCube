import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { TYPO } from '@/constants/theme';

interface PetsSummaryCardProps {
  sortedPets: any[];
  activePetId: string | null;
  setActivePet: (id: string) => void;
  totalLogs: number;
  daysWithPet: (id: string) => number;
  colors: any;
}

export const PetsSummaryCard = React.memo(function PetsSummaryCard({
  sortedPets, activePetId, setActivePet,
  totalLogs, daysWithPet, colors,
}: PetsSummaryCardProps) {
  const maxDays = Math.max(...sortedPets.map(p => daysWithPet(p.id)), 0);

  return (
    <View style={{
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: colors.primary,
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 2,
    }}>
      {/* Pet avatars row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {sortedPets.map((p) => {
          const isActive = p.id === activePetId;
          const ac = p.accent_color ?? colors.primary;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => setActivePet(p.id)}
              style={{ alignItems: 'center', gap: 4 }}
            >
              <View style={{
                width: 54,
                height: 54,
                borderRadius: 14,
                backgroundColor: isActive ? ac + '20' : colors.card,
                borderWidth: isActive ? 2.5 : 1,
                borderColor: isActive ? ac : colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} cachePolicy="memory-disk" style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ fontSize: TYPO.title }}>🐾</Text>
                )}
              </View>
              <Text style={{
                fontSize: TYPO.label,
                fontWeight: isActive ? '700' : '500',
                color: isActive ? (ac ?? colors.primary) : colors.textSecondary,
                maxWidth: 60,
                textAlign: 'center',
              }} numberOfLines={1}>
                {p.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: colors.primary + '10', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Pets</Text>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.primary }}>{sortedPets.length}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.info + '10', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Logs Today</Text>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.info }}>{totalLogs}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.success + '10', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Days</Text>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.success }}>{maxDays}</Text>
        </View>
      </View>
    </View>
  );
});
