/**
 * MonthGridView — Apple Calendar style month sheet (weekday header, 6-row
 * grid, up to 3 category dots per day) plus DayEventsSummaryCard, the
 * "Events for X" card rendered below the grid for the selected day.
 * Extracted 1:1 from CalendarScreen.tsx's inline MonthGridView/
 * DayEventsSummaryCard functions — pure structural move, no behavior change.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';
import { fmtTimeParts } from '@/lib/dates';
import { BRAND } from '@/components/FamilyCubeLogo';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import { roleStyle } from './EventCard';
import { toDateStr, parseDate, DAY_SHORT, CAT_DOT, MONTH_LABELS, buildMonthGrid } from './calendarDateHelpers';
import { eventAssignee } from '@/store/eventStore';

// ─── Icons (chevron-left/right only — kept local to avoid pulling in
// CalendarScreen's full icon set for two glyphs) ───────────────────────────
import Svg, { Path } from 'react-native-svg';
const ChevronLeft = ({ c, size = 18 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M15 18l-6-6 6-6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const ChevronRight = ({ c, size = 18 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 6l6 6-6 6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// Compact "Events for X" card — used both as Month's selected-day summary
// below the grid, and as the Day-first intro shown above the grid when
// Month opens on today (before the user has scrolled into the full grid).
export function DayEventsSummaryCard({
  dateLabel, events, members, colors, isDark, onSelectEvent, onLongPressEvent, loading, isViewerParent,
}: {
  dateLabel: string; events: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelectEvent: (ev: FamilyEvent) => void;
  // Same parent-only sync-source gate EventCard.tsx and hubComponents.tsx's
  // EventDetailSheet already use for their own "synced from" badge/row.
  isViewerParent?: boolean;
  // Long-press → edit (date/time/recurrence/driver/delete). This card had
  // NO long-press at all — a parent's actual default view (compact
  // defaults to isKid, so a parent lands here, not the compact time-grid
  // that DOES have long-press-to-edit wired) meant tapping only ever
  // reached the read-only detail sheet, with no way to edit or delete any
  // event, including a kid-created one, from the view parents actually use.
  onLongPressEvent?: (ev: FamilyEvent) => void;
  // Tapping a day never visited this session has no _dayCache/disk-cache
  // entry to paint from (eventStore.ts selectDate), so `events` still holds
  // the PREVIOUS day's stale list while the DB fetch is in flight — without
  // this flag the card rendered that stale/empty list as a confirmed "No
  // scheduled events," matching the Day-view timeline's dayLoading gate
  // just below this card (CalendarScreen.tsx) so both stop flashing a false
  // empty state.
  loading?: boolean;
}) {
  const shown = events.filter(ev => ev.category !== 'Holiday');
  return (
    <View style={{ borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#F1F5F9', backgroundColor: isDark ? colors.card : '#fff', padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
          Events for {dateLabel}
        </Text>
        {!loading && (
          <View style={{ backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textSecondary }}>
              {shown.length} item{shown.length === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>

      {loading && shown.length === 0 ? (
        <View style={{ gap: 8 }}>
          {[48, 48].map((h, i) => (
            <View key={i} style={{ height: h, borderRadius: 12, backgroundColor: isDark ? '#1E293B' : '#E8E6F0', opacity: 0.5 + i * 0.15 }} />
          ))}
        </View>
      ) : shown.length === 0 ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontStyle: 'italic', paddingVertical: 8 }}>
          No scheduled events for this day. Tap + to add one.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {shown.map(ev => {
            const assignee = members.find(m => m.id === ev.memberId);
            const rs = roleStyle(assignee?.role, colors);
            const { time, ampm } = fmtTimeParts(ev.time);
            // This card previously showed zero ride/driver context at all —
            // a "needs a ride" or "driver confirmed" event looked identical
            // to any other event here (QA sweep UI pass, Medium finding).
            const driver = eventAssignee(ev);
            const driverStatusColor = driver.status === 'confirmed' ? colors.success
              : driver.status === 'rejected' ? colors.danger : colors.warning;
            return (
              <TouchableOpacity key={ev.id} onPress={() => onSelectEvent(ev)}
                onLongPress={onLongPressEvent ? () => onLongPressEvent(ev) : undefined}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14,
                  borderWidth: 1, borderColor: rs.dot + '35',
                  backgroundColor: isDark ? rs.dot + '1A' : rs.badge,
                  paddingHorizontal: 10, paddingVertical: 9 }}>
                <View style={{ width: 3, height: 30, borderRadius: 2, backgroundColor: rs.dot }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textSecondary }}>{time}{ampm.toLowerCase()}</Text>
                    {ev.location && (
                      <>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>·</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>{ev.location}</Text>
                      </>
                    )}
                    {(ev.rideRequired || ev.category === 'Ride') && (
                      <>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>·</Text>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: driverStatusColor }} />
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: driverStatusColor }} numberOfLines={1}>
                          {driver.name ? (driver.status === 'confirmed' ? driver.name.split(' ')[0] : `${driver.name.split(' ')[0]} pending`) : 'needs a ride'}
                        </Text>
                      </>
                    )}
                  </View>
                  {/* Synced-from badge — icon + tiny avatar for "whose",
                      matching the compact treatment EventCard.tsx's Agenda
                      row and hubComponents.tsx's EventDetailSheet row use
                      (a spelled-out "Name's calendar" text ran too long
                      next to this card's other pills, and fell back to a
                      bare provider name whenever the member lookup
                      missed). */}
                  {!!ev.lastExternalSyncProvider && isViewerParent && (() => {
                    const syncMember = members.find(m => m.id === ev.lastExternalSyncMemberId);
                    const iconName = ev.lastExternalSyncProvider === 'google' ? 'logo-google'
                      : ev.lastExternalSyncProvider === 'apple' ? 'logo-apple' : 'mail-outline';
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
                        <Ionicons name={iconName as any} size={10} color={colors.textTertiary} />
                        {syncMember && (
                          <FamilyAvatar name={syncMember.name} emoji={syncMember.emoji} avatarUrl={(syncMember as any).avatarUrl}
                            siblings={members.map(m => m.name)} size={12} ringWidth={0} />
                        )}
                      </View>
                    );
                  })()}
                </View>
                {assignee && (
                  <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: rs.dot + '40' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: rs.text }}>{assignee.name.split(' ')[0]}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Month grid — Apple Calendar style ─────────────────────────────────────
