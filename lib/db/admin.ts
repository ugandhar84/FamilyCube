import { supabase } from '@/lib/supabase';
import { todayLocal, localDateStr } from '@/lib/dates';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminStats = {
  totalUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  usersOnboarded: number;
  usersWithConsent: number;
  totalPets: number;
  activePets: number;
  avgPetsPerUser: number;
  totalFamilyLinks: number;
  totalPosts: number;
  pendingModeration: number;
  activeSponsored: number;
  moodScansToday: number;
  feedLogsToday: number;
  postsToday: number;
  walksToday: number;
  groomToday: number;
  dauToday: number;
  wauLast7: number;
  weeklyGrowthPct: number;
  aiCostToday: number;
  aiCallsToday: number;
  signupTrend: number[];
  recentSignups: { id: string; name: string | null; created_at: string }[];
  speciesBreakdown: { species: string; count: number }[];
};

export type AdminListing = {
  id: string;
  category: string;
  business_name: string;
  tagline: string | null;
  logo_url: string | null;
  cover_url: string | null;
  city: string | null;
  website_url: string | null;
  phone: string | null;
  address: string | null;
  state: string | null;
  description: string | null;
  cta_label: string | null;
  cta_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  priority: number;
  impressions: number;
  clicks: number;
  starts_at: string | null;
  ends_at: string | null;
  target_species: string[];
  video_url: string | null;
  created_at: string;
};

export type AdminUserRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  onboarding_completed: boolean;
  ai_mood_consent: boolean;
  is_admin: boolean;
  pet_count: number;
  family_count: number;
};

export type UserFilter = 'all' | 'new7d' | 'onboarded' | 'consented' | 'admin';
export type UserSort   = 'newest' | 'oldest' | 'az';

export type ModerationPost = {
  id: string;
  caption: string | null;
  photo_url: string | null;
  media_type: 'photo' | 'video' | null;
  video_url: string | null;
  created_at: string;
  is_flagged: boolean;
  is_hidden: boolean;
  is_media_blocked: boolean;
  moderated: boolean;
  author_id: string;
  author_name: string | null;
  pet_name: string | null;
  likes_count: number;
  report_count: number;
};

export type ModerationTab = 'reported' | 'flagged' | 'recent' | 'all';

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

export type AdminAnalytics = {
  totalUsers: number;
  usersLast7: number;
  usersLast30: number;
  usersWithConsent: number;
  usersOnboarded: number;
  totalPets: number;
  activePets: number;
  avgPetsPerUser: number;
  petsBySpecies: { species: string; count: number }[];
  totalFamilyLinks: number;
  caretakers: number;
  viewers: number;
  avgFamilyPerPet: number;
  feedLogsLast7: number;
  moodLogsLast7: number;
  groomLogsLast7: number;
  walkLogsLast7: number;
  totalPosts: number;
  postsLast7: number;
  totalLikes: number;
  playdateRequests: number;
};

export type PetProduct = {
  id: string;
  brand: string | null;
  name: string;
  category: string;
  species: string | null;
  breed_size: string | null;
  min_age_years: number | null;
  max_age_years: number | null;
  price: number | null;
  original_price: number | null;
  emoji: string | null;
  image_url: string | null;
  video_url: string | null;
  android_video_url: string | null;
  deal_type: 'clearance' | 'rollback' | null;
  sponsored: boolean;
  sponsor_rank: number;
  cta_label: string;
  cta_url: string | null;
  active: boolean;
  created_at: string;
};

const USERS_PAGE = 30;

