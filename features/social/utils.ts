/**
 * utils — pure helper functions for the Social feature.
 *
 * Contains four categories of utilities:
 *   1. @mention parsing — detecting and inserting @handles in text fields
 *   2. Time formatting — human-readable relative and absolute timestamps
 *   3. String / geo helpers — initials, state abbreviations, haversine distance
 *   4. UI config factories — event-type and playdate-status display configs
 *
 * All functions are side-effect-free and safe to import in any environment.
 */

import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { formatTime } from '@/lib/units';
import { showAlert } from '@/components/AppAlert';
import { CANCEL_REASONS } from './types';

// ── @mention utilities ─────────────────────────────────────────────────────────

/** Extract the @-word currently being typed, or null if cursor isn't inside one */
export function getMentionQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const m = before.match(/@([a-zA-Z0-9_]*)$/);
  return m ? m[1] : null;
}

/** Replace the @-word at cursor position with the chosen handle */
export function insertMention(text: string, cursor: number, handle: string): { text: string; cursor: number } {
  const before = text.slice(0, cursor);
  const after  = text.slice(cursor);
  const replaced = before.replace(/@([a-zA-Z0-9_]*)$/, `@${handle} `);
  return { text: replaced + after, cursor: replaced.length };
}

/** Extract all @handles from a piece of text */
export function extractHandles(text: string): string[] {
  return [...new Set((text.match(/@([a-zA-Z0-9_]+)/g) ?? []).map(h => h.slice(1).toLowerCase()))];
}

// ── Time helpers ───────────────────────────────────────────────────────────────

/** Returns a friendly relative timestamp like "3 minutes ago" */
export function relTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)  return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}hr ago`;
    const d = Math.floor(h / 24);
    if (d < 7)   return `${d}d ago`;
    const w = Math.floor(d / 7);
    if (w < 5)   return `${w}w ago`;
    return format(parseISO(iso), 'MMM d');
  } catch { return ''; }
}

/**
 * Returns a contextual edit timestamp — recent edits get a relative label
 * ("just now", "3h ago") while older ones show the day or date to keep it
 * scannable in a feed where many posts may be edited.
 */
export function editedTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    if (h < 48) return `yesterday at ${formatTime(parseISO(iso))}`;
    if (h < 168) return `${format(parseISO(iso), 'EEE')} ${formatTime(parseISO(iso))}`;
    return `${format(parseISO(iso), 'MMM d')} · ${formatTime(parseISO(iso))}`;
  } catch { return ''; }
}

// ── String helpers ─────────────────────────────────────────────────────────────

/** Returns up to 2 uppercase initials from a display name — used as avatar fallback text */
export function initials(name: string): string {
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

/** Converts a full US state name to its two-letter abbreviation, or returns the name unchanged */
export const usStateAbbr = (name: string): string => US_STATE_ABBR_MAP[name] ?? name;

const US_STATE_ABBR_MAP: Record<string, string> = {
  Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',
  Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',
  Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',
  Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',
  Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV',
  'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
  'North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',
  Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',
  Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA',
  'West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY','District of Columbia':'DC',
};

// ── Distance ───────────────────────────────────────────────────────────────────

/** Great-circle distance in kilometres between two GPS coordinates */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Pet age ────────────────────────────────────────────────────────────────────

/** Returns a compact age string like "8mo" or "3y" — empty string if no birthday set */
export function petAgeLabel(birthDate: string | null): string {
  if (!birthDate) return '';
  const months = Math.floor((Date.now() - new Date(birthDate).getTime()) / (1000*60*60*24*30.44));
  return months < 12 ? `${months}mo` : `${Math.floor(months/12)}y`;
}

// ── Event types ────────────────────────────────────────────────────────────────

/**
 * Returns a map of event-type keys to display config (label, icon, colour).
 * Takes `colors` so accent colours can adapt to the current theme.
 */
export function getEventTypes(colors: any): Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> {
  return {
    meetup:      { label: 'Meetup',      icon: 'people-outline',    color: '#FF8C55'      },
    vaccination: { label: 'Vaccination', icon: 'medical-outline',   color: colors.success },
    adoption:    { label: 'Adoption',    icon: 'heart-outline',     color: colors.danger  },
    walk:        { label: 'Group Walk',  icon: 'footsteps-outline', color: colors.primary },
    training:    { label: 'Training',    icon: 'school-outline',    color: colors.info    },
    other:       { label: 'Other',       icon: 'calendar-outline',  color: colors.warning },
  };
}

// ── Status config ──────────────────────────────────────────────────────────────

/**
 * Returns a map of playdate-status keys to display config (label, colour, icon).
 * Used by NearbyPetCard to badge each card with the current request state.
 */
export function getStatusCfg(colors: any): Record<string, { label: string; color: string; icon: any }> {
  return {
    pending:      { label: 'Request sent',   color: '#FF8C55',      icon: 'time-outline'            },
    scheduling:   { label: 'Scheduling',     color: '#FF8C55',      icon: 'calendar-outline'        },
    incoming:     { label: 'Wants to play!', color: colors.primary, icon: 'paw-outline'             },
    accepted:     { label: 'Accepted',       color: '#14B8A6',      icon: 'checkmark-circle-outline' },
    declined:     { label: 'Declined',       color: colors.danger,  icon: 'close-circle-outline'    },
    negotiating:  { label: 'Scheduling',     color: colors.primary, icon: 'chatbubble-outline'      },
    agreed:       { label: 'Scheduled ✅',   color: colors.success, icon: 'calendar-outline'        },
  };
}

// ── Cancel reason picker ───────────────────────────────────────────────────────

/** Returns the selected reason string, null for "No reason", or undefined if dismissed. */
export function pickCancelReason(): Promise<string | null | undefined> {
  return new Promise(resolve =>
    showAlert(
      'Reason for cancelling',
      'The other pet\'s parent will be notified.',
      [
        ...CANCEL_REASONS.map(r => ({ text: r, onPress: () => resolve(r) })),
        { text: 'No reason', onPress: () => resolve(null) },
        { text: 'Keep it', style: 'cancel' as const, onPress: () => resolve(undefined) },
      ],
    ),
  );
}
