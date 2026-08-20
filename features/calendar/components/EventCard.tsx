/**
 * EventCard — shared event card for all 4 calendar view modes, built on the
 * same frosted-glass shell as features/quests/components/CollapsibleQuestCard.tsx
 * (BlurView, gradient wash, accent border/shadow, radius 28).
 *
 * Two density variants cover every case the 4 views need:
 *  - 'row'      — compact tinted row (Month's day-summary, Week's day cards,
 *                 Agenda's grouped list, Day-slot's hour rows). No blur —
 *                 too small/dense for the glass treatment to read.
 *  - 'timeline' — the full glass card used by Day view's classic timeline
 *                 (compact=false): category badge, conflict banner, for/
 *                 patient row with member picker, category-specific fields,
 *                 notes, approval-request row, and the "hold to edit" hint.
 *                 Swipe-to-delete and long-press-to-edit stay owned by the
 *                 caller (SwipeableEventCard wraps this from outside).
 *
 * All role/category color logic is passed in via `roleStyle`/`catStyle`
 * results (computed by the caller with the shared helpers) so this file
 * owns no business logic — purely presentational.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, Linking, Animated, Easing } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { s } from './calendarCardStyles';
import { isEventPast, isEventNow } from './calendarDateHelpers';

// Filled map-pin — real SVG, replacing the 📍 emoji used as a location icon.
function MapPinIcon({ c, size = 13 }: { c: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 22s7-7.58 7-12.5A7 7 0 0 0 5 9.5C5 14.42 12 22 12 22z" fill={c} />
      <Circle cx={12} cy={9.5} r={2.6} fill="#fff" />
    </Svg>
  );
}

// ─── Location link — tappable address that opens the native maps app ──────────
function shortAddress(addr: string, maxLen = 22): string {
  if (addr.length <= maxLen) return addr;
  const parts = addr.split(',');
  const short = parts.length > 1 ? `${parts[0].trim()}, ${parts[1].trim()}` : addr;
  return short.length <= maxLen + 6 ? short : addr.slice(0, maxLen).trimEnd() + '…';
}
function openInMaps(addr: string) {
  const encoded = encodeURIComponent(addr);
  const url = Platform.OS === 'ios'
    ? `https://maps.apple.com/?q=${encoded}`
    : `https://maps.google.com/?q=${encoded}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${encoded}`));
}
export function LocationLink({ addr, color, fontSize = 13, iconSize = 12, fontWeight = '600' }: {
  addr: string; color: string; fontSize?: number; iconSize?: number; fontWeight?: string;
}) {
  return (
    <TouchableOpacity onPress={() => openInMaps(addr)} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: iconSize + 8, height: iconSize + 8, borderRadius: (iconSize + 8) / 2,
        backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <MapPinIcon c="#fff" size={iconSize} />
      </View>
      <Text style={{ fontSize, fontWeight: fontWeight as any, color }} numberOfLines={1}>
        {shortAddress(addr)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Shared color helpers (also used by CalendarScreen for compat card) ───────
export function roleStyle(role: string | undefined, colors: any) {
  const dot =
    role === 'parent' ? colors.parent :
    role === 'kid'    ? colors.kid :
    role === 'teen'   ? colors.primary :
    role === 'senior' ? colors.accent :
    colors.textTertiary;
  return { dot, badge: dot + '20', text: dot };
}

const CAT_COLOR: Record<string, { dot: string; badge: string; text: string }> = {
  Medical:  { dot: '#EF4444', badge: '#FEE2E2', text: '#DC2626' },
  Work:     { dot: '#A855F7', badge: '#F3E8FF', text: '#7C3AED' },
  Sports:   { dot: '#F59E0B', badge: '#FEF3C7', text: '#D97706' },
  School:   { dot: '#3B82F6', badge: '#DBEAFE', text: '#1D4ED8' },
  Study:    { dot: '#3B82F6', badge: '#DBEAFE', text: '#1D4ED8' },
  Birthday: { dot: '#F59E0B', badge: '#FEF3C7', text: '#D97706' },
  Holiday:  { dot: '#F59E0B', badge: '#FEF3C7', text: '#D97706' },
  Event:    { dot: '#10B981', badge: '#D1FAE5', text: '#059669' },
  default:  { dot: '#10B981', badge: '#D1FAE5', text: '#059669' },
};
export function catStyle(category?: string, isDark = false) {
  const c = CAT_COLOR[category ?? 'default'] ?? CAT_COLOR.default;
  if (isDark) return { dot: c.dot, badge: c.dot + '25', text: c.dot };
  return c;
}

// ─── Row variant — compact tinted row shared by Month/Week/Agenda/DaySlot ──────
export interface EventCardRowProps {
  ev: FamilyEvent;
  members: FamilyMember[];
  colors: any; isDark: boolean;
  onPress: () => void;
  /** 'boxed' (Agenda's time chip) | 'inline' (Week/Month's time-first row) */
  timeStyle?: 'boxed' | 'inline';
  showCategory?: boolean;
  showLocation?: boolean;
  /** Adds the pending/confirmed/declined helper-status row below the top
   * row (ported from Hub's TimelineCard) — used by the Hub timeline, off
   * by default for Calendar's Agenda/Week which keep the compact layout. */
  showHelperStatus?: boolean;
  /** Viewer's own role — declined-driver gets the loud "Declined" treatment
   * only for parents; kids/teens see a neutral "No driver yet" instead. */
  isViewerParent?: boolean;
}

