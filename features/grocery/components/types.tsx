import { ComponentType } from 'react';
import {
  Apple, Milk, Wheat, Beef, Carrot, Cookie, Snowflake,
  ShoppingBasket, Sandwich, Wine, Croissant, Fish,
  Nut, ShoppingCart,
} from 'lucide-react-native';
import { GroceryItem } from '@/store/groceryStore';

// ─── Category suggestions ─────────────────────────────────────────────────────

export const CATEGORIES = ['Produce', 'Dairy', 'Grains', 'Spices', 'Meat', 'Snacks', 'Beverages', 'Frozen', 'Cleaning', 'Personal Care', 'Bakery', 'Seafood', 'Deli', 'Frozen Meals', 'Other'];
export const CAT_ICON: Record<string, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Produce:        Carrot,
  Dairy:          Milk,
  Grains:         Wheat,
  Spices:         Apple,       // closest available; spice jar not in lucide
  Meat:           Beef,
  Snacks:         Cookie,
  Beverages:      Wine,
  Frozen:         Snowflake,
  Cleaning:       ShoppingBasket,
  'Personal Care': Nut,
  Bakery:         Croissant,
  Seafood:        Fish,
  Deli:           Sandwich,
  'Frozen Meals': Snowflake,
  Other:          ShoppingCart,
};
export const CAT_EMOJI: Record<string, string> = {
  Produce: '🥦', Dairy: '🥛', Grains: '🌾', Spices: '🌶️', Meat: '🥩',
  Snacks: '🍿', Beverages: '🧃', Frozen: '🧊', Cleaning: '🧹', 'Personal Care': '🧴',
  Bakery: '🥐', Seafood: '🐟', Deli: '🥪', 'Frozen Meals': '🧊', Other: '📦',
};

export function CatIcon({ category, size = 20, color }: { category?: string; size?: number; color?: string }) {
  const Ic = CAT_ICON[category ?? 'Other'] ?? ShoppingCart;
  return <Ic size={size} color={color} strokeWidth={1.8} />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000)   return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function catDotColor(colors: any): Record<string, string> {
  return {
    Produce: colors.teal, Dairy: colors.teal, Meat: colors.teal, Frozen: colors.teal,
    Grains: colors.amber, Snacks: colors.amber, Beverages: colors.amber,
    Cleaning: colors.primary, 'Personal Care': colors.primary, Spices: colors.primary,
    Other: colors.textTertiary,
  };
}

export function fmtProvenance(item: GroceryItem, members: any[]) {
  const time = new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dateStr = fmtDate(item.createdAt);
  if (item.aiGenerated) return `Added by ✨ AI · ${dateStr} ${time}`;
  const member = members.find(m => m.id === item.addedBy);
  const name   = member?.name?.split(' ')[0] ?? 'Someone';
  return `Added by ${name} · ${dateStr}`;
}

export function mapBoughtRow(r: any): GroceryItem {
  return {
    id: r.id, familyId: r.family_id, name: r.name,
    quantity: r.quantity ?? undefined, category: r.category ?? undefined,
    storePreference: r.store_preference ?? undefined, notes: r.notes ?? undefined,
    addedBy: r.added_by ?? '', isBought: true,
    boughtBy: r.bought_by ?? undefined, boughtAt: r.bought_at ?? undefined,
    estimatedPrice: r.estimated_price ?? undefined, aiGenerated: r.ai_generated ?? false,
    createdAt: r.created_at,
  } as GroceryItem;
}

// ─── Quick-add suggestions ──────────────────────────────────────────────────

export const QUICK_SUGGESTIONS = [
  { name: 'Milk',     cat: 'Dairy',    emoji: '🥛' },
  { name: 'Eggs',     cat: 'Dairy',    emoji: '🥚' },
  { name: 'Bread',    cat: 'Bakery',   emoji: '🍞' },
  { name: 'Rice',     cat: 'Grains',   emoji: '🍚' },
  { name: 'Onion',    cat: 'Produce',  emoji: '🧅' },
  { name: 'Tomato',   cat: 'Produce',  emoji: '🍅' },
  { name: 'Banana',   cat: 'Produce',  emoji: '🍌' },
  { name: 'Butter',   cat: 'Dairy',    emoji: '🧈' },
  { name: 'Chicken',  cat: 'Meat',     emoji: '🍗' },
  { name: 'Pasta',    cat: 'Grains',   emoji: '🍝' },
  { name: 'Salt',     cat: 'Spices',   emoji: '🧂' },
  { name: 'Oil',      cat: 'Other',    emoji: '🫙' },
  { name: 'Water',    cat: 'Beverages',emoji: '💧' },
  { name: 'Coffee',   cat: 'Beverages',emoji: '☕' },
];

export interface AiSuggestedItem {
  name: string;
  quantity?: string;
  category?: string;
  storePreference?: string;
  notes?: string;
  isDuplicate?: boolean;
}

export const AI_QUICK_PROMPTS = ['Weekly staples', 'Healthy breakfast', 'School lunch', 'Weekend BBQ', 'Party for 12', 'Sunday cooking'];
