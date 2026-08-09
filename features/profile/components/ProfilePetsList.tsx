/**
 * ProfilePetsList — horizontal scroll of pet cards + an "Add pet" card.
 * Tapping a card navigates to /pet/[id]; the Add card is paywall-gated.
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { toTitle } from '@/lib/format';
import { petCard } from '@/features/profile/styles';
import { usePaywall } from '@/lib/hooks/usePaywall';

interface ProfilePetsListProps {
  pets: any[];
  accent: string;
  colors: any;
}

const ProfilePetsList = React.memo(function ProfilePetsList({ pets, accent, colors }: ProfilePetsListProps) {
  const { gate } = usePaywall();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled
      contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingTop: 4, paddingBottom: 4 }}>
      {pets.map(p => {
        const pc = (p as any).accent_color ?? colors.primary;
        const days = Math.floor((Date.now() - new Date(p.created_at ?? Date.now()).getTime()) / 86400000);
        return (
          <TouchableOpacity key={p.id} onPress={() => router.push(`/pet/${p.id}`)} activeOpacity={0.8}
            style={[petCard.wrap, { backgroundColor: colors.card, borderColor: `${pc}28` }]}>
            <View style={[petCard.imageWrap, { backgroundColor: `${pc}20` }]}>
              {(p as any).avatar_url
                ? <Image source={{ uri: (p as any).avatar_url }} cachePolicy="memory-disk" style={petCard.image} contentFit="cover" />
                : <Text style={petCard.bigEmoji}>{p.emoji}</Text>
              }
              <LinearGradient colors={['transparent', `${pc}66`]} style={petCard.imageGradient} />
            </View>
            <Text style={[petCard.name, { color: colors.textPrimary }]}>{p.name}</Text>
            <Text style={[petCard.breed, { color: colors.textSecondary ?? colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {toTitle((p as any).breed ?? p.species)}
            </Text>
            <View style={[petCard.daysBadge, { backgroundColor: `${pc}16` }]}>
              <Text style={[petCard.daysText, { color: pc }]}>{days}d together</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Add pet card */}
      <TouchableOpacity activeOpacity={0.8}
        style={[petCard.wrap, petCard.addWrap, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={async () => {
          const ok = await gate('pets', { title: 'Pet limit reached', message: 'Free accounts support 1 pet. Upgrade to Pro to add up to 5 pets.' });
          if (ok) router.push('/onboarding/add-pet');
        }}>
        <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}16` }}>
          <Ionicons name="add-outline" size={28} color={accent} />
        </View>
        <Text style={[petCard.name, { color: accent }]}>Add pet</Text>
      </TouchableOpacity>
    </ScrollView>
  );
});

export default ProfilePetsList;
