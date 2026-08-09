import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { router } from 'expo-router';
import { toTitle } from '@/lib/format';
import { formatTime } from '@/lib/units';
import { PlaydateEntry } from '@/features/playdates/types';
import { CalendarIcon } from '@/features/playdates/components/CalendarIcon';
import { TYPO } from '@/constants/theme';

export const STATUS_CFG: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  pending:     { label: 'Pending',    color: '#FF8C55', bg: '#FF8C5518', icon: 'time-outline' },
  accepted:    { label: 'Upcoming ✅', color: '#22C55E', bg: '#22C55E18', icon: 'calendar-outline' },
  declined:    { label: 'Declined',   color: '#E24B4A', bg: '#E24B4A18', icon: 'close-circle-outline' },
  scheduling:  { label: 'Scheduling', color: '#4896D8', bg: '#4896D818', icon: 'chatbubble-outline' },
  past:        { label: 'Completed',  color: '#94A3B8', bg: '#94A3B818', icon: 'checkmark-done-outline' },
};

export function petAgeLabel(birthDate: string | null): string {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  const today = new Date();
  const totalMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  if (totalMonths < 1) return 'Newborn';
  if (totalMonths < 12) return `${totalMonths}mo`;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return m > 0 ? `${y}y ${m}mo` : `${y}y`;
}

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function declinedByLabel(
  status: string,
  direction: 'outgoing' | 'incoming',
  petName: string,
  currentUserId: string | null,
  responderUserId: string | null | undefined,
  fromOwnerId: string | null | undefined,
): string | null {
  if (status === 'declined') {
    return direction === 'outgoing' ? `${petName} declined` : 'You declined';
  }
  if (status === 'withdrawn') {
    return direction === 'outgoing' ? 'You withdrew' : `${petName} withdrew`;
  }
  if (status === 'cancelled') {
    if (responderUserId && currentUserId) {
      return responderUserId === currentUserId ? 'You cancelled' : `${petName} cancelled`;
    }
    return 'Playdate cancelled';
  }
  if (status === 'expired') return 'Request expired';
  return null;
}

function fmtTime(t: string): string {
  try {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return formatTime(d);
  } catch { return t.substring(0, 5); }
}

function fmtDate(iso: string): string {
  try { return format(parseISO(iso), 'EEE, MMM d, yyyy'); } catch { return iso; }
}

function countdownLabel(agreedDate: string, agreedTime?: string | null): string | null {
  try {
    const target = parseISO(agreedDate);
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const days   = differenceInCalendarDays(target, today);
    if (days === 0) return agreedTime ? `Today at ${fmtTime(agreedTime)} 🎉` : 'Today! 🎉';
    if (days === 1) return agreedTime ? `Tomorrow at ${fmtTime(agreedTime)} 🐾` : 'Tomorrow! 🐾';
    if (days > 1 && days <= 7) return `In ${days} days 📅`;
    return null;
  } catch { return null; }
}

// Split avatar: shows my pet (left half) and their pet (right half)
function SplitAvatar({ myPet, theirPet, size = 54 }: { myPet: any; theirPet: any; size?: number }) {
  const r = size / 2;
  const half = size / 2;
  const myAc = myPet?.accent_color ?? '#7C5CBF';
  const theirAc = theirPet?.accent_color ?? '#7C5CBF';

  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', flexDirection: 'row' }}>
      <View style={{ width: half, height: size, backgroundColor: myAc + '33', alignItems: 'flex-start', overflow: 'hidden' }}>
        {myPet?.avatar_url ? (
          <Image source={{ uri: myPet.avatar_url }} cachePolicy="memory-disk"
            style={{ width: size, height: size, borderRadius: r }} contentFit="cover" />
        ) : (
          <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: myAc + '33' }}>
            <Text style={{ fontSize: size * 0.38 }}>{myPet?.emoji ?? '🐾'}</Text>
          </View>
        )}
      </View>
      <View style={{ width: half, height: size, overflow: 'hidden', alignItems: 'flex-end' }}>
        {theirPet?.avatar_url ? (
          <Image source={{ uri: theirPet.avatar_url }} cachePolicy="memory-disk"
            style={{ width: size, height: size, borderRadius: r, marginLeft: -half }} contentFit="cover" />
        ) : (
          <View style={{ width: size, height: size, marginLeft: -half, alignItems: 'center', justifyContent: 'center', backgroundColor: theirAc + '33' }}>
            <Text style={{ fontSize: size * 0.38 }}>{theirPet?.emoji ?? '🐾'}</Text>
          </View>
        )}
      </View>
      <View style={{ position: 'absolute', left: half - 0.75, top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(255,255,255,0.5)' }} />
    </View>
  );
}

