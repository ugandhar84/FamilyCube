import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export interface PetPrivacySettings {
  pet_show_about:      boolean;
  pet_show_vaccines:   boolean;
  pet_show_allergies:  boolean;
  pet_show_vet_visits: boolean;
  pet_show_weight:     boolean;
  pet_show_milestones: boolean;
}

export const DEFAULT_PET_PRIVACY: PetPrivacySettings = {
  pet_show_about:      true,
  pet_show_vaccines:   true,
  pet_show_allergies:  true,
  pet_show_vet_visits: true,
  pet_show_weight:     true,
  pet_show_milestones: true,
};

export interface PetProfileData {
  pet: Record<string, any> | null;
  allergies: { allergen: string; severity: string; category: string | null }[];
  isOwner: boolean;
  privacy: PetPrivacySettings;
}

const PRIVACY_COLS = 'pet_show_about,pet_show_vaccines,pet_show_allergies,pet_show_vet_visits,pet_show_weight,pet_show_milestones';

/**
 * Single round-trip to load a pet profile page for any pet (own or another user's).
 * Also fetches the owner's pet profile privacy settings so the UI can hide sections.
 */
export async function getPetProfile(petId: string): Promise<PetProfileData> {
  const uid = useAuthStore.getState().user?.id;
  const [{ data: petData, error: petError }, { data: allergyData }] = await Promise.all([
    supabase.from('pets').select('*').eq('id', petId).maybeSingle(),
    supabase.from('allergies').select('allergen,severity,category').eq('pet_id', petId),
  ]);

  const isOwner = !!(uid && petData && petData.owner_id === uid);

  // Fetch owner's privacy prefs — skip for own pets (owner sees everything)
  let privacy: PetPrivacySettings = DEFAULT_PET_PRIVACY;
  if (!isOwner && petData?.owner_id) {
    const { data: ownerPrefs } = await supabase
      .from('profiles')
      .select(PRIVACY_COLS)
      .eq('id', petData.owner_id)
      .maybeSingle();
    if (ownerPrefs) {
      privacy = {
        pet_show_about:      ownerPrefs.pet_show_about      ?? true,
        pet_show_vaccines:   ownerPrefs.pet_show_vaccines   ?? true,
        pet_show_allergies:  ownerPrefs.pet_show_allergies  ?? true,
        pet_show_vet_visits: ownerPrefs.pet_show_vet_visits ?? true,
        pet_show_weight:     ownerPrefs.pet_show_weight     ?? true,
        pet_show_milestones: ownerPrefs.pet_show_milestones ?? true,
      };
    }
  }

  return {
    pet: petData ?? null,
    allergies: (allergyData ?? []) as { allergen: string; severity: string; category: string | null }[],
    isOwner,
    privacy,
  };
}
