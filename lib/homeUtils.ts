/**
 * homeUtils.ts — pure utility functions and constants for the Home screen.
 *
 * Intentionally free of React Native imports so these helpers can be used in
 * both component files and plain TypeScript modules without bundler side-effects.
 *
 * Exports:
 *  - DISCOVER_CHIPS          — category filter chip config for the Discover section.
 *  - CATEGORY_VARIANTS       — deterministic emoji + gradient variants per partner category.
 *  - placeVariant()          — picks a variant for a partner by id hash or position index.
 *  - darkenHex / lightenHex  — hex colour manipulation for banner gradient derivation.
 *  - hexLuminance()          — WCAG relative luminance for contrast-safe text colour choice.
 *  - greetingWord()          — time-of-day greeting string (morning / afternoon / evening).
 *  - getWeatherGradient()    — hero card gradient based on condition, temperature, and time.
 *  - extractYouTubeId()      — parses a YouTube URL into its 11-char video id.
 *  - MOOD_DAYS / MOOD_BAR_COLORS — 7-day mood chart config.
 *  - PROD_CAT_COLOR / PROD_CAT_EMOJI — product carousel category style config.
 *  - CATEGORY_COLOR          — sponsored partner category accent colours.
 */
// No React Native imports — all pure JS/TS

import type { PartnerCategory } from '@/lib/discovery';

// ── Discover category chips ──────────────────────────────────────────────────
export const DISCOVER_CHIPS: { label: string; emoji: string; value: PartnerCategory | null }[] = [
  { label: 'All',        emoji: '',   value: null },
  { label: 'Vets',       emoji: '🏥', value: 'vet' },
  { label: 'Grooming',   emoji: '✂️', value: 'grooming' },
  { label: 'Pet Stores', emoji: '🦴', value: 'food' },
  { label: 'Boarding',   emoji: '🏠', value: 'boarding' },
  { label: 'Dog Parks',  emoji: '🎾', value: 'training' },
];

// Multiple visual variants per category — assigned deterministically per place by id hash
export const CATEGORY_VARIANTS: Record<string, { emoji: string; grad: [string, string] }[]> = {
  vet: [
    { emoji: '🏥', grad: ['#C9B8EC', '#7C5CBF'] },
    { emoji: '🩺', grad: ['#B8D4EC', '#3A7BD5'] },
    { emoji: '💉', grad: ['#B8ECE4', '#1A8A72'] },
    { emoji: '❤️', grad: ['#F5B8C8', '#D5314A'] },
    { emoji: '🐾', grad: ['#ECE0B8', '#C47F17'] },
  ],
  grooming: [
    { emoji: '✂️', grad: ['#F5C9A8', '#FF8C55'] },
    { emoji: '🛁', grad: ['#A8D4F5', '#4A9FD5'] },
    { emoji: '🪮', grad: ['#F5A8D0', '#D5317A'] },
    { emoji: '💅', grad: ['#D4A8F5', '#8F3FD5'] },
  ],
  food: [
    { emoji: '🦴', grad: ['#A8E6DA', '#4ECDC4'] },
    { emoji: '🐟', grad: ['#A8C4F5', '#3A6FD5'] },
    { emoji: '🛒', grad: ['#B8F5A8', '#3FAF2A'] },
    { emoji: '🐾', grad: ['#F5E6A8', '#D5A017'] },
    { emoji: '🥩', grad: ['#F5A8A8', '#D53030'] },
  ],
  boarding: [
    { emoji: '🏠', grad: ['#F5DCA8', '#E8A320'] },
    { emoji: '🐕', grad: ['#C4D4F5', '#4A6FD5'] },
    { emoji: '🌙', grad: ['#C4A8F5', '#7040D5'] },
  ],
  training: [
    { emoji: '🎾', grad: ['#A8F0C6', '#2ECC71'] },
    { emoji: '🌳', grad: ['#B8F5A8', '#2F9E1A'] },
    { emoji: '🐕', grad: ['#F5E0A8', '#D5891A'] },
  ],
  other: [
    { emoji: '🐾', grad: ['#C9B8EC', '#7C5CBF'] },
  ],
};

/**
 * Returns the visual variant (emoji + gradient) for a partner place.
 * When `catIndex` is provided (count of same-category partners before this one),
 * it cycles deterministically through variants in order. Otherwise it hashes the
 * place `id` so the same place always gets the same look across re-renders.
 */
