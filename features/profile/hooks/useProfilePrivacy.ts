/**
 * useProfilePrivacy — profile-visibility and pet-visibility toggle state.
 * Loads initial values from the profile object; persists each change immediately.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useProfilePrivacy(profile: any, userId: string | undefined) {
  // ── Profile visibility ───────────────────────────────────────────────────────
  const [profileShowName,  setProfileShowName]  = useState(true);
  const [profileShowEmail, setProfileShowEmail] = useState(false);
  const [profileShowPhoto, setProfileShowPhoto] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setProfileShowName( (profile as any).profile_show_full_name ?? true);
    setProfileShowEmail((profile as any).profile_show_email     ?? false);
    setProfileShowPhoto((profile as any).profile_show_photo     ?? true);
  }, [profile]);

  const saveProfilePrivacy = useCallback(async (field: string, v: boolean) => {
    if (userId) await supabase.from('profiles').update({ [field]: v }).eq('id', userId);
  }, [userId]);

  // ── Pet visibility ───────────────────────────────────────────────────────────
  const [petShowAbout,      setPetShowAbout]      = useState(true);
  const [petShowVaccines,   setPetShowVaccines]   = useState(true);
  const [petShowAllergies,  setPetShowAllergies]  = useState(true);
  const [petShowVetVisits,  setPetShowVetVisits]  = useState(true);
  const [petShowWeight,     setPetShowWeight]     = useState(true);
  const [petShowMilestones, setPetShowMilestones] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setPetShowAbout(     (profile as any).pet_show_about      ?? true);
    setPetShowVaccines(  (profile as any).pet_show_vaccines   ?? true);
    setPetShowAllergies( (profile as any).pet_show_allergies  ?? true);
    setPetShowVetVisits( (profile as any).pet_show_vet_visits ?? true);
    setPetShowWeight(    (profile as any).pet_show_weight     ?? true);
    setPetShowMilestones((profile as any).pet_show_milestones ?? true);
  }, [profile]);

  const savePetPrivacy = useCallback(async (field: string, v: boolean) => {
    if (userId) await supabase.from('profiles').update({ [field]: v }).eq('id', userId);
  }, [userId]);

  return {
    profileShowName, setProfileShowName,
    profileShowEmail, setProfileShowEmail,
    profileShowPhoto, setProfileShowPhoto,
    saveProfilePrivacy,
    petShowAbout, setPetShowAbout,
    petShowVaccines, setPetShowVaccines,
    petShowAllergies, setPetShowAllergies,
    petShowVetVisits, setPetShowVetVisits,
    petShowWeight, setPetShowWeight,
    petShowMilestones, setPetShowMilestones,
    savePetPrivacy,
  };
}
