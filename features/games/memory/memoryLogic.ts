/**
 * memoryLogic — pure deck generation, grid sizing, and scoring for solo
 * Memory. Card shape mirrors the server's exactly (accept_game_challenge's
 * memory branch / submit_game_move's memory branch) so solo and
 * multiplayer share one mental model even though solo never touches the
 * DB: { id, pairId, faceUp, matchedBy }.
 */

export interface MemoryCard {
  id: number;
  pairId: number;
  faceUp: boolean;
  matchedBy: string | null; // solo: 'human' | 'ai' | null
}

export type MemoryDifficulty = 'easy' | 'medium' | 'hard';

// Mirrors accept_game_challenge's pair_count-by-difficulty exactly (6/8/12
// pairs = 4x3/4x4/6x4 grids).
export const PAIR_COUNT: Record<MemoryDifficulty, number> = { easy: 6, medium: 8, hard: 12 };
export const GRID_COLUMNS: Record<MemoryDifficulty, number> = { easy: 4, medium: 4, hard: 4 };
// Time limit mirrors accept_game_challenge's time_limit_seconds exactly
// (null/untimed at easy).
export const TIME_LIMIT_SECONDS: Record<MemoryDifficulty, number | null> = { easy: null, medium: 90, hard: 120 };

// A curated set of large, high-contrast emoji — legible at small card
// sizes and distinct from each other at a glance (no near-duplicate faces).
const CARD_FACES = [
  '🐶', '🐱', '🦊', '🐻', '🐼', '🦁', '🐸', '🐵',
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍉', '🥝', '🍒',
  '⚽️', '🏀', '🎸', '🎨', '🚀', '⭐️', '🌈', '🎲',
];

export function faceFor(pairId: number): string {
  return CARD_FACES[pairId % CARD_FACES.length];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateDeck(difficulty: MemoryDifficulty): MemoryCard[] {
  const pairCount = PAIR_COUNT[difficulty];
  const ids = shuffle(Array.from({ length: pairCount * 2 }, (_, i) => i));
  return ids.map((id, ord) => ({ id, pairId: ord % pairCount, faceUp: false, matchedBy: null }));
}

export function isDeckComplete(cards: MemoryCard[]): boolean {
  return cards.every(c => c.matchedBy !== null);
}

// Higher is better, matching game_scores.score's universal "desc" ordering.
export function computeMemoryScore(params: {
  difficulty: MemoryDifficulty; moveCount: number; timeElapsedSeconds: number;
}): number {
  const { difficulty, moveCount, timeElapsedSeconds } = params;
  const BASE_SCORE = 1000;
  const parMoves = PAIR_COUNT[difficulty] * 2;
  const movePenalty = Math.max(0, moveCount - parMoves) * 15;
  const timePenalty = difficulty === 'easy' ? 0 : timeElapsedSeconds * 2;
  const difficultyBonus = { easy: 0, medium: 200, hard: 500 }[difficulty];
  return Math.max(0, BASE_SCORE - movePenalty - timePenalty) + difficultyBonus;
}
