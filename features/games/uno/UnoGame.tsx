/**
 * UnoGame — routed screen (app/hub/games/uno.tsx). Params: ?gameId=<uuid>.
 *
 * Renders entirely from gameStore.activeUnoGame/activeUnoPlayers, which
 * come from the uno_games_public/uno_players_public VIEWS (never the base
 * tables) — hand is populated only for the caller's own seat, every other
 * seat exposes handCount only, which is exactly what's needed to render
 * opponents' card-backs by count without ever seeing their cards.
 *
 * AI seats are driven by whichever human client's turn-poll notices it's
 * an AI seat's turn — since every human at the table polls the same
 * public views every 2s (ensureUnoRealtime), the first client to notice
 * fires the AI's move; a second client noticing moments later will simply
 * find the turn has already moved on and no-op. This is safe because
 * play_uno_card/draw_uno_card are both server-validated against
 * current_turn_seat — an AI-seat move submitted twice by two racing
 * clients would have the second one rejected by the RPC itself (wrong
 * seat's turn by then), not silently double-applied.
 *
 * ── On the animations added in the table redesign ──
 * Every animation on this screen is PURELY VISUAL and strictly optimistic.
 * The rule, which must survive any future edit here: the RPC is fired
 * FIRST and is never awaited-behind, delayed by, or conditional on any
 * animation. `submitPlay` calls playUnoCard immediately and only then
 * mounts the FlyingCard flourish; the flourish's own timer unmounts it
 * regardless of how the RPC resolved. Animations therefore cannot desync
 * from server state — they carry no state of their own that the render
 * path reads back. If the server rejects a move, the store's next state
 * simply doesn't reflect it and the flourish is a no-op that already
 * finished.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withRepeat, withSequence, withDelay,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { ArcadeScreen } from '../arcade/ArcadeScreen';
import {
  ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO,
  ARCADE_AI_THINK_MS, ARCADE_SPRING, ARCADE_SPRING_BOUNCY,
} from '../theme/gameTheme';
import { playSfx } from '../theme/gameAudio';
import { speakEvent, speakText } from '../theme/gameVoice';
import { UnoCard, UNO_COLOR_HEX, REAL_COLORS, legalCardsInHand, isWild, aiBotName } from './unoLogic';
import { UnoOpponentSeat } from './UnoOpponentSeat';
import { UnoTableCenter } from './UnoTableCenter';
import { UnoHand, FlyingCard } from './UnoHand';
import { CARD_W } from './UnoCardViews';
import { useGameStore } from '@/store/gameStore';
import { useFamilyStore } from '@/store/familyStore';

export default function UnoGame() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { width, height } = useWindowDimensions();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId) ?? members[0]?.id ?? null;
  const game = useGameStore(s => s.activeUnoGame);
  const players = useGameStore(s => s.activeUnoPlayers);
  const loadUnoGame = useGameStore(s => s.loadUnoGame);
  const ensureUnoRealtime = useGameStore(s => s.ensureUnoRealtime);
  const stopUnoRealtime = useGameStore(s => s.stopUnoRealtime);
  const playUnoCard = useGameStore(s => s.playUnoCard);
  const drawUnoCard = useGameStore(s => s.drawUnoCard);
  const playUnoAiTurn = useGameStore(s => s.playUnoAiTurn);
  const callUno = useGameStore(s => s.callUno);
  const catchMissedUno = useGameStore(s => s.catchMissedUno);

  const [colorPickerCard, setColorPickerCard] = useState<UnoCard | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Visual-only: the card currently mid-flight toward the discard pile.
  const [flying, setFlying] = useState<{ card: UnoCard; fromX: number; fromY: number; key: number } | null>(null);
  // Visual-only: how many trailing cards in my hand are freshly drawn.
  const [justDrewCount, setJustDrewCount] = useState(0);
  const aiTurnInFlightRef = useRef<string | null>(null);
  const flightKeyRef = useRef(0);
  const prevHandLenRef = useRef<number | null>(null);
  // True while MY OWN play's sting has already been fired from
  // handleCardPress — outlives the (shorter) flight animation itself, so
  // the discard-change detector below can't double-sound a play whose RPC
  // round-trip happens to finish after the flourish already unmounted.
  const ownPlaySoundedRef = useRef(false);

  useEffect(() => {
    if (!gameId) return;
    useGameStore.setState({ activeUnoGame: null, activeUnoPlayers: [] });
    loadUnoGame(gameId);
    ensureUnoRealtime(gameId);
    return () => stopUnoRealtime();
  }, [gameId]);

  const me = players.find(p => p.memberId === activeMemberId);
  const myHand: UnoCard[] = (me?.hand as UnoCard[]) ?? [];
  const topCard = game?.discardPile[game.discardPile.length - 1] as UnoCard | undefined;
  const isMyTurn = !!game && !!me && game.status === 'active' && game.currentTurnSeat === me.seat;
  const currentSeatPlayer = players.find(p => p.seat === game?.currentTurnSeat);

  // AI turn driver — see file header comment on why racing clients are safe.
  useEffect(() => {
    if (!game || game.status !== 'active' || !currentSeatPlayer?.isAi || !topCard) return;
    const turnKey = `${game.id}:${game.currentTurnSeat}:${game.updatedAt}`;
    if (aiTurnInFlightRef.current === turnKey) return;
    aiTurnInFlightRef.current = turnKey;

    const timer = setTimeout(async () => {
      // Re-check: another client may have already advanced this turn
      // while we were "thinking" — the store's own state is the freshest
      // we have without another fetch, and the RPC re-validates regardless.
      const freshGame = useGameStore.getState().activeUnoGame;
      const freshPlayers = useGameStore.getState().activeUnoPlayers;
      if (!freshGame || freshGame.id !== game.id || freshGame.currentTurnSeat !== game.currentTurnSeat) return;
      const aiPlayer = freshPlayers.find(p => p.seat === freshGame.currentTurnSeat && p.isAi);
      if (!aiPlayer) return;

      // No client can ever see an AI seat's hand (uno_players_public
      // redacts every hand but the caller's own, and an AI seat has no
      // member_id to match against) — the move decision happens entirely
      // server-side in play_uno_ai_turn, which has real access to the
      // hand. This call is safe to race across multiple clients: the RPC
      // re-validates it's genuinely this seat's turn before doing anything.
      await playUnoAiTurn(gameId);
    }, ARCADE_AI_THINK_MS + 300);
    return () => clearTimeout(timer);
  }, [game?.id, game?.currentTurnSeat, game?.updatedAt, currentSeatPlayer?.isAi]);

  // Detect cards ARRIVING in my hand (a draw, mine or forced) purely so
  // the new cards can pop in. Reads the authoritative hand length only —
  // it never writes game state, so it can't desync anything.
  useEffect(() => {
    const prev = prevHandLenRef.current;
    prevHandLenRef.current = myHand.length;
    if (prev === null) return;
    if (myHand.length > prev) {
      setJustDrewCount(myHand.length - prev);
      const t = setTimeout(() => setJustDrewCount(0), 600);
      return () => clearTimeout(t);
    }
    if (myHand.length < prev) setJustDrewCount(0);
  }, [myHand.length]);

  // Detect an OPPONENT's or AI's card landing on the discard pile so the
  // table has a sound for every play, not just the local player's own
  // button presses. Keys off the top card's identity + discard length so
  // it never fires from a re-render that didn't actually change the pile
  // (e.g. a realtime poll returning the same state).
  const prevDiscardKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    const key = `${game.discardPile.length}:${topCard?.color}:${topCard?.value}`;
    const prevKey = prevDiscardKeyRef.current;
    prevDiscardKeyRef.current = key;
    if (prevKey === null || prevKey === key || !topCard) return;
    // My own plays already get their sting from handleCardPress at the
    // moment of the tap — skip this one occurrence so a slow RPC
    // round-trip doesn't double-sound it, then clear the flag so the
    // NEXT discard change (a genuinely different play) sounds normally.
    if (ownPlaySoundedRef.current) { ownPlaySoundedRef.current = false; return; }
    // Voice fires ALONGSIDE the sting, never instead of it, and only for
    // the disruptive card types — a plain number card keeps just its quiet
    // `unoPlay` tick (see gameVoice's header note on why).
    if (topCard.value === 'skip') { playSfx('unoSkip'); speakEvent('skip'); }
    else if (topCard.value === 'reverse') { playSfx('unoReverse'); speakEvent('reverse'); }
    else if (topCard.value === 'draw2') { playSfx('unoDrawPenalty'); speakEvent('draw2'); }
    else if (topCard.value === 'wild4') { playSfx('unoDrawPenalty'); speakEvent('draw4'); }
    else playSfx('unoPlay');
  }, [game?.discardPile.length, topCard?.color, topCard?.value]);

  // winner_id is null for an AI win (uno_players.member_id is null for AI
  // seats — there's no member id to store) — Uno never ends in a draw, so
  // a completed game with no winner_id unambiguously means whichever seat
  // now holds zero cards (the seat that just played its last card) won.
  const gameOver = game?.status === 'completed';
  const winner = game?.winnerId
    ? players.find(p => p.memberId === game.winnerId)
    : (gameOver ? players.find(p => p.handCount === 0) : undefined);
  const iWon = gameOver && !!me && winner?.id === me.id;

  // Every hook in this component must run on every render regardless of
  // the early "still loading" / "not seated here" returns below — an
  // effect declared AFTER a conditional return only runs once that
  // condition stops being true, which changes the hook count between
  // renders and is a real Rules-of-Hooks violation (React throws
  // "Rendered more hooks than during the previous render"). Guard the
  // effect's BODY instead, same pattern already used for this in
  // TicTacToeGame.tsx/MemoryGame.tsx's own multiplayer screens.
  useEffect(() => {
    if (!gameOver) return;
    playSfx(iWon ? 'win' : 'lose');
    if (iWon) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      speakEvent('win');
    } else {
      // nameFor() isn't defined yet at this point in the component (it's
      // declared after the early "loading"/"not seated" returns below),
      // so the winner's name is resolved inline here rather than reusing
      // it — same underlying data (members list + winner player row).
      const winnerName = winner?.isAi
        ? aiBotName(winner.seat)
        : members.find(m => m.id === winner?.memberId)?.name?.split(' ')[0] ?? 'Someone';
      speakText(`${winnerName} wins!`);
    }
  }, [gameOver]);

  // Banner entrance for the end-of-game state.
  const bannerScale = useSharedValue(0.8);
  const bannerY = useSharedValue(-18);
  useEffect(() => {
    if (gameOver) {
      bannerScale.value = withSpring(1, ARCADE_SPRING_BOUNCY);
      bannerY.value = withSpring(0, ARCADE_SPRING_BOUNCY);
    } else {
      bannerScale.value = 0.8;
      bannerY.value = -18;
    }
  }, [gameOver]);
  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bannerScale.value }, { translateY: bannerY.value }],
  }));

  // Turn-change flash on the status line, so a turn passing to/from you is
  // felt and not just read.
  const statusFlash = useSharedValue(1);
  useEffect(() => {
    if (!game || game.status !== 'active') return;
    statusFlash.value = 0.4;
    statusFlash.value = withSpring(1, ARCADE_SPRING);
  }, [game?.currentTurnSeat, game?.status]);
  const statusStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + statusFlash.value * 0.45,
    transform: [{ scale: 0.94 + statusFlash.value * 0.06 }],
  }));

  if (!game) {
    return (
      <ArcadeScreen title="UNO" musicTrack="unoLoop">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, color: ARCADE.textSecondary }}>Loading table…</Text>
        </View>
      </ArcadeScreen>
    );
  }

  if (!me) {
    return (
      <ArcadeScreen title="UNO" musicTrack="unoLoop">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, color: ARCADE.textSecondary }}>You're not seated at this table.</Text>
        </View>
      </ArcadeScreen>
    );
  }

  const nameFor = (p: typeof players[number] | undefined) => {
    if (!p) return 'Someone';
    if (p.isAi) return aiBotName(p.seat);
    return members.find(m => m.id === p.memberId)?.name?.split(' ')[0] ?? 'Player';
  };

  const handleCardPress = (card: UnoCard, index: number) => {
    if (!isMyTurn || submitting || !topCard) return;
    const legal = legalCardsInHand(myHand, topCard, game.activeWildColor);
    if (!legal.some(c => c.color === card.color && c.value === card.value)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // A distinct sting per card TYPE — a plain number plays differently
    // from a disruptive Skip/Reverse/Draw2, so the table sounds alive
    // rather than every card making the same generic click.
    if (card.value === 'skip') { playSfx('unoSkip'); speakEvent('skip'); }
    else if (card.value === 'reverse') { playSfx('unoReverse'); speakEvent('reverse'); }
    else if (card.value === 'draw2') { playSfx('unoDrawPenalty'); speakEvent('draw2'); }
    else if (card.value === 'wild4') { playSfx('unoDrawPenalty'); speakEvent('draw4'); }
    else playSfx('unoPlay');
    // Mark this as "already sounded" so the discard-change detector
    // (which fires for EVERY play, mine included, once the RPC's result
    // lands) doesn't play the sting a second time for my own move.
    ownPlaySoundedRef.current = true;
    setTimeout(() => { ownPlaySoundedRef.current = false; }, 4000);
    if (isWild(card)) {
      setColorPickerCard(card);
    } else {
      submitPlay(card, undefined, index);
    }
  };

  // Fires the RPC FIRST, then starts the visual flourish. The flourish is
  // never awaited and never gates the call — see the header note.
  const submitPlay = async (card: UnoCard, chosenColor?: string, index?: number) => {
    setSubmitting(true);
    setColorPickerCard(null);

    const promise = playUnoCard(gameId, card, chosenColor);

    // Approximate launch point: where that card sat in the fan. Exact
    // measured geometry deliberately skipped — see FlyingCard's note.
    const n = Math.max(myHand.length, 1);
    const slot = index ?? Math.floor(n / 2);
    const step = Math.min(CARD_W + 6, Math.max(46, (width - 32 - CARD_W) / Math.max(n - 1, 1)));
    const contentW = (n - 1) * step + CARD_W;
    const fromX = Math.max(16, (width - contentW) / 2) + slot * step;
    const fromY = height - 210;
    flightKeyRef.current += 1;
    setFlying({ card, fromX, fromY, key: flightKeyRef.current });

    try {
      await promise;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDraw = async () => {
    if (!isMyTurn || submitting) return;
    setSubmitting(true);
    playSfx('cardDeal');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { await drawUnoCard(gameId); } finally { setSubmitting(false); }
  };

  const opponents = players.filter(p => p.id !== me.id).sort((a, b) => a.seat - b.seat);

  // Seat layout: 1 opponent sits across the table (top centre); 2 or 3
  // spread along the top edge, tightening as they're added. A dedicated
  // left/right column layout was considered and rejected — on a phone-
  // width table it steals horizontal room from the centre pile without
  // adding real spatial information.
  const compactSeats = opponents.length >= 3;

  // Discard-pile centre, in screen coords, for the flight target.
  const targetX = width / 2 + 20;
  const targetY = height * 0.4;

  return (
    <ArcadeScreen
      title="UNO" musicTrack="unoLoop" musicStopped={gameOver}
      backgroundColors={['#123A2C', '#0C2A20', '#071A14']}
    >
      {/* ── Felt table backdrop ──────────────────────────────────────────
          A deep emerald felt, distinct from the violet arcade shell the
          other three games sit on, with an ARCADE.uno-tinted rim so the
          table still carries Uno's own accent identity. The SAME gradient
          now also paints ArcadeScreen's own header strip (via
          backgroundColors) — a violet header over a green table read as
          broken chrome rather than two intentional zones. */}
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={['#123A2C', '#0C2A20', '#071A14']}
          locations={[0, 0.55, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        {/* Table-edge vignette: an inset rim + darkened corners so the felt
            reads as a surface with edges rather than a flat fill. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: 8, right: 8, top: 4, bottom: 4,
            borderRadius: 40,
            borderWidth: 2,
            borderColor: 'rgba(255,90,60,0.16)',
          }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />

        <View style={{ flex: 1 }}>
          {/* ── Opponent seats along the table's far edge ── */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'flex-start',
              gap: compactSeats ? 6 : 12,
              paddingHorizontal: 8,
              paddingTop: 4,
            }}
          >
            {opponents.map(p => {
              // Real-Uno "gotcha": any seated player can catch someone
              // sitting at exactly one card who hasn't called it yet,
              // forcing a 2-card draw penalty (call_uno/catch_missed_uno
              // are both server-enforced — this is just the affordance).
              const catchable = !gameOver && p.handCount === 1 && !p.hasCalledUno;
              return (
                <Pressable
                  key={p.id}
                  disabled={!catchable}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                    catchMissedUno(gameId, p.id);
                  }}
                  accessibilityRole={catchable ? 'button' : undefined}
                  accessibilityLabel={catchable ? `Catch ${nameFor(p)} for not calling UNO` : undefined}
                >
                  <UnoOpponentSeat
                    name={nameFor(p)}
                    handCount={p.handCount}
                    isTurn={!gameOver && game.currentTurnSeat === p.seat}
                    hasCalledUno={p.hasCalledUno}
                    isAi={p.isAi}
                    aiDifficulty={p.aiDifficulty}
                    compact={compactSeats}
                  />
                  {catchable && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute', top: -6, right: -6, paddingHorizontal: 8, paddingVertical: 3,
                        borderRadius: 10, backgroundColor: ARCADE.uno, borderWidth: 1.5, borderColor: '#fff',
                      }}
                    >
                      <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: 10, color: '#fff' }}>
                        Catch!
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* ── Table centre ── */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            {gameOver ? (
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Animated.Text
                  style={[
                    bannerStyle,
                    {
                      fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD,
                      fontSize: ARCADE_TYPO.display,
                      color: iWon ? ARCADE.uno : ARCADE.textPrimary,
                      textAlign: 'center',
                    },
                  ]}
                >
                  {iWon ? 'You win!' : `${nameFor(winner)} wins`}
                </Animated.Text>
                {iWon && <ConfettiBurst colorA={ARCADE.uno} colorB={ARCADE.primary} />}
              </View>
            ) : (
              <>
                <Animated.Text
                  style={[
                    statusStyle,
                    {
                      fontFamily: ARCADE_FONT_DISPLAY_BOLD,
                      fontSize: ARCADE_TYPO.heading,
                      color: isMyTurn ? ARCADE.primary : ARCADE.textSecondary,
                      letterSpacing: 0.4,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {isMyTurn ? 'Your turn' : `${nameFor(currentSeatPlayer)}'s turn`}
                </Animated.Text>

                <UnoTableCenter
                  topCard={topCard}
                  activeWildColor={game.activeWildColor}
                  drawPileCount={game.drawPileCount}
                  pendingDrawCount={game.pendingDrawCount}
                  canDraw={isMyTurn && !submitting}
                  direction={game.direction}
                  onDrawPress={handleDraw}
                />
              </>
            )}
          </View>

          {/* ── My hand ── */}
          {!gameOver && (
            <View style={{ paddingBottom: 6 }}>
              {myHand.length === 1 && !me.hasCalledUno && (
                <CallUnoButton
                  onPress={() => {
                    playSfx('unoCall');
                    speakEvent('uno');
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    callUno(gameId);
                  }}
                />
              )}
              <UnoHand
                hand={myHand}
                topCard={topCard}
                activeWildColor={game.activeWildColor}
                isMyTurn={isMyTurn}
                disabled={submitting}
                justDrewCount={justDrewCount}
                onCardPress={handleCardPress}
              />
            </View>
          )}
        </View>

        {/* Flight flourish — mounted after the RPC is already in flight. */}
        {flying && (
          <FlyingCard
            key={flying.key}
            card={flying.card}
            fromX={flying.fromX}
            fromY={flying.fromY}
            toX={targetX}
            toY={targetY}
            onDone={() => setFlying(null)}
          />
        )}

        {/* ── Wild colour picker ── */}
        {colorPickerCard && (
          <View
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, top: 0,
              backgroundColor: 'rgba(5,14,11,0.92)',
              alignItems: 'center', justifyContent: 'center', gap: 20,
            }}
          >
            <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading, color: ARCADE.textPrimary }}>
              Choose a color
            </Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {REAL_COLORS.map(color => (
                <Pressable
                  key={color}
                  onPress={() => {
                    playSfx('unoWildColor');
                    // Only the plain wild announces here — a wild4 already
                    // said "Draw four!" on the tap that opened this picker,
                    // and the debounce in speakEvent would drop this one
                    // anyway; being explicit keeps the intent readable.
                    if (colorPickerCard.value === 'wild') speakEvent('wild');
                    submitPlay(colorPickerCard, color);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${color}`}
                  style={{
                    width: 62, height: 62, borderRadius: 31,
                    backgroundColor: UNO_COLOR_HEX[color],
                    borderWidth: 3, borderColor: '#fff',
                    shadowColor: UNO_COLOR_HEX[color], shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
                  }}
                />
              ))}
            </View>
            <Pressable onPress={() => setColorPickerCard(null)} hitSlop={12}>
              <Text style={{ color: ARCADE.textMuted, fontSize: ARCADE_TYPO.body, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ArcadeScreen>
  );
}

/**
 * CallUnoButton — the "CALL UNO!" moment. Idles with a slow attention
 * pulse (it's easy to miss, and missing it is punishable), and bounces
 * hard on press. The RPC itself is fired by the caller's onPress with no
 * animation gating.
 */
function CallUnoButton({ onPress }: { onPress: () => void }) {
  const idle = useSharedValue(1);
  const hit = useSharedValue(0);

  useEffect(() => {
    idle.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 560 }), withTiming(1, { duration: 560 })),
      -1,
      true,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: idle.value * (1 + hit.value * 0.28) }],
    shadowOpacity: 0.5 + hit.value * 0.5,
    shadowRadius: 10 + hit.value * 14,
  }));

  return (
    <Animated.View style={[{ alignSelf: 'center', marginBottom: 4, shadowColor: ARCADE.uno, shadowOffset: { width: 0, height: 0 } }, style]}>
      <Pressable
        onPress={() => {
          hit.value = withSequence(
            withSpring(1, ARCADE_SPRING_BOUNCY),
            withDelay(90, withTiming(0, { duration: 220 })),
          );
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel="Call UNO"
        style={{
          paddingVertical: 10, paddingHorizontal: 26, borderRadius: 22,
          backgroundColor: ARCADE.uno, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
        }}
      >
        <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, color: '#fff', fontSize: ARCADE_TYPO.body, letterSpacing: 1 }}>
          CALL UNO!
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * ConfettiBurst / ConfettiDot — adapted from the identical pattern in
 * TicTacToeGame.tsx (same spring, same delayed fade, same radial spread),
 * recoloured for Uno and given a slightly wider throw for the bigger
 * table area. Kept structurally identical on purpose so the win moment
 * feels like the same arcade, not a different one.
 */
function ConfettiBurst({ colorA, colorB }: { colorA: string; colorB: string }) {
  const dots = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({
      angle: (i / 14) * Math.PI * 2 + Math.random() * 0.3,
      color: i % 2 === 0 ? colorA : colorB,
    })),
    [colorA, colorB],
  );

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%' }}>
      {dots.map((d, i) => <ConfettiDot key={i} angle={d.angle} color={d.color} />)}
    </View>
  );
}

function ConfettiDot({ angle, color }: { angle: number; color: string }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);
  useEffect(() => {
    progress.value = withSpring(1, { damping: 8, stiffness: 90 });
    opacity.value = withDelay(200, withTiming(0, { duration: 300 }));
  }, []);
  const distance = 96;
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: Math.cos(angle) * distance * progress.value },
      { translateY: Math.sin(angle) * distance * progress.value },
      { scale: 1 - progress.value * 0.3 },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', width: 9, height: 9, borderRadius: 4.5, backgroundColor: color }, style]} />;
}
