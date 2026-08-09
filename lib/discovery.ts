import { supabase } from './supabase';
import { Platform } from 'react-native';
import type { Pet } from './types';

interface SponsoredRow {
  id: string; category: string; business_name: string | null; tagline: string | null;
  city: string | null; logo_url: string | null; cover_url: string | null;
  phone: string | null; website_url: string | null; cta_label: string | null;
  cta_url: string | null; is_featured: boolean; priority: number;
  target_species: string[] | null; starts_at: string | null; ends_at: string | null;
  video_url: string | null;
}

interface PetProductRow {
  id: string; brand: string | null; name: string; category: string;
  species: string | null; breed_size: string | null;
  min_age_years: number | null; max_age_years: number | null;
  price: number | null; original_price: number | null;
  emoji: string | null; image_url: string | null; video_url: string | null;
  sponsored: boolean; cta_label: string | null; cta_url: string | null;
}

// ── Nearby places — single edge-function call ─────────────────────────────────
// All logic (cache check, Overpass, DeepSeek, cache write) lives in the
// `nearby-places` edge function. Client just renders what comes back.

export async function getOSMPlaces(
  coords: Coords,
  category: PartnerCategory | null = null,
  pet?: Pet | null,
  radius_km: number = 8,
): Promise<Partner[]> {
  try {
    const ageYears = pet ? petAgeYears(pet) : null;
    const { data, error } = await supabase.functions.invoke('nearby-places', {
      body: {
        lat: coords.lat,
        lng: coords.lng,
        category,
        platform: Platform.OS,
        radius_m: Math.round(radius_km * 1000),
        pet: pet
          ? { name: pet.name, species: pet.species, breed: pet.breed ?? null, age_years: ageYears, weight_kg: pet.weight_kg ?? null }
          : null,
      },
    });
    if (error) throw error;
    return (data?.places ?? []) as Partner[];
  } catch {
    return [];
  }
}

// ── Types (mirror the partners / pet_products tables + get_nearby_partners RPC) ──
export type PartnerCategory = 'vet' | 'grooming' | 'food' | 'boarding' | 'training' | 'other';

export interface Partner {
  id: string;
  name: string;
  category: PartnerCategory;
  subtitle: string | null;
  description: string | null;
  city: string | null;
  rating: number | null;
  price_from: number | null;
  is_24h: boolean;
  phone: string | null;
  emoji: string | null;
  image_url: string | null;
  video_url: string | null;
  youtube_url: string | null;
  accent_color: string | null;
  sponsored: boolean;
  cta_label: string;
  cta_url: string | null;
  distance_km: number | null;
  eta_minutes?: number | null;
  lat?: number | null;
  lng?: number | null;
}

export interface ProductPick {
  id: string;
  brand: string | null;
  name: string;
  category: string;
  price: number | null;
  original_price: number | null;
  emoji: string | null;
  image_url: string | null;
  video_url: string | null;
  android_video_url: string | null;
  youtube_url: string | null;
  deal_type: 'clearance' | 'rollback' | null;
  sponsored: boolean;
  cta_label: string;
  cta_url: string | null;
  /** Human-readable explanation of why this pet matched — drives the "Why this?" disclosure. */
  reason: string;
}

export interface Coords { lat: number; lng: number; }

// ── Pet → matching dimensions ────────────────────────────────────────────────
export function petAgeYears(pet: Pet): number | null {
  if (!pet.birthday) return null;
  const born = new Date(pet.birthday);
  if (isNaN(born.getTime())) return null;
  return (Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000);
}

/** Coarse breed-size bucket from weight (dogs); cats/others default to null (no size filter). */
export function petBreedSize(pet: Pet): 'small' | 'medium' | 'large' | null {
  if (pet.species !== 'dog' || pet.weight_kg == null) return null;
  if (pet.weight_kg < 10) return 'small';
  if (pet.weight_kg <= 25) return 'medium';
  return 'large';
}

// ── Queries ──────────────────────────────────────────────────────────────────
export async function getNearbyPartners(
  coords: Coords | null,
  species: string | null,
  category: PartnerCategory | null = null,
  limit = 12,
): Promise<Partner[]> {
  const { data, error } = await supabase.rpc('get_nearby_partners', {
    p_lat: coords?.lat ?? null,
    p_lng: coords?.lng ?? null,
    p_category: category,
    p_species: species,
    p_limit: limit,
  });
  if (error || !data) return [];
  return data as Partner[];
}

