import { useEffect, useRef, useState, memo } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Animated, Alert, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as WebBrowser from 'expo-web-browser';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play, CheckCheck, AlertTriangle, MapPin, FileText, RefreshCw } from 'lucide-react-native';
import { ChatMessage } from '@/store/chatStore';
import { VoiceNoteBubble } from './VoiceComponents';
import { SwipeableBubble } from './SwipeableBubble';
import { CollapsibleText } from './MentionText';
import { formatTime, detectAlertTint, SHARE_KIND_META, REPLY_KIND_LABEL, BUBBLE_R, BUBBLE_SM } from './constants';

// ─── Video thumbnail — first-frame still, not playing ──────────────────────
// A video message's bubble preview used a plain <Image> pointed at the
// video's own .mp4 URL — Image can't decode video, so it silently rendered
// nothing (just the play-button overlay floating on empty space). No video-
// thumbnail-generation package is installed; a paused VideoView renders the
// first frame as a static image for free, reusing the exact same expo-video
// dependency the fullscreen lightbox already depends on — no new package.
function VideoThumbnail({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, pl => { pl.pause(); });
  return (
    <VideoView player={player} style={{ width, height }} contentFit="cover"
      nativeControls={false} pointerEvents="none" />
  );
}

// ─── Shared card (read-only meal/event/quest share from Ask Cube) ─────────