// ── Dashboard stats ───────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStats> {
  const now     = new Date();
  const today   = todayLocal();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i));
    return localDateStr(d);
  });

  const todayStr = localDateStr(now);

  const [
    { count: totalUsers },
    { count: newToday },
    { count: newWeek },
    { count: onboarded },
    { count: consent },
    { count: totalPets },
    { count: activePets },
    { count: totalFamily },
    { count: totalPosts },
    { count: pendingMod },
    { count: activeSponsored },
    { count: moodToday },
    { count: feedToday },
    { count: postsToday },
    { count: walksToday },
    { count: groomToday },
    { data: dauRows },
    { data: wauRows },
    { data: usageToday },
    { data: speciesRows },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).not('ai_consent_accepted_at', 'is', null),
    supabase.from('pets').select('id', { count: 'exact', head: true }),
    supabase.from('pets').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('pet_family').select('id', { count: 'exact', head: true }),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('is_flagged', true).eq('moderated', false),
    supabase.from('sponsored_listings').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('mood_logs').select('id', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('feeding_logs').select('id', { count: 'exact', head: true }).gte('fed_at', today),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).gte('created_at', today),
    // Walks completed today
    supabase.from('daily_checklist').select('id', { count: 'exact', head: true })
      .eq('type', 'walk').eq('completed', true).gte('completed_at', today),
    // Grooming sessions today (done_at is a date column)
    supabase.from('grooming_logs').select('id', { count: 'exact', head: true }).eq('done_at', todayStr),
    // DAU: distinct users who logged a meal today
    supabase.from('feeding_logs').select('fed_by').gte('fed_at', today).not('fed_by', 'is', null),
    // WAU: distinct users who logged a meal in last 7 days
    supabase.from('feeding_logs').select('fed_by').gte('fed_at', weekAgo).not('fed_by', 'is', null),
    supabase.from('api_usage_logs').select('cost_usd').gte('called_at', today),
    // Active pets for species breakdown
    supabase.from('pets').select('species').eq('is_active', true),
  ]);

  // Signups in last 7d — also used for recent joins feed and sparkline
  const { data: signupRows } = await supabase
    .from('profiles')
    .select('id,full_name,created_at')
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false });

  const trendMap: Record<string, number> = {};
  for (const r of signupRows ?? []) {
    const day = (r.created_at as string).slice(0, 10);
    trendMap[day] = (trendMap[day] ?? 0) + 1;
  }
  const signupTrend = days7.map(d => trendMap[d] ?? 0);
  const recentSignups = (signupRows ?? []).slice(0, 5).map((r: any) => ({
    id: r.id, name: r.full_name as string | null, created_at: r.created_at as string,
  }));

  const aiCostToday  = (usageToday ?? []).reduce((s: number, r: any) => s + (r.cost_usd ?? 0), 0);
  const aiCallsToday = (usageToday ?? []).length;
  const dauToday     = new Set((dauRows ?? []).map((r: any) => r.fed_by)).size;
  const wauLast7     = new Set((wauRows ?? []).map((r: any) => r.fed_by)).size;
  const total        = totalUsers ?? 0;
  const prevTotal    = Math.max(total - (newWeek ?? 0), 1);
  const weeklyGrowthPct = Math.round(((newWeek ?? 0) / prevTotal) * 100);

  const specMap: Record<string, number> = {};
  for (const r of (speciesRows ?? [])) specMap[r.species] = (specMap[r.species] ?? 0) + 1;
  const speciesBreakdown = Object.entries(specMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([species, count]) => ({ species, count }));

  return {
    totalUsers:        total,
    newUsersToday:     newToday        ?? 0,
    newUsersWeek:      newWeek         ?? 0,
    usersOnboarded:    onboarded       ?? 0,
    usersWithConsent:  consent         ?? 0,
    totalPets:         totalPets       ?? 0,
    activePets:        activePets      ?? 0,
    avgPetsPerUser:    total ? Math.round(((activePets ?? 0) / total) * 10) / 10 : 0,
    totalFamilyLinks:  totalFamily     ?? 0,
    totalPosts:        totalPosts      ?? 0,
    pendingModeration: pendingMod      ?? 0,
    activeSponsored:   activeSponsored ?? 0,
    moodScansToday:    moodToday       ?? 0,
    feedLogsToday:     feedToday       ?? 0,
    postsToday:        postsToday      ?? 0,
    walksToday:        walksToday      ?? 0,
    groomToday:        groomToday      ?? 0,
    dauToday,
    wauLast7,
    weeklyGrowthPct,
    aiCostToday,
    aiCallsToday,
    signupTrend,
    recentSignups,
    speciesBreakdown,
  };
}

// ── Sponsored listings (admin) ────────────────────────────────────────────────

