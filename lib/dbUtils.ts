import { showAlert } from '@/components/AppAlert';

/**
 * Wraps any Supabase mutation in a try/catch, shows an alert on failure,
 * and returns true on success / false on failure so callers can gate state updates.
 *
 * Usage:
 *   const ok = await dbRun(() => supabase.from('x').delete().eq('id', id), 'Delete failed');
 *   if (ok) load();
 */
export async function dbRun(
  fn: () => PromiseLike<{ error: any }>,
  userMessage = 'Something went wrong. Please try again.',
): Promise<boolean> {
  try {
    const { error } = await fn();
    if (error) {
      console.error('[dbRun]', error.message);
      showAlert('Error', userMessage);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[dbRun] threw', e?.message);
    showAlert('Error', userMessage);
    return false;
  }
}

/** Fire-and-forget version — logs errors but never crashes. */
export function dbFire(fn: () => Promise<any>, label = 'dbFire'): void {
  fn().catch((e: any) => console.warn(`[${label}]`, e?.message ?? e));
}