// ── Sponsored listings from admin DB ─────────────────────────────────────────
// Fetches active sponsored_listings and maps them to the Partner shape so they
// slot into the existing home-screen carousel with a "Sponsored" badge.
export async function getSponsoredListings(
  speciesList: string[],
  activePetSpecies: string | null = null,
): Promise<Partner[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('sponsored_listings')
    .select('id,category,business_name,tagline,description,city,logo_url,cover_url,phone,website_url,cta_label,cta_url,is_featured,priority,target_species,starts_at,ends_at,video_url,youtube_url')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('priority', { ascending: false })
    .limit(20);

  if (error) { console.warn('[Sponsored] fetch error:', error.message); return []; }
  if (!data?.length) { console.log('[Sponsored] no active listings in DB'); return []; }

  console.log('[Sponsored] fetched', data.length, 'listings');

  const filtered = (data as SponsoredRow[]).filter(l => {
    // Date range check (null = no limit)
    if (l.starts_at && new Date(l.starts_at) > new Date(now)) return false;
    if (l.ends_at   && new Date(l.ends_at)   < new Date(now)) return false;
    return true;
  });

  console.log('[Sponsored] after date filtering:', filtered.length, 'listings for species:', speciesList);

  // Sort: active pet's species first → all user's species → generic
  const sorted = filtered.map(l => {
    const isGeneric = !l.target_species?.length;
    const matchesActive = activePetSpecies && l.target_species?.includes(activePetSpecies);
    const matchesAnyUser = l.target_species?.some((s: string) => speciesList.includes(s));
    return { listing: l, isGeneric, matchesActive, matchesAnyUser };
  }).sort((a, b) => {
    // Exact active pet first
    if (a.matchesActive !== b.matchesActive) return a.matchesActive ? -1 : 1;
    // Then any user pet
    if (a.matchesAnyUser !== b.matchesAnyUser) return a.matchesAnyUser ? -1 : 1;
    // Then generic
    if (a.isGeneric !== b.isGeneric) return a.isGeneric ? 1 : -1;
    // Within each group, maintain featured/priority order
    if (a.listing.is_featured !== b.listing.is_featured) return a.listing.is_featured ? -1 : 1;
    return (b.listing.priority ?? 0) - (a.listing.priority ?? 0);
  });

  if (!sorted.length) return [];

  return sorted.map(({ listing: l, matchesActive, matchesAnyUser }) => {
      const targetSpecies = l.target_species && l.target_species.length > 0
        ? l.target_species.join(' & ')
        : null;
      let subtitle: string;
      if (matchesActive && targetSpecies) {
        subtitle = `Trusted by ${targetSpecies} owners`;
      } else if (matchesAnyUser && targetSpecies) {
        subtitle = `Trusted by ${targetSpecies} owners`;
      } else {
        subtitle = 'Trusted by pet owners';
      }

      return {
        id: l.id,
        name: l.business_name ?? 'Partner',
        category: mapSponsoredCategory(l.category),
        subtitle: subtitle,
        description: (l as any).description ?? null,
        city: l.city ?? null,
        rating: null,
        price_from: null,
        is_24h: false,
        phone: l.phone ?? null,
        emoji: null,
        image_url: l.cover_url ?? l.logo_url ?? null,
        video_url: l.video_url ?? null,
        youtube_url: (l as any).youtube_url ?? null,
        accent_color: null,
        sponsored: true,
        cta_label: l.cta_label ?? 'Learn More',
        cta_url: l.cta_url ?? l.website_url ?? null,
        distance_km: null,
      };
    });
}

function mapSponsoredCategory(cat: string): PartnerCategory {
  const map: Record<string, PartnerCategory> = {
    clinic: 'vet', food: 'food', grooming: 'grooming',
    boarding: 'boarding', training: 'training',
  };
  return map[cat] ?? 'other';
}

export async function getProductPick(pets: Pet[]): Promise<ProductPick | null> {
  const picks = await getProductPicks(pets);
  return picks[0] ?? null;
}

