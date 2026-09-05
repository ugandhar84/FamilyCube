/**
 * snakeLogic — pure movement/collision/food-spawn/speed-table for solo
 * Snake. No AI needed (solo only, per the plan) — this is the entire game
 * engine, driven by a fixed-size grid and a tick interval that speeds up
 * with difficulty.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export interface Point { x: number; y: number }
export type SnakeDifficulty = 'easy' | 'medium' | 'hard';

// 20x20 = 400 cells. Chosen against the board now filling most of the
// screen (see SnakeGame's boardSize math): on a ~390pt-wide phone the board
// lands near 360pt, giving ~18pt cells — big enough that the snake and food
// read clearly at arm's length, while 400 plain <View> cells stays cheap
// enough to re-render every tick without a canvas layer. Going higher (24+)
// shrinks cells below ~15pt where the 1pt inset margin starts to dominate;
// going lower makes the bigger board feel coarse and empty.
export const GRID_SIZE = 20;
// Tick interval in ms — lower is faster. Hard also grows the snake faster
// per food (below) for extra pressure beyond raw speed.
export const TICK_MS: Record<SnakeDifficulty, number> = { easy: 180, medium: 130, hard: 95 };
export const GROWTH_PER_FOOD: Record<SnakeDifficulty, number> = { easy: 1, medium: 1, hard: 2 };
export const DIFFICULTY_MULTIPLIER: Record<SnakeDifficulty, number> = { easy: 1.0, medium: 1.5, hard: 2.0 };

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function isOpposite(a: Direction, b: Direction): boolean {
  return OPPOSITE[a] === b;
}

export function initialSnake(): Point[] {
  const mid = Math.floor(GRID_SIZE / 2);
  return [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
}

function stepFor(direction: Direction): Point {
  switch (direction) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

export function nextHead(head: Point, direction: Direction): Point {
  const step = stepFor(direction);
  return { x: head.x + step.x, y: head.y + step.y };
}

export function isOutOfBounds(p: Point): boolean {
  return p.x < 0 || p.y < 0 || p.x >= GRID_SIZE || p.y >= GRID_SIZE;
}

export function isSelfCollision(head: Point, body: Point[]): boolean {
  return body.some(seg => seg.x === head.x && seg.y === head.y);
}

export function randomEmptyCell(occupied: Point[]): Point {
  const occupiedSet = new Set(occupied.map(p => `${p.x},${p.y}`));
  const free: Point[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!occupiedSet.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  return free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
}

export function computeSnakeScore(params: { difficulty: SnakeDifficulty; foodEaten: number; snakeLength: number; startingLength: number }): number {
  const { difficulty, foodEaten, snakeLength, startingLength } = params;
  const multiplier = DIFFICULTY_MULTIPLIER[difficulty];
  return Math.round((foodEaten * 100 + (snakeLength - startingLength) * 10) * multiplier);
}
