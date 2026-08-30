import { localDateStr } from '@/lib/dates';
import { BRAND } from '../shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Meal {
  id: string; day: string; title: string; type: string;
  ingredients: string[]; chef_id: string | null; week_of: string;
  emoji?: string | null; prep_minutes?: number | null; dietary_tags?: string[];
  kid_friendly_rating?: number | null; prep_steps?: string[];
  ai_generated?: boolean;
  // Display string from the time picker, e.g. "6:00 PM" — same convention
  // as calendar_events.start_time — plus the IANA zone it was entered in.
  // Both optional: a meal with no time set gets no reminder.
  start_time?: string | null;
  timezone?: string | null;
  linked_event_id?: string | null;
}

export interface AiMealOption {
  mealName: string; emoji?: string; prepMinutes: number;
  dietaryTags: string[]; kidFriendlyRating: number; ingredientsList: string[];
  prepSteps?: string[];
}

export interface AiDayOptions {
  day: string;
  options: AiMealOption[];
}

export interface AiMealResult {
  weeklyOptions: AiDayOptions[];
  groceryAutoList: string[];
  nutritionCoachingTip: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MEAL_CACHE_KEY = 'cubeai_meal_plan_cache_v2';
export const CACHE_TTL_MS   = 6 * 60 * 60 * 1000;
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Parse which days the user is asking about from their prompt
export function detectDays(prompt: string): string[] {
  const p = prompt.toLowerCase();
  const todayJs = new Date().getDay(); // 0=Sun
  const todayIdx = todayJs === 0 ? 6 : todayJs - 1; // Mon=0 … Sun=6

  if (/\btoday\b/.test(p))    return [DAYS[todayIdx]];
  if (/\btomorrow\b/.test(p)) return [DAYS[(todayIdx + 1) % 7]];
  if (/\bweekend\b/.test(p))  return ['Sat', 'Sun'];
  if (/\bweekdays?\b/.test(p)) return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  const dayMap: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
    friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu',
    fri: 'Fri', sat: 'Sat', sun: 'Sun',
  };
  const mentioned = Object.entries(dayMap)
    .filter(([k]) => new RegExp(`\\b${k}\\b`).test(p))
    .map(([, v]) => v);
  const unique = [...new Set(mentioned)];
  if (unique.length) return unique;

  const nextMatch = p.match(/next\s+(\d+)\s+days?/);
  if (nextMatch) {
    const n = Math.min(parseInt(nextMatch[1]), 7);
    return Array.from({ length: n }, (_, i) => DAYS[(todayIdx + i) % 7]);
  }

  return DAYS; // default: full week
}
export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const categorizeItem = (name: string): string => {
  const n = name.toLowerCase();
  if (/chicken|beef|turkey|pork|salmon|shrimp|lamb|tuna|meat|sausage/.test(n)) return 'Meat';
  if (/milk|cheese|cheddar|parmesan|yogurt|butter|cream|dairy/.test(n)) return 'Dairy';
  if (/potato|zucchini|broccoli|carrot|lettuce|tomato|onion|garlic|pepper|spinach|apple|banana|fruit|veggie/.test(n)) return 'Produce';
  return 'Pantry';
};

export const weekOf = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1);
  return localDateStr(d);
};

export const MEAL_EMOJIS = ['🍗','🥩','🐟','🍣','🍤','🥚','🧆','🌮','🌯','🥗','🍜','🍝','🍛','🍲','🥘','🫕','🥙','🍱','🥞','🫔','🧇','🍔','🍕','🥪','🧋','🥣','🍚','🍙','🍘','🥟'];
export const DIETARY_OPTIONS = ['Vegetarian','Vegan','Gluten-Free','Dairy-Free','Nut-Free','High-Protein','Low-Carb','Kid-Friendly'];

export const MEAL_TYPE_COLOR: Record<string, string> = {
  lunch:     BRAND.teal,
  dinner:    BRAND.purple,
  breakfast: BRAND.amber,
  snack:     BRAND.rose,
};
