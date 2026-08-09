import * as ExpoCrypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

export async function getTimelineEntries(petId: string, year?: number) {
  let q = supabase.from('pet_timelines').select('*').eq('pet_id', petId);
  if (year) {
    q = q
      .gte('event_date', `${year}-01-01`)
      .lte('event_date', `${year}-12-31`);
  }
  const { data, error } = await q.order('event_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getGenerationCountsPerYear(petId: string): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from('timeline_generations')
    .select('created_at')
    .eq('pet_id', petId)
    .eq('success', true);
  if (error) throw error;
  const counts: Record<number, number> = {};
  for (const row of data ?? []) {
    const yr = new Date(row.created_at).getFullYear();
    counts[yr] = (counts[yr] ?? 0) + 1;
  }
  return counts;
}

export async function generatePetTimeline(petId: string, year: number) {
  const { data, error } = await supabase.functions.invoke('generate-pet-timeline', {
    body: { pet_id: petId, year },
  });
  if (error) {
    if ((error as any).status === 402 || (error as any).context?.status === 402) {
      const e = new Error('Pro subscription required to generate timelines') as any;
      e.code = 'pro_required';
      throw e;
    }
    throw error;
  }
  return data;
}

export async function createTimelineShare(petId: string, expiresAt?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const bytes = await ExpoCrypto.getRandomBytesAsync(16);
  const token = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const { data, error } = await supabase
    .from('timeline_shares')
    .insert({
      pet_id: petId,
      share_token: token,
      created_by: user.id,
      expires_at: expiresAt || null,
    })
    .select('share_token')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Failed to create share link');
  return data.share_token;
}

export async function getSharedTimeline(shareToken: string) {
  const { data: share, error: shareErr } = await supabase
    .from('timeline_shares')
    .select('pet_id, expires_at, is_active')
    .eq('share_token', shareToken)
    .maybeSingle();

  if (shareErr || !share) throw new Error('Invalid share link');
  if (!share.is_active) throw new Error('Share link has been disabled');
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    throw new Error('Share link has expired');
  }

  // Update accessed_at
  try {
    await supabase
      .from('timeline_shares')
      .update({ accessed_at: new Date().toISOString() })
      .eq('share_token', shareToken);
  } catch {};

  const { data: entries, error: entriesErr } = await supabase
    .from('pet_timelines')
    .select('*')
    .eq('pet_id', share.pet_id)
    .order('event_date', { ascending: false });

  if (entriesErr) throw entriesErr;
  return { entries: entries ?? [], pet_id: share.pet_id };
}

export async function deleteTimelineShare(shareToken: string) {
  const { error } = await supabase
    .from('timeline_shares')
    .delete()
    .eq('share_token', shareToken);
  if (error) throw error;
}

export async function pinTimelineEntry(entryId: string, pinned: boolean) {
  const { error } = await supabase
    .from('pet_timelines')
    .update({ is_pinned: pinned })
    .eq('id', entryId);
  if (error) throw error;
}

export async function deleteTimelineEntry(entryId: string) {
  const { error } = await supabase
    .from('pet_timelines')
    .delete()
    .eq('id', entryId);
  if (error) throw error;
}
