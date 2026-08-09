import { supabase } from '@/lib/supabase';

export type ExpenseCategory =
  | 'food' | 'medication' | 'vaccine' | 'vet'
  | 'grooming' | 'boarding' | 'accessories' | 'toys' | 'recreation' | 'insurance' | 'other';

export interface PetExpense {
  id: string;
  pet_id: string;
  category: ExpenseCategory;
  amount: number;
  expense_date: string;
  title: string | null;
  notes: string | null;
  created_at: string;
}

const COLS = 'id,pet_id,category,amount,expense_date,title,notes,created_at';

export async function getExpenses(
  petId: string | string[],
  from?: string,   // inclusive YYYY-MM-DD
  to?: string,     // inclusive YYYY-MM-DD
): Promise<PetExpense[]> {
  const ids = Array.isArray(petId) ? petId : [petId];
  let q = supabase.from('pet_expenses').select(COLS).in('pet_id', ids);
  if (from) q = q.gte('expense_date', from);
  if (to)   q = q.lte('expense_date', to);
  const { data, error } = await q.order('expense_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PetExpense[];
}

export async function saveExpense(
  petId: string,
  payload: Omit<PetExpense, 'id' | 'pet_id' | 'created_at'>,
  id?: string,
): Promise<void> {
  const row = { pet_id: petId, ...payload };
  const { error } = id
    ? await supabase.from('pet_expenses').update(row).eq('id', id)
    : await supabase.from('pet_expenses').insert(row);
  if (error) throw error;
}

export async function isDuplicateExpense(
  petId: string,
  title: string,
  category: ExpenseCategory,
  amount: number,
  expense_date: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('pet_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('pet_id', petId)
    .eq('expense_date', expense_date)
    .eq('category', category)
    .eq('amount', amount)
    .ilike('title', title);
  return (count ?? 0) > 0;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('pet_expenses').delete().eq('id', id);
  if (error) throw error;
}

export const EXPENSE_CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; emoji: string; color: string }> = {
  food:        { label: 'Food',        emoji: '🍖', color: '#E8A320' },
  medication:  { label: 'Medication',  emoji: '💊', color: '#7C5CBF' },
  vaccine:     { label: 'Vaccine',     emoji: '💉', color: '#3B82F6' },
  vet:         { label: 'Vet visit',   emoji: '🩺', color: '#E24B4A' },
  grooming:    { label: 'Grooming',    emoji: '✂️', color: '#FF8C55' },
  boarding:    { label: 'Boarding / Care', emoji: '🏠', color: '#0EA5E9' },
  accessories: { label: 'Accessories', emoji: '🛍️', color: '#16A34A' },
  toys:        { label: 'Toys',        emoji: '🧸', color: '#06B6D4' },
  recreation:  { label: 'Recreation',  emoji: '🎾', color: '#F43F5E' },
  insurance:   { label: 'Insurance',   emoji: '🛡️', color: '#4F46E5' },
  other:       { label: 'Other',       emoji: '📦', color: '#9A8FC0' },
};

export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_CONFIG) as ExpenseCategory[];