interface Props {
  entry: PlaydateEntry;
  myPet?: any;
  ac: string;
  colors: any;
  currentUserId: string | null;
  onWithdraw: (id: string) => void;
  onResend: (id: string) => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCounterPropose: (id: string) => void;
  onCalendarPress: (entry: PlaydateEntry) => void;
  onPlayAgain: (entry: PlaydateEntry) => void;
  onRatePlaydate?: (entry: PlaydateEntry) => void;
  selectMode: boolean;
  selected: boolean;
  deletable: true | string;
  onLongPress: () => void;
  onToggleSelect: () => void;
}

export const PlaydateEntryCard = React.memo(function PlaydateEntryCard({
  entry, myPet, ac, colors, currentUserId,
  onWithdraw, onResend, onAccept, onDecline, onCounterPropose, onCalendarPress, onPlayAgain, onRatePlaydate,
  selectMode, selected, deletable, onLongPress, onToggleSelect,
}: Props) {
  const cfg = STATUS_CFG[entry.displayStatus] ?? STATUS_CFG.pending;
  const petAc = entry.pet.accent_color ?? ac;
  const canSelect = deletable === true;
  const showActions = !selectMode && (entry.displayStatus === 'pending' || entry.displayStatus === 'scheduling');
  const incomingIsMyTurn = entry.direction !== 'incoming' || entry.displayStatus !== 'scheduling' || entry.responder_user_id !== currentUserId;
  const isHistory = ['declined', 'cancelled', 'withdrawn', 'expired'].includes(entry.status);
  const isPast = entry.displayStatus === 'past';
  const isUpcoming = entry.displayStatus === 'accepted';
  const countdown = isUpcoming && entry.agreed_date ? countdownLabel(entry.agreed_date, entry.agreed_time) : null;

  const handlePress = () => {
    if (selectMode) {
      if (canSelect) onToggleSelect();
      return;
    }
    router.push(`/playdate/${entry.id}` as any);
  };

  // ── Proposed time block (pending / scheduling) ─────────────────────────────
  const ProposedBlock = () => {
    if (!entry.proposed_date) return null;
    const color = entry.displayStatus === 'scheduling' ? '#4896D8' : '#FF8C55';
    return (
      <View style={[mp.infoBlock, { backgroundColor: color + '10', borderColor: color + '30' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <CalendarIcon size={12} color={color} />
          <Text style={[mp.infoDate, { color }]}>{fmtDate(entry.proposed_date)}</Text>
        </View>
        {(entry.proposed_time || entry.proposed_end_time) && (
          <Text style={[mp.infoTime, { color }]}>
            🕐 {entry.proposed_time ? fmtTime(entry.proposed_time) : ''}
            {entry.proposed_end_time ? ` → ${fmtTime(entry.proposed_end_time)}` : ''}
          </Text>
        )}
        {entry.proposed_location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location-outline" size={11} color={color} />
            <Text style={[mp.infoTime, { color }]}>{entry.proposed_location}</Text>
          </View>
        )}
        {entry.message && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={11} color={color} />
            <Text style={[mp.infoTime, { color, fontStyle: 'italic' }]} numberOfLines={2}>{entry.message}</Text>
          </View>
        )}
      </View>
    );
  };

  // ── Agreed date block (upcoming / past) ────────────────────────────────────
  const AgreedBlock = () => {
    if (!entry.agreed_date) return null;
    const color = isPast ? '#94A3B8' : '#22C55E';
    return (
      <View style={[mp.infoBlock, { backgroundColor: color + '0E', borderColor: color + '30' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <CalendarIcon size={12} color={color} />
          <Text style={[mp.infoDate, { color }]}>
            {isPast ? '✓ ' : ''}{fmtDate(entry.agreed_date)}
          </Text>
        </View>
        {entry.agreed_time && (
          <Text style={[mp.infoTime, { color }]}>🕐 {fmtTime(entry.agreed_time)}</Text>
        )}
        {entry.agreed_location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location-outline" size={11} color={color} />
            <Text style={[mp.infoTime, { color }]}>{entry.agreed_location}</Text>
          </View>
        )}
        {entry.message && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={11} color={color} />
            <Text style={[mp.infoTime, { color, fontStyle: 'italic' }]} numberOfLines={2}>{entry.message}</Text>
          </View>
        )}
      </View>
    );
  };

  // ── History declined-details block ─────────────────────────────────────────
  const HistoryBlock = () => {
    if (!isHistory) return null;
    if (!entry.proposed_date && !entry.proposed_location && !entry.message) return null;
    return (
      <View style={[mp.infoBlock, { backgroundColor: '#94A3B808', borderColor: '#94A3B825' }]}>
        {entry.proposed_date && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <CalendarIcon size={12} color="#94A3B8" />
            <Text style={[mp.infoDate, { color: '#94A3B8' }]}>{fmtDate(entry.proposed_date)}</Text>
          </View>
        )}
        {(entry.proposed_time || entry.proposed_end_time) && (
          <Text style={[mp.infoTime, { color: '#94A3B8' }]}>
            🕐 {entry.proposed_time ? fmtTime(entry.proposed_time) : ''}
            {entry.proposed_end_time ? ` → ${fmtTime(entry.proposed_end_time)}` : ''}
          </Text>
        )}
        {entry.proposed_location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location-outline" size={11} color="#94A3B8" />
            <Text style={[mp.infoTime, { color: '#94A3B8' }]}>{entry.proposed_location}</Text>
          </View>
        )}
        {entry.message && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={11} color="#94A3B8" />
            <Text style={[mp.infoTime, { color: '#94A3B8', fontStyle: 'italic' }]} numberOfLines={2}>{entry.message}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[mp.cardWrap, { backgroundColor: colors.card, shadowColor: colors.textPrimary,
      borderColor: selectMode && selected ? petAc : colors.border,
      borderWidth: selectMode && selected ? 2 : StyleSheet.hairlineWidth,
      opacity: (selectMode && !canSelect) || isHistory ? (isHistory ? 0.72 : 0.45) : 1,
    }]}>
      <View style={[mp.strip, { backgroundColor: isHistory ? '#94A3B8' : cfg.color }]} />

      {/* Upcoming countdown banner */}
      {isUpcoming && countdown && (
        <View style={[mp.countdownBanner, { backgroundColor: petAc + '15', borderBottomColor: petAc + '25' }]}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: petAc }}>{countdown}</Text>
        </View>
      )}

      {/* Tappable row */}
      <TouchableOpacity
        style={mp.row}
        activeOpacity={0.8}
        onPress={handlePress}
        onLongPress={!selectMode ? onLongPress : undefined}
        delayLongPress={350}>

        <SplitAvatar myPet={myPet} theirPet={entry.pet} size={52} />

        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={[mp.petName, { color: colors.textPrimary }]}>
              {entry.parentName ? `${entry.parentName}'s ${entry.pet.name}` : entry.pet.name}
            </Text>
            {entry.pet.breed && (
              <Text style={[mp.sub, { color: colors.textSecondary }]}>{toTitle(entry.pet.breed)}</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Direction pill */}
            <View style={[mp.pill, {
              backgroundColor: entry.direction === 'incoming' ? '#14B8A618' : colors.primary + '18',
            }]}>
              <Text style={[mp.pillText, { color: entry.direction === 'incoming' ? '#14B8A6' : colors.primary }]}>
                {entry.direction === 'incoming' ? '↙ Received' : '↗ Sent'}
              </Text>
            </View>

            {/* Who ended it label for history */}
            {isHistory && (() => {
              const lbl = declinedByLabel(entry.status, entry.direction, entry.pet.name, currentUserId, entry.responder_user_id, entry.from_owner_id);
              return lbl ? (
                <View style={[mp.pill, { backgroundColor: '#94A3B815' }]}>
                  <Text style={[mp.pillText, { color: '#94A3B8' }]}>{lbl}</Text>
                </View>
              ) : null;
            })()}

            {/* Age */}
            {entry.pet.birthday && (
              <Text style={[mp.meta, { color: colors.textSecondary }]}>{petAgeLabel(entry.pet.birthday)}</Text>
            )}
            <Text style={[mp.meta, { color: colors.textSecondary }]}>{relTime(entry.created_at)}</Text>
          </View>

          {/* Date blocks */}
          {(entry.displayStatus === 'pending' || entry.displayStatus === 'scheduling') && <ProposedBlock />}
          {(isUpcoming || isPast) && <AgreedBlock />}
          {isHistory && <HistoryBlock />}
        </View>

        <View style={{ gap: 6, alignItems: 'center' }}>
          {selectMode ? (
            canSelect ? (
              <View style={[mp.checkbox, {
                backgroundColor: selected ? petAc : 'transparent',
                borderColor: selected ? petAc : colors.border,
              }]}>
                {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
            ) : (
              <View style={[mp.lockBadge, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Ionicons name="lock-closed" size={9} color={colors.textTertiary} />
                <Text style={[mp.lockText, { color: colors.textSecondary }]}>{deletable}</Text>
              </View>
            )
          ) : (
            (isUpcoming || entry.displayStatus === 'scheduling' || entry.displayStatus === 'pending') &&
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          )}
        </View>
      </TouchableOpacity>

      {/* ── Action bars ─────────────────────────────────────────── */}

      {/* Incoming pending/scheduling: Accept / New time / Decline */}
      {showActions && entry.direction === 'incoming' && incomingIsMyTurn && (
        <View style={[mp.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, flex: 0.8 }]}
            onPress={() => onDecline(entry.id)} activeOpacity={0.75}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#E24B4A' }}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: petAc + '18', borderColor: petAc, borderWidth: 1, flex: 1.1 }]}
            onPress={() => onCounterPropose(entry.id)} activeOpacity={0.75}>
            <Ionicons name="calendar-outline" size={13} color={petAc} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: petAc }}>New time</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: petAc, flex: 0.85 }]}
            onPress={() => onAccept(entry.id)} activeOpacity={0.75}>
            <Ionicons name="checkmark" size={13} color="#fff" />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>Accept</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Outgoing pending/scheduling: Resend nudge + Withdraw */}
      {showActions && entry.direction === 'outgoing' && (
        <View style={[mp.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: petAc + '15', borderColor: petAc, borderWidth: 1, flex: 1 }]}
            onPress={() => onResend(entry.id)} activeOpacity={0.75}>
            <Ionicons name="notifications-outline" size={13} color={petAc} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: petAc }}>Nudge</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: '#E24B4A15', borderColor: '#E24B4A', borderWidth: 1, flex: 1 }]}
            onPress={() => onWithdraw(entry.id)} activeOpacity={0.75}>
            <Ionicons name="close-circle-outline" size={13} color="#E24B4A" />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#E24B4A' }}>Withdraw</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Upcoming: Add to calendar */}
      {!selectMode && isUpcoming && (
        <View style={[mp.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: petAc + '15', borderColor: petAc, borderWidth: 1, flex: 1 }]}
            onPress={() => onCalendarPress(entry)} activeOpacity={0.75}>
            <Ionicons name="calendar-outline" size={13} color={petAc} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: petAc }}>Add to Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, flex: 0.6 }]}
            onPress={handlePress} activeOpacity={0.75}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textSecondary }}>Details</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Past completed: Rate + Play again */}
      {!selectMode && isPast && (
        <View style={[mp.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          {entry.myRating != null ? (
            <View style={[mp.actionBtn, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40', borderWidth: 1, flex: 1 }]}>
              <Text style={{ fontSize: TYPO.caption }}>⭐</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#F59E0B' }}>
                Rated {entry.myRating.toFixed(1)}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[mp.actionBtn, { backgroundColor: '#14B8A618', borderColor: '#14B8A6', borderWidth: 1, flex: 1 }]}
              onPress={() => onRatePlaydate?.(entry)} activeOpacity={0.75}>
              <Text style={{ fontSize: TYPO.caption }}>⭐</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#14B8A6' }}>Rate playdate</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: petAc + '18', borderColor: petAc, borderWidth: 1, flex: 1 }]}
            onPress={() => onPlayAgain(entry)} activeOpacity={0.75}>
            <Text style={{ fontSize: TYPO.caption }}>🐾</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: petAc }}>Play again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* History: Request again */}
      {!selectMode && isHistory && entry.direction === 'outgoing' && entry.status !== 'withdrawn' && (
        <View style={[mp.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[mp.actionBtn, { backgroundColor: '#94A3B812', borderColor: '#94A3B840', borderWidth: 1, flex: 1 }]}
            onPress={() => onPlayAgain(entry)} activeOpacity={0.75}>
            <Ionicons name="refresh-outline" size={13} color="#94A3B8" />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#94A3B8' }}>Request again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

export default PlaydateEntryCard;

const mp = StyleSheet.create({
  cardWrap:        { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10, overflow: 'hidden', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  strip:           { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  countdownBanner: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  row:             { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingLeft: 18 },
  petName:         { fontSize: TYPO.body, fontWeight: '800', letterSpacing: -0.2 },
  sub:             { fontSize: TYPO.caption, opacity: 0.6 },
  meta:            { fontSize: TYPO.label, opacity: 0.6 },
  pill:            { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  pillText:        { fontSize: TYPO.label, fontWeight: '700' },
  actionBar:       { flexDirection: 'row', gap: 6, padding: 10, paddingLeft: 14, borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  infoBlock:       { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7, marginTop: 6, gap: 2 },
  infoDate:        { fontSize: TYPO.caption, fontWeight: '800', letterSpacing: -0.2 },
  infoTime:        { fontSize: TYPO.label, fontWeight: '600', opacity: 0.85, marginLeft: 17 },
  checkbox:        { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  lockBadge:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  lockText:        { fontSize: TYPO.label, fontWeight: '700' },
});