export function placeVariant(id: string, cat: string, catIndex?: number): { emoji: string; grad: [string, string] } {
  const variants = CATEGORY_VARIANTS[cat] ?? CATEGORY_VARIANTS.other;
  if (catIndex !== undefined) return variants[catIndex % variants.length];
  // Simple djb2-style hash — deterministic and fast for short strings.
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return variants[hash % variants.length];
}

export function darkenHex(hex: string, ratio = 0.35): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - Math.round(255 * ratio));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * ratio));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * ratio));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function lightenHex(hex: string, ratio = 0.6): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (n >> 16) + Math.round((255 - (n >> 16)) * ratio));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round((255 - ((n >> 8) & 0xff)) * ratio));
  const b = Math.min(255, (n & 0xff) + Math.round((255 - (n & 0xff)) * ratio));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Computes WCAG 2.1 relative luminance of a hex colour — used to choose white vs dark text. */
export function hexLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0.5;
  const n = parseInt(clean, 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8)  & 0xff) / 255;
  const b = ( n        & 0xff) / 255;
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Returns a time-aware greeting word: "Good morning", "Good afternoon", or "Good evening". */
export function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Returns a two-stop gradient for the Home screen hero card based on weather condition,
 * temperature, and time of day. Storm / snow / rain get dark moody tones; clear sunny
 * days get bright blues; sunrise/sunset get warm oranges and purples.
 */
export function getWeatherGradient(condition: string | null, tempF: number | null, isDark: boolean): [string, string] {
  const c    = (condition ?? '').toLowerCase();
  const hour = new Date().getHours();
  const isNight   = hour < 6 || hour >= 20;
  const isSunrise = hour >= 5 && hour < 8;
  const isSunset  = hour >= 18 && hour < 20;
  const hot  = tempF !== null && tempF >= 85;
  const cold = tempF !== null && tempF < 40;

  const isRainy  = c.includes('rain') || c.includes('drizzle') || c.includes('shower');
  const isStormy = c.includes('storm') || c.includes('thunder');
  const isSnowy  = c.includes('snow') || c.includes('sleet') || c.includes('blizzard');
  const isFoggy  = c.includes('fog');
  const isClear  = c.includes('clear') || c.includes('sunny') || c.includes('fair');

  if (isStormy)                        return ['#1A1A2E', '#4A0F2E'];
  if (isSnowy)                         return ['#1E3A5F', '#4A7FA5'];
  if (isRainy)                         return ['#1C3A4A', '#2E6B8A'];
  if (isFoggy)                         return ['#3A3A4A', '#5A5A6A'];
  if (isNight && isClear && cold)      return ['#0D0D2B', '#1A1A4A'];
  if (isNight && isClear)              return ['#0F0C29', '#302B63'];
  if (isNight)                         return ['#1A1A3A', '#2D2D5A'];
  if (isSunrise)                       return ['#B34700', '#F4A261'];
  if (isSunset)                        return ['#8B2FC9', '#E07B39'];
  if (isClear && hot)                  return ['#B35C00', '#E8A030'];
  if (isClear)                         return ['#1565C0', '#42A5F5'];
  if (cold)                            return ['#1A3A5C', '#2E6B9E'];
  if (hot)                             return ['#7B2D00', '#C85A00'];
  return isDark ? ['#1A2744', '#2A3F6F'] : ['#1565C0', '#5B9BD5'];
}

/** Extracts the 11-character video ID from a YouTube watch, embed, or shorts URL. Returns null on no match. */
export function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// 7-day mood chart labels
export const MOOD_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const MOOD_BAR_COLORS: Record<string, string> = {
  happy: '#7C5CBF',
  playful: '#FF8C55',
  tired: '#94A3B8',
  grumpy: '#E8A320',
  anxious: '#E24B4A',
  calm: '#4ECDC4',
  excited: '#FF6B6B',
};

// Product carousel colours
export const PROD_CAT_COLOR: Record<string, string> = {
  food: '#16A34A', treats: '#E8A320', supplement: '#7C5CBF', supplies: '#3B82F6',
  toy: '#FF8C55', grooming: '#0891B2', health: '#E24B4A',
};
export const PROD_CAT_EMOJI: Record<string, string> = {
  food: '🥩', treats: '🦴', supplement: '💊', supplies: '🛒',
  toy: '🎾', grooming: '✂️', health: '❤️‍🩹',
};

// Sponsored / partner category colours
export const CATEGORY_COLOR: Record<string, string> = {
  vet: '#E24B4A', food: '#16A34A', grooming: '#A855F7',
  boarding: '#FF8C55', training: '#3B82F6', other: '#8B8FA8',
};
