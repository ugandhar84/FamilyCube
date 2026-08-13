import { supabase } from '@/lib/supabase';

export type CustomDomain = 'event' | 'quest';

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
  const { data } = await supabase
    .from('family_custom_categories')
    .select('key, label, emoji, color, coins_default, sort_order')
    .eq('family_id', familyId)
    .eq('domain', domain)
    .order('sort_order');
  return (data ?? []).map(r => ({
    key:          r.key,
    label:        r.label,
    emoji:        r.emoji,
    color:        r.color,
    coinsDefault: r.coins_default ?? undefined,
    sortOrder:    r.sort_order,
  }));
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
  const { data } = await supabase
    .from('family_custom_suggestions')
    .select('title, use_count')
    .eq('family_id', familyId)
    .eq('domain', domain)
    .eq('category', category)
    .order('use_count', { ascending: false })
    .limit(10);
  return (data ?? []).map(r => ({ title: r.title, hint: '✨ Your family' }));
}

export async function recordCustomSuggestion(
  familyId: string,
  domain: CustomDomain,
  category: string,
  title: string,
): Promise<void> {
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
