import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
// getSponsoredListings lives in lib/discovery.ts — use useSponsoredListings hook from lib/hooks/useHomeDashboard.ts

export interface HomeDashboard {
  counts:        { notes: number; moods: number; meals: number; grooming: number; weight: number; vet: number };
  next_vet:      string | null;
  last_vet:      { date: string; type: string; title: string } | null;
  scan_count:    number;
  latest_mood:   { mood_label: string; mood_score: number; date: string; created_at: string } | null;
  checklist:     any[];
  notif_general: number;
  notif_social:  number;
}

export interface GlobalSummary {
  counts:      { notes: number; moods: number; meals: number; grooming: number; weight: number; vet: number };
  tasks_done:  number;
  tasks_total: number;
  scan_count:  number;
  next_vet:    string | null;
  last_vet:    { date: string; type: string; title: string; pet_name?: string } | null;
  latest_mood: { mood_label: string; mood_score: number; date: string; photo_url: string | null; pet_id: string; pet_name: string } | null;
  pet_moods:   { pet_id: string; mood_label: string; mood_score: number; date: string; photo_url: string | null; pet_name: string }[];
}

export async function getGlobalSummary(userId: string, date?: string): Promise<GlobalSummary> {
  const params: any = { p_user_id: userId, p_date: date ?? format(new Date(), 'yyyy-MM-dd') };
  const { data, error } = await supabase.rpc('get_global_summary', params);
  if (error) {
    if (error.code === 'PGRST202') {
      console.warn('[home] get_global_summary RPC not found — run migration_global_summary_rpc.sql');
      return { counts: { notes:0, moods:0, meals:0, grooming:0, weight:0, vet:0 }, tasks_done:0, tasks_total:0, scan_count:0, next_vet:null, last_vet:null, latest_mood:null, pet_moods:[] };
    }
    throw error;
  }
  return data as GlobalSummary;
}

export async function getHomeDashboard(
  petId: string,
  userId: string,
  date?: string,
): Promise<HomeDashboard> {
  // p_date sent as text string — RPC accepts text and casts internally
  const params: any = { p_pet_id: petId, p_user_id: userId, p_date: date ?? format(new Date(), 'yyyy-MM-dd') };

  const { data, error } = await supabase.rpc('get_home_dashboard', params);
  // PGRST202 = function not found (migration not yet run) — return safe empty state
  if (error) {
    if (error.code === 'PGRST202') {
      console.warn('[home] get_home_dashboard RPC not found — run migration_home_dashboard_rpc.sql');
      return { counts: { notes:0, moods:0, meals:0, grooming:0, weight:0, vet:0 }, next_vet:null, last_vet:null, scan_count:0, latest_mood:null, checklist:[], notif_general:0, notif_social:0 };
    }
    throw error;
  }
  return data as HomeDashboard;
}

