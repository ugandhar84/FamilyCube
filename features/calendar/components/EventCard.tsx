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
import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, Linking } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { s } from './calendarCardStyles';

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
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize, fontWeight: fontWeight as any, color, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }} numberOfLines={1}>
        {shortAddress(addr)}
      </Text>
      <Text style={{ fontSize: fontSize - 2, color, opacity: 0.7 }}>↗</Text>
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
}

export function EventCardRow({ ev, members, colors, isDark, onPress, timeStyle = 'inline', showCategory = false, showLocation = true }: EventCardRowProps) {
  const assignee = members.find(m => m.id === ev.memberId);
  const rs = roleStyle(assignee?.role, colors);
  const timeParts = fmtTimePartsLocal(ev.time);

  if (timeStyle === 'boxed') {
    return (
      <TouchableOpacity onPress={onPress}
        style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 10,
          borderRadius: 16, borderWidth: 1, borderColor: rs.dot + '35',
          backgroundColor: isDark ? colors.card : colors.card,
          paddingHorizontal: 10, paddingVertical: 10,
        }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: isDark ? rs.dot + '1A' : rs.badge, borderWidth: 1, borderColor: rs.dot + '40' }}>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: rs.text }}>{timeParts.time}</Text>
          <Text style={{ fontSize: 9, fontWeight: '700', color: rs.text, opacity: 0.8 }}>{timeParts.ampm}</Text>
        </View>
        <View style={{ flex: 1, paddingTop: 2 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
            {ev.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {showCategory && ev.category && (
              <View style={{ backgroundColor: colors.surface, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary }}>{ev.category}</Text>
              </View>
            )}
            {showLocation && ev.location && (
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>📍 {ev.location}</Text>
            )}
          </View>
        </View>
        {assignee && (
          <View style={{ backgroundColor: rs.dot, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textInverse }}>{assignee.name.split(' ')[0]}</Text>
          </View>
        )}
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
  ev, members, colors, isDark, isPast, isConf, cs, forLabel, pickerMembers,
  isParent, isKid, canApproveRequest, onPress, onLongPress, onAssignMember, onApprove, canDelete,
}: EventCardTimelineProps) {
  const assignee = members.find(m => m.id === ev.memberId);
  const cat = ev.category ?? 'Event';
  const accentColor = isConf ? colors.warning : cs.dot;

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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={{ fontSize: 11 }}>📍</Text>
                    <LocationLink addr={ev.location} color={colors.success} fontSize={TYPO.label} fontWeight="600" />
                  </View>
                )}
              </View>
            );
          })()}

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
                  <LocationLink addr={ev.pickupLocation} color={colors.success} fontSize={TYPO.label} fontWeight="700" />
                </View>
              )}
              {ev.dropLocation && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>→ To: </Text>
                  <LocationLink addr={ev.dropLocation} color={colors.success} fontSize={TYPO.label} fontWeight="700" />
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
