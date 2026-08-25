// Shared member-edit logic used by both RosterTab.tsx and Profile's own
// member carousel (features/profile/ProfileSettingsScreen.tsx) — split out
// so the two screens can't silently drift apart on something as easy to
// get subtly wrong twice as a DB role-vocabulary translation.
import { supabase } from '@/lib/supabase';
import type { MemberRole } from '@/store/familyStore';

/**
 * Persists EditMemberModal's edits. Two role vocabularies exist and must
 * both be handled: EditMemberModal's own chips use 'child'/'teenager'/
 * 'senior' (not this app's real MemberRole union), and the DB's
 * members_role_check constraint only accepts 'grandparent', never
 * 'senior' — writing 'senior' straight through fails the constraint
 * silently unless the raw update's error is checked (which this does).
 * `updateMember` is familyStore's own store-and-DB-write action — passed in
 * rather than imported directly so this stays a plain function usable from
 * anywhere useFamilyStore() is already in scope, no hook-inside-non-hook issue.
 */
export async function saveMemberEdit(
  updateMember: (id: string, patch: Record<string, unknown>) => Promise<void>,
  memberId: string,
  name: string,
  role: string,
  hasCar: boolean,
  rideEarningsPerRun: number,
  groceryEarningsPerRun: number,
  subRole?: string,
  relationship?: string,
  // Avatar edit — `avatar` is a single DB column doubling as either an
  // emoji string or an uploaded photo URL (see familyStore's fromRow/toRow:
  // isUrl = avatar.startsWith('http') decides which). Only one of these two
  // is ever passed by a caller (EditMemberModal's own emoji-vs-photo
  // choice), never both — whichever is set wins; passing neither leaves the
  // existing avatar untouched.
  avatarEmoji?: string,
  avatarUrl?: string,
): Promise<{ error?: string }> {
  const dbRole = role === 'senior' ? 'grandparent' : role;
  const newAvatar = avatarUrl ?? avatarEmoji;
  const { error } = await supabase.from('members').update({
    name, role: dbRole, has_car: hasCar,
    ride_earnings_per_run: rideEarningsPerRun, grocery_earnings_per_run: groceryEarningsPerRun,
    sub_role: subRole ?? null,
    relationship: relationship ?? null,
    ...(newAvatar ? { avatar: newAvatar } : {}),
  }).eq('id', memberId);
  if (error) {
    console.warn('[memberActions] saveMemberEdit failed', error.message);
    return { error: error.message };
  }
  const appRole: MemberRole = role === 'child' ? 'kid' : role === 'teenager' ? 'teen' : role as MemberRole;
  await updateMember(memberId, {
    name, role: appRole, hasCar, rideEarningsPerRun, groceryEarningsPerRun, subRole, relationship,
    ...(avatarUrl ? { avatarUrl, emoji: undefined } : {}),
    ...(avatarEmoji ? { emoji: avatarEmoji, avatarUrl: undefined } : {}),
  });
  return {};
}
