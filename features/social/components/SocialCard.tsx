import React, { useRef } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { parseISO } from 'date-fns';
import { router } from 'expo-router';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Notif {
  id: string; user_id: string; type: string;
  title: string; body?: string | null;
  data?: Record<string, any> | null;
  read: boolean; created_at: string;
  actor_name?: string; actor_emoji?: string;
  actor_color?: string; actor_avatar?: string | null;
}

export interface MyPet {
  id: string; name: string; emoji: string;
  accent_color: string | null; avatar_url: string | null;
}

// ─── Type config ──────────────────────────────────────────────────────────────
export const TYPE_CFG: Record<string, { icon: string; tint: string; label: string; gradient: string[] }> = {
  post_like:                   { icon: '❤️',  tint: '#E24B4A', label: 'Liked your post',        gradient: ['#E24B4A22','#E24B4A08'] },
  post_comment:                { icon: '💬',  tint: '#7C5CBF', label: 'Commented on your post', gradient: ['#7C5CBF22','#7C5CBF08'] },
  post_comment_reply:          { icon: '↩️',  tint: '#7C5CBF', label: 'Replied to your comment',gradient: ['#7C5CBF22','#7C5CBF08'] },
  new_post:                    { icon: '📝',  tint: '#FF8C55', label: 'Shared a new post',      gradient: ['#FF8C5522','#FF8C5508'] },
  follow:                      { icon: '🐾',  tint: '#14B8A6', label: 'Started following',       gradient: ['#14B8A622','#14B8A608'] },
  mention:                     { icon: '🔔',  tint: '#FF8C55', label: 'Mentioned you',           gradient: ['#FF8C5522','#FF8C5508'] },
  chat_message:                { icon: '💬',  tint: '#2196F3', label: 'Sent you a message',      gradient: ['#2196F322','#2196F308'] },
  family_update:               { icon: '🏠',  tint: '#F59E0B', label: 'Family update',           gradient: ['#F59E0B22','#F59E0B08'] },
  playdate_request:            { icon: '🐾',  tint: '#FF8C55', label: 'Wants a playdate!',       gradient: ['#FF8C5522','#FF8C5508'] },
  playdate_counter_proposal:   { icon: '📅',  tint: '#FF8C55', label: 'Proposed a new time',     gradient: ['#FF8C5522','#FF8C5508'] },
  playdate_accepted:           { icon: '🎉',  tint: '#14B8A6', label: 'Accepted the playdate!',  gradient: ['#14B8A622','#14B8A608'] },
  playdate_declined:           { icon: '😔',  tint: '#E24B4A', label: "Can't make it",           gradient: ['#E24B4A22','#E24B4A08'] },
  playdate_withdrawal:         { icon: '↩️',  tint: '#A1A1AA', label: 'Withdrew the request',    gradient: ['#A1A1AA22','#A1A1AA08'] },
  playdate_cancelled:          { icon: '↩️',  tint: '#A1A1AA', label: 'Cancelled the playdate',  gradient: ['#A1A1AA22','#A1A1AA08'] },
  playdate_rescheduled:        { icon: '📅',  tint: '#FF8C55', label: 'Wants to reschedule',     gradient: ['#FF8C5522','#FF8C5508'] },
  playdate_reminder:           { icon: '⏰',  tint: '#14B8A6', label: 'Playdate reminder',        gradient: ['#14B8A622','#14B8A608'] },
  playdate_completion:         { icon: '✅',  tint: '#22C55E', label: 'Confirmed the playdate',   gradient: ['#22C55E22','#22C55E08'] },
  playdate_expired:            { icon: '⏳',  tint: '#94A3B8', label: 'Request expired',          gradient: ['#94A3B822','#94A3B808'] },
  playdate_resend:             { icon: '🐾',  tint: '#FF8C55', label: 'Still waiting',            gradient: ['#FF8C5522','#FF8C5508'] },
  playdate_proposal:           { icon: '📅',  tint: '#FF8C55', label: 'Proposed a time',          gradient: ['#FF8C5522','#FF8C5508'] },
  playdate_confirmed:          { icon: '🎉',  tint: '#14B8A6', label: 'Playdate confirmed!',      gradient: ['#14B8A622','#14B8A608'] },
  playdate_proposal_declined:  { icon: '❌',  tint: '#E24B4A', label: 'Declined the proposal',   gradient: ['#E24B4A22','#E24B4A08'] },
  playdate_proposal_cancelled: { icon: '↩️',  tint: '#A1A1AA', label: 'Cancelled the proposal',  gradient: ['#A1A1AA22','#A1A1AA08'] },
};

