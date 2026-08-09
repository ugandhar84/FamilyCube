import { supabase } from '@/lib/supabase';

export async function getPetFamily(petId: string) {
  const { data, error } = await supabase
    .from('pet_family')
    .select('id,pet_id,user_id,role,joined_at,profiles(full_name,handle,avatar_url)')
    .eq('pet_id', petId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function removeFamilyMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('pet_family').delete().eq('id', memberId);
  if (error) throw error;
}

export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  const { error } = await supabase.from('pet_family').update({ role }).eq('id', memberId);
  if (error) throw error;
}

export async function createFamilyInvite(payload: {
  pet_id: string; invited_by: string; email: string; role: string; token: string;
}) {
  const { data, error } = await supabase.from('family_invitations').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.from('family_invitations').update({ status: 'revoked' }).eq('id', id);
  if (error) throw error;
}

export async function declineInvite(id: string): Promise<void> {
  const { error } = await supabase.from('family_invitations').update({ status: 'declined' }).eq('id', id);
  if (error) throw error;
}