export function EventCardRow({ ev, members, colors, isDark, onPress, timeStyle = 'inline', showCategory = false, showLocation = true, showHelperStatus = false, isViewerParent = false }: EventCardRowProps) {
  const assignee = members.find(m => m.id === ev.memberId);
  const rs = roleStyle(assignee?.role, colors);
  const timeParts = fmtTimePartsLocal(ev.time);
  // Driver/accompanying-adult is a free-text name field, not a memberId
  // reference — resolved by name match against the real family roster so a
  // real avatar can show instead of just a text pill. Rides use
  // ev.driverName; every other category (Medical/Study/Sports/etc) uses the
  // more general ev.helper field for "who's accompanying/escorting" — check
  // both so this isn't Ride-only.
  const driverName = ev.driverName || ev.helper;
  const driver = driverName ? members.find(m => m.name === driverName || m.name.split(' ')[0] === driverName) : undefined;
  // Dimmed once the event's date/time has passed — matches Day view's
  // existing opacity:0.5 treatment for completed events, applied here so
  // Agenda (and any other row-variant caller) gets it too.
  const isPast = isEventPast(ev.date, ev.time);
  // Currently happening — start time has arrived, end (or default 60-min
  // window) hasn't. Takes priority over the pending/issue border tint since
  // "this is going on right now" is the most time-critical thing to signal.
  const isNow = isEventNow(ev.date, ev.time, ev.endTime);

  const helperPending  = ev.helperStatus === 'pending';
  const helperRejected = ev.helperStatus === 'rejected';
  const showAlarm      = helperRejected && isViewerParent;
  const helperMissing  = !ev.helper && !!ev.location;

  // Slow glow pulse for the "happening now" card — light green border/wash
  // that breathes in and out rather than a hard blink.
  const nowPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isNow) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(nowPulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(nowPulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isNow, nowPulse]);

  if (timeStyle === 'boxed') {
    const hasIssue = showHelperStatus && ((helperMissing && !isPast) || (showAlarm && !isPast));
    const NOW_GREEN = '#22C55E';
    const animatedBorderColor = nowPulse.interpolate({ inputRange: [0, 1], outputRange: [NOW_GREEN + '55', NOW_GREEN + 'B0'] });
    const animatedBg = nowPulse.interpolate({ inputRange: [0, 1], outputRange: [NOW_GREEN + '0C', NOW_GREEN + '1C'] });
    const Container: any = isNow ? Animated.View : View;
    const containerStyle = isNow
      ? { borderRadius: 16, borderWidth: 1.5, borderColor: animatedBorderColor, backgroundColor: animatedBg, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }
      : {
          borderRadius: 16, borderWidth: 1,
          borderColor: hasIssue ? colors.danger + '45' : (helperPending && !isPast && showHelperStatus) ? colors.warning + '45' : rs.dot + '35',
          backgroundColor: isDark ? colors.card : colors.card,
          paddingHorizontal: 12, paddingVertical: 10, gap: 8,
          opacity: isPast ? 0.5 : 1,
        };
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <Container style={containerStyle}>
          {isNow && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: -2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NOW_GREEN }} />
              <Text style={{ fontSize: 9, fontWeight: '900', color: NOW_GREEN, letterSpacing: 0.4 }}>HAPPENING NOW</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
            backgroundColor: isDark ? rs.dot + '1A' : rs.badge, borderWidth: 1, borderColor: rs.dot + '40' }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: rs.text }}>{timeParts.time}</Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: rs.text, opacity: 0.8 }}>{timeParts.ampm}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
              {ev.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
              {showCategory && ev.category && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary }}>{ev.category}</Text>
                </View>
              )}
              {showLocation && ev.location && (
                <LocationLink addr={ev.location} color={colors.info} fontSize={TYPO.micro} iconSize={12} fontWeight="700" />
              )}
            </View>
          </View>
          {/* "For" + accompanied-by/driver avatars, overlapped into one
              cluster (driver drawn on top, offset left) rather than split
              top/bottom — they're both people tied to this one event, so
              stacking them as a pair reads as related and keeps the card
              from growing an extra row just to fit a second avatar. Centered
              against the row's own height (matches the time chip/title). */}
          {(assignee || driver) && (
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {assignee && (
                  <FamilyAvatar name={assignee.name} emoji={assignee.emoji} avatarUrl={(assignee as any).avatarUrl}
                    siblings={members.map(m => m.name)} size={26} ringColor={rs.dot} ringWidth={1.5} />
                )}
                {driver && (
                  <View style={{
                    marginLeft: assignee ? -10 : 0,
                    borderRadius: 15, borderWidth: 2, borderColor: colors.card,
                  }}>
                    <FamilyAvatar name={driver.name} emoji={driver.emoji} avatarUrl={(driver as any).avatarUrl}
                      siblings={members.map(m => m.name)} size={26} ringColor={colors.info} ringWidth={1.5} />
                  </View>
                )}
              </View>
              {/* Status pill — sits under the avatar cluster instead of a
                  separate "Accompanied by: Name" text line, since the
                  avatar already shows who; the pill only needs to answer
                  "are they confirmed yet". */}
              {showHelperStatus && driver && ev.helperStatus && (
                <>
                  {ev.helperStatus === 'confirmed' && (
                    <View style={{ backgroundColor: colors.success + '18', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: colors.success }}>Confirmed ✓</Text>
                    </View>
                  )}
                  {helperPending && (
                    <View style={{ backgroundColor: colors.warning + '20', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: colors.warningDark }}>⏳ Awaiting</Text>
                    </View>
                  )}
                  {showAlarm && (
                    <View style={{ backgroundColor: colors.danger + '25', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: colors.danger + '40' }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: colors.danger }}>Declined ✕</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </View>

        {showHelperStatus && showAlarm && ev.declineReason && (
          <Text style={{ fontSize: TYPO.micro, color: colors.danger, fontStyle: 'italic' }}>
            "{ev.declineReason}"
          </Text>
        )}

        {/* Needs driver warning — no helper assigned at all */}
        {showHelperStatus && !isPast && helperMissing && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: colors.danger + '12', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
            borderWidth: 1, borderColor: colors.danger + '30' }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>⚠ No driver assigned — tap to fix</Text>
          </View>
        )}
        </Container>
      </TouchableOpacity>
    );
  }

  // 'inline' — Week/Month style: time label + title + name, all in one row
  return (
    <TouchableOpacity onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
        borderWidth: 1, borderColor: rs.dot + '35',
        backgroundColor: isDark ? rs.dot + '1A' : rs.badge,
        opacity: isPast ? 0.5 : 1,
      }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: rs.text, width: 46 }}>{timeParts.time}{timeParts.ampm.toLowerCase()}</Text>
      <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
        {ev.title}
      </Text>
      {assignee && <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: rs.text }}>{assignee.name.split(' ')[0]}</Text>}
    </TouchableOpacity>
  );
}

