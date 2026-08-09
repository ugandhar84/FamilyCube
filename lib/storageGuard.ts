// Standalone storage quota checker — usable outside React components.
// useStorageGuard (hook) wraps this with Alert UI for screens.

import { supabase } from '@/lib/supabase';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useAuthStore } from '@/store/authStore';
import { getAppSettings } from '@/lib/db/appSettings';

const DEFAULT_CAPS: Record<string, number> = {
  free:    100  * 1024 * 1024,        // 100 MB
  pro:     2048 * 1024 * 1024,        // 2 GB
  ultimate: 5120 * 1024 * 1024,        // 5 GB
};

export function fmtBytes(b: number): string {
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (b >= 1024 * 1024)        return `${Math.round(b / (1024 * 1024))} MB`;
  return `${Math.round(b / 1024)} KB`;
}

export const STORAGE_UNLIMITED = Number.MAX_SAFE_INTEGER;

export async function getStorageCap(tier: string): Promise<number> {
  try {
    const key = `storage_cap_${tier}_bytes`;
    const s = await getAppSettings([key]);
    if (s[key] != null) {
      const val = Number(s[key]);
      // 0 stored in DB = admin set "no cap" — treat as unlimited
      return val === 0 ? STORAGE_UNLIMITED : val;
    }
  } catch {}
  return DEFAULT_CAPS[tier] ?? DEFAULT_CAPS.free;
}

export async function getUserStorageUsed(userId: string): Promise<number> {
  // Get all pets owned by user for photo lookup
  const { data: pets } = await supabase
    .from('pets').select('id').eq('owner_id', userId);

  const petIds = (pets ?? []).map((p: any) => p.id);

  const [photoRes, postRes] = await Promise.all([
    petIds.length > 0
      ? supabase.from('pet_photos').select('file_size_bytes').in('pet_id', petIds)
      : Promise.resolve({ data: [] }),
    supabase.from('social_posts').select('file_size_bytes').eq('author_id', userId),
  ]);

  const photoBytes = ((photoRes as any).data ?? []).reduce((s: number, r: any) => s + (r.file_size_bytes ?? 0), 0);
  const postBytes  = ((postRes  as any).data ?? []).reduce((s: number, r: any) => s + (r.file_size_bytes ?? 0), 0);
  return photoBytes + postBytes;
}

export interface StorageCheckResult {
  allowed: boolean;
  used: number;
  cap: number;
  tier: string;
}

/** Returns quota status. Does NOT show any UI — caller decides what to show. */
export async function checkStorageQuota(fileSizeBytes: number): Promise<StorageCheckResult> {
  const { user } = useAuthStore.getState();
  const { tier } = useSubscriptionStore.getState();

  if (!user?.id) return { allowed: true, used: 0, cap: DEFAULT_CAPS[tier] ?? DEFAULT_CAPS.free, tier };

  const [cap, used] = await Promise.all([
    getStorageCap(tier),
    getUserStorageUsed(user.id),
  ]);

  return { allowed: used + fileSizeBytes <= cap, used, cap, tier };
}
