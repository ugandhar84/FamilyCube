import React, { useState, useEffect } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import { showAlert } from '@/components/AppAlert';
import { formatDist, formatTime } from '@/lib/units';
import { toTitle } from '@/lib/format';
import SubscriptionBadge from '@/components/SubscriptionBadge';
import { getStatusCfg } from '@/features/social/utils';
import { NearbyPet, CANCEL_REASONS } from '@/features/social/types';

// ── CalendarSvg ────────────────────────────────────────────────────────────────

function CalendarSvg({ size = 11, color = '#22C55E' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="17" rx="3" stroke={color} strokeWidth="1.8" />
      <Line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="1.8" />
      <Line x1="8"  y1="2" x2="8"  y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="16" y1="2" x2="16" y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"
        stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Carousel constants ─────────────────────────────────────────────────────────

const SW = Dimensions.get('window').width;
export const CAROUSEL_CARD_W  = SW * (Platform.OS === 'android' ? 0.42 : 0.46);
export const CAROUSEL_PHOTO_H = CAROUSEL_CARD_W * (Platform.OS === 'android' ? 0.62 : 0.7);

// ── rt stylesheet (incoming request tile) ──────────────────────────────────────

export const rt = StyleSheet.create({
  card:          { width: CAROUSEL_CARD_W, borderRadius: 20, overflow: 'hidden',
                   shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  photoZone:     { width: '100%', height: CAROUSEL_PHOTO_H, position: 'relative' },
  photo:         { width: '100%', height: '100%' },
  emojiZone:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji:         { fontSize: CAROUSEL_CARD_W * 0.36 },
  turnBadge:     { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
                   paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  turnBadgeText: { fontSize: TYPO.label, fontWeight: '800', color: '#fff' },
  info:          { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8, gap: 2 },
  name:          { fontSize: TYPO.caption, fontWeight: '800', letterSpacing: -0.3 },
  breed:         { fontSize: TYPO.label, fontWeight: '500', opacity: 0.55 },
  relTime:       { fontSize: TYPO.label, fontWeight: '600', marginTop: 2 },
  dateChip:      { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 7,
                   paddingHorizontal: 6, paddingVertical: 3, marginTop: 2, alignSelf: 'flex-start' },
  dateChipText:  { fontSize: TYPO.label, fontWeight: '700' },
  actionRow:     { flexDirection: 'row', gap: 4, marginTop: 5 },
  iconBtn:       { height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                   flexDirection: 'row', gap: 3, paddingHorizontal: 5, flex: 1 },
  acceptText:    { fontSize: TYPO.caption, fontWeight: '800', color: '#fff' },
  waitingText:   { fontSize: TYPO.label, fontWeight: '600', marginTop: 6 },
});

// ── NearbyPetCard ──────────────────────────────────────────────────────────────

interface NearbyPetCardProps {
  pet: NearbyPet;
  playdateStatus?: string;
  isLocked?: boolean;
  agreedDate?: string | null;
  agreedTime?: string | null;
  agreedLocation?: string | null;
  proposedDate?: string | null;
  proposedTime?: string | null;
  proposedEndTime?: string | null;
  proposedLocation?: string | null;
  proposedMessage?: string | null;
  isMyTurn?: boolean;
  isSender?: boolean;
  chatId?: string | null;
  hasUnread?: boolean;
  lastMessageAt?: string | null;
  chatEnabled?: boolean;
  onRequest: () => void;
  onWithdraw: () => void;
  onResend: () => void;
  onDecline?: () => void;
  onCancelPlaydate?: (reason: string | null) => void;
  onViewProfile: () => void;
  onOpenChat?: (chatId: string) => void;
  onAccept?: () => void;
  onSchedulingTap?: () => void;
  colors: any;
}

function NearbyPetCardBase({
  pet, playdateStatus, isLocked, agreedDate, agreedTime, agreedLocation,
  proposedDate, proposedTime, proposedEndTime, proposedLocation, proposedMessage,
  isMyTurn, isSender, chatId, hasUnread, lastMessageAt, chatEnabled,
  onRequest, onWithdraw, onResend, onDecline, onCancelPlaydate,
  onViewProfile, onOpenChat, onAccept, onSchedulingTap, colors,
}: NearbyPetCardProps) {
  const ac = pet.accent_color ?? colors.primary;
  const ageStr = pet.age
    ? (pet.age.years > 0
        ? `${pet.age.years}yr${pet.age.months > 0 ? ` ${pet.age.months}mo` : ''}`
        : `${pet.age.months}mo`)
    : null;
  const TERMINAL = new Set(['expired', 'cancelled', 'withdrawn', 'declined', 'completed', 'past']);
  const effectiveStatus = (playdateStatus && TERMINAL.has(playdateStatus)) ? undefined : playdateStatus;
  const STATUS_CFG = getStatusCfg(colors);
  const stCfg = effectiveStatus ? STATUS_CFG[effectiveStatus] : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!lastMessageAt || !hasUnread) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [lastMessageAt, hasUnread]);
  const msgAgo = (lastMessageAt && hasUnread) ? (() => {
    const diff = now - new Date(lastMessageAt).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })() : null;

  const handleCardPress = () => {
    if (playdateStatus === 'negotiating' && chatId && chatEnabled) {
      onOpenChat?.(chatId);
      router.push(`/playdate-chat/${chatId}` as any);
    } else if ((playdateStatus === 'agreed' || playdateStatus === 'scheduling' || playdateStatus === 'incoming' || playdateStatus === 'accepted') && onSchedulingTap) {
      onSchedulingTap();
    } else {
      onViewProfile();
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={handleCardPress}
      style={[nc.card, { backgroundColor: colors.card, shadowColor: colors.textPrimary }]}>

      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push({ pathname: '/pet/[id]', params: { id: pet.id } } as any)}
        style={nc.photoZone}>
        {pet.avatar_url
          ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={nc.photo} contentFit="cover" />
          : <LinearGradient colors={[`${ac}55`, `${ac}20`]} style={nc.emojiZone}>
              <Text style={nc.emoji}>{pet.emoji}</Text>
            </LinearGradient>
        }
        <View style={nc.distBadge}>
          <Ionicons name="navigate-outline" size={8} color="#fff" />
          <Text style={nc.distBadgeText}>{formatDist(pet.distanceKm)}</Text>
        </View>
        {(effectiveStatus === 'scheduling' || effectiveStatus === 'negotiating') && (
          <View style={[nc.schedBadge, { backgroundColor: isMyTurn ? ac : 'rgba(0,0,0,0.52)' }]}>
            <Ionicons name="calendar-outline" size={9} color="#fff" />
            <Text style={nc.schedBadgeText}>Scheduling</Text>
          </View>
        )}
        {hasUnread && effectiveStatus !== 'scheduling' && effectiveStatus !== 'negotiating' && (
          <View style={[nc.unreadDot, { backgroundColor: colors.danger, borderColor: colors.card }]} />
        )}
        {pet.owner && effectiveStatus !== 'scheduling' && effectiveStatus !== 'negotiating' && (
          <View style={nc.parentBadge}>
            {pet.owner.profile_show_photo !== false && pet.owner.avatar_url
              ? <Image source={{ uri: pet.owner.avatar_url }} cachePolicy="memory-disk" style={nc.parentBadgeImg} contentFit="cover" />
              : <Text style={nc.parentBadgeInitial}>
                  {pet.owner.user_emoji ?? pet.owner.handle?.charAt(0).toUpperCase() ?? '?'}
                </Text>
            }
          </View>
        )}
      </TouchableOpacity>

      <View style={nc.info}>
        <View style={nc.nameRow}>
          <Text style={[nc.name, { color: colors.textPrimary }]} numberOfLines={1}>{pet.name}</Text>
          <SubscriptionBadge tier={pet.owner_tier} size="sm" />
          {ageStr && (
            <View style={[nc.agePill, { backgroundColor: `${ac}18` }]}>
              <Text style={[nc.ageText, { color: ac }]}>{ageStr}</Text>
            </View>
          )}
        </View>

        {(pet.breed || pet.species) && (
          <Text style={[nc.breed, { color: colors.textSecondary }]} numberOfLines={1}>
            {toTitle(pet.breed ?? pet.species)}
          </Text>
        )}

        {!!pet.avg_rating && (pet.total_ratings ?? 0) >= 3 && (
          <View style={nc.ratingRow}>
            <Text style={nc.ratingStar}>⭐</Text>
            <Text style={[nc.ratingNum, { color: ac }]}>{pet.avg_rating.toFixed(1)}</Text>
            <Text style={[nc.ratingCount, { color: colors.textSecondary }]}>
              ({pet.total_ratings})
            </Text>
          </View>
        )}

        {pet.owner?.handle && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
            <Ionicons name="person-outline" size={13} color={colors.textTertiary ?? colors.textSecondary} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary ?? colors.textSecondary }} numberOfLines={1}>
              {pet.owner.handle ? `@${pet.owner.handle}` : 'Pet parent'}
            </Text>
          </View>
        )}

        {!effectiveStatus && !isLocked ? (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); onRequest(); }}
            style={[nc.btn, { backgroundColor: ac }]} activeOpacity={0.8}>
            <Text style={nc.btnText}>Playdate</Text>
          </TouchableOpacity>
        ) : effectiveStatus === 'incoming' ? (
          <>
            <View style={nc.statusRow}>
              <View style={[nc.statusBadge, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="paw-outline" size={10} color={colors.primaryText ?? colors.primary} />
                <Text style={[nc.statusText, { color: colors.primaryText ?? colors.primary }]}>Wants to play!</Text>
              </View>
            </View>
            {proposedDate && (
              <View style={[nc.dateBlock, { backgroundColor: `${ac}14`, borderColor: `${ac}28` }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <CalendarSvg size={11} color={ac} />
                  <Text style={[nc.dateDay, { color: ac }]}>
                    {(() => { try { return format(parseISO(proposedDate), 'EEE, MMM d'); } catch { return proposedDate; } })()}
                  </Text>
                </View>
                {proposedTime && (
                  <Text style={[nc.dateTime, { color: ac }]}>
                    {(() => {
                      const fmt = (t: string) => { try { const [h,m] = t.split(':').map(Number); const d = new Date(); d.setHours(h,m,0,0); return formatTime(d); } catch { return t.slice(0,5); } };
                      return proposedEndTime ? `${fmt(proposedTime)} → ${fmt(proposedEndTime)}` : fmt(proposedTime);
                    })()}
                  </Text>
                )}
                {proposedLocation ? (
                  <Text style={[nc.dateTime, { color: colors.textSecondary }]} numberOfLines={1}>📍 {proposedLocation}</Text>
                ) : null}
                {proposedMessage ? (
                  <Text style={[nc.dateTime, { color: colors.textSecondary, fontStyle: 'italic' }]} numberOfLines={1}>💬 "{proposedMessage}"</Text>
                ) : null}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[nc.textBtn, { flex: 1, backgroundColor: colors.danger }]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  showAlert(
                    'Decline Playdate?',
                    `Are you sure you want to decline ${pet.name}'s request?`,
                    [
                      { text: 'Keep it', style: 'cancel' },
                      { text: 'Decline', style: 'destructive', onPress: () => onDecline?.() },
                    ],
                  );
                }}>
                <Text style={[nc.textBtnLabel, { color: '#fff' }]}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[nc.textBtn, { flex: 1, backgroundColor: '#14B8A6' }]}
                onPress={(e) => { e.stopPropagation?.(); onAccept?.(); }}>
                <Text style={[nc.textBtnLabel, { color: '#fff' }]}>Accept</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : stCfg ? (
          <>
            <View style={nc.statusRow}>
              {effectiveStatus !== 'scheduling' && effectiveStatus !== 'negotiating' && (
                <View style={[nc.statusBadge, { backgroundColor: `${stCfg.color}15` }]}>
                  <Ionicons name={stCfg.icon} size={10} color={stCfg.color} />
                  <Text style={[nc.statusText, { color: stCfg.color }]}>{stCfg.label}</Text>
                </View>
              )}
              {effectiveStatus === 'pending' && (
                <>
                  <TouchableOpacity style={[nc.iconBtn, { backgroundColor: `${ac}15` }]}
                    onPress={(e) => { e.stopPropagation?.(); onResend(); }}>
                    <Ionicons name="refresh-outline" size={13} color={ac} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[nc.iconBtn, { backgroundColor: colors.danger + '15' }]}
                    onPress={(e) => { e.stopPropagation?.(); onWithdraw(); }}>
                    <Ionicons name="close-outline" size={13} color={colors.danger} />
                  </TouchableOpacity>
                </>
              )}
              {effectiveStatus === 'agreed' && (
                <TouchableOpacity style={[nc.textBtn, { backgroundColor: colors.danger }]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    showAlert(
                      'Cancel Playdate?',
                      `This will notify ${pet.name}'s parent. Why can't you make it?`,
                      [
                        ...CANCEL_REASONS.map(r => ({ text: r, onPress: () => onCancelPlaydate?.(r) })),
                        { text: 'No reason', onPress: () => onCancelPlaydate?.(null) },
                        { text: 'Keep it', style: 'cancel' as const },
                      ],
                    );
                  }}>
                  <Text style={[nc.textBtnLabel, { color: '#fff' }]}>Decline</Text>
                </TouchableOpacity>
              )}
              {(effectiveStatus === 'negotiating' || effectiveStatus === 'scheduling') && (
                <View style={{ flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
                  {isSender ? (
                    <TouchableOpacity style={[nc.textBtn, { backgroundColor: colors.danger }]}
                      onPress={(e) => { e.stopPropagation?.(); onWithdraw(); }}>
                      <Text style={[nc.textBtnLabel, { color: '#fff' }]}>Withdraw</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[nc.textBtn, { backgroundColor: colors.danger }]}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        showAlert(
                          'Decline Playdate?',
                          `Are you sure you want to decline the playdate with ${pet.name}?`,
                          [
                            { text: 'Keep it', style: 'cancel' },
                            { text: 'Decline', style: 'destructive', onPress: () => onDecline?.() },
                          ]
                        );
                      }}>
                      <Text style={[nc.textBtnLabel, { color: '#fff' }]}>Decline</Text>
                    </TouchableOpacity>
                  )}
                  {isMyTurn && onSchedulingTap && (
                    <TouchableOpacity style={[nc.textBtn, { backgroundColor: ac }]}
                      onPress={(e) => { e.stopPropagation?.(); onSchedulingTap(); }}>
                      <Text style={[nc.textBtnLabel, { color: '#fff' }]}>Respond</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
            {(effectiveStatus === 'pending' || effectiveStatus === 'scheduling' || effectiveStatus === 'incoming') && proposedDate && (
              <View style={[nc.dateBlock, { backgroundColor: isMyTurn ? `${ac}14` : `${ac}08`, borderColor: `${ac}28` }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <CalendarSvg size={11} color={ac} />
                  <Text style={[nc.dateDay, { color: ac }]}>
                    {(() => { try { return format(parseISO(proposedDate), 'EEE, MMM d'); } catch { return proposedDate; } })()}
                  </Text>
                </View>
                {proposedTime && (
                  <Text style={[nc.dateTime, { color: ac }]}>
                    {(() => {
                      const fmt = (t: string) => { try { const [h,m] = t.split(':').map(Number); const d = new Date(); d.setHours(h,m,0,0); return formatTime(d); } catch { return t.slice(0,5); } };
                      return proposedEndTime ? `${fmt(proposedTime)} → ${fmt(proposedEndTime)}` : fmt(proposedTime);
                    })()}
                  </Text>
                )}
                {proposedLocation ? (
                  <Text style={[nc.dateTime, { color: colors.textSecondary }]} numberOfLines={1}>📍 {proposedLocation}</Text>
                ) : null}
                {proposedMessage ? (
                  <Text style={[nc.dateTime, { color: colors.textSecondary, fontStyle: 'italic' }]} numberOfLines={1}>💬 "{proposedMessage}"</Text>
                ) : null}
                {!isMyTurn && (
                  <Text style={[nc.dateTime, { color: colors.textSecondary }]}>⏳ Waiting for reply</Text>
                )}
              </View>
            )}
            {msgAgo && chatId && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.danger }} />
                <Text style={{ fontSize: TYPO.label, color: colors.danger, fontWeight: '700' }}>
                  💬 {pet.name} replied {msgAgo}
                </Text>
              </View>
            )}
            {agreedDate && (
              <View style={[nc.dateBlock, { backgroundColor: colors.success + '15', borderColor: colors.success + '30' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <CalendarSvg size={11} color={colors.success} />
                  <Text style={[nc.dateDay, { color: colors.success }]}>
                    {(() => { try { return format(parseISO(agreedDate), 'EEE, MMM d'); } catch { return agreedDate; } })()}
                  </Text>
                </View>
                {agreedTime && (
                  <Text style={[nc.dateTime, { color: colors.success }]}>
                    {(() => { try { const [h,m] = agreedTime.split(':').map(Number); const d = new Date(); d.setHours(h,m,0,0); return formatTime(d); } catch { return agreedTime.slice(0,5); } })()}
                  </Text>
                )}
                {agreedLocation && (
                  <Text style={[nc.dateTime, { marginLeft: 0, color: colors.success }]}>📍 {agreedLocation}</Text>
                )}
              </View>
            )}
          </>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export const NearbyPetCard = React.memo(NearbyPetCardBase);

export const nc = StyleSheet.create({
  card:         { width: CAROUSEL_CARD_W, borderRadius: 20, overflow: 'hidden',
                  shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  photoZone:    { width: '100%', height: CAROUSEL_PHOTO_H, position: 'relative' },
  photo:        { width: '100%', height: '100%' },
  emojiZone:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji:        { fontSize: CAROUSEL_CARD_W * 0.36 },
  distBadge:    { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
                  backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  distBadgeText:{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' },
  schedBadge:   { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
                  paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  schedBadgeText:{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' },
  textBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  textBtnLabel: { fontSize: TYPO.caption, fontWeight: '800' },
  unreadDot:    { position: 'absolute', top: 6, left: 6,
                  width: 10, height: 10, borderRadius: 5,
                  backgroundColor: '#E24B4A', borderWidth: 1.5, borderColor: '#fff' },
  unreadInner:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  parentBadge:  { position: 'absolute', top: 6, left: 6, width: 48, height: 48, borderRadius: 24,
                  backgroundColor: '#7C5CBF', borderWidth: 3, borderColor: 'rgba(255,255,255,0.95)',
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  parentBadgeImg:     { width: 48, height: 48, borderRadius: 24 },
  parentBadgeInitial: { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },
  info:         { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8, gap: 2 },
  nameRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name:         { fontSize: TYPO.caption, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  agePill:      { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  ageText:      { fontSize: TYPO.label, fontWeight: '700' },
  breed:        { fontSize: TYPO.label, fontWeight: '500', opacity: 0.55, marginTop: 0 },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  ratingStar:   { fontSize: TYPO.micro },
  ratingNum:    { fontSize: TYPO.label, fontWeight: '800', letterSpacing: -0.2 },
  ratingCount:  { fontSize: TYPO.micro, fontWeight: '500' },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                  borderRadius: 10, paddingVertical: 6, marginTop: 4 },
  btnText:      { fontSize: TYPO.caption, fontWeight: '800', color: '#fff' },
  statusRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  statusBadge:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 7,
                  paddingHorizontal: 6, paddingVertical: 4 },
  statusText:   { fontSize: TYPO.label, fontWeight: '800', flexShrink: 1 },
  iconBtn:      { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dateBlock:    { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4,
                  marginTop: 4, gap: 1 },
  dateDay:      { fontSize: TYPO.caption, fontWeight: '800', color: '#22C55E', letterSpacing: -0.2 },
  dateTime:     { fontSize: TYPO.label, fontWeight: '600', color: '#22C55E', opacity: 0.75, marginLeft: 15 },
});
