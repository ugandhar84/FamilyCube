/**
 * Shared helper — suppresses routine notifications for lost or deceased pets.
 *
 * Lost pets:     active lost_alert (is_found=false, not expired) → skip all routine reminders
 * Deceased pets: pets.status='memorial' or memorial_at is set → skip all routine reminders
 *
 * Both sets are returned so callers can filter their pet list before sending.
 */

export interface PetStatusSets {
  /** Pet IDs currently reported lost */
  lostIds: Set<string>;
  /** Pet IDs that have passed away */
  deceasedIds: Set<string>;
}

export async function getBlockedPetIds(
  supabase: any,
  petIds: string[],
): Promise<PetStatusSets> {
  if (!petIds.length) return { lostIds: new Set(), deceasedIds: new Set() };

  const [{ data: lostRows }, { data: deceasedRows }] = await Promise.all([
    supabase
      .from('lost_alerts')
      .select('pet_id')
      .in('pet_id', petIds)
      .eq('is_found', false),
    supabase
      .from('pets')
      .select('id')
      .in('id', petIds)
      .or('status.eq.memorial,memorial_at.not.is.null'),
  ]);

  return {
    lostIds:     new Set((lostRows    ?? []).map((r: any) => r.pet_id ?? r.id)),
    deceasedIds: new Set((deceasedRows ?? []).map((r: any) => r.id)),
  };
}

/** Returns true if this pet should be skipped for routine care notifications. */
export function isBlocked(petId: string, sets: PetStatusSets): boolean {
  return sets.lostIds.has(petId) || sets.deceasedIds.has(petId);
}
