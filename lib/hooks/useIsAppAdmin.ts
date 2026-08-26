// Shared "is this auth session a platform admin" check — backs both the
// admin console's own gate (features/admin/_layout.tsx) and the hidden
// entry point in ProfileSettingsScreen. Single source of truth so the two
// checks can never drift (a parent who shouldn't see the entry point must
// never be able to reach the gate either, and vice versa).
//
// Reads app_admins directly (RLS: app_admins_select_self — a user can only
// SELECT their own row), so a non-admin's query simply returns no row
// rather than an authorization error. Not cached across app restarts on
// purpose — admin status is rare to check and security-sensitive enough
// that a stale "yes" is worse than one extra network round trip.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useIsAppAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setIsAdmin(false); setLoading(false); }
        return;
      }
      const { data, error } = await supabase
        .from('app_admins')
        .select('auth_user_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setIsAdmin(!error && !!data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { isAdmin, loading };
}