export async function getAdminSponsoredListings(category?: string | null): Promise<AdminListing[]> {
  let q = supabase
    .from('sponsored_listings')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AdminListing[];
}

export async function toggleSponsoredActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('sponsored_listings').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deleteSponsoredListing(id: string): Promise<void> {
  const { error } = await supabase.from('sponsored_listings').delete().eq('id', id);
  if (error) throw error;
}

export async function getSponsoredListingById(id: string): Promise<AdminListing | null> {
  const { data, error } = await supabase
    .from('sponsored_listings').select('*').eq('id', id).single();
  if (error) throw error;
  return data as AdminListing | null;
}

export async function createSponsoredListing(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('sponsored_listings').insert(payload);
  if (error) throw error;
}

export async function updateSponsoredListing(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('sponsored_listings').update(payload).eq('id', id);
  if (error) throw error;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getAdminUsers(opts: {
  filter: UserFilter;
  sort: UserSort;
  search: string;
  fromDate?: Date | null;
  toDate?: Date | null;
  offset: number;
}): Promise<{ users: AdminUserRow[]; hasMore: boolean }> {
  const { filter, sort, search, fromDate, toDate, offset } = opts;

  let query = supabase
    .from('profiles')
    .select('id,full_name,avatar_url,created_at,onboarding_completed,ai_mood_consent,is_admin');

  const w7 = new Date(Date.now() - 7 * 86400000).toISOString();
  if (filter === 'new7d')     query = query.gte('created_at', w7);
  if (filter === 'onboarded') query = query.eq('onboarding_completed', true);
  if (filter === 'consented') query = query.eq('ai_mood_consent', true);
  if (filter === 'admin')     query = query.eq('is_admin', true);

  if (fromDate) query = query.gte('created_at', fromDate.toISOString());
  if (toDate) {
    const end = new Date(toDate); end.setHours(23, 59, 59, 999);
    query = query.lte('created_at', end.toISOString());
  }

  if (search.trim()) query = query.ilike('full_name', `%${search.trim()}%`);

  if (sort === 'newest')      query = query.order('created_at', { ascending: false });
  else if (sort === 'oldest') query = query.order('created_at', { ascending: true });
  else                        query = query.order('full_name',   { ascending: true });

  query = query.range(offset, offset + USERS_PAGE - 1);

  const { data, error } = await query;
  if (error) throw error;

  const userIds = (data ?? []).map((u: any) => u.id as string);
  const [petRows, famRows] = await Promise.all(
    userIds.length > 0
      ? [
          supabase.from('pets').select('owner_id').in('owner_id', userIds),
          supabase.from('pet_family').select('user_id').in('user_id', userIds),
        ]
      : [Promise.resolve({ data: [] as any[] }), Promise.resolve({ data: [] as any[] })],
  );
  const petCounts: Record<string, number> = {};
  const famCounts: Record<string, number> = {};
  ((petRows as any).data ?? []).forEach((r: any) => { petCounts[r.owner_id] = (petCounts[r.owner_id] ?? 0) + 1; });
  ((famRows as any).data ?? []).forEach((r: any) => { famCounts[r.user_id] = (famCounts[r.user_id] ?? 0) + 1; });
  const enriched: AdminUserRow[] = (data ?? []).map((u: any) => ({
    ...u, pet_count: petCounts[u.id] ?? 0, family_count: famCounts[u.id] ?? 0,
  }));

  return { users: enriched, hasMore: (data?.length ?? 0) === USERS_PAGE };
}

export async function setUserAdmin(userId: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', userId);
  if (error) throw error;
}

// ── Moderation ────────────────────────────────────────────────────────────────

export async function getModerationPosts(
  tab: ModerationTab,
  fromDate?: Date | null,
  toDate?: Date | null,
): Promise<ModerationPost[]> {
  // For 'reported' tab: join post_reports count, filter ≥50 reports, not yet moderated
  if (tab === 'reported') {
    const { data, error } = await supabase.rpc('get_reported_posts', { min_reports: 50 });
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      id:               p.id,
      caption:          p.caption,
      photo_url:        p.photo_url,
      media_type:       p.media_type ?? null,
      video_url:        p.video_url ?? null,
      created_at:       p.created_at,
      is_flagged:       p.is_flagged,
      is_hidden:        p.is_hidden ?? false,
      is_media_blocked: p.is_media_blocked ?? false,
      moderated:        p.moderated,
      author_id:        p.author_id,
      likes_count:      p.likes_count,
      report_count:     p.report_count,
      author_name:      p.author_name ?? null,
      pet_name:         p.pet_name ?? null,
    }));
  }

  let q = supabase
    .from('social_posts')
    .select('id,caption,photo_url,media_type,video_url,created_at,is_flagged,is_hidden,is_media_blocked,moderated,author_id,likes_count,profiles(full_name),pets(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (tab === 'flagged') q = q.eq('is_flagged', true).eq('moderated', false);
  if (fromDate) q = q.gte('created_at', fromDate.toISOString());
  if (toDate) {
    const end = new Date(toDate); end.setHours(23, 59, 59, 999);
    q = q.lte('created_at', end.toISOString());
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((p: any) => ({
    id:               p.id,
    caption:          p.caption,
    photo_url:        p.photo_url,
    media_type:       p.media_type ?? null,
    video_url:        p.video_url ?? null,
    created_at:       p.created_at,
    is_flagged:       p.is_flagged,
    is_hidden:        p.is_hidden ?? false,
    is_media_blocked: p.is_media_blocked ?? false,
    moderated:        p.moderated,
    author_id:        p.author_id,
    likes_count:      p.likes_count,
    report_count:     0,
    author_name:      p.profiles?.full_name ?? null,
    pet_name:         p.pets?.name ?? null,
  }));
}

export async function approvePost(postId: string): Promise<void> {
  const { error } = await supabase.from('social_posts')
    .update({ is_flagged: false, is_hidden: false, moderated: true }).eq('id', postId);
  if (error) throw error;
}

export async function hidePost(postId: string): Promise<void> {
  const { error } = await supabase.from('social_posts')
    .update({ is_hidden: true, moderated: true }).eq('id', postId);
  if (error) throw error;
}

export async function blockPostMedia(postId: string): Promise<void> {
  const { error } = await supabase.from('social_posts')
    .update({ is_media_blocked: true, moderated: true }).eq('id', postId);
  if (error) throw error;
}

export async function unblockPostMedia(postId: string): Promise<void> {
  const { error } = await supabase.from('social_posts')
    .update({ is_media_blocked: false }).eq('id', postId);
  if (error) throw error;
}

export async function deleteAdminPost(postId: string): Promise<void> {
  const { error } = await supabase.from('social_posts').delete().eq('id', postId);
  if (error) throw error;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getAdminAnalytics(period: AnalyticsPeriod): Promise<AdminAnalytics> {
  const now   = new Date();
  const ms    = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 0;
  const since = ms > 0 ? new Date(now.getTime() - ms * 86400000).toISOString() : '2000-01-01T00:00:00Z';
  const d7    = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [
    { count: totalUsers },
    { count: usersLast7 },
    { count: usersLast30 },
    { count: usersConsent },
    { count: usersOnboarded },
    { count: totalPets },
    { count: activePets },
    { data: speciesRows },
    { count: totalFamily },
    { count: caretakers },
    { count: viewers },
    { count: feedLogs },
    { count: moodLogs },
    { count: groomLogs },
    { count: walkLogs },
    { count: totalPosts },
    { count: postsLast7 },
    { data: likesRows },
    { count: playdates },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('ai_mood_consent', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    supabase.from('pets').select('id', { count: 'exact', head: true }),
    supabase.from('pets').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('pets').select('species'),
    supabase.from('pet_family').select('id', { count: 'exact', head: true }),
    supabase.from('pet_family').select('id', { count: 'exact', head: true }).eq('role', 'caretaker'),
    supabase.from('pet_family').select('id', { count: 'exact', head: true }).eq('role', 'viewer'),
    supabase.from('feeding_logs').select('id', { count: 'exact', head: true }).gte('fed_at', d7),
    supabase.from('mood_logs').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    supabase.from('grooming_logs').select('id', { count: 'exact', head: true }).gte('done_at', d7),
    supabase.from('daily_checklist').select('id', { count: 'exact', head: true }).eq('type', 'walk').eq('completed', true).gte('completed_at', d7),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    supabase.from('social_posts').select('likes_count'),
    supabase.from('playdate_requests').select('id', { count: 'exact', head: true }),
  ]);

  const speciesMap: Record<string, number> = {};
  for (const r of speciesRows ?? []) speciesMap[r.species] = (speciesMap[r.species] ?? 0) + 1;
  const petsBySpecies = Object.entries(speciesMap)
    .sort((a, b) => b[1] - a[1])
    .map(([species, count]) => ({ species, count }));

  const totalLikes = (likesRows ?? []).reduce((s: number, r: any) => s + (r.likes_count ?? 0), 0);
  const avgPets    = totalUsers ? Math.round(((activePets ?? 0) / (totalUsers ?? 1)) * 10) / 10 : 0;
  const avgFamily  = totalPets  ? Math.round(((totalFamily ?? 0) / (totalPets ?? 1)) * 10) / 10 : 0;

  return {
    totalUsers:       totalUsers      ?? 0,
    usersLast7:       usersLast7      ?? 0,
    usersLast30:      usersLast30     ?? 0,
    usersWithConsent: usersConsent    ?? 0,
    usersOnboarded:   usersOnboarded  ?? 0,
    totalPets:        totalPets       ?? 0,
    activePets:       activePets      ?? 0,
    avgPetsPerUser:   avgPets,
    petsBySpecies,
    totalFamilyLinks: totalFamily     ?? 0,
    caretakers:       caretakers      ?? 0,
    viewers:          viewers         ?? 0,
    avgFamilyPerPet:  avgFamily,
    feedLogsLast7:    feedLogs        ?? 0,
    moodLogsLast7:    moodLogs        ?? 0,
    groomLogsLast7:   groomLogs       ?? 0,
    walkLogsLast7:    walkLogs        ?? 0,
    totalPosts:       totalPosts      ?? 0,
    postsLast7:       postsLast7      ?? 0,
    totalLikes,
    playdateRequests: playdates       ?? 0,
  };
}

// ── Pet Products (recommendations) ───────────────────────────────────────────

export async function getPetProducts(): Promise<PetProduct[]> {
  const { data, error } = await supabase
    .from('pet_products')
    .select('*')
    .order('sponsor_rank', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PetProduct[];
}

export async function getPetProductById(id: string): Promise<PetProduct | null> {
  const { data, error } = await supabase
    .from('pet_products').select('*').eq('id', id).single();
  if (error) throw error;
  return data as PetProduct | null;
}

export async function createPetProduct(payload: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.from('pet_products').insert(payload).select('id');
  if (error) throw new Error(error.message || 'Insert blocked — check admin RLS policies');
  if (!data || data.length === 0) throw new Error('Insert failed — row was not created (check RLS or constraints)');
}

export async function updatePetProduct(id: string, payload: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.from('pet_products').update(payload).eq('id', id).select('id');
  if (error) throw new Error(error.message || 'Update blocked — check admin RLS policies');
  if (!data || data.length === 0) throw new Error('Update blocked by RLS — admin write policy missing');
}

export async function deletePetProduct(id: string): Promise<void> {
  const { data, error } = await supabase.from('pet_products').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message || 'Delete blocked — check admin RLS policies');
  if (!data || data.length === 0) throw new Error('Delete blocked by RLS — admin write policy missing');
}

export async function togglePetProductActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('pet_products').update({ active: isActive }).eq('id', id);
  if (error) throw new Error(error.message || 'Toggle blocked — check admin RLS policies');
}

// ── App Config ────────────────────────────────────────────────────────────────

export type SpeciesEnabledMap = Record<string, boolean>;

export async function getSpeciesEnabled(): Promise<SpeciesEnabledMap> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'species_enabled')
    .single();
  if (error || !data) {
    // Fallback: all enabled except fish
    return { dog:true, cat:true, rabbit:true, horse:true, bird:true, fish:false, hamster:true, turtle:true, other:true };
  }
  return data.value as SpeciesEnabledMap;
}

export async function setSpeciesEnabled(map: SpeciesEnabledMap): Promise<void> {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: 'species_enabled', value: map, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