function fmtTimePartsLocal(time?: string): { time: string; ampm: string } {
  if (!time) return { time: '--:--', ampm: '' };
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return { time: `${h}:${m}`, ampm };
}

// ─── Timeline variant — full glass card for Day view's classic timeline ───────
export interface EventCardTimelineProps {
  ev: FamilyEvent;
  members: FamilyMember[];
  colors: any; isDark: boolean;
  isDark_unused?: never;
  isPast: boolean;
  isConf: boolean;
  cs: { dot: string; badge: string; text: string };
  forLabel: string | null;
  // Context label for ev.helper (e.g. "Accompanied by", "Drop-off by") —
  // rendered bottom-right alongside the driver avatar when present.
  helperLabel?: string | null;
  pickerMembers: FamilyMember[];
  isParent: boolean;
  isKid: boolean;
  canApproveRequest: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onAssignMember: (memberId: string) => void;
  onApprove: () => void;
  canDelete: boolean;
}

export function EventCardTimeline({
  ev, members, colors, isDark, isPast, isConf, cs, forLabel, helperLabel, pickerMembers,
  isParent, isKid, canApproveRequest, onPress, onLongPress, onAssignMember, onApprove, canDelete,
}: EventCardTimelineProps) {
  const assignee = members.find(m => m.id === ev.memberId);
  const cat = ev.category ?? 'Event';
  const accentColor = isConf ? colors.warning : cs.dot;
  // ev.helper is a free-text name (driver/tutor/coach/escort), not a
  // memberId — resolved by name match against the roster so a real avatar
  // can be shown instead of just initials/text.
  const helperMember = ev.helper ? members.find(m => m.name === ev.helper || m.name.split(' ')[0] === ev.helper) : undefined;

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} onLongPress={onLongPress} delayLongPress={450}>
      <View style={[s.eventCard, { backgroundColor: colors.card, borderColor: accentColor + '40', shadowColor: accentColor }]}>
        <LinearGradient
          colors={[accentColor + '14', accentColor + '00']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {Platform.OS === 'ios' ? (
          <BlurView intensity={22} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
        )}
        <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)' }} pointerEvents="none" />

        <View style={{ padding: 14, gap: 8 }}>
          {/* Header: category badge + conflict flag + title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={[s.catBadge, { backgroundColor: cs.badge, borderColor: cs.dot + '60' }]}>
                <Text style={[s.catText, { color: cs.text }]}>{cat.toUpperCase()}</Text>
              </View>
              {isConf && <Text style={{ fontSize: 12 }}>⚠️</Text>}
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, flex: 1 }}>
                {ev.title}
              </Text>
            </View>
          </View>

          {isConf && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4, marginTop: 2 }}>
              <Text style={{ fontSize: 12 }}>⚠️</Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.warning }}>Scheduling Conflict Detected</Text>
            </View>
          )}

          {/* For / patient row — all assigned members, or a picker if unassigned */}
          {forLabel && (() => {
            const allAssignees = ev.memberIds?.length
              ? members.filter(m => ev.memberIds!.includes(m.id))
              : assignee ? [assignee] : [];
            return (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 }}>
                {allAssignees.length > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>{forLabel}:</Text>
                    {allAssignees.map(m => (
                      <FamilyAvatar key={m.id} name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={members.map(x => x.name)} size={24} ringColor={cs.dot} ringWidth={1.5} />
                    ))}
                  </View>
                ) : !isPast && isParent && pickerMembers.length > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>{forLabel}:</Text>
                    {pickerMembers.map(k => (
                      <TouchableOpacity key={k.id} style={{ padding: 2 }} onPress={() => onAssignMember(k.id)}>
                        <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} siblings={pickerMembers.map(x => x.name)} size={30}
                          ringColor={ev.memberId === k.id ? colors.primary : colors.border} ringWidth={ev.memberId === k.id ? 2.5 : 1}
                          bgColor={ev.memberId === k.id ? colors.primaryLight : undefined} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
                    {forLabel}: <Text style={{ fontWeight: '700' }}>—</Text>
                  </Text>
                )}
                {ev.location && (
                  <LocationLink addr={ev.location} color={colors.info} fontSize={TYPO.label} fontWeight="600" />
                )}
              </View>
            );
          })()}

          {/* Accompanied-by / driver — bottom-right, real avatar when the
              named helper matches a real family member. */}
          {ev.helper && (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>
                  {helperLabel ?? 'With'}:
                </Text>
                {helperMember ? (
                  <FamilyAvatar name={helperMember.name} emoji={helperMember.emoji} avatarUrl={(helperMember as any).avatarUrl}
                    siblings={members.map(m => m.name)} size={24} ringColor={colors.info} ringWidth={1.5} />
                ) : (
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>{ev.helper}</Text>
                )}
              </View>
            </View>
          )}

          {/* Category-specific extra fields */}
          {cat === 'Medical' && ev.doctorName && (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
              🩺 Doctor: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.doctorName}</Text>
            </Text>
          )}
          {cat === 'Study' && ev.subject && (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
              📖 Subject: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.subject}</Text>
            </Text>
          )}
          {cat === 'Sports' && ev.coachName && (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
              🏅 Coached by: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.coachName}</Text>
            </Text>
          )}
          {(cat === 'Ride' || cat === 'Sports') && (ev.pickupLocation || ev.dropLocation) && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
              {ev.pickupLocation && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>From: </Text>
                  <LocationLink addr={ev.pickupLocation} color={colors.info} fontSize={TYPO.label} fontWeight="700" />
                </View>
              )}
              {ev.dropLocation && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>→ To: </Text>
                  <LocationLink addr={ev.dropLocation} color={colors.info} fontSize={TYPO.label} fontWeight="700" />
                </View>
              )}
            </View>
          )}

          {/* Notes */}
          {ev.notes && (
            <Text style={[s.notesText, { backgroundColor: colors.primaryLight, color: colors.primary, borderColor: colors.primary + '30' }]}>
              📝 "{ev.notes}"
            </Text>
          )}

          {/* Kid request awaiting parent approval */}
          {canApproveRequest && (
            <View style={[s.approvalRow, { borderTopColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontSize: 12 }}>⚠️</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.warning }}>Request Pending</Text>
              </View>
              <TouchableOpacity style={[s.approveBtn, { backgroundColor: colors.success }]} onPress={onApprove}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.textInverse }}>✓ Approve & Assign</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isPast && isKid && ev.approvalPending && (
            <View style={[s.approvalRow, { borderTopColor: colors.border, justifyContent: 'flex-start', gap: 6 }]}>
              <Text style={{ fontSize: 12 }}>⚠️</Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warning }}>Awaiting parent approval…</Text>
            </View>
          )}

          {!isPast && (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4, textAlign: 'right', opacity: 0.6 }}>
              Hold to edit{canDelete ? ' · Swipe ← to delete' : ''}{ev.helper ? ' · Tap for driver actions' : ''}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