// A real month sheet: weekday header, 6-row grid, up to 3 category dots per
// day from the lightweight stripMap (no full event fetch needed to paint
// it). Tapping a day sets selectedDate, which drives the agenda list
// rendered below by the caller — the grid itself never renders events.
export default function MonthGridView({
  monthDate, selected, stripMap, colors, isDark, onSelectDay, onChangeMonth,
}: {
  monthDate: Date; selected: string; stripMap: Record<string, string[]>; colors: any; isDark: boolean;
  onSelectDay: (d: string) => void;
  onChangeMonth: (delta: number) => void;
}) {
  const todayStr = toDateStr(new Date());
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <TouchableOpacity onPress={() => onChangeMonth(-1)} style={{ padding: 8 }}>
          <ChevronLeft c={colors.textSecondary} size={18} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
          {MONTH_LABELS[month]} {year}
        </Text>
        <TouchableOpacity onPress={() => onChangeMonth(1)} style={{ padding: 8 }}>
          <ChevronRight c={colors.textSecondary} size={18} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {DAY_SHORT.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, letterSpacing: 0.4 }}>
            {d[0]}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100/7}%`, aspectRatio: 1 }} />;
          const date = parseDate(d);
          const isSel = d === selected;
          const isToday = d === todayStr;
          const cats = stripMap[d] ?? [];
          const dotColors = cats.map(c => CAT_DOT[c] ?? '#10B981').filter((c, idx, a) => a.indexOf(c) === idx).slice(0, 3);
          return (
            <TouchableOpacity key={d} onPress={() => onSelectDay(d)}
              style={{ width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{
                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSel ? BRAND.purple : isToday ? BRAND.purple + '18' : 'transparent',
              }}>
                <Text style={{
                  fontSize: TYPO.body, fontWeight: isToday || isSel ? '900' : '600',
                  color: isSel ? '#fff' : isToday ? BRAND.purple : (isDark ? colors.textPrimary : '#1E2D6B'),
                }}>
                  {date.getDate()}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 3, height: 8, marginTop: 2, alignItems: 'center' }}>
                {dotColors.map((c, idx) => (
                  <View key={idx} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c }} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
