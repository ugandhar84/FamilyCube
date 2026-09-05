/**
 * memoryAI — "seen cards" recall model for solo Memory. Tracks every card
 * either player has ever flipped face-up (mirrors what a human remembers
 * across turns) and consults that memory with a per-difficulty recall
 * chance, rather than seeing the whole board like a naive bot would.
 */
import { MemoryCard } from './memoryLogic';
import type { MemoryDifficulty } from './memoryLogic';

// cardId -> pairId, accumulated from every flip by either player.
export type SeenMap = Map<number, number>;

export function recordSeen(seen: SeenMap, card: MemoryCard) {
  seen.set(card.id, card.pairId);
}

function faceDownIds(cards: MemoryCard[]): number[] {
  return cards.filter(c => c.matchedBy === null).map(c => c.id);
}

// Independent recall roll per seen card, re-rolled every time the AI looks
// (not a fixed subset) — a card "half-remembered" one turn may be
// forgotten the next, same as Easy/Medium human play often feels.
function recalledSubset(seen: SeenMap, difficulty: MemoryDifficulty): SeenMap {
  if (difficulty === 'easy') return new Map();
  const recallChance = difficulty === 'hard' ? 1 : 0.5;
  const out: SeenMap = new Map();
  for (const [cardId, pairId] of seen) {
    if (Math.random() < recallChance) out.set(cardId, pairId);
  }
  return out;
}

// Finds a face-down pair the AI currently "remembers" (both cards' ids
// known and still unmatched). Returns null if it doesn't recall a
// complete pair right now.
function findRecalledPair(cards: MemoryCard[], recalled: SeenMap): [number, number] | null {
  const faceDown = new Set(faceDownIds(cards));
  const byPair = new Map<number, number[]>();
  for (const [cardId, pairId] of recalled) {
    if (!faceDown.has(cardId)) continue;
    const list = byPair.get(pairId) ?? [];
    list.push(cardId);
    byPair.set(pairId, list);
  }
  for (const [, ids] of byPair) {
    if (ids.length >= 2) return [ids[0], ids[1]];
  }
  return null;
}

function randomFaceDown(cards: MemoryCard[], exclude: number[] = []): number {
  const candidates = faceDownIds(cards).filter(id => !exclude.includes(id));
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Picks the AI's two flips for one turn. `onFirstFlip` is called with the
 * first card id so the caller can update `seen` (the AI "sees" its own
 * first flip) before the second pick is made — mirrors submit_game_move's
 * own two-call-per-turn shape.
 */
export function pickAiMemoryTurn(
  cards: MemoryCard[], seen: SeenMap, difficulty: MemoryDifficulty,
): { first: number; second: (revealedFirstPairId: number) => number } {
  const recalled = recalledSubset(seen, difficulty);
  const knownPair = findRecalledPair(cards, recalled);

  const first = knownPair ? knownPair[0] : randomFaceDown(cards);

  return {
    first,
    second: (revealedFirstPairId: number) => {
      // After seeing the first card for real, check recall again — the
      // AI's own first flip is now part of what it "knows" this turn.
      if (knownPair) return knownPair[1];
      const rechecked = recalledSubset(seen, difficulty);
      for (const [cardId, pairId] of rechecked) {
        if (cardId === first) continue;
        if (pairId === revealedFirstPairId) {
          const stillFaceDown = new Set(faceDownIds(cards));
          if (stillFaceDown.has(cardId)) return cardId;
        }
      }
      return randomFaceDown(cards, [first]);
    },
  };
}
