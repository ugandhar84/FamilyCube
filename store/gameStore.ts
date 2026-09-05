/**
 * gameStore — Family Games (Tic-Tac-Toe/Memory multiplayer challenges,
 * Uno tables, Snake/Memory leaderboard). Mirrors eventStore.ts's own
 * patterns throughout: the getFamilyId()/getActiveMemberId() reach-into-
 * useFamilyStore helpers, the module-level realtime channel singletons
 * with a hot-reload-safe stale-topic sweep, and the family-notifier
 * fire-and-forget notification helper shape.
 *
 * Solo-vs-AI play (Tic-Tac-Toe, Memory) never touches this store or the
 * database at all — that board state lives as local useState inside the
 * game components themselves, per the plan. This store is exclusively
 * the multiplayer/leaderboard surface: challenge/accept/decline, live
 * move sync, Uno tables, and score submission.
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

// ── Shared helpers (same reach-into-useFamilyStore pattern as eventStore.ts) ──

function getFamilyId(): string | null {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const s = useFamilyStore.getState();
    const m = s.members.find((m: any) => m.id === s.activeMemberId) ?? s.members[0];
    return (m as any)?.familyId ?? null;
  } catch { return null; }
}

function getActiveMemberId(): string | null {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const s = useFamilyStore.getState();
    return s.activeMemberId ?? s.members[0]?.id ?? null;
  } catch { return null; }
}

function notifyGameEvent(
  type: 'game_challenge_received' | 'game_challenge_accepted' | 'game_challenge_declined' | 'game_move_made' | 'game_completed' | 'uno_game_invite' | 'uno_your_turn',
  memberIds: string[],
  excludeMemberId: string | null,
  payload: Record<string, unknown>,
) {
  const familyId = getFamilyId();
  const recipients = memberIds.filter(id => id && id !== excludeMemberId);
  if (!familyId || !recipients.length) return;
  supabase.functions.invoke('family-notifier', {
    body: { type, familyId, memberIds: recipients, payload, persist: true, excludeMemberId: excludeMemberId ?? undefined },
  }).catch(e => console.warn('[gameStore] notify failed:', e?.message));
}

// ── Types (mirror the game_sessions/game_scores table shapes) ───────────────

export type GameType = 'tic_tac_toe' | 'memory';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type SessionStatus = 'pending' | 'active' | 'declined' | 'completed' | 'expired' | 'abandoned';

export interface GameSession {
  id: string;
  familyId: string;
  gameType: GameType;
  mode: 'solo_ai' | 'multiplayer';
  difficulty: Difficulty;
  challengerId: string;
  challengedId: string | null;
  status: SessionStatus;
  currentTurnMemberId: string | null;
  boardState: any;
  winnerId: string | null;
  result: 'win' | 'draw' | 'tie' | null;
  moveCount: number | null;
  timeLimitSeconds: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface GameWinTally {
  id: string;
  familyId: string;
  memberId: string;
  gameType: 'tic_tac_toe' | 'memory' | 'uno';
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArcadeStats {
  memberId: string;
  familyId: string;
  totalXp: number;
  level: number;
}

export interface GameScore {
  id: string;
  familyId: string;
  memberId: string;
  gameType: 'snake' | 'memory';
  difficulty: Difficulty;
  score: number;
  snakeLength: number | null;
  snakeFoodEaten: number | null;
  memoryMoves: number | null;
  memoryTimeSeconds: number | null;
  sessionId: string | null;
  createdAt: string;
}

function fromSessionRow(row: any): GameSession {
  return {
    id: row.id,
    familyId: row.family_id,
    gameType: row.game_type,
    mode: row.mode,
    difficulty: row.difficulty,
    challengerId: row.challenger_id,
    challengedId: row.challenged_id ?? null,
    status: row.status,
    currentTurnMemberId: row.current_turn_member_id ?? null,
    boardState: row.board_state,
    winnerId: row.winner_id ?? null,
    result: row.result ?? null,
    moveCount: row.move_count ?? null,
    timeLimitSeconds: row.time_limit_seconds ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? null,
  };
}

// ── Uno types (mirror uno_games_public/uno_players_public exactly — these
// are the ONLY tables/views this store ever reads Uno state from; the base
// uno_games/uno_players tables have no grants at all, see the migration's
// own comment on why a security_invoker view would have silently broken
// this). hand is null for every seat except the caller's own — the view
// itself enforces that redaction, not this client code. ──

export type UnoStatus = 'lobby' | 'active' | 'completed' | 'abandoned';

export interface UnoGame {
  id: string;
  familyId: string;
  status: UnoStatus;
  direction: 1 | -1;
  currentTurnSeat: number;
  drawPileCount: number;
  discardPile: { color: string; value: string }[];
  pendingDrawCount: number;
  activeWildColor: string | null;
  winnerId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnoPlayer {
  id: string;
  gameId: string;
  seat: number;
  memberId: string | null;
  isAi: boolean;
  aiDifficulty: 'easy' | 'medium' | 'hard' | null;
  handCount: number;
  hand: { color: string; value: string }[] | null; // only populated for the caller's own seat
  hasCalledUno: boolean;
  createdAt: string;
  updatedAt: string;
}

function fromUnoGameRow(row: any): UnoGame {
  return {
    id: row.id,
    familyId: row.family_id,
    status: row.status,
    direction: row.direction,
    currentTurnSeat: row.current_turn_seat,
    drawPileCount: row.draw_pile_count,
    discardPile: row.discard_pile ?? [],
    pendingDrawCount: row.pending_draw_count,
    activeWildColor: row.active_wild_color ?? null,
    winnerId: row.winner_id ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromUnoPlayerRow(row: any): UnoPlayer {
  return {
    id: row.id,
    gameId: row.game_id,
    seat: row.seat,
    memberId: row.member_id ?? null,
    isAi: row.is_ai,
    aiDifficulty: row.ai_difficulty ?? null,
    handCount: row.hand_count,
    hand: row.hand ?? null,
    hasCalledUno: row.has_called_uno,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromScoreRow(row: any): GameScore {
  return {
    id: row.id,
    familyId: row.family_id,
    memberId: row.member_id,
    gameType: row.game_type,
    difficulty: row.difficulty,
    score: row.score,
    snakeLength: row.snake_length ?? null,
    snakeFoodEaten: row.snake_food_eaten ?? null,
    memoryMoves: row.memory_moves ?? null,
    memoryTimeSeconds: row.memory_time_seconds ?? null,
    sessionId: row.session_id ?? null,
    createdAt: row.created_at,
  };
}

function fromWinTallyRow(row: any): GameWinTally {
  return {
    id: row.id,
    familyId: row.family_id,
    memberId: row.member_id,
    gameType: row.game_type,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Mirrors public.arcade_level_for_xp(int) exactly (migration
// 20260942350000) — level N requires 50*(N-1)^2 total XP. Kept here as a
// pure function too so the launcher can render instantly off cached state
// without an extra RPC round-trip; loadArcadeStats still reads total_xp
// itself from the DB, this just recomputes the same deterministic formula
// client-side from that number.
export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(xp, 0) / 50)) + 1;
}

// XP still needed to reach the NEXT level from the given total — drives a
// "12 XP to Level 4" progress readout without a second RPC call.
export function xpToNextLevel(xp: number): { current: number; next: number; remaining: number } {
  const level = levelForXp(xp);
  const nextLevelXp = 50 * level * level;
  return { current: xp, next: nextLevelXp, remaining: Math.max(0, nextLevelXp - xp) };
}

// ── Realtime — two channels, same singleton-guard shape as eventStore.ts's
// ensureRealtime, deliberately WITHOUT its buffering machinery: that
// exists there because a bulk edit fans out into many postgres_changes
// payloads for one logical action. A game move is inherently one row, one
// UPDATE, one payload — there's no burst to coalesce. ──

// Challenge channel — family-wide, always-on while any Games screen is
// mounted. Drives incomingChallenges/outgoingChallenges.
let _rtChallengeChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtChallengeFamilyId = '';

// Session channel — scoped to ONE active session, subscribed only while
// its game screen is mounted (never family-wide) so a family member isn't
// receiving realtime traffic for every other pending game in the family.
let _rtSessionChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtSessionId = '';

// Uno table polling — scoped to ONE game, active only while its lobby or
// table screen is mounted. See ensureUnoRealtime's own comment for why
// this is a short-poll rather than a postgres_changes subscription.
let _unoPollTimer: ReturnType<typeof setInterval> | null = null;
let _rtUnoGameId = '';

interface GameState {
  incomingChallenges: GameSession[];
  outgoingChallenges: GameSession[];
  activeSession: GameSession | null;
  leaderboard: Record<string, GameScore[]>;   // key: `${gameType}:${difficulty}`

  activeUnoGame: UnoGame | null;
  activeUnoPlayers: UnoPlayer[];

  winTallies: Record<string, GameWinTally>; // key: `${memberId}:${gameType}`
  arcadeStats: Record<string, ArcadeStats>; // key: memberId

  lastChallengeError: string | null;

  loadChallenges: (familyId: string) => Promise<void>;
  createChallenge: (gameType: GameType, difficulty: Difficulty, challengedId: string) => Promise<GameSession | null>;
  acceptChallenge: (sessionId: string) => Promise<GameSession | null>;
  declineChallenge: (sessionId: string) => Promise<void>;
  cancelChallenge: (sessionId: string) => Promise<void>;
  submitMove: (sessionId: string, move: Record<string, unknown>) => Promise<GameSession | null>;
  submitScore: (params: {
    gameType: 'snake' | 'memory'; difficulty: Difficulty; score: number;
    snakeLength?: number; snakeFoodEaten?: number; memoryMoves?: number; memoryTimeSeconds?: number; sessionId?: string;
  }) => Promise<GameScore | null>;
  loadLeaderboard: (gameType: 'snake' | 'memory', difficulty: Difficulty) => Promise<void>;

  submitSoloResult: (gameType: 'tic_tac_toe' | 'memory', outcome: 'win' | 'loss' | 'draw') => Promise<void>;
  loadWinTallies: (familyId: string, memberId: string) => Promise<void>;
  loadFamilyWinTallies: (familyId: string, gameType: 'tic_tac_toe' | 'memory' | 'uno') => Promise<GameWinTally[]>;
  loadArcadeStats: (familyId: string, memberId: string) => Promise<void>;

  loadSession: (sessionId: string) => Promise<void>;
  ensureChallengeRealtime: (familyId: string) => void;
  ensureSessionRealtime: (sessionId: string) => void;
  stopSessionRealtime: () => void;

  createUnoGame: (humanMemberIds: string[], aiDifficulties: ('easy' | 'medium' | 'hard')[]) => Promise<UnoGame | null>;
  loadUnoGame: (gameId: string) => Promise<void>;
  playUnoCard: (gameId: string, card: { color: string; value: string }, chosenColor?: string) => Promise<UnoGame | null>;
  drawUnoCard: (gameId: string) => Promise<UnoGame | null>;
  callUno: (gameId: string) => Promise<boolean>;
  catchMissedUno: (gameId: string, targetPlayerId: string) => Promise<boolean>;
  playUnoAiTurn: (gameId: string) => Promise<UnoGame | null>;
  ensureUnoRealtime: (gameId: string) => void;
  stopUnoRealtime: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  incomingChallenges: [],
  outgoingChallenges: [],
  activeSession: null,
  leaderboard: {},
  activeUnoGame: null,
  activeUnoPlayers: [],
  winTallies: {},
  arcadeStats: {},
  lastChallengeError: null,

  loadChallenges: async (familyId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return;
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('family_id', familyId)
      .eq('status', 'pending')
      .or(`challenger_id.eq.${activeMemberId},challenged_id.eq.${activeMemberId}`);
    if (error || !data) { console.warn('[gameStore] loadChallenges failed', error?.message); return; }
    const sessions = data.map(fromSessionRow);
    set({
      incomingChallenges: sessions.filter(s => s.challengedId === activeMemberId),
      outgoingChallenges: sessions.filter(s => s.challengerId === activeMemberId),
    });
  },

  createChallenge: async (gameType, difficulty, challengedId) => {
    const familyId = getFamilyId();
    const activeMemberId = getActiveMemberId();
    if (!familyId || !activeMemberId) return null;
    const { data, error } = await supabase.rpc('create_game_challenge', {
      p_family_id: familyId, p_game_type: gameType, p_difficulty: difficulty,
      p_challenger_id: activeMemberId, p_challenged_id: challengedId,
    });
    if (error || !data) {
      console.warn('[gameStore] createChallenge failed', error?.message);
      // Translate the RPC's own raised-exception text into a message a
      // player can actually act on — "cancel the old one first" — rather
      // than a raw Postgres error with no way forward in the UI.
      const message = error?.message?.includes('a pending')
        ? 'You already have a pending challenge with them for this game — cancel it first, or wait for them to respond.'
        : 'Could not send the challenge. Please try again.';
      set({ lastChallengeError: message });
      return null;
    }
    const session = fromSessionRow(data);
    set(s => ({ outgoingChallenges: [session, ...s.outgoingChallenges], lastChallengeError: null }));
    notifyGameEvent('game_challenge_received', [challengedId], activeMemberId, {
      gameType, difficulty, sessionId: session.id,
    });
    return session;
  },

  cancelChallenge: async (sessionId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return;
    const { error } = await supabase.rpc('cancel_game_challenge', {
      p_session_id: sessionId, p_member_id: activeMemberId,
    });
    if (error) { console.warn('[gameStore] cancelChallenge failed', error.message); return; }
    set(s => ({ outgoingChallenges: s.outgoingChallenges.filter(c => c.id !== sessionId) }));
  },

  acceptChallenge: async (sessionId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return null;
    const { data, error } = await supabase.rpc('accept_game_challenge', {
      p_session_id: sessionId, p_member_id: activeMemberId,
    });
    if (error || !data) { console.warn('[gameStore] acceptChallenge failed', error?.message); return null; }
    const session = fromSessionRow(data);
    set(s => ({
      incomingChallenges: s.incomingChallenges.filter(c => c.id !== sessionId),
      activeSession: session,
    }));
    notifyGameEvent('game_challenge_accepted', [session.challengerId], activeMemberId, {
      gameType: session.gameType, sessionId: session.id,
    });
    return session;
  },

  declineChallenge: async (sessionId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return;
    const { data, error } = await supabase.rpc('decline_game_challenge', {
      p_session_id: sessionId, p_member_id: activeMemberId,
    });
    if (error) { console.warn('[gameStore] declineChallenge failed', error.message); return; }
    set(s => ({ incomingChallenges: s.incomingChallenges.filter(c => c.id !== sessionId) }));
    if (data) {
      const session = fromSessionRow(data);
      notifyGameEvent('game_challenge_declined', [session.challengerId], activeMemberId, {
        gameType: session.gameType, sessionId: session.id,
      });
    }
  },

  submitMove: async (sessionId, move) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return null;
    const { data, error } = await supabase.rpc('submit_game_move', {
      p_session_id: sessionId, p_member_id: activeMemberId, p_move: move,
    });
    if (error || !data) { console.warn('[gameStore] submitMove failed', error?.message); return null; }
    const session = fromSessionRow(data);
    set({ activeSession: session });
    const opponentId = session.challengerId === activeMemberId ? session.challengedId : session.challengerId;
    if (opponentId) {
      if (session.status === 'completed') {
        notifyGameEvent('game_completed', [opponentId], activeMemberId, {
          gameType: session.gameType, sessionId: session.id, result: session.result, winnerId: session.winnerId,
        });
      } else {
        notifyGameEvent('game_move_made', [opponentId], activeMemberId, {
          gameType: session.gameType, sessionId: session.id,
        });
      }
    }
    return session;
  },

  submitScore: async ({ gameType, difficulty, score, snakeLength, snakeFoodEaten, memoryMoves, memoryTimeSeconds, sessionId }) => {
    const familyId = getFamilyId();
    const activeMemberId = getActiveMemberId();
    if (!familyId || !activeMemberId) return null;
    const { data, error } = await supabase.rpc('submit_score', {
      p_family_id: familyId, p_member_id: activeMemberId, p_game_type: gameType, p_difficulty: difficulty,
      p_score: score, p_snake_length: snakeLength ?? null, p_snake_food_eaten: snakeFoodEaten ?? null,
      p_memory_moves: memoryMoves ?? null, p_memory_time_seconds: memoryTimeSeconds ?? null,
      p_session_id: sessionId ?? null,
    });
    if (error || !data) { console.warn('[gameStore] submitScore failed', error?.message); return null; }
    return fromScoreRow(data);
  },

  loadLeaderboard: async (gameType, difficulty) => {
    const familyId = getFamilyId();
    if (!familyId) return;
    const { data, error } = await supabase
      .from('game_scores')
      .select('*')
      .eq('family_id', familyId)
      .eq('game_type', gameType)
      .eq('difficulty', difficulty)
      .order('score', { ascending: false })
      .limit(20);
    if (error || !data) { console.warn('[gameStore] loadLeaderboard failed', error?.message); return; }
    const key = `${gameType}:${difficulty}`;
    set(s => ({ leaderboard: { ...s.leaderboard, [key]: data.map(fromScoreRow) } }));
  },

  // Solo-vs-AI Tic-Tac-Toe/Memory have no game_sessions row at all (local
  // board state only, per the plan) — this is the ONLY way a solo result
  // ever reaches game_win_tallies/XP. Fire-and-forget from the game
  // screen's own gameOver effect, same "don't block the win banner on a
  // network round-trip" posture submitScore already has for the
  // leaderboard. Refreshes the cached arcade stats/tallies afterward so a
  // level-up is visible without navigating away and back.
  submitSoloResult: async (gameType, outcome) => {
    const familyId = getFamilyId();
    const activeMemberId = getActiveMemberId();
    if (!familyId || !activeMemberId) return;
    const { data, error } = await supabase.rpc('submit_solo_game_result', {
      p_family_id: familyId, p_member_id: activeMemberId, p_game_type: gameType, p_outcome: outcome,
    });
    if (error || !data) { console.warn('[gameStore] submitSoloResult failed', error?.message); return; }
    set(s => ({ winTallies: { ...s.winTallies, [`${activeMemberId}:${gameType}`]: fromWinTallyRow(data) } }));
    await get().loadArcadeStats(familyId, activeMemberId);
  },

  loadWinTallies: async (familyId, memberId) => {
    const { data, error } = await supabase
      .from('game_win_tallies')
      .select('*')
      .eq('family_id', familyId)
      .eq('member_id', memberId);
    if (error || !data) { console.warn('[gameStore] loadWinTallies failed', error?.message); return; }
    set(s => {
      const next = { ...s.winTallies };
      for (const row of data) {
        const tally = fromWinTallyRow(row);
        next[`${tally.memberId}:${tally.gameType}`] = tally;
      }
      return { winTallies: next };
    });
  },

  // Family-wide (not just the caller's own) win/loss/draw tallies for one
  // game type — powers LeaderboardScreen's "Records" tab. Returned
  // directly rather than merged into `winTallies` keyed by memberId (that
  // cache is meant for "my own tally", this is a one-off family-wide read
  // the screen owns its own local state for).
  loadFamilyWinTallies: async (familyId, gameType) => {
    const { data, error } = await supabase
      .from('game_win_tallies')
      .select('*')
      .eq('family_id', familyId)
      .eq('game_type', gameType);
    if (error || !data) { console.warn('[gameStore] loadFamilyWinTallies failed', error?.message); return []; }
    return data.map(fromWinTallyRow);
  },

  loadArcadeStats: async (familyId, memberId) => {
    const { data, error } = await supabase
      .from('member_arcade_stats')
      .select('*')
      .eq('family_id', familyId)
      .eq('member_id', memberId)
      .maybeSingle();
    if (error) { console.warn('[gameStore] loadArcadeStats failed', error?.message); return; }
    // No row yet (member has never finished a tallied game) — total_xp is 0,
    // still level 1, not an error state.
    const totalXp = data?.total_xp ?? 0;
    set(s => ({
      arcadeStats: {
        ...s.arcadeStats,
        [memberId]: { memberId, familyId, totalXp, level: levelForXp(totalXp) },
      },
    }));
  },

  loadSession: async (sessionId) => {
    const { data, error } = await supabase.from('game_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (error || !data) { console.warn('[gameStore] loadSession failed', error?.message); return; }
    // Guard against a slow fetch resolving after the screen already moved
    // on to a different session (e.g. user backed out and opened another
    // game) — never clobber a newer activeSession with a stale one.
    if (get().activeSession && get().activeSession!.id !== sessionId && _rtSessionId !== sessionId) return;
    set({ activeSession: fromSessionRow(data) });
  },

  ensureChallengeRealtime: (familyId) => {
    if (_rtChallengeFamilyId === familyId && _rtChallengeChannel) return;
    if (_rtChallengeChannel) { supabase.removeChannel(_rtChallengeChannel); _rtChallengeChannel = null; }
    // Hot-reload-safe stale-topic sweep — same defensive pattern as
    // eventStore.ts's ensureRealtime, guards against the dev-mode "cannot
    // add postgres_changes callbacks ... after subscribe()" crash.
    const staleTopic = `realtime:games:${familyId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
    _rtChallengeFamilyId = familyId;

    const activeMemberId = getActiveMemberId();
    _rtChallengeChannel = supabase
      .channel(`games:${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row) return;
          const session = fromSessionRow(payload.new ?? payload.old);
          const isMine = session.challengerId === activeMemberId || session.challengedId === activeMemberId;
          if (!isMine) return;

          set(s => {
            const next = { ...s };
            if (session.status === 'pending') {
              if (session.challengedId === activeMemberId) {
                next.incomingChallenges = s.incomingChallenges.some(c => c.id === session.id)
                  ? s.incomingChallenges.map(c => c.id === session.id ? session : c)
                  : [session, ...s.incomingChallenges];
              }
              if (session.challengerId === activeMemberId) {
                next.outgoingChallenges = s.outgoingChallenges.some(c => c.id === session.id)
                  ? s.outgoingChallenges.map(c => c.id === session.id ? session : c)
                  : [session, ...s.outgoingChallenges];
              }
            } else {
              // Left pending (accepted/declined/expired) — no longer belongs
              // in either pending list.
              next.incomingChallenges = s.incomingChallenges.filter(c => c.id !== session.id);
              next.outgoingChallenges = s.outgoingChallenges.filter(c => c.id !== session.id);
            }
            return next;
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _rtChallengeChannel = null;
          _rtChallengeFamilyId = '';
        }
      });
  },

  ensureSessionRealtime: (sessionId) => {
    if (_rtSessionId === sessionId && _rtSessionChannel) return;
    if (_rtSessionChannel) { supabase.removeChannel(_rtSessionChannel); _rtSessionChannel = null; }
    const staleTopic = `realtime:game:${sessionId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
    _rtSessionId = sessionId;

    _rtSessionChannel = supabase
      .channel(`game:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (!payload.new) return;
          const incoming = fromSessionRow(payload.new);
          const current = useGameStore.getState().activeSession;
          // submitMove already applies the RPC's own fresh snapshot locally;
          // a realtime echo of that same write (or a delayed/out-of-order
          // one) must never regress the board back to an older move count.
          if (current && current.id === incoming.id && (current.moveCount ?? 0) > (incoming.moveCount ?? 0)) return;
          useGameStore.setState({ activeSession: incoming });
        },
      )
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _rtSessionChannel = null;
          _rtSessionId = '';
        }
      });
  },

  stopSessionRealtime: () => {
    if (_rtSessionChannel) { supabase.removeChannel(_rtSessionChannel); _rtSessionChannel = null; }
    _rtSessionId = '';
  },

  createUnoGame: async (humanMemberIds, aiDifficulties) => {
    const familyId = getFamilyId();
    const activeMemberId = getActiveMemberId();
    if (!familyId || !activeMemberId) return null;
    const { data, error } = await supabase.rpc('create_uno_game', {
      p_family_id: familyId, p_created_by: activeMemberId,
      p_human_member_ids: humanMemberIds, p_ai_difficulties: aiDifficulties,
    });
    if (error || !data) { console.warn('[gameStore] createUnoGame failed', error?.message); return null; }
    const game = fromUnoGameRow(data);
    set({ activeUnoGame: game });
    const invitees = humanMemberIds.filter(id => id !== activeMemberId);
    notifyGameEvent('uno_game_invite', invitees, activeMemberId, { gameId: game.id });
    return game;
  },

  loadUnoGame: async (gameId) => {
    const [{ data: gameRow, error: gameError }, { data: playerRows, error: playersError }] = await Promise.all([
      supabase.from('uno_games_public').select('*').eq('id', gameId).maybeSingle(),
      supabase.from('uno_players_public').select('*').eq('game_id', gameId).order('seat'),
    ]);
    if (gameError || !gameRow) { console.warn('[gameStore] loadUnoGame failed', gameError?.message); return; }
    if (playersError || !playerRows) { console.warn('[gameStore] loadUnoGame (players) failed', playersError?.message); return; }
    set({ activeUnoGame: fromUnoGameRow(gameRow), activeUnoPlayers: playerRows.map(fromUnoPlayerRow) });
  },

  playUnoCard: async (gameId, card, chosenColor) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return null;
    const { data, error } = await supabase.rpc('play_uno_card', {
      p_game_id: gameId, p_member_id: activeMemberId, p_card: card, p_chosen_color: chosenColor ?? null,
    });
    if (error || !data) { console.warn('[gameStore] playUnoCard failed', error?.message); return null; }
    const game = fromUnoGameRow(data);
    set({ activeUnoGame: game });
    await get().loadUnoGame(gameId); // refresh hand_counts + own hand from the view
    const others = get().activeUnoPlayers.filter(p => p.memberId && p.memberId !== activeMemberId).map(p => p.memberId!);
    if (game.status === 'completed') {
      notifyGameEvent('game_completed', others, activeMemberId, { gameType: 'uno', gameId, winnerId: game.winnerId });
    } else {
      const nextPlayer = get().activeUnoPlayers.find(p => p.seat === game.currentTurnSeat);
      if (nextPlayer?.memberId) notifyGameEvent('uno_your_turn', [nextPlayer.memberId], activeMemberId, { gameId });
    }
    return game;
  },

  drawUnoCard: async (gameId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return null;
    const { data, error } = await supabase.rpc('draw_uno_card', {
      p_game_id: gameId, p_member_id: activeMemberId,
    });
    if (error || !data) { console.warn('[gameStore] drawUnoCard failed', error?.message); return null; }
    const game = fromUnoGameRow(data);
    set({ activeUnoGame: game });
    await get().loadUnoGame(gameId);
    const nextPlayer = get().activeUnoPlayers.find(p => p.seat === game.currentTurnSeat);
    if (nextPlayer?.memberId && nextPlayer.memberId !== activeMemberId) {
      notifyGameEvent('uno_your_turn', [nextPlayer.memberId], activeMemberId, { gameId });
    }
    return game;
  },

  callUno: async (gameId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return false;
    // call_uno now genuinely validates hand size server-side (exactly one
    // card) rather than accepting a call at any time — the boolean return
    // lets the UI tell the player their call didn't count, instead of
    // silently no-oping the way this used to swallow every RPC error.
    const { error } = await supabase.rpc('call_uno', { p_game_id: gameId, p_member_id: activeMemberId });
    if (error) { console.warn('[gameStore] callUno failed', error.message); return false; }
    await get().loadUnoGame(gameId);
    return true;
  },

  catchMissedUno: async (gameId, targetPlayerId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return false;
    const { error } = await supabase.rpc('catch_missed_uno', {
      p_game_id: gameId, p_catcher_member_id: activeMemberId, p_target_player_id: targetPlayerId,
    });
    if (error) { console.warn('[gameStore] catchMissedUno failed', error.message); return false; }
    await get().loadUnoGame(gameId);
    return true;
  },

  // Resolves an AI seat's turn server-side (play_uno_ai_turn) — the AI's
  // hand is never visible to any client (uno_players_public redacts every
  // hand but the caller's own, and an AI seat has no member_id to ever
  // match), so the decision has to happen in the RPC itself. Any seated
  // family member may trigger this; see UnoGame.tsx's own comment on why
  // multiple clients racing to call it is safe (server re-validates whose
  // turn it actually is).
  playUnoAiTurn: async (gameId) => {
    const { data, error } = await supabase.rpc('play_uno_ai_turn', { p_game_id: gameId });
    if (error || !data) { console.warn('[gameStore] playUnoAiTurn failed', error?.message); return null; }
    const game = fromUnoGameRow(data);
    set({ activeUnoGame: game });
    await get().loadUnoGame(gameId);
    const activeMemberId = getActiveMemberId();
    const nextPlayer = get().activeUnoPlayers.find(p => p.seat === game.currentTurnSeat);
    if (nextPlayer?.memberId && nextPlayer.memberId !== activeMemberId) {
      notifyGameEvent('uno_your_turn', [nextPlayer.memberId], activeMemberId, { gameId });
    }
    return game;
  },

  // Uno has no usable postgres_changes path: uno_games/uno_players both
  // revoke all base-table grants from `authenticated` and carry zero RLS
  // policies (the plan's own deliberate access model — reads only ever go
  // through the redacting *_public views). Realtime's row-change delivery
  // re-checks the SUBSCRIBING client's own SELECT privileges against the
  // base table it names, so a table with no grant and no policy delivers
  // nothing no matter what a view built on top of it allows. Short-poll
  // the public views instead while a lobby/table screen is mounted — the
  // same tradeoff other UNO-style turn-based games make when they don't
  // control their own realtime layer.
  ensureUnoRealtime: (gameId) => {
    if (_rtUnoGameId === gameId && _unoPollTimer) return;
    if (_unoPollTimer) { clearInterval(_unoPollTimer); _unoPollTimer = null; }
    _rtUnoGameId = gameId;
    _unoPollTimer = setInterval(() => {
      if (_rtUnoGameId === gameId) get().loadUnoGame(gameId);
    }, 2000);
  },

  stopUnoRealtime: () => {
    if (_unoPollTimer) { clearInterval(_unoPollTimer); _unoPollTimer = null; }
    _rtUnoGameId = '';
  },
}));