export function SharedCardBubble({ payload, colors, onLongPress, onPress }: { payload: any; colors: any; onLongPress: () => void; onPress?: () => void }) {
  const kind = payload?.kind ?? 'meal';
  const meta = SHARE_KIND_META[kind] ?? SHARE_KIND_META.meal;
  const accent = colors[meta.accentKey] ?? colors.primary;
  const d = payload?.data ?? {};
  // A shared card's imageUrl is often a Supabase signed URL captured at
  // share time — if it's since expired, or the request otherwise fails,
  // the bare <Image> below rendered nothing at all (blank slot, live-
  // reported: "that image is not showing"). Track failure and fall back
  // to the emoji, same as MealHero (AskCubeProposalCard.tsx) already does
  // for the identical card shown inside Ask Cube itself.
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!d.imageUrl && !imgFailed;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350}
      style={{ width: 260, backgroundColor: colors.card, borderRadius: 16,
        borderWidth: 1.5, borderColor: accent + '40', overflow: 'hidden' }}>
      {(showImage || d.emoji) && (
        <View style={{ height: 90, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
          {showImage
            ? <Image source={{ uri: d.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover"
                onError={() => setImgFailed(true)} />
            : <Text style={{ fontSize: 44 }}>{d.emoji}</Text>}
        </View>
      )}
      <View style={{ padding: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ fontSize: 13 }}>{meta.icon}</Text>
          <Text style={{ fontSize: 10, fontWeight: '800', color: accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.label}</Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{d.title}</Text>
        {(d.day || d.mealType || d.startAt) && (
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
            {d.day ? `${d.day}${d.mealType ? ` · ${d.mealType}` : ''}` : new Date(d.startAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Message bubble (WhatsApp style — rounded rect with tail) ────────────────

// Chat's FlatList renders potentially hundreds of these rows with no
// tuning props previously set (see ChatScreen.tsx's FlatList) — every
// list re-render (new message arriving, a reaction on ANY row, scroll-
// derived header-collapse state changing) re-rendered every currently-
// mounted MessageBubble from scratch, none of it skippable, since this
// had no memo boundary at all. Live-reported as janky/not-smooth
// scrolling. Wrapped in React.memo with a custom comparator below (not
// the default shallow-props check) since `readers` arrives as a freshly
// filtered array on every parent render even when its actual contents
// are unchanged — a plain reference-equality memo would never skip a
// re-render for messages that show the reader stack.
function MessageBubbleImpl({ msg, isMe, isGroupFirst, isGroupLast, senderName, senderEmoji,
  senderColor, replyToColor, activeMemberId, memberMap, searchQuery, colors, isDark, highlighted, isParent, readers,
  onLongPress, onDoubleTap, onSwipeRight, onQuoteTap, onOpenImage, onOpenVideo, onOpenSharedCard, onRetry }: {
  msg: ChatMessage; isMe: boolean; isGroupFirst: boolean; isGroupLast: boolean;
  senderName: string; senderEmoji: string; senderColor: string;
  // Color of the ORIGINAL sender of the quoted message (msg.replyTo), not
  // this message's own sender — lets the quote strip stand out as "whose
  // message this was" rather than blending into the replying bubble.
  replyToColor?: string;
  activeMemberId: string; memberMap: Record<string, any>;
  highlighted?: boolean;
  isParent?: boolean;
  // memberIds who've read this message — only passed for my own messages in
  // a group channel. Renders as a small avatar stack, WhatsApp-group style.
  readers?: string[];
  onQuoteTap?: () => void;
  onOpenImage?: (uri: string) => void;
  onOpenVideo?: (uri: string) => void;
  onOpenSharedCard?: (payload: any) => void;
  // Only relevant when msg.status === 'failed' — retries the exact send
  // that failed (network drop, RLS error, etc.) using the args chatStore
  // captured at failure time.
  onRetry?: () => void;
  searchQuery: string; colors: any; isDark: boolean;
  onLongPress: () => void; onDoubleTap: () => void; onSwipeRight: () => void;
}) {
  const alertTint = detectAlertTint(msg.text);
  const alertColor = alertTint === 'danger' ? colors.danger : alertTint === 'warning' ? colors.warning : alertTint === 'success' ? colors.success : null;

  // Blue "my bubble" from the brand palette (colors.info) instead of the
  // primary terracotta — distinguishes "my own message" from the app's
  // universal CTA/action color, matching the classic messaging-app
  // convention of a distinct blue for your own bubbles. Kept the same
  // softened alpha treatment (reduced from full opacity so it sits back a
  // bit rather than reading as the loudest thing on screen).
  const bubbleMe       = isDark ? colors.info + 'B0' : colors.info + 'A8';
  const bubbleMeTxt    = '#FFFFFF';
  const bubbleOther    = alertColor ? (isDark ? alertColor + '20' : alertColor + '12') : colors.card;
  const bubbleOtherTxt = colors.textPrimary;
  const tsColor        = isMe ? 'rgba(255,255,255,0.65)' : colors.textTertiary;

  const totalRx = Object.values(msg.reactions ?? {}).flat().length;
  const isVoice = !!msg.voiceUri && !msg.text;

  const lastTap = useRef(0);
  const handlePress = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) onDoubleTap();
    lastTap.current = now;
  };

  // Amber highlight animation when tapping a quoted message
  const highlightAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (highlighted) {
      highlightAnim.setValue(1);
      Animated.timing(highlightAnim, { toValue: 0, duration: 1800, useNativeDriver: false }).start();
    }
  }, [highlighted]);
  const highlightBorder = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', colors.amber] });
  const highlightWidth  = highlightAnim.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 2, 2] });

  // Flat corner on the chat-side tip (last bubble in group)
  const btlr = isMe ? BUBBLE_R : (isGroupFirst ? BUBBLE_SM : BUBBLE_R);
  const btrr = isMe ? (isGroupFirst ? BUBBLE_SM : BUBBLE_R) : BUBBLE_R;
  const bblr = BUBBLE_R;
  const bbrr = BUBBLE_R;

  // Timestamp + tick — inline at bottom-right of bubble (WhatsApp style)
  const metaRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
      alignSelf: 'flex-end', marginTop: 4, marginBottom: -2 }}>
      {/* Parent-only — the AI moderation pass (layer 2) flags tone issues
          silently; the message stays visible to everyone as sent, only
          parents see this small indicator, never a public callout. */}
      {isParent && msg.moderationFlag && (
        <Pressable
          onPress={() => Alert.alert('Flagged for review', msg.moderationFlag!.reason || 'This message was flagged by AI moderation.')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <AlertTriangle size={11} color={colors.danger} style={{ marginRight: 2 }} />
        </Pressable>
      )}
      {msg.edited && <Text style={{ fontSize: 9, color: tsColor }}>edited · </Text>}
      <Text style={{ fontSize: 10, color: tsColor }}>{formatTime(msg.timestamp)}</Text>
      {/* isMe read-receipt checkmark uses colors.info (the app's one true
          blue) — was colors.parent, which is a role-accent color that means
          "this is a parent's content" everywhere else in the app (Parents
          Vault, role badges). Reusing it as a generic "read" tint was
          confusing regardless of who actually read the message. */}
      {isMe && (
        <CheckCheck size={13} color={
          (readers?.length ?? 0) > 0 ? colors.info : 'rgba(255,255,255,0.55)'
        } />
      )}
    </View>
  );

  // Small overlapping avatar stack under my own group message — who's read
  // it, WhatsApp-group style. Capped at 4 faces + a "+N" overflow chip so a
  // big family group never turns this into a wide clutter strip.
  const readerStack = (readers && readers.length > 0) ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 3 }}>
      {readers.slice(0, 4).map((id, i) => {
        const m = memberMap[id];
        const readerColor = m?.role === 'parent' ? (colors.parent ?? '#2563eb') : (colors.kid ?? '#7c3aed');
        return (
          <View key={id} style={{
            marginLeft: i === 0 ? 0 : -6, zIndex: 4 - i,
            width: 14, height: 14, borderRadius: 7,
            borderWidth: 1, borderColor: colors.background,
            backgroundColor: readerColor,
            alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <Text style={{ fontSize: 8, color: '#fff', fontWeight: '700' }}>
              {m?.emoji && m.emoji !== '👤' ? m.emoji : (m?.name?.[0]?.toUpperCase() ?? '?')}
            </Text>
          </View>
        );
      })}
      {readers.length > 4 && (
        <Text style={{ fontSize: 9, color: colors.textTertiary, marginLeft: 3 }}>+{readers.length - 4}</Text>
      )}
    </View>
  ) : null;

  const swipeTimeNode = (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
      paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, color: '#fff', fontWeight: '600' }}>{formatTime(msg.timestamp)}</Text>
    </View>
  );

  // Automated broadcast (En Route ping, missed-pickup warning, reassignment
  // notice) — rendered as a centered system banner, not a left/right chat
  // bubble. Without this, the sender's own broadcasts rendered as their
  // normal outgoing bubble (solid brand color, right-aligned), making an
  // automated "en route" ping visually indistinguishable from something
  // they actually typed — this branch fixes that regardless of who the
  // system attributes the message to.
  if (alertTint && alertColor) {
    return (
      <View style={{ alignItems: 'center', paddingHorizontal: 24,
        marginBottom: isGroupLast ? 14 : 4, marginTop: isGroupFirst ? 8 : 0 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: isDark ? alertColor + '14' : alertColor + '0A',
          borderWidth: 1, borderColor: alertColor + '28',
          borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '90%',
        }}>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: alertColor, flexShrink: 1, textAlign: 'center' }}>
            {msg.text}
          </Text>
          <Text style={{ fontSize: 10, color: alertColor + '99' }}>{formatTime(msg.timestamp)}</Text>
        </View>
      </View>
    );
  }

  // Structured share (meal/event/quest from Ask Cube) — a read-only card,
  // not the normal colored text bubble. Kept outside SwipeableBubble (no
  // reply-swipe on a card) but keeps the same avatar/sender-name row so it
  // still reads as part of the conversation flow.
  if (msg.systemEvent?.type === 'shared_card') {
    return (
      <View style={{ flexDirection: isMe ? 'row-reverse' : 'row',
        alignItems: 'flex-end', gap: 6, paddingHorizontal: 10,
        marginBottom: isGroupLast ? 14 : 3, marginTop: isGroupFirst ? 8 : 0 }}>
        {!isMe && (
          isGroupLast
            ? <View style={[mb.avatar, { backgroundColor: senderColor }]}>
                <Text style={{ fontSize: senderEmoji && senderEmoji !== '👤' ? 16 : 13, color: '#fff', fontWeight: '700' }}>
                  {senderEmoji && senderEmoji !== '👤' ? senderEmoji : senderName[0]?.toUpperCase()}
                </Text>
              </View>
            : <View style={{ width: 34 }} />
        )}
        <View style={{ maxWidth: '82%', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 2 }}>
          <SharedCardBubble payload={msg.systemEvent.payload} colors={colors} onLongPress={onLongPress}
            onPress={() => onOpenSharedCard?.(msg.systemEvent!.payload)} />
          {metaRow}
        </View>
      </View>
    );
  }

  return (
    <SwipeableBubble onSwipeRight={onSwipeRight} timeNode={swipeTimeNode}>
      <View style={{ flexDirection: isMe ? 'row-reverse' : 'row',
        alignItems: 'flex-end', gap: 6, paddingHorizontal: 10,
        marginBottom: isGroupLast ? 14 : 3, marginTop: isGroupFirst ? 8 : 0 }}>

        {/* Avatar — shown only on last bubble of group for others */}
        {!isMe && (
          isGroupLast
            ? <View style={[mb.avatar, { backgroundColor: senderColor }]}>
                <Text style={{ fontSize: senderEmoji && senderEmoji !== '👤' ? 16 : 13,
                  color: '#fff', fontWeight: '700' }}>
                  {senderEmoji && senderEmoji !== '👤' ? senderEmoji : senderName[0]?.toUpperCase()}
                </Text>
              </View>
            : <View style={{ width: 34 }} />
        )}

        <Animated.View style={{ maxWidth: '78%', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 2,
          borderRadius: BUBBLE_R, borderWidth: highlightWidth, borderColor: highlightBorder }}>
          {/* Bubble */}
          <Pressable
            onPress={handlePress}
            onLongPress={onLongPress}
            delayLongPress={350}
            style={{
              backgroundColor: isMe ? bubbleMe : bubbleOther,
              borderTopLeftRadius: btlr,
              borderTopRightRadius: btrr,
              borderBottomLeftRadius: bblr,
              borderBottomRightRadius: bbrr,
              borderWidth: isMe ? 0 : 1,
              borderColor: alertColor ? alertColor + '50' : colors.border,
              overflow: 'hidden',
              padding: isVoice ? 8 : 11,
              minWidth: msg.replyTo ? 220 : undefined,
            }}
          >
            {/* Reply quote — WhatsApp inset card */}
            {msg.replyTo && (
              <Pressable onPress={onQuoteTap}
                style={{
                  flexDirection: 'row',
                  borderRadius: 10,
                  overflow: 'hidden',
                  marginBottom: 8,
                  // Outgoing: a translucent white tint pops against the solid
                  // primary bubble; incoming: colors.surface against the card.
                  backgroundColor: isMe ? 'rgba(255,255,255,0.16)' : colors.surface,
                }}>
                {/* Accent strip — the QUOTED message's own sender's color
                    (not this message's sender), so it reads as "whose
                    message this was" and stands out against the reply. */}
                <View style={{ width: 3, backgroundColor: replyToColor ?? senderColor }} />
                <View style={{ flex: 1, paddingHorizontal: 9, paddingVertical: 7 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', marginBottom: 2,
                    color: replyToColor ?? senderColor }}>
                    {memberMap[msg.replyTo.senderId]?.name?.split(' ')[0] ?? 'Family'}
                  </Text>
                  <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16,
                    color: isMe ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>
                    {msg.replyTo.text || REPLY_KIND_LABEL[msg.replyTo.kind ?? 'voice']}
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Voice note */}
            {isVoice && msg.voiceUri ? (
              <VoiceNoteBubble uri={msg.voiceUri} msgId={msg.id} duration={msg.voiceDuration ?? 0} isMine={isMe} colors={colors} />
            ) : isVoice ? (
              <Text style={{ fontSize: 14, color: isMe ? bubbleMeTxt : bubbleOtherTxt }}>
                🎙️ Voice note ({Math.round(msg.voiceDuration ?? 0)}s)
              </Text>
            ) : (
              <>
                {/* Location pin */}
                {msg.locationPin && (
                  <Pressable
                    onPress={() => {
                      const { lat, lng, address } = msg.locationPin!;
                      const label = encodeURIComponent(address);
                      const appleUrl  = `maps:0,0?q=${label}&ll=${lat},${lng}`;
                      const googleUrl = `comgooglemaps://?q=${label}&center=${lat},${lng}`;
                      const webUrl    = `https://maps.google.com/?q=${lat},${lng}`;
                      Linking.canOpenURL(googleUrl)
                        .then(can => Linking.openURL(can ? googleUrl : appleUrl))
                        .catch(() => Linking.openURL(webUrl));
                    }}
                    style={{ borderRadius: 12, overflow: 'hidden', width: 230, marginHorizontal: -2 }}>
                    {/* Map snapshot — non-interactive, tap handled by outer Pressable */}
                    <MapView
                      style={{ width: 230, height: 140 }}
                      initialRegion={{ latitude: msg.locationPin.lat, longitude: msg.locationPin.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }}
                      scrollEnabled={false} zoomEnabled={false}
                      pitchEnabled={false} rotateEnabled={false}
                      pointerEvents="none"
                      legalLabelInsets={{ top: 0, left: 0, bottom: -999, right: -999 }}
                    >
                      <Marker coordinate={{ latitude: msg.locationPin.lat, longitude: msg.locationPin.lng }} />
                    </MapView>
                    {/* Address footer */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 10, paddingVertical: 8,
                      backgroundColor: isMe ? 'rgba(0,0,0,0.28)' : colors.surface }}>
                      <MapPin size={13} color={isMe ? '#fff' : colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700',
                          color: isMe ? '#fff' : colors.textPrimary }} numberOfLines={1}>
                          {msg.locationPin.address}
                        </Text>
                        <Text style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.55)' : colors.textTertiary }}>
                          Tap to open in Maps
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                )}
                {/* Document attachment */}
                {msg.documentUri && (
                  // Linking.openURL delegates entirely to an external app
                  // registered for the URL's content type — for something
                  // like a .md file, iOS has no default handler at all, so
                  // it rejects even though the URL itself is completely
                  // valid and reachable (confirmed live: the signed URL
                  // 200'd with real content). That's not "file no longer
                  // available," it's "no app knows how to open this" — the
                  // error text was misleading about the real cause.
                  // WebBrowser opens an in-app Safari view instead, which
                  // can display/download most file types without needing
                  // an external app handler to exist.
                  <Pressable onPress={() => WebBrowser.openBrowserAsync(msg.documentUri!).catch(() =>
                    Alert.alert("Couldn't open document", 'Please try again.'))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : colors.surface,
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, maxWidth: 220 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.amber + '22',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={20} color={colors.amber} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isMe ? '#fff' : colors.textPrimary }} numberOfLines={2}>
                        {msg.documentName ?? 'Document'}
                      </Text>
                      <Text style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.6)' : colors.textTertiary }}>
                        Tap to open
                      </Text>
                    </View>
                  </Pressable>
                )}
                {/* Image / video */}
                {msg.imageUri && (
                  <Pressable
                    onPress={() => msg.mediaType === 'video' ? onOpenVideo?.(msg.imageUri!) : onOpenImage?.(msg.imageUri!)}
                    style={{ marginBottom: msg.text ? 6 : 0, borderRadius: 12, overflow: 'hidden' }}>
                    {msg.mediaType === 'video'
                      ? <VideoThumbnail uri={msg.imageUri} width={210} height={158} />
                      : <Image source={{ uri: msg.imageUri }} style={{ width: 210, height: 158 }} resizeMode="cover" />}
                    {msg.mediaType === 'video' && (
                      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 24, padding: 10 }}>
                          <Play size={22} color="#fff" fill="#fff" />
                        </View>
                      </View>
                    )}
                  </Pressable>
                )}
                {/* Text — collapse after 10 lines */}
                {!!msg.text && (
                  <CollapsibleText
                    text={msg.text}
                    memberMap={memberMap}
                    myId={activeMemberId}
                    searchQuery={searchQuery}
                    isMe={isMe}
                    bubbleMeTxt={bubbleMeTxt}
                    bubbleOtherTxt={bubbleOtherTxt}
                  />
                )}
              </>
            )}
            {/* Time + tick — inside bubble, bottom-right (WhatsApp style) */}
            {metaRow}
          </Pressable>

          {/* Reaction chips */}
          {totalRx > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
              {Object.entries(msg.reactions ?? {}).map(([emoji, ids]) =>
                ids.length > 0 ? (
                  <View key={emoji} style={[mb.rxChip, {
                    backgroundColor: ids.includes(activeMemberId) ? colors.primaryLight : colors.surface,
                    borderColor: ids.includes(activeMemberId) ? colors.primary : 'transparent',
                  }]}>
                    <Text style={{ fontSize: 13 }}>{emoji}</Text>
                    {ids.length > 1 && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '700' }}>{ids.length}</Text>
                    )}
                  </View>
                ) : null
              )}
            </View>
          )}

          {/* Read-by avatar stack — only on the last bubble of a group, so a
              run of consecutive messages from me doesn't repeat it per line. */}
          {isGroupLast && readerStack}

          {/* Failed send — was silently removed from the list with only an
              invisible background retry (flushOfflineQueue, next reconnect/
              app-active); the sender had no way to tell it failed or retry
              on demand. Only ever shown for status: 'failed', which only
              ever applies to my own not-yet-sent messages. */}
          {msg.status === 'failed' && (
            <Pressable
              onPress={onRetry}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
                alignSelf: isMe ? 'flex-end' : 'flex-start' }}
            >
              <AlertTriangle size={11} color={colors.danger} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>Not sent</Text>
              <RefreshCw size={11} color={colors.danger} style={{ marginLeft: 2 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger, textDecorationLine: 'underline' }}>Tap to retry</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </SwipeableBubble>
  );
}