export const DEFAULT_CFG = { icon: '🔔', tint: '#6B7280', label: 'Notification', gradient: ['#6B728022','#6B728008'] };

export const TYPE_FILTERS = [
  { key: 'all',          label: 'All',       icon: '🔔' },
  { key: 'playdate',     label: 'Playdates', icon: '🐾' },
  { key: 'new_post',     label: 'Posts',     icon: '📝' },
  { key: 'post_like',    label: 'Likes',     icon: '❤️' },
  { key: 'post_comment', label: 'Comments',  icon: '💬' },
];

export const SOCIAL_TYPES = [
  'post_like','post_comment','post_comment_reply','follow','mention','new_post',
  'playdate_request','playdate_resend','playdate_accepted',
  'playdate_proposal','playdate_counter_proposal','playdate_declined','playdate_withdrawal',
  'playdate_confirmed','playdate_proposal_declined','playdate_proposal_cancelled',
  'playdate_cancelled','playdate_reminder','chat_message',
  'playdate_rescheduled','playdate_expired','playdate_completion','playdate_chat_message',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function titleToName(title: string): string {
  const m = title.match(/^[\p{Emoji}\s]*(\w[\w\s]*?) /u);
  if (m?.[1]) return m[1];
  const m2 = title.match(/^[\p{Emoji}\s]*(\w[\w\s]*)$/u);
  return m2?.[1]?.trim() || 'Someone';
}

export function compactTime(iso: string) {
  try {
    const diff = Date.now() - parseISO(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  } catch { return ''; }
}

export function richDetail(notif: Notif): string | null {
  const d = notif.data ?? {};
  const t = notif.type;
  if (t.startsWith('playdate_')) {
    const parts: string[] = [];
    if (d.proposed_date || d.agreed_date) parts.push(d.proposed_date ?? d.agreed_date);
    if (d.proposed_time || d.agreed_time) {
      const s = d.proposed_time ?? d.agreed_time;
      const e = d.proposed_end_time ?? d.agreed_end_time;
      parts.push(e ? `${s} → ${e}` : s);
    }
    if (d.proposed_location || d.agreed_location) parts.push(`📍 ${d.proposed_location ?? d.agreed_location}`);
    if (d.message) parts.push(`"${d.message}"`);
    if (parts.length) return parts.join('  ·  ');
    if (notif.body) return notif.body;
  }
  if (t === 'post_like' || t === 'post_comment') {
    if (d.post_snippet) return `"${d.post_snippet}"`;
    if (d.comment_text) return `"${d.comment_text}"`;
  }
  if (t === 'chat_message' || t === 'playdate_chat_message') {
    if (d.message_preview) return d.message_preview;
  }
  return notif.body ?? null;
}

export function myPetIdFromNotif(n: Notif, myPetIdSet: Set<string>, chatPetMap: Map<string,string>, postPetMap: Map<string,string>): string | null {
  const d = n.data ?? {};
  for (const key of ['to_pet_id','from_pet_id','my_pet_id','recipient_pet_id','pet_id']) {
    if (typeof d[key] === 'string' && myPetIdSet.has(d[key])) return d[key];
  }
  for (const val of Object.values(d)) {
    if (typeof val === 'string' && myPetIdSet.has(val)) return val;
  }
  if (typeof d.chat_id === 'string') { const v = chatPetMap.get(d.chat_id); if (v) return v; }
  if (typeof d.post_id === 'string') { const v = postPetMap.get(d.post_id); if (v) return v; }
  return null;
}

const POST_TYPES = new Set(['post_like', 'post_comment', 'post_comment_reply', 'mention', 'new_post']);
const COMMENT_TYPES = new Set(['post_comment', 'post_comment_reply', 'mention']);

export function navigateForNotif(n: Notif, chatEnabled: boolean) {
  const d = n.data ?? {};
  if (POST_TYPES.has(n.type)) {
    if (d.post_id) {
      router.push({
        pathname: '/post/[id]' as any,
        params: { id: d.post_id, open_comments: COMMENT_TYPES.has(n.type) ? '1' : '0' },
      });
      return;
    }
    if (d.actor_pet_id) { router.push({ pathname: '/pet/[id]' as any, params: { id: d.actor_pet_id } }); return; }
    router.push('/(tabs)/connect' as any);
    return;
  }
  if (n.type === 'follow') {
    if (d.actor_pet_id) { router.push({ pathname: '/pet/[id]' as any, params: { id: d.actor_pet_id } }); return; }
    router.push('/(tabs)/social-notifications' as any);
    return;
  }
  if (n.type === 'chat_message' || n.type === 'playdate_chat_message') {
    if (chatEnabled && d.chat_id) { router.push({ pathname: '/playdate-chat/[chatId]' as any, params: { chatId: d.chat_id } }); }
    else { router.push({ pathname: '/(tabs)/connect', params: { tab: 'Playdates' } } as any); }
    return;
  }
  if (n.type.startsWith('playdate')) {
    if (d.chat_id) { router.push({ pathname: '/playdate-chat/[chatId]' as any, params: { chatId: d.chat_id } }); return; }
    if (d.request_id) { router.push({ pathname: '/playdate/[id]' as any, params: { id: d.request_id } }); return; }
    router.push('/my-playdates' as any);
    return;
  }
  router.push('/(tabs)/connect' as any);
}

// ─── PetAvatar ────────────────────────────────────────────────────────────────
export function PetAvatar({ emoji, color, avatarUrl, size }: { emoji?: string; color?: string; avatarUrl?: string | null; size: number }) {
  if (avatarUrl) return <Image source={{ uri: avatarUrl }} cachePolicy="memory-disk" style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: (color ?? '#7C5CBF') + '22', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.48 }}>{emoji ?? '🐾'}</Text>
    </View>
  );
}

