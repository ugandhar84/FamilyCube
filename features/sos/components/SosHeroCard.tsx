import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SPECIES_EMOJI , TYPO } from '@/constants/theme';

interface SosHeroCardProps {
  activeLostAlert: any | null;
  ac: string;
  pet: any | null;
  pets: any[];
  petMeta: string;
  locationLoading: boolean;
  locationText: string | null;
  nearbyVets: any[];
  nearbyAlerts: any[];
  getDaysRemaining: (expiresAt: string | null) => number | null;
  handAnim: Animated.Value;
  colors: any;
  s: any;
  onSwitchPet: () => void;
}

export const SosHeroCard = React.memo(function SosHeroCard({
  activeLostAlert, ac, pet, pets, petMeta, locationLoading, locationText,
  nearbyVets, nearbyAlerts, getDaysRemaining, handAnim, colors, s, onSwitchPet,
}: SosHeroCardProps) {
  return (
    <View style={s.heroWrap}>
      <LinearGradient
        colors={activeLostAlert ? ['#C0392B', '#E74C3C'] : [ac, ac + 'DD']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={s.heroBlob} />

        {/* Pet row */}
        <View style={s.heroPetRow}>
          <View style={s.heroAvatar}>
            <Text style={{ fontSize: TYPO.hero }}>{pet?.emoji ?? SPECIES_EMOJI[(pet as any)?.species] ?? '🐾'}</Text>
          </View>
          <TouchableOpacity style={{ flex: 1 }} onPress={onSwitchPet} activeOpacity={0.75}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={s.heroName}>{pet?.name ?? 'No pet selected'}</Text>
              {pets.length > 1 && (
                <>
                  <Ionicons name="chevron-down" size={15} color="rgba(255,255,255,0.8)" />
                  <Animated.Text style={{
                    fontSize: TYPO.heading,
                    transform: [{ translateX: handAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
                  }}>👈</Animated.Text>
                </>
              )}
            </View>
            <Text style={s.heroSub}>
              {locationLoading ? 'Getting location…' : locationText ?? 'Location unknown'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.passportBtn}
            onPress={() => pet && router.push(`/pet/card?id=${pet.id}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="card-outline" size={13} color="#fff" />
            <Text style={s.passportBtnTxt}>Passport</Text>
          </TouchableOpacity>
        </View>

        {/* Stat tiles */}
        <View style={s.heroTiles}>
          <View style={s.heroTile}>
            <Text style={s.heroTileNum}>{nearbyVets.length || '—'}</Text>
            <Text style={s.heroTileLabel}>VETS NEARBY</Text>
          </View>
          <View style={[s.heroTile, s.heroTileMid]}>
            <Text style={s.heroTileNum}>{nearbyAlerts.length || '—'}</Text>
            <Text style={s.heroTileLabel}>LOST NEARBY</Text>
          </View>
          <View style={s.heroTile}>
            <Text style={s.heroTileNum}>{activeLostAlert ? '🚨' : '✓'}</Text>
            <Text style={s.heroTileLabel}>{activeLostAlert ? 'ALERT ON' : 'SAFE'}</Text>
          </View>
        </View>

        {/* Active alert banner */}
        {activeLostAlert && (
          <View style={s.alertBanner}>
            <Ionicons name="radio-outline" size={13} color="#fff" />
            <Text style={s.alertBannerTxt}>
              Alert active · {getDaysRemaining((activeLostAlert as any)?.expires_at) || 0} days remaining
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
});
