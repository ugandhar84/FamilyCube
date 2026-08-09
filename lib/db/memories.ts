import { supabase } from '@/lib/supabase';

export interface PetPhoto {
  id: string;
  pet_id: string;
  url: string;
  caption: string | null;
  taken_at: string;
}

export interface Milestone {
  id: string;
  pet_id: string;
  day_count: number;
  title: string;
  achieved_at: string;
}

const PAGE_SIZE = 24; // good for 3-column grid

export async function getPhotosPage(
  petId: string,
  cursor?: string,
): Promise<{ photos: PetPhoto[]; nextCursor: string | null }> {
  let q = supabase
    .from('pet_photos')
    .select('id,pet_id,url,caption,taken_at')
    .eq('pet_id', petId)
    .order('taken_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) q = q.lt('taken_at', cursor);

  const { data, error } = await q;
  if (error) throw error;

  const photos = (data ?? []) as PetPhoto[];
  const nextCursor = photos.length === PAGE_SIZE ? photos[photos.length - 1].taken_at : null;
  return { photos, nextCursor };
}

export async function getMilestones(petId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select('id,pet_id,day_count,title,achieved_at')
    .eq('pet_id', petId)
    .order('day_count', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Milestone[];
}