function sameReaders(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const MessageBubble = memo(MessageBubbleImpl, (prev, next) => {
  return (
    prev.msg === next.msg &&
    prev.isMe === next.isMe &&
    prev.isGroupFirst === next.isGroupFirst &&
    prev.isGroupLast === next.isGroupLast &&
    prev.senderName === next.senderName &&
    prev.senderEmoji === next.senderEmoji &&
    prev.senderColor === next.senderColor &&
    prev.replyToColor === next.replyToColor &&
    prev.activeMemberId === next.activeMemberId &&
    prev.memberMap === next.memberMap &&
    prev.searchQuery === next.searchQuery &&
    prev.colors === next.colors &&
    prev.isDark === next.isDark &&
    prev.highlighted === next.highlighted &&
    prev.isParent === next.isParent &&
    sameReaders(prev.readers, next.readers)
    // Callback props (onLongPress/onDoubleTap/onSwipeRight/onQuoteTap/
    // onOpenImage/onOpenVideo/onOpenSharedCard) are deliberately excluded
    // from this comparison — ChatScreen recreates them as fresh closures
    // per render regardless, so comparing them would defeat the memo
    // entirely. None of them capture per-row-varying values other than
    // `msg` itself (already compared above), so a stale closure from a
    // skipped re-render still behaves correctly.
  );
});

const mb = StyleSheet.create({
  avatar:  { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rxChip:  { flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
});
