/**
 * unoLogic — pure card-shape helpers and CLIENT-SIDE legality pre-checks
 * for Uno. The server (play_uno_card/draw_uno_card RPCs, already applied)
 * is the sole source of truth for every real state transition — this
 * file exists only so the UI can grey out illegal cards and the AI
 * (unoAI.ts) can reason about a hand, without a round-trip for every
 * hover/highlight decision. Card shape mirrors the server exactly:
 * { color: 'red'|'yellow'|'green'|'blue'|'wild', value: '0'-'9'|'skip'|
 * 'reverse'|'draw2'|'wild'|'wild4' }.
 */

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type UnoValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface UnoCard {
  color: UnoColor;
  value: UnoValue;
}

export const REAL_COLORS: Exclude<UnoColor, 'wild'>[] = ['red', 'yellow', 'green', 'blue'];

export function isWild(card: UnoCard): boolean {
  return card.color === 'wild';
}

export function isActionCard(card: UnoCard): boolean {
  return card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2' || card.value === 'wild4';
}

// Mirrors play_uno_card's own legality check exactly: a wild is always
// legal; otherwise the color must match (accounting for an active chosen
// wild color overriding the top card's own color) or the value must match.
export function isLegalPlay(card: UnoCard, topCard: UnoCard, activeWildColor: string | null): boolean {
  if (isWild(card)) return true;
  const effectiveColor = activeWildColor ?? topCard.color;
  return card.color === effectiveColor || card.value === topCard.value;
}

export function legalCardsInHand(hand: UnoCard[], topCard: UnoCard, activeWildColor: string | null): UnoCard[] {
  return hand.filter(c => isLegalPlay(c, topCard, activeWildColor));
}

export function cardKey(card: UnoCard): string {
  return `${card.color}:${card.value}`;
}

// Most common real (non-wild) color in a hand — used both by the AI's own
// wild-color choice and by a "suggested" color hint for a human player.
export function mostCommonColor(hand: UnoCard[]): Exclude<UnoColor, 'wild'> {
  const counts: Record<string, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) {
    if (c.color !== 'wild') counts[c.color]++;
  }
  let best: Exclude<UnoColor, 'wild'> = 'red';
  let bestCount = -1;
  for (const color of REAL_COLORS) {
    if (counts[color] > bestCount) { best = color; bestCount = counts[color]; }
  }
  return best;
}

export const UNO_COLOR_HEX: Record<UnoColor, string> = {
  red: '#E5443D', yellow: '#F2B705', green: '#2FAE5B', blue: '#2C7BE0', wild: '#1A1424',
};

export function valueLabel(value: UnoValue): string {
  switch (value) {
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    case 'draw2': return '+2';
    case 'wild': return '★';
    case 'wild4': return '+4';
    default: return value;
  }
}

// Character names for AI seats — a plain "AI" (or even "Medium AI") label
// is hard to track at a glance once a table has more than one AI seat,
// and "AI's turn"/"AI wins" reads as generic rather than as a specific
// opponent. Uno supports up to 4 total seats, so 4 names covers every
// possible table with room to spare. Keyed by SEAT NUMBER (0-3), not by
// player id or difficulty — a seat's name stays the same for the whole
// game regardless of hand contents, and two AI seats never collide since
// seats are unique per game by definition.
const AI_BOT_NAMES = ['Robo', 'Ace', 'Nova', 'Ziggy'] as const;

export function aiBotName(seat: number): string {
  return AI_BOT_NAMES[seat % AI_BOT_NAMES.length];
}
