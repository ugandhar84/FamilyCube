import type { GroceryCategory, GroceryStore } from '@/store/groceryStore';
import type { FamilyMember } from '@/store/familyStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
export function formatDay(iso: string) {
  const d     = new Date(iso);
  const today = new Date();
  const yest  = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString())  return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Matches colors.primary's light-mode value — these voice subcomponents
// (VoiceNoteBubble/VoiceReviewBar/RecordingBar) don't receive the colors
// object as a prop, so this stays a direct brand-purple constant rather
// than threading colors through every one of them for this pass.
export const VOICE_COLOR     = '#9261C7';
export const QUICK_REACTIONS = ['❤️', '👍', '😋', '🙌', '🌟', '😂'];
export type GroupChannel = { id: string; label: string; isDM: false; lock: boolean; seniorOnly?: boolean };

// Fallback for a family with no members loaded yet (e.g. initial render) —
// most callers should prefer buildGroupChannels(members) below, which
// derives the maternal/paternal/grand-squad split from actual GP data.
export const GROUP_CHANNELS: GroupChannel[] = [
  { id: 'all',     label: '#all-family',       isDM: false, lock: false },
  { id: 'parents', label: '🔒 #parents-vault', isDM: false, lock: true },
];

// Same maternal/paternal derivation as FamilyTreeView.tsx's sideForGp/sideLabel
// (linkedParentId → that parent's relationship 'Mother'/'Father') — grand-
// parents are split into two side channels plus a combined "Grand Squad"
// channel, replacing the old single flat #seniors channel. A side's channel
// is only included if at least one senior actually belongs to it, so a
// family with GPs on only one side doesn't get an empty second tab.
export function buildGroupChannels(members: FamilyMember[]): GroupChannel[] {
  const parents = members.filter(m => m.role === 'parent');
  const seniors = members.filter(m => m.role === 'senior');

  const sideForGp = (gp: FamilyMember): 'a' | 'b' | 'unlinked' => {
    if (!gp.linkedParentId) return 'unlinked';
    if (gp.linkedParentId === parents[0]?.id) return 'a';
    if (gp.linkedParentId === parents[1]?.id) return 'b';
    return 'unlinked';
  };
  const sideLabel = (p?: FamilyMember): string | undefined =>
    p?.relationship === 'Mother' ? 'Maternal' : p?.relationship === 'Father' ? 'Paternal' : undefined;

  const sideA = seniors.filter(gp => sideForGp(gp) === 'a');
  const sideB = seniors.filter(gp => sideForGp(gp) === 'b');
  const unlinked = seniors.filter(gp => sideForGp(gp) === 'unlinked');

  const channels: GroupChannel[] = [
    { id: 'all',     label: '#all-family',       isDM: false, lock: false },
    { id: 'parents', label: '🔒 #parents-vault', isDM: false, lock: true },
  ];

  const labelA = sideLabel(parents[0]);
  const labelB = sideLabel(parents[1]);
  if (sideA.length > 0) {
    channels.push({ id: 'seniors_a', label: `👶 ${labelA ?? 'Grandparents'} Grands`, isDM: false, lock: false, seniorOnly: true });
  }
  if (sideB.length > 0) {
    channels.push({ id: 'seniors_b', label: `👶 ${labelB ?? 'Grandparents'} Grands`, isDM: false, lock: false, seniorOnly: true });
  }
  // Unlinked seniors (no side determined) fold into whichever side channel
  // exists, or get their own fallback channel if neither side is set up yet.
  if (unlinked.length > 0 && sideA.length === 0 && sideB.length === 0) {
    channels.push({ id: 'seniors_a', label: '👵 Grandparents', isDM: false, lock: false, seniorOnly: true });
  }
  if (seniors.length > 0) {
    channels.push({ id: 'seniors_all', label: '#the-grand-squad', isDM: false, lock: false, seniorOnly: true });
  }
  return channels;
}
export const GROCERY_CATS: GroceryCategory[]  = ['Produce','Dairy & Eggs','Bakery','Pantry','Frozen','Household','Snacks','Pharmacy','Pet Store','Other'];
export const GROCERY_STORES: GroceryStore[]   = ['Costco','Supermarket',"Trader Joe's",'Target','Pharmacy','Pet Store','Other'];

// ─── Waveform helpers ─────────────────────────────────────────────────────────

export const WF_BARS = 36;
export const WF_H    = 36; // container height px

/** Deterministic "fingerprint" waveform from a seed string (uri / msgId). */
export function seedWaveform(seed: string): number[] {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) & 0x7fffffff;
  return Array.from({ length: WF_BARS }, (_, i) => {
    const x   = i / WF_BARS;
    const ph  = ((h >>> (i % 20)) & 0xff) / 255;
    const raw = 0.08
      + 0.42 * Math.abs(Math.sin(x * Math.PI * 5  + ph * Math.PI * 2))
      + 0.28 * Math.abs(Math.sin(x * Math.PI * 9  + ph * Math.PI * 3.7))
      + 0.14 * Math.abs(Math.sin(x * Math.PI * 14 + ph * Math.PI * 1.3));
    return Math.min(1, raw);
  });
}

// ─── Message bubble constants ─────────────────────────────────────────────────

export const BUBBLE_R  = 16; // standard corners — matches Ask Cube's bubble radius
export const BUBBLE_SM = 4;  // tail corner (last in group)

// Automated broadcast alerts (En Route pings, missed-pickup warnings, etc.)
// are plain text with no severity field in ChatMessage/the DB — rather than
// a schema change, senders prefix the text with one of these emoji markers
// and the bubble picks up a matching tint. Order matters: check the more
// urgent marker first since a message could theoretically start with either.
export const ALERT_MARKERS: { prefix: string; tint: 'danger' | 'warning' | 'success' }[] = [
  { prefix: '🚨', tint: 'danger' },   // e.g. "Pickup not confirmed yet"
  { prefix: '⚠️', tint: 'warning' },  // e.g. running late, needs attention
  { prefix: '🚗', tint: 'success' },  // routine En Route / trip broadcast
  { prefix: '✅', tint: 'success' },  // pickup confirmed / task taken over
];

export function detectAlertTint(text: string): 'danger' | 'warning' | 'success' | null {
  const marker = ALERT_MARKERS.find(m => text.startsWith(m.prefix));
  return marker?.tint ?? null;
}

export const SHARE_KIND_META: Record<string, { label: string; icon: string; accentKey: string }> = {
  meal:   { label: 'Meal',   icon: '🍽️', accentKey: 'amber' },
  event:  { label: 'Event',  icon: '📅', accentKey: 'primary' },
  quest:  { label: 'Quest',  icon: '✅', accentKey: 'kid' },
};

// ─── Swipeable bubble thresholds ──────────────────────────────────────────────

export const SWIPE_REPLY_THRESHOLD = 56;
export const SWIPE_MAX_RIGHT       = 72;
export const SWIPE_MAX_LEFT        = -52;

// ─── Collapsible text ─────────────────────────────────────────────────────────

export const COLLAPSE_LINES = 10;
