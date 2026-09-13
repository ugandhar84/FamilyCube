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

// First name of a given member — used to name the ACTOR in every game
// notification ("Alex challenged you to Tic-Tac-Toe!"). Every other
// notification type in family-notifier's own buildMessage() (quest_claimed,
// geofence_arrive, chat_mention, ...) is written server-side around a
// senderName/kidName/memberName field the CALLER resolves and includes —
// none of the 7 game notification types followed that pattern, so
// family-notifier had no name to put in the message and fell through to
// its generic default (title: "FamilyCube", body: "") for every single
// one. This closes that gap at the source instead of guessing names
// server-side from a bare member id.
function nameOf(memberId: string | null | undefined): string {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const s = useFamilyStore.getState();
    return s.members.find((m: any) => m.id === memberId)?.name?.split(' ')[0] ?? 'Someone';
  } catch { return 'Someone'; }
}

const GAME_LABEL: Record<string, string> = { tic_tac_toe: 'Tic-Tac-Toe', memory: 'Memory', uno: 'Uno' };

function notifyGameEvent(
  type: 'game_challenge_received' | 'game_challenge_accepted' | 'game_challenge_declined' | 'game_move_made' | 'game_completed' | 'uno_game_invite' | 'uno_your_turn',
  memberIds: string[],
  excludeMemberId: string | null,
  payload: Record<string, unknown>,
) {
  const familyId = getFamilyId();
  const recipients = memberIds.filter(id => id && id !== excludeMemberId);
  if (!familyId || !recipients.length) return;
  const actorName = nameOf(excludeMemberId);
  const gameLabel = GAME_LABEL[payload.gameType as string] ?? 'a game';
  supabase.functions.invoke('family-notifier', {
    body: { type, familyId, memberIds: recipients, payload: { ...payload, actorName, gameLabel }, persist: true, excludeMemberId: excludeMemberId ?? undefined },
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
// The activeMemberId ensureChallengeRealtime's postgres_changes callback
// closure was built against. Was NOT tracked at all — the dedup guard
// below only ever compared familyId, so PIN-switching between two kids
// on the SAME shared device/family (a real, common case — see
// FamilyGamesSection's own mount effect keyed only on familyId) silently
// kept the OLD channel alive with the OLD member's id baked into its
// closure, filtering every incoming challenge against the wrong viewer
// until the app was fully relaunched (live-reported: "the other person is
// not showing the realtime invitation on the hub (showing after
// relaunch)"). Tracking it here lets the guard below correctly force a
// re-subscribe whenever the active member changes, even if familyId did not.
let _rtChallengeMemberId = '';

// Session channel — scoped to ONE active session, subscribed only while
// its game screen is mounted (never family-wide) so a family member isn't
// receiving realtime traffic for every other pending game in the family.
let _rtSessionChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtSessionId = '';
// Presence channel — separate from the postgres_changes session channel
// above (Presence and postgres_changes are independent Realtime features,
// each with their own subscribe lifecycle on the same or different
// channels) — tracks whether the OPPONENT's own game screen is currently
// mounted, i.e. genuinely online in this game right now, not just "has the
// app open somewhere." Was missing entirely (live-reported: "other person
// should notify that he is offline at that moement" — no such signal
// existed anywhere in this feature before).
let _rtPresenceChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtPresenceSessionId = '';
// Family-wide presence (distinct from the per-session one above) — tracks
// who currently has the Games area open, surfaced in the invite picker.
let _rtFamilyPresenceChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyPresenceFamilyId = '';

// Uno realtime — Broadcast channel (not postgres_changes), scoped to ONE
// game, active only while its lobby or table screen is mounted. See
// ensureUnoRealtime's own comment for why Broadcast rather than
// postgres_changes. _unoPollTimer is retained only so stopUnoRealtime can
// still clear a stale interval left over from a hot-reloaded older
// version of this store; ensureUnoRealtime itself no longer creates one.
let _unoPollTimer: ReturnType<typeof setInterval> | null = null;
let _unoBroadcastChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtUnoGameId = '';

// game_win_tallies/member_arcade_stats — unlike Uno's hand data, these
// carry no per-viewer secrecy at all (scores are visible to the whole
// family by design, per their own plain grant+RLS), so a real
// postgres_changes subscription works here without the Broadcast
// workaround Uno needed. Was fetch-once with no live updates at all
// [live-requested: "users should see realtime scores as well along with
// moves"] — a completed game elsewhere in the family never updated an
// already-open Leaderboard/Launcher screen until it was manually
// reopened.
let _rtScoresChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtScoresFamilyId = '';

interface GameState {
  incomingChallenges: GameSession[];
  outgoingChallenges: GameSession[];
  // Every 'active' session the current member participates in, across the
  // whole family — powers a "resume game" card on the Hub (live-requested:
  // resuming a force-closed app previously required already knowing the
  // sessionId, since it's only ever a navigation param, never a persisted
  // "which game was I in" pointer). Distinct from activeSession (singular),
  // which is only ever set once a specific game SCREEN is open.
  myActiveSessions: GameSession[];
  activeSession: GameSession | null;
  leaderboard: Record<string, GameScore[]>;   // key: `${gameType}:${difficulty}`

  activeUnoGame: UnoGame | null;
  activeUnoPlayers: UnoPlayer[];
  // Every non-completed/abandoned Uno table this member is currently
  // seated at — was nothing at all (Uno's own "join" is really just
  // being silently seated at creation time, per create_uno_game; without
  // this list, a seated player who misses the one-shot invite push has no
  // other way to ever find and enter the table) [live-reported: "once
  // the family member joins they are unable to play their game"].
  myUnoGames: UnoGame[];

  winTallies: Record<string, GameWinTally>; // key: `${memberId}:${gameType}`
  arcadeStats: Record<string, ArcadeStats>; // key: memberId
  // Bumped by ensureScoresRealtime's handlers on every real-time score
  // change — screens that keep their own local state (LeaderboardScreen's
  // RecordsTab fetches into useState rather than reading winTallies
  // directly) depend on this in a useEffect to know when to re-fetch,
  // since a plain number change is the cheapest possible re-render trigger.
  scoresVersion: number;

  lastChallengeError: string | null;

  // Whether the OPPONENT's own game screen is currently mounted/online,
  // driven by ensurePresence's Presence channel — was no such signal
  // anywhere before (live-reported: "other person should notify that he
  // is offline at that moement"). Undefined until ensurePresence has had
  // its first sync, so UI can distinguish "unknown yet" from "confirmed
  // offline" if it wants to.
  opponentOnline: boolean | undefined;
  // Family-wide equivalent — every member currently on the Games area,
  // for the invite picker's online/offline indicator. Empty set (not
  // undefined) before the first sync — "not known to be online" reads
  // safely as "offline" for a badge, unlike opponentOnline's own
  // undefined/unknown distinction which that per-session UI cares about.
  onlineMemberIds: Set<string>;

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
  leaveGame: (sessionId: string) => Promise<GameSession | null>;
  ensureChallengeRealtime: (familyId: string) => void;
  ensureSessionRealtime: (sessionId: string) => void;
  stopSessionRealtime: () => void;
  ensurePresence: (sessionId: string, memberId: string) => void;
  stopPresence: () => void;
  ensureFamilyPresence: (familyId: string, memberId: string) => void;
  stopFamilyPresence: () => void;
  ensureScoresRealtime: (familyId: string) => void;
  stopScoresRealtime: () => void;

  createUnoGame: (humanMemberIds: string[], aiDifficulties: ('easy' | 'medium' | 'hard')[]) => Promise<UnoGame | null>;
  loadUnoGame: (gameId: string) => Promise<void>;
  loadMyUnoGames: (familyId: string) => Promise<void>;
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
  myActiveSessions: [],
  activeSession: null,
  leaderboard: {},
  activeUnoGame: null,
  myUnoGames: [],
  activeUnoPlayers: [],
  winTallies: {},
  scoresVersion: 0,
  arcadeStats: {},
  lastChallengeError: null,
  opponentOnline: undefined,
  onlineMemberIds: new Set(),

  loadChallenges: async (familyId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return;
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('family_id', familyId)
      // Was status='pending' only — 'active' sessions the member is
      // currently in were never fetched at all, so there was no way to
      // surface a "resume game" entry point after a force-close/relaunch
      // dropped them back on the Hub with no memory of which sessionId
      // they were in (live-requested: rejoin-after-close support).
      .in('status', ['pending', 'active'])
      .or(`challenger_id.eq.${activeMemberId},challenged_id.eq.${activeMemberId}`);
    if (error || !data) { console.warn('[gameStore] loadChallenges failed', error?.message); return; }
    const sessions = data.map(fromSessionRow);
    set({
      incomingChallenges: sessions.filter(s => s.status === 'pending' && s.challengedId === activeMemberId),
      outgoingChallenges: sessions.filter(s => s.status === 'pending' && s.challengerId === activeMemberId),
      myActiveSessions: sessions.filter(s => s.status === 'active'),
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
    // A per-move "your turn" push was redundant with the live realtime sync
    // both boards already have open — the opponent's board updates and
    // flashes its own turn indicator (PlayerPod's active/pulse state)
    // immediately, so only game-completion still gets a push.
    if (opponentId && session.status === 'completed') {
      notifyGameEvent('game_completed', [opponentId], activeMemberId, {
        gameType: session.gameType, sessionId: session.id, result: session.result, winnerId: session.winnerId,
      });
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
    // A leaderboard is a ranking of PEOPLE, not a log of every round
    // played — fetching a wide window and reducing to one row per member
    // (their own best) avoids one person's own repeated attempts filling
    // every visible slot and burying everyone else's (and their own most
    // recent, different) scores. PostgREST has no DISTINCT ON, so this
    // reduction happens client-side; the underlying table is already
    // capped at 20 rows per family+game+difficulty by its own DB trigger,
    // so "wide window" here is still a small, bounded fetch.
    const { data, error } = await supabase
      .from('game_scores')
      .select('*')
      .eq('family_id', familyId)
      .eq('game_type', gameType)
      .eq('difficulty', difficulty)
      // Tiebreak by most recent first — with only score as the sort key,
      // two equal scores fell back to whatever order Postgres happened to
      // return them in (not guaranteed to be insertion order), so the same
      // tie could silently re-rank itself between one load and the next.
      .order('score', { ascending: false })
      .order('created_at', { ascending: false });
    if (error || !data) { console.warn('[gameStore] loadLeaderboard failed', error?.message); return; }
    const bestPerMember = new Map<string, typeof data[number]>();
    for (const row of data) {
      if (!bestPerMember.has(row.member_id)) bestPerMember.set(row.member_id, row);
    }
    const key = `${gameType}:${difficulty}`;
    set(s => ({ leaderboard: { ...s.leaderboard, [key]: Array.from(bestPerMember.values()).slice(0, 20).map(fromScoreRow) } }));
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
    const incoming = fromSessionRow(data);
    // Was: unconditionally overwrote activeSession, unlike
    // ensureSessionRealtime's own handler just above (which correctly
    // guards on moveCount so a delayed/out-of-order realtime echo can
    // never regress the board). loadSession is called on every screen
    // mount right alongside ensureSessionRealtime — if an opponent's move
    // lands via realtime FIRST (a very real race: a just-accepted
    // challenge's screen mount and the challenger's near-simultaneous
    // first move), this fetch could still resolve afterward with the
    // OLDER pre-move snapshot and silently revert the board/turn
    // indicator right back [live-reported: "once they move their turn
    // other person not seeing that move realtime" — traced to this
    // exact clobber, not a missing/broken subscription]. Same guard now.
    const current = get().activeSession;
    if (current && current.id === sessionId && (current.moveCount ?? 0) > (incoming.moveCount ?? 0)) return;
    set({ activeSession: incoming });
  },

  // Explicit "I'm done" — was NO way to end an active game at all
  // (live-reported: "if the other person should fore exit from the game
  // if he lost the intrest inbetween and that let tha other player also
  // know that he is no longer in the game"). Distinct from the 30-minute
  // silent-disconnect sweep (game-challenge-sweep/index.ts) — this fires
  // immediately and credits the opponent as the winner, since the leaver
  // is unambiguously the one who quit.
  leaveGame: async (sessionId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return null;
    const { data, error } = await supabase.rpc('leave_game', {
      p_session_id: sessionId, p_member_id: activeMemberId,
    });
    if (error || !data) { console.warn('[gameStore] leaveGame failed', error?.message); return null; }
    const session = fromSessionRow(data);
    // Was: only set activeSession — myActiveSessions (the Hub's "resume
    // game" card list) was left untouched here, relying entirely on the
    // family-wide games:${familyId} realtime channel to echo this same
    // update back and clean it up. That channel may not even be
    // subscribed right now (the leaving player is on the GAME screen, not
    // the Hub, when they tap Leave — FamilyGamesSection, which owns that
    // channel, might not be mounted at all), so the card kept showing a
    // now-abandoned game as still resumable (live-reported: "as soon as i
    // leave the game we can clear the resume game on the hub"). Remove it
    // here directly, synchronously with the RPC's own result, instead of
    // depending on a realtime echo that may never arrive in time (or at
    // all, for this specific screen).
    set(s => ({ activeSession: session, myActiveSessions: s.myActiveSessions.filter(c => c.id !== sessionId) }));
    const opponentId = session.challengerId === activeMemberId ? session.challengedId : session.challengerId;
    if (opponentId) {
      notifyGameEvent('game_completed', [opponentId], activeMemberId, {
        gameType: session.gameType, sessionId: session.id, result: 'opponent_left', winnerId: session.winnerId,
      });
    }
    return session;
  },

  ensureChallengeRealtime: (familyId) => {
    const activeMemberId = getActiveMemberId();
    // Was `_rtChallengeFamilyId === familyId` only — see _rtChallengeMemberId's
    // own comment above for why the member id must ALSO match to skip
    // re-subscribing (a PIN-switch between two kids in the same family
    // never changes familyId, but must still force a fresh channel since
    // the callback closure below captures activeMemberId by value).
    if (_rtChallengeFamilyId === familyId && _rtChallengeMemberId === activeMemberId && _rtChallengeChannel) return;
    if (_rtChallengeChannel) { supabase.removeChannel(_rtChallengeChannel); _rtChallengeChannel = null; }
    // Hot-reload-safe stale-topic sweep — same defensive pattern as
    // eventStore.ts's ensureRealtime, guards against the dev-mode "cannot
    // add postgres_changes callbacks ... after subscribe()" crash.
    const staleTopic = `realtime:games:${familyId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
    _rtChallengeFamilyId = familyId;
    _rtChallengeMemberId = activeMemberId ?? '';

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
              next.myActiveSessions = s.myActiveSessions.filter(c => c.id !== session.id);
            } else if (session.status === 'active') {
              // Left pending (accepted) — no longer belongs in either
              // pending list, but now belongs in myActiveSessions so the
              // Hub's "resume game" card appears live for both players the
              // instant a challenge is accepted, not just after a reload.
              next.incomingChallenges = s.incomingChallenges.filter(c => c.id !== session.id);
              next.outgoingChallenges = s.outgoingChallenges.filter(c => c.id !== session.id);
              next.myActiveSessions = s.myActiveSessions.some(c => c.id === session.id)
                ? s.myActiveSessions.map(c => c.id === session.id ? session : c)
                : [session, ...s.myActiveSessions];
            } else {
              // Declined/expired/completed/abandoned — no longer belongs in
              // any of the three lists.
              next.incomingChallenges = s.incomingChallenges.filter(c => c.id !== session.id);
              next.outgoingChallenges = s.outgoingChallenges.filter(c => c.id !== session.id);
              next.myActiveSessions = s.myActiveSessions.filter(c => c.id !== session.id);
            }
            return next;
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _rtChallengeChannel = null;
          _rtChallengeFamilyId = '';
          _rtChallengeMemberId = '';
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

  // Live score/leaderboard updates — game_win_tallies and
  // member_arcade_stats both carry a plain grant+RLS (unlike Uno's hand
  // data, scores have no per-viewer secrecy), so a real postgres_changes
  // subscription works directly, no Broadcast workaround needed. Call
  // from any screen showing scores (Leaderboard, GameLauncher) while
  // mounted; re-fetches whichever cache actually changed rather than
  // trying to patch the row in place, since a winTallies cache key is
  // `${memberId}:${gameType}` and arcadeStats is keyed by memberId alone
  // — simplest to just re-run the same loader this screen already calls
  // on mount.
  ensureScoresRealtime: (familyId) => {
    if (_rtScoresFamilyId === familyId && _rtScoresChannel) return;
    if (_rtScoresChannel) { supabase.removeChannel(_rtScoresChannel); _rtScoresChannel = null; }
    const staleTopic = `realtime:scores:${familyId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
    _rtScoresFamilyId = familyId;

    const refetchTally = async (memberId: string, gameType: string) => {
      const { data } = await supabase.from('game_win_tallies').select('*')
        .eq('family_id', familyId).eq('member_id', memberId).eq('game_type', gameType).maybeSingle();
      if (data) set(s => ({ winTallies: { ...s.winTallies, [`${memberId}:${gameType}`]: fromWinTallyRow(data) }, scoresVersion: s.scoresVersion + 1 }));
    };
    const refetchStats = async (memberId: string) => {
      await useGameStore.getState().loadArcadeStats(familyId, memberId);
      set(s => ({ scoresVersion: s.scoresVersion + 1 }));
    };

    _rtScoresChannel = supabase
      .channel(`scores:${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_win_tallies', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (row?.member_id && row?.game_type) refetchTally(row.member_id, row.game_type);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'member_arcade_stats', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (row?.member_id) refetchStats(row.member_id);
        },
      )
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _rtScoresChannel = null;
          _rtScoresFamilyId = '';
        }
      });
  },

  stopScoresRealtime: () => {
    if (_rtScoresChannel) { supabase.removeChannel(_rtScoresChannel); _rtScoresChannel = null; }
    _rtScoresFamilyId = '';
  },

  // Supabase Realtime Presence — was missing entirely (live-requested:
  // "other person should notify that he is offline at that moement").
  // Each player's own game screen calls this while mounted; `track()`
  // announces "I'm here" the instant the channel subscribes, and Presence's
  // own sync/join/leave events fire automatically (server-detected, no
  // polling) the moment the OTHER player's channel disconnects — app
  // backgrounded, force-closed, or a genuine network drop all present the
  // same way as a plain "leave" from this channel's perspective, which is
  // exactly the "is the opponent's game screen live right now" signal this
  // feature needs. Deliberately a SEPARATE channel from the postgres_changes
  // session channel above — Presence and postgres_changes are independent
  // Realtime primitives, mixing their handlers on one channel object works
  // but keeping them apart keeps each one's subscribe/teardown lifecycle
  // simple to reason about independently.
  ensurePresence: (sessionId, memberId) => {
    if (_rtPresenceSessionId === sessionId && _rtPresenceChannel) return;
    if (_rtPresenceChannel) { supabase.removeChannel(_rtPresenceChannel); _rtPresenceChannel = null; }
    const staleTopic = `realtime:presence:game:${sessionId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
    _rtPresenceSessionId = sessionId;

    const recompute = (channel: ReturnType<typeof supabase.channel>) => {
      const state = channel.presenceState<{ memberId: string }>();
      const others = Object.values(state).flat().some(p => p.memberId && p.memberId !== memberId);
      useGameStore.setState({ opponentOnline: others });
    };

    _rtPresenceChannel = supabase.channel(`presence:game:${sessionId}`, { config: { presence: { key: memberId } } });
    _rtPresenceChannel
      .on('presence', { event: 'sync' }, () => recompute(_rtPresenceChannel!))
      .on('presence', { event: 'join' }, () => recompute(_rtPresenceChannel!))
      .on('presence', { event: 'leave' }, () => recompute(_rtPresenceChannel!))
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await _rtPresenceChannel?.track({ memberId, onlineAt: new Date().toISOString() });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _rtPresenceChannel = null;
          _rtPresenceSessionId = '';
          useGameStore.setState({ opponentOnline: undefined });
        }
      });
  },

  stopPresence: () => {
    if (_rtPresenceChannel) { supabase.removeChannel(_rtPresenceChannel); _rtPresenceChannel = null; }
    _rtPresenceSessionId = '';
    set({ opponentOnline: undefined });
  },

  // Family-wide presence — was missing at the INVITE step entirely: the
  // per-session Presence above only ever tracks whether the OPPONENT of
  // an already-active game is currently on that specific game's screen.
  // The invite picker (ChallengeInviteSheet) had no way to show who's
  // actually likely to see a new challenge soon [live-requested: "we
  // should ... detect and prompt to log in to the board"]. Tracked while
  // the Games area (GameLauncherScreen/FamilyGamesSection) is mounted —
  // not truly "logged in anywhere in the app," but a reasonable, buildable
  // proxy: "currently viewing the games area right now."
  ensureFamilyPresence: (familyId, memberId) => {
    if (_rtFamilyPresenceFamilyId === familyId && _rtFamilyPresenceChannel) return;
    if (_rtFamilyPresenceChannel) { supabase.removeChannel(_rtFamilyPresenceChannel); _rtFamilyPresenceChannel = null; }
    const staleTopic = `realtime:presence:family-games:${familyId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
    _rtFamilyPresenceFamilyId = familyId;

    const recompute = (channel: ReturnType<typeof supabase.channel>) => {
      const state = channel.presenceState<{ memberId: string }>();
      const online = new Set(Object.values(state).flat().map(p => p.memberId).filter(Boolean));
      useGameStore.setState({ onlineMemberIds: online });
    };

    _rtFamilyPresenceChannel = supabase.channel(`presence:family-games:${familyId}`, { config: { presence: { key: memberId } } });
    _rtFamilyPresenceChannel
      .on('presence', { event: 'sync' }, () => recompute(_rtFamilyPresenceChannel!))
      .on('presence', { event: 'join' }, () => recompute(_rtFamilyPresenceChannel!))
      .on('presence', { event: 'leave' }, () => recompute(_rtFamilyPresenceChannel!))
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await _rtFamilyPresenceChannel?.track({ memberId, onlineAt: new Date().toISOString() });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _rtFamilyPresenceChannel = null;
          _rtFamilyPresenceFamilyId = '';
          useGameStore.setState({ onlineMemberIds: new Set() });
        }
      });
  },

  stopFamilyPresence: () => {
    if (_rtFamilyPresenceChannel) { supabase.removeChannel(_rtFamilyPresenceChannel); _rtFamilyPresenceChannel = null; }
    _rtFamilyPresenceFamilyId = '';
    set({ onlineMemberIds: new Set() });
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
    notifyGameEvent('uno_game_invite', invitees, activeMemberId, { gameId: game.id, gameType: 'uno' });
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

  // Every Uno table this member is currently seated at (lobby or active
  // status) — the only way, besides tapping the one-shot invite push, for
  // a seated player to discover and enter a table they were silently
  // placed at. Call from wherever the Games launcher/Hub renders a
  // "resume" style card (see ChallengeResumePrompt's own equivalent for
  // Tic-Tac-Toe/Memory).
  loadMyUnoGames: async (familyId) => {
    const activeMemberId = getActiveMemberId();
    if (!activeMemberId) return;
    const { data: seatRows, error: seatError } = await supabase
      .from('uno_players_public')
      .select('game_id')
      .eq('member_id', activeMemberId);
    if (seatError) { console.warn('[gameStore] loadMyUnoGames (seats) failed', seatError.message); return; }
    const gameIds = [...new Set((seatRows ?? []).map((r: any) => r.game_id))];
    if (!gameIds.length) { set({ myUnoGames: [] }); return; }
    const { data: gameRows, error: gameError } = await supabase
      .from('uno_games_public')
      .select('*')
      .eq('family_id', familyId)
      .in('id', gameIds)
      .in('status', ['lobby', 'active']);
    if (gameError || !gameRows) { console.warn('[gameStore] loadMyUnoGames (games) failed', gameError?.message); return; }
    set({ myUnoGames: gameRows.map(fromUnoGameRow) });
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
    }
    // Per-turn "your turn" pushes removed — Uno's realtime poll already
    // updates every open board immediately, and the board itself flashes
    // whose turn it is, so a push here was redundant noise.
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
    return game;
  },

  // Was: a 2-second setInterval poll, not real-time at all [live-reported:
  // "it should be time sensitive it should be real time not near
  // realtime"]. uno_games/uno_players have no usable postgres_changes
  // path — both tables revoke all base-table grants from `authenticated`
  // and carry zero RLS policies (deliberate: reads only go through the
  // redacting *_public views), and Realtime's row-change delivery
  // re-checks the SUBSCRIBING client's own SELECT privileges against the
  // base table it names, so a table with no grant delivers nothing no
  // matter what a view on top of it allows — and postgres_changes can't
  // subscribe to a view directly either (views have no independent WAL
  // entries). Supabase Broadcast sidesteps this: play_uno_card/
  // draw_uno_card/call_uno now explicitly push a message via
  // realtime.send() (migration 20260962000000) after each committed
  // write, and every client just subscribes to that same
  // `uno:{game_id}` channel and re-fetches through the existing
  // redaction views on receipt — genuinely push-based, not polled.
  ensureUnoRealtime: (gameId) => {
    if (_rtUnoGameId === gameId && _unoBroadcastChannel) return;
    if (_unoBroadcastChannel) { supabase.removeChannel(_unoBroadcastChannel); _unoBroadcastChannel = null; }
    if (_unoPollTimer) { clearInterval(_unoPollTimer); _unoPollTimer = null; }
    const staleTopic = `realtime:uno:${gameId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
    _rtUnoGameId = gameId;
    _unoBroadcastChannel = supabase
      .channel(`uno:${gameId}`)
      .on('broadcast', { event: 'uno_update' }, () => {
        if (_rtUnoGameId === gameId) get().loadUnoGame(gameId);
      })
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _unoBroadcastChannel = null;
          _rtUnoGameId = '';
        }
      });
  },

  stopUnoRealtime: () => {
    if (_unoBroadcastChannel) { supabase.removeChannel(_unoBroadcastChannel); _unoBroadcastChannel = null; }
    if (_unoPollTimer) { clearInterval(_unoPollTimer); _unoPollTimer = null; }
    _rtUnoGameId = '';
  },
}));
