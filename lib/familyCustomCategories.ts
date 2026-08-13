import { supabase } from '@/lib/supabase';

export type CustomDomain = 'event' | 'quest';

// ── In-memory cache ───────────────────────────────────────────────────────────
const _catCache  = new Map<string, CustomCategory[]>();   // key: `${familyId}:${domain}`
const _suggCache = new Map<string, { title: string; hint: string }[]>(); // key: `${familyId}:${domain}:${category}`

function catKey(familyId: string, domain: CustomDomain) { return `${familyId}:${domain}`; }
function suggKey(familyId: string, domain: CustomDomain, category: string) { return `${familyId}:${domain}:${category}`; }

export interface CustomCategory {
  key: string;
  label: string;
  emoji: string;
  color: string;
  coinsDefault?: number;
  sortOrder: number;
}

export interface CustomSuggestion {
  title: string;
  category: string;
  useCount: number;
}

// ── Custom categories ─────────────────────────────────────────────────────────

export async function fetchCustomCategories(
  familyId: string,
  domain: CustomDomain,
): Promise<CustomCategory[]> {
  const k = catKey(familyId, domain);
  if (_catCache.has(k)) return _catCache.get(k)!;

  const { data } = await supabase
    .from('family_custom_categories')
    .select('key, label, emoji, color, coins_default, sort_order')
    .eq('family_id', familyId)
    .eq('domain', domain)
    .order('sort_order');
  const result = (data ?? []).map(r => ({
    key:          r.key,
    label:        r.label,
    emoji:        r.emoji,
    color:        r.color,
    coinsDefault: r.coins_default ?? undefined,
    sortOrder:    r.sort_order,
  }));
  _catCache.set(k, result);
  return result;
}

export async function saveCustomCategory(
  familyId: string,
  domain: CustomDomain,
  cat: Omit<CustomCategory, 'sortOrder'>,
): Promise<void> {
  await supabase.from('family_custom_categories').upsert({
    family_id:     familyId,
    domain,
    key:           cat.key,
    label:         cat.label,
    emoji:         cat.emoji,
    color:         cat.color,
    coins_default: cat.coinsDefault ?? null,
  }, { onConflict: 'family_id,domain,key' });
}

// ── Custom suggestions ────────────────────────────────────────────────────────

export async function fetchCustomSuggestions(
  familyId: string,
  domain: CustomDomain,
  category: string,
): Promise<{ title: string; hint: string }[]> {
  const k = suggKey(familyId, domain, category);
  if (_suggCache.has(k)) return _suggCache.get(k)!;

  const { data } = await supabase
    .from('family_custom_suggestions')
    .select('title, use_count')
    .eq('family_id', familyId)
    .eq('domain', domain)
    .eq('category', category)
    .order('use_count', { ascending: false })
    .limit(10);
  const result = (data ?? []).map(r => ({ title: r.title, hint: '✨ Your family' }));
  _suggCache.set(k, result);
  return result;
}

// ── Cache write-through after recording a suggestion ──────────────────────────
function _appendSuggCache(familyId: string, domain: CustomDomain, category: string, title: string) {
  const k = suggKey(familyId, domain, category);
  const existing = _suggCache.get(k) ?? [];
  if (!existing.find(s => s.title === title)) {
    _suggCache.set(k, [{ title, hint: '✨ Your family' }, ...existing]);
  }
}

// ── Warmup: fetch all custom categories + suggestions at app start ────────────
export async function warmupCustomCache(familyId: string): Promise<void> {
  const domains: CustomDomain[] = ['event', 'quest'];
  await Promise.all(domains.map(async domain => {
    const cats = await fetchCustomCategories(familyId, domain); // fills _catCache
    // Fetch suggestions for all custom categories + 'Other'
    const categoriesToPreload = ['Other', ...cats.map(c => c.key)];
    await Promise.all(categoriesToPreload.map(cat => fetchCustomSuggestions(familyId, domain, cat)));
  }));
}

export async function recordCustomSuggestion(
  familyId: string,
  domain: CustomDomain,
  category: string,
  title: string,
): Promise<void> {
  _appendSuggCache(familyId, domain, category, title); // optimistic cache update
  // Upsert: increment use_count if already exists
  const { data: existing } = await supabase
    .from('family_custom_suggestions')
    .select('id, use_count')
    .eq('family_id', familyId)
    .eq('domain', domain)
    .eq('title', title)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('family_custom_suggestions')
      .update({ use_count: existing.use_count + 1 })
      .eq('id', existing.id);
  } else {
    await supabase.from('family_custom_suggestions').insert({
      family_id: familyId,
      domain,
      category,
      title,
      use_count: 1,
    });
  }
}
