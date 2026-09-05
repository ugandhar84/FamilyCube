/**
 * ticTacToeLogic — pure win/draw detection, shared by the client-side AI
 * (ticTacToeAI.ts) and the solo-vs-AI game screen's own move handling.
 * Mirrors submit_game_move's server-side win-check exactly (same 8-line
 * enumeration) — kept as a SEPARATE implementation, not shared code
 * between client and RPC, since the RPC is Postgres/PL-pgSQL and this is
 * TypeScript; the server copy is the actual source of truth for
 * multiplayer, this one exists for solo play (no server round-trip at
 * all) and for the AI to evaluate hypothetical boards during minimax.
 */

export type Cell = 'X' | 'O' | null;
export type Board = Cell[]; // length 9, index 0-8, row-major

export const LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export function checkWinner(board: Board): 'X' | 'O' | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}

// Returns the specific winning line (for drawing the win-line overlay),
// or null if there is no winner yet.
export function checkWinningLine(board: Board): [number, number, number] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return line;
    }
  }
  return null;
}

export function isDraw(board: Board): boolean {
  return checkWinner(board) === null && board.every(c => c !== null);
}

export function isGameOver(board: Board): boolean {
  return checkWinner(board) !== null || isDraw(board);
}

export function emptyBoard(): Board {
  return Array(9).fill(null);
}

export function legalMoves(board: Board): number[] {
  return board.reduce<number[]>((acc, c, i) => { if (c === null) acc.push(i); return acc; }, []);
}
