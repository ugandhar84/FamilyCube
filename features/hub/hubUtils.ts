// Shared pure utilities for the Hub feature.

import { useState, useEffect } from 'react';

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtClock(): string {
  const now = new Date();
  const h = now.getHours();
  return `${h % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function fmtTime(t?: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function fmtHumanDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Compact inline variant for card subtitles (e.g. "Praveena · Today ·
// 9:00 PM") — fmtHumanDate's full "August 30, 2026" is too long for a
// one-line card, and doesn't call out Today/Tomorrow, the two dates a
// glance actually needs. Live-reported gap: an Action Needed ride card
// showed only the time, with no way to tell a ride happening in the next
// hour apart from one 10 days out.
export function fmtHumanDateShort(dateStr: string): string {
  const today = localToday();
  if (dateStr === today) return 'Today';
  const t = new Date(today + 'T00:00:00');
  t.setDate(t.getDate() + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  if (dateStr === tomorrow) return 'Tomorrow';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function hoursUntilEvent(dateStr: string, timeStr?: string): number {
  if (!timeStr) return 999;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [h, m] = timeStr.split(':').map(Number);
  const ev = new Date(year, month - 1, day, h, m, 0, 0);
  return (ev.getTime() - Date.now()) / 3600000;
}

export function isWorkEvent(ev: { category?: string }): boolean {
  return ev.category === 'Work';
}

const HOME_LOCATIONS = new Set([
  'home', 'house', 'living room', 'bedroom', 'kitchen', 'backyard', 'back yard',
  'garage', 'dining room', 'basement', 'garden', 'front yard', 'patio', 'deck',
]);

/** Returns true if the location is clearly inside the home — no driver needed. */
export function isHomeLocation(location?: string): boolean {
  if (!location) return false;
  return HOME_LOCATIONS.has(location.trim().toLowerCase());
}

export function minutesBetween(t1: string, t2: string): number {
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  return Math.abs((h1 * 60 + m1) - (h2 * 60 + m2));
}

import { BRAND } from '@/components/FamilyCubeLogo';

const CAT_COLOR: Record<string, string> = {
  Medical: '#EF4444', Work: BRAND.purple, Sports: '#10B981',
  School: BRAND.amber, Study: '#3B82F6', Event: BRAND.teal,
};

export function catColor(cat?: string): string {
  return cat ? (CAT_COLOR[cat] ?? BRAND.teal) : BRAND.teal;
}

// ─── Ride countdown hook ──────────────────────────────────────────────────────
// Shared by KidView/TeenView/SeniorView — any role that can be a ride's rider
// (not driver) needs the same "minutes until pickup" countdown for its own
// ride banner/hero card.
export function useCountdown(date?: string, time?: string) {
  const [mins, setMins] = useState<number | null>(null);
  useEffect(() => {
    if (!date || !time) { setMins(null); return; }
    const tick = () => {
      const [h, m] = time.split(':').map(Number);
      const target = new Date();
      target.setFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
      target.setHours(h, m, 0, 0);
      setMins(Math.round((target.getTime() - Date.now()) / 60000));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [date, time]);
  return mins;
}