export async function getProductPicks(pets: Pet[]): Promise<ProductPick[]> {
  const pet    = pets[0]; // primary pet for scoring/reason
  if (!pet) return [];
  const age    = petAgeYears(pet);
  const size   = petBreedSize(pet);
  const reason = buildReason(pet, size, age);

  // Build species filter covering ALL pets the user owns (+ generic products with no species)
  const speciesSet = [...new Set(pets.map(p => p.species).filter(Boolean))] as string[];
  const speciesFilter = speciesSet.length
    ? `species.is.null,${speciesSet.map(s => `species.eq.${s}`).join(',')}`
    : 'species.is.null';

  let { data, error } = await supabase
    .from('pet_products')
    .select('id, brand, name, category, species, breed_size, min_age_years, max_age_years, price, original_price, emoji, image_url, video_url, android_video_url, youtube_url, deal_type, sponsored, cta_label, cta_url')
    .eq('active', true)
    .or(speciesFilter)
    .order('sponsored', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) return [];

  // Score each product by specificity, then sort.
  // Tier 1 (score 3): exact species + exact breed size  ← shown first
  // Tier 2 (score 2): exact species, breed size generic (null)
  // Tier 3 (score 1): generic species (null), exact breed size
  // Tier 4 (score 0): fully generic
  // Products with a breed_size that DOESN'T match the pet are excluded.
  const withScore = (data as PetProductRow[])
    .filter(p => p.breed_size == null || size == null || p.breed_size === size)
    .filter(p => {
      if (age == null) return true;
      const okMin = p.min_age_years == null || age >= p.min_age_years;
      const okMax = p.max_age_years == null || age <= p.max_age_years;
      return okMin && okMax;
    })
    .map(p => {
      let score = 0;
      if (p.species != null && p.species === pet.species) score += 2; // exact species
      if (p.breed_size != null && p.breed_size === size)  score += 1; // exact breed
      return { p, score };
    })
    .sort((a, b) => b.score - a.score); // stable sort: DB ordering preserved within same tier

  const items = (withScore.length > 0 ? withScore : (data as PetProductRow[]).map(p => ({ p, score: 0 })))
    .slice(0, 5);

  return items.map(entry => {
    const p = entry.p;
    const itemReason = buildProductReason(pet, p, entry.score, size, age);
    return {
      id: p.id,
      brand: p.brand,
      name: p.name,
      category: p.category,
      price: p.price != null ? Number(p.price) : null,
      original_price: p.original_price != null ? Number(p.original_price) : null,
      emoji: p.emoji,
      image_url: p.image_url,
      video_url: (p as any).video_url ?? null,
      android_video_url: (p as any).android_video_url ?? null,
      youtube_url: (p as any).youtube_url ?? null,
      deal_type: (p as any).deal_type ?? null,
      sponsored: p.sponsored,
      cta_label: p.cta_label ?? 'Shop',
      cta_url: p.cta_url,
      reason: itemReason,
    };
  });
}

function buildReason(pet: Pet, size: string | null, age: number | null): string {
  const parts: string[] = [];
  if (size) parts.push(`${size} breed`);
  else if (pet.species) parts.push(pet.species);
  if (age != null) parts.push(`age ${Math.max(0, Math.round(age))}`);
  if (pet.weight_kg != null) parts.push(`${pet.weight_kg} kg`);
  return parts.length ? `Matched to ${parts.join(' · ')}` : `Matched to ${pet.name}'s profile`;
}

/** Per-product reason explaining why this item matched */
function buildProductReason(
  pet: Pet,
  product: PetProductRow,
  score: number,
  size: string | null,
  age: number | null,
): string {
  // Tier 1: exact species + exact breed size
  if (score === 3) {
    return `Perfect for ${size ? `${size} ` : ''}${pet.species}s`;
  }
  // Tier 2: exact species, generic breed size
  if (score === 2) {
    const parts = [`Great for ${pet.species}s`];
    if (age != null) {
      const petAge = Math.max(0, Math.round(age));
      parts.push(`age ${petAge}+`);
    }
    return parts.join(' • ');
  }
  // Tier 3: generic species, exact breed size
  if (score === 1 && size) {
    return `Great for ${size} breeds`;
  }
  // Tier 4: fully generic
  return `Popular with pet owners`;
}
