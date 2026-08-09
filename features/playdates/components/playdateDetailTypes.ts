/**
 * Shared types and helpers for the Playdate Detail screen.
 */
import { format, parseISO } from 'date-fns';
import { formatTime } from '@/lib/units';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Pet {
  id: string; name: string; emoji: string;
  accent_color?: string | null; avatar_url?: string | null;
}

export interface PlaydateRequest {
  id: string;
  from_pet_id: string; to_pet_id: string;
  from_owner_id: string; to_owner_id: string;
  responder_user_id?: string | null;
  cancel_reason?: string | null;
  status: string;
  proposed_date?: string | null; proposed_time?: string | null; proposed_end_time?: string | null;
  proposed_location?: string | null; message?: string | null;
  agreed_date?: string | null; agreed_time?: string | null; agreed_location?: string | null;
  expires_at?: string | null;
  from_confirmed?: boolean | null; to_confirmed?: boolean | null;
  from_pet: Pet; to_pet: Pet;
}

export interface Proposal {
  id: string; request_id: string;
  proposed_by_pet_id: string; proposed_by_owner_id: string;
  proposed_date: string; proposed_time: string; proposed_end_time?: string | null;
  proposed_location: string; message?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'superseded';
  round: number; created_at: string;
}

export interface OwnerContact { full_name: string | null; handle: string | null; phone: string | null; }

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtDate(date?: string | null) {
  if (!date) return '';
  try { return format(parseISO(date), 'EEE, MMM d, yyyy'); } catch { return date; }
}

export function fmtTime(time?: string | null) {
  if (!time) return '';
  try {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return formatTime(d);
  } catch { return time.substring(0, 5); }
}

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
