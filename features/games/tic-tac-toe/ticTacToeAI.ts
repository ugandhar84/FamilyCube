/**
 * ticTacToeAI — solo-vs-AI opponent logic. Never touches the network/
 * gameStore at all (per the plan: solo-vs-AI is pure client-side state) —
 * these are plain functions the game screen calls synchronously after the
 * human's move to compute the AI's response.
 */
import { Board, checkWinner, legalMoves } from './ticTacToeLogic';

export type Difficulty = 'easy' | 'medium' | 'hard';

function randomMove(board: Board): number {
  const moves = legalMoves(board);
  return moves[Math.floor(Math.random() * moves.length)];
}

// Returns the move index that gives `symbol` an immediate win, if any.
function findImmediateWin(board: Board, symbol: 'X' | 'O'): number | null {
  for (const i of legalMoves(board)) {
    const trial = [...board];
    trial[i] = symbol;
    if (checkWinner(trial) === symbol) return i;
  }
  return null;
}

// 9-cell board — full minimax with no pruning needed, resolves instantly
// (worst case a few hundred leaf evaluations, since terminal states prune
// naturally via early returns). +10 for an AI win, -10 for an opponent
// win, 0 for a draw, discounted by depth so the AI prefers a FASTER win
// and a SLOWER loss when multiple lines lead to the same outcome.
function minimax(board: Board, aiSymbol: 'X' | 'O', currentPlayer: 'X' | 'O', depth: number): number {
  const winner = checkWinner(board);
  if (winner === aiSymbol) return 10 - depth;
  if (winner !== null) return depth - 10;
  const moves = legalMoves(board);
  if (moves.length === 0) return 0;

  const opponent: 'X' | 'O' = currentPlayer === 'X' ? 'O' : 'X';
  const scores = moves.map(i => {
    const trial = [...board];
    trial[i] = currentPlayer;
    return minimax(trial, aiSymbol, opponent, depth + 1);
  });
  return currentPlayer === aiSymbol ? Math.max(...scores) : Math.min(...scores);
}

function bestMinimaxMove(board: Board, aiSymbol: 'X' | 'O'): number {
  const opponent: 'X' | 'O' = aiSymbol === 'X' ? 'O' : 'X';
  let bestScore = -Infinity;
  let bestMove = legalMoves(board)[0];
  for (const i of legalMoves(board)) {
    const trial = [...board];
    trial[i] = aiSymbol;
    const score = minimax(trial, aiSymbol, opponent, 1);
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

/**
 * Picks the AI's move given the current board and its assigned symbol.
 * - easy: uniform-random legal move.
 * - medium: take an immediate win if available, else block the
 *   opponent's immediate win, else random. No lookahead beyond 1 ply.
 * - hard: full minimax — unbeatable (worst case, forces a draw).
 */
export function pickAiMove(board: Board, aiSymbol: 'X' | 'O', difficulty: Difficulty): number {
  if (difficulty === 'easy') return randomMove(board);

  if (difficulty === 'medium') {
    const winMove = findImmediateWin(board, aiSymbol);
    if (winMove !== null) return winMove;
    const opponentSymbol: 'X' | 'O' = aiSymbol === 'X' ? 'O' : 'X';
    const blockMove = findImmediateWin(board, opponentSymbol);
    if (blockMove !== null) return blockMove;
    return randomMove(board);
  }

  return bestMinimaxMove(board, aiSymbol);
}
