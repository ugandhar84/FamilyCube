import { useState, useCallback } from 'react';
import { Linking } from 'react-native';
import { showAlert } from '@/components/AppAlert';
import { supabase } from '@/lib/supabase';
import { getLocationAPI } from '@/lib/location';
import { haversineKm, usStateAbbr } from '@/features/social/utils';
import type { NearbyPet, GenderFilter, SpeciesFilter } from '@/features/social/types';
import { DISTANCE_OPTS_METRIC, DISTANCE_OPTS_IMPERIAL } from '@/features/social/types';
import { usesImperial } from '@/lib/units';

export function useSocialNearby(
  userId: string | null,
  activePetId: string | null,
  activePetSpecies: string | undefined,
  prefetchPetProfile: (petId: string) => void,
) {
  const imperial = usesImperial();
  const distanceOpts = imperial ? DISTANCE_OPTS_IMPERIAL : DISTANCE_OPTS_METRIC;

  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [nearbyPets, setNearbyPets] = useState<NearbyPet[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<number>(distanceOpts[1].km);
  const [nearbySpecies, setNearbySpecies] = useState<SpeciesFilter>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('any');
  const [breedSearch, setBreedSearch] = useState('');

  const initLocation = useCallback(async () => {
    const Loc = getLocationAPI();
    if (!Loc) { setLocationGranted(false); return; }
    try {
      const existing = await Loc.getForegroundPermissionsAsync();
      if (existing.status !== 'granted' && !existing.canAskAgain) {
        setLocationGranted(false);
        showAlert('Location required', 'Enable location in Settings to find nearby pets.',
          [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: Linking.openSettings }]);
        return;
      }
      const { status } = existing.status === 'granted' ? existing : await Loc.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocationGranted(false); return; }
      setLocationGranted(true);
      // Only spin if we actually have a pet to query nearby pets for
      if (activePetId) setLoadingNearby(true);
      const pos = await Loc.getCurrentPositionAsync({ accuracy: Loc.Accuracy.Balanced });
      const { latitude: lat, longitude: lon } = pos.coords;
      setUserLocation({ lat, lon });
      Loc.reverseGeocodeAsync({ latitude: lat, longitude: lon }).then(r => {
        const place = r?.[0];
        if (place) {
          const street = place.street || place.name || place.district || place.subregion;
          const city   = place.city || place.subregion || place.district;
          const state  = place.region
            ? (place.isoCountryCode === 'US' ? usStateAbbr(place.region) : place.region)
            : null;
          const parts  = [street, city, state].filter(Boolean);
          const label  = parts.length >= 2 ? parts.join(', ') : (parts[0] ?? null);
          if (label) setLocationLabel(label);
        }
      }).catch(() => {});
      if (userId) {
        const now = new Date().toISOString();
        await supabase.from('pets')
          .update({ location_lat: lat, location_lng: lon, location_updated_at: now })
          .eq('owner_id', userId);
      }
    } catch { setLocationGranted(false); setLoadingNearby(false); }
  }, [userId]);

  const loadNearbyPets = useCallback(async () => {
    if (!userLocation || !userId || !activePetId) { setLoadingNearby(false); return; }
    setNearbyPets([]);
    setLoadingNearby(true);
    try {
      const { lat, lon } = userLocation;
      const deg = distanceFilter / 111;
      const { data, error } = await supabase
        .from('pets')
        .select('id, name, species, breed, gender, status, emoji, accent_color, avatar_url, birthday, location_lat, location_lng, owner_id, profiles(full_name, handle, avatar_url, profile_show_photo, user_emoji)')
        .not('location_lat', 'is', null).not('location_lng', 'is', null)
        .neq('owner_id', userId).neq('id', activePetId).eq('location_shared', true)
        .neq('status', 'memorial')
        .gte('location_lat', lat - deg).lte('location_lat', lat + deg)
        .gte('location_lng', lon - deg).lte('location_lng', lon + deg)
        .limit(200);
      if (error) { console.warn('[Nearby] fetch error:', error.message); return; }

      let pets: NearbyPet[] = (data ?? []).map((p: any) => {
        let age: { years: number; months: number } | null = null;
        if (p.birthday) {
          const birth = new Date(p.birthday);
          const today = new Date();
          const years = today.getFullYear() - birth.getFullYear();
          const months = today.getMonth() - birth.getMonth();
          age = { years: months < 0 ? years - 1 : years, months: months < 0 ? 12 + months : months };
        }
        return {
          ...p,
          latitude: p.location_lat, longitude: p.location_lng,
          owner: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
          age,
          distanceKm: haversineKm(lat, lon, p.location_lat, p.location_lng),
        };
      }).filter((p: NearbyPet) => p.distanceKm <= distanceFilter);

      if (nearbySpecies !== 'all') {
        pets = pets.filter(p => p.species?.toLowerCase() === nearbySpecies.toLowerCase());
      }
      if (genderFilter === 'unknown') {
        pets = pets.filter(p => !p.gender || p.gender.toLowerCase() === 'unknown' || p.gender.toLowerCase() === 'other');
      } else if (genderFilter !== 'any') {
        pets = pets.filter(p => p.gender?.toLowerCase() === genderFilter);
      }
      pets.sort((a, b) => a.distanceKm - b.distanceKm);

      const nearbyOwnerIds = [...new Set(pets.map(p => p.owner_id).filter(Boolean))];
      const nearbyPetIds = pets.map(p => p.id);
      const [subsResult, ratingsResult] = await Promise.all([
        nearbyOwnerIds.length
          ? supabase.from('subscriptions').select('user_id, tier').in('user_id', nearbyOwnerIds)
          : Promise.resolve({ data: [] }),
        nearbyPetIds.length
          ? supabase.from('pet_rating_stats').select('pet_id, avg_rating, total_ratings').in('pet_id', nearbyPetIds)
          : Promise.resolve({ data: [] }),
      ]);
      const nearbyTierMap: Record<string, string> = Object.fromEntries((subsResult.data ?? []).map((s: any) => [s.user_id, s.tier]));
      const ratingMap: Record<string, { avg: number; count: number }> = Object.fromEntries(
        (ratingsResult.data ?? []).map((r: any) => [r.pet_id, { avg: parseFloat(r.avg_rating), count: r.total_ratings }])
      );
      pets = pets.map(p => ({
        ...p,
        owner_tier: nearbyTierMap[p.owner_id] ?? 'free',
        avg_rating: ratingMap[p.id]?.avg ?? null,
        total_ratings: ratingMap[p.id]?.count ?? null,
      }));

      setNearbyPets(pets);
      pets.slice(0, 5).forEach(p => prefetchPetProfile(p.id));
    } finally {
      setLoadingNearby(false);
    }
  }, [userLocation, userId, activePetId, nearbySpecies, distanceFilter, genderFilter, prefetchPetProfile]);

  const filteredNearby = breedSearch.trim()
    ? nearbyPets.filter(p => p.breed?.toLowerCase().includes(breedSearch.toLowerCase()))
    : nearbyPets;

  return {
    userLocation, locationLabel, locationGranted,
    nearbyPets, filteredNearby, loadingNearby,
    distanceFilter, setDistanceFilter,
    nearbySpecies, setNearbySpecies,
    genderFilter, setGenderFilter,
    breedSearch, setBreedSearch,
    distanceOpts,
    initLocation, loadNearbyPets,
  };
}