// ─── SocialCard ───────────────────────────────────────────────────────────────
export interface SocialCardProps {
  notif: Notif;
  isRead: boolean;
  isSelected: boolean;
  selecting: boolean;
  colors: any;
  isDark: boolean;
  actorPetMap: Map<string, { name: string; emoji: string }>;
  onPress: () => void;
  onLongPress: () => void;
}

export const SocialCard = React.memo(function SocialCard({
  notif, isRead, isSelected, selecting, colors, isDark, actorPetMap, onPress, onLongPress,
}: SocialCardProps) {
  const cfg          = TYPE_CFG[notif.type] ?? DEFAULT_CFG;
  const d            = notif.data ?? {};
  const resolvedActor = d.actor_pet_id ? actorPetMap.get(d.actor_pet_id as string) : undefined;
  const actorName    = ((d.actor_name ?? d.from_pet_name ?? notif.actor_name ?? '').trim()) || resolvedActor?.name || titleToName(notif.title);
  const actorEmoji   = d.actor_emoji ?? d.from_pet_emoji ?? notif.actor_emoji ?? resolvedActor?.emoji ?? '🐾';
  const actorColor   = d.actor_color ?? d.from_pet_color ?? notif.actor_color ?? cfg.tint;
  const actorAvatar  = d.actor_avatar ?? d.from_pet_avatar ?? notif.actor_avatar ?? null;
  const detail       = richDetail(notif);
  const scaleAnim    = useRef(new Animated.Value(1)).current;

  const onPressIn  = () => Animated.spring(scaleAnim, { toValue: 0.975, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () => Animated.spring(scaleAnim, { toValue: 1,     useNativeDriver: true, speed: 50 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], marginBottom: 10 }}>
      <TouchableOpacity activeOpacity={1} onPress={onPress} onLongPress={onLongPress}
        delayLongPress={350} onPressIn={onPressIn} onPressOut={onPressOut}>
        <View style={[
          sc.card,
          {
            backgroundColor: isSelected
              ? actorColor + '12'
              : isRead ? (isDark ? '#12101E' : '#FAFAFA') : cfg.tint + '0C',
            borderColor: isSelected
              ? actorColor + 'CC'
              : isRead ? (isDark ? '#221E38' : '#EDEBF5') : cfg.tint + '40',
          },
          isSelected && { borderWidth: 1.5 },
        ]}>
          {!isRead && <View style={[sc.accentBar, { backgroundColor: cfg.tint }]} />}

          <View style={sc.inner}>
            {selecting ? (
              <View style={[sc.checkbox, {
                borderColor: isSelected ? actorColor : (isDark ? '#4A3A6A' : '#C4B5E0'),
                backgroundColor: isSelected ? actorColor : 'transparent',
              }]}>
                {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            ) : (
              <View style={{ position: 'relative', flexShrink: 0 }}>
                <View style={[sc.avatarRing, { borderColor: actorColor + '70' }]}>
                  <PetAvatar emoji={actorEmoji} color={actorColor} avatarUrl={actorAvatar} size={46} />
                </View>
                <View style={[sc.typeBadge, { backgroundColor: isDark ? '#1E1A30' : '#fff', borderColor: isDark ? '#2A2045' : '#F0EDF8' }]}>
                  <Text style={{ fontSize: TYPO.body }}>{cfg.icon}</Text>
                </View>
                {!isRead && <View style={[sc.unreadDot, { backgroundColor: cfg.tint, borderColor: isDark ? '#12101E' : '#FAFAFA' }]} />}
              </View>
            )}

            <View style={sc.content}>
              <View style={sc.row1}>
                <Text style={[sc.actorName, { color: actorColor }]} numberOfLines={1}>{actorName}</Text>
                <View style={[sc.typeChip, { backgroundColor: cfg.tint + '18' }]}>
                  <Text style={[sc.typeChipTxt, { color: cfg.tint }]}>{cfg.label}</Text>
                </View>
              </View>
              {!!d.actor_owner_handle && (
                <Text style={[sc.handle, { color: colors.textSecondary ?? colors.textSecondary }]} numberOfLines={1}>@{d.actor_owner_handle}</Text>
              )}
              {!!detail && (
                <Text style={[sc.detail, { color: colors.textSecondary }]} numberOfLines={2}>{detail}</Text>
              )}
            </View>

            <View style={sc.rightCol}>
              <Text style={[sc.time, { color: colors.textSecondary }]}>{compactTime(notif.created_at)}</Text>
              {!isRead
                ? <View style={[sc.dot, { backgroundColor: cfg.tint }]} />
                : <Ionicons name="chevron-forward" size={12} color={isDark ? '#4A3A6A' : '#C4B5E0'} />
              }
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export const sc = StyleSheet.create({
  card:        { borderRadius: 18, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8 },
  accentBar:   { position: 'absolute', left: 0, top: 8, bottom: 8, width: 4, borderRadius: 4 },
  inner:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, paddingLeft: 18, gap: 13 },
  avatarRing:  { borderRadius: 27, borderWidth: 2.5, padding: 2 },
  typeBadge:   { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 },
  unreadDot:   { position: 'absolute', top: 0, right: 0, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  checkbox:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content:     { flex: 1, gap: 4 },
  row1:        { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  actorName:   { fontSize: TYPO.body, fontWeight: '800' },
  typeChip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeChipTxt: { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.2 },
  handle:      { fontSize: TYPO.body, fontWeight: '500', marginBottom: 1 },
  detail:      { fontSize: TYPO.body, lineHeight: 18 },
  rightCol:    { alignItems: 'flex-end', gap: 6, alignSelf: 'flex-start', paddingTop: 1 },
  time:        { fontSize: TYPO.body, fontWeight: '600' },
  dot:         { width: 8, height: 8, borderRadius: 4 },
});
