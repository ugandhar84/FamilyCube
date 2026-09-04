/**
 * DaySlotView — simple hour-slot list Day view (5am–11pm fixed rows, dashed
 * "+ tap to add" placeholder for empty hours). Extracted 1:1 from
 * CalendarScreen.tsx's inline DaySlotView function — this hour-slot card
 * layout (title + assignee chip + location/category footer, no time chip
 * since the row is already grouped by hour) doesn't match either
 * EventCardRow variant, so it stays hand-rolled rather than being forced
 * into the shared component and risking a visual/behavior change.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { assigneeStyle, MultiPersonTimeFill } from './EventCard';
import { timeToMinutes } from './calendarDateHelpers';

// One fixed-height row per hour (5am–11pm), not a proportional time-block
// grid — an empty hour shows a dashed "+ tap to add" placeholder, a filled
// hour shows its event(s) as role-colored cards. This intentionally drops
// the proportional positioning/now-line/pull-to-month gesture the previous
// hour-grid Day view had, in favor of matching the reference's simpler
// slot-list pattern 1:1.
const DAY_SLOT_START_HOUR = 5;
const DAY_SLOT_END_HOUR = 23;

export default function DaySlotView({
  dayEvents, members, colors, isDark, onSelect, onLongPressEvent, onAddAtTime,
}: {
  dayEvents: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelect: (ev: FamilyEvent) => void;
  // Long-press → edit — same parent edit-access-everywhere reasoning as
  // every other calendar view.
  onLongPressEvent?: (ev: FamilyEvent) => void;
  onAddAtTime: (hourTimeKey: string) => void;
}) {
  const hours = Array.from({ length: DAY_SLOT_END_HOUR - DAY_SLOT_START_HOUR + 1 }, (_, i) => DAY_SLOT_START_HOUR + i);

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>
      {hours.map(hour => {
        const hourLabel = hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`;
        const hourTimeKey = `${String(hour).padStart(2, '0')}:00`;
        const matching = dayEvents.filter(ev => {
          const t = timeToMinutes(ev.time);
          return t !== null && Math.floor(t / 60) === hour;
        });

        return (
          <View key={hour}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 54, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
            <View style={{ width: 64, paddingTop: 4 }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, textAlign: 'right' }}>{hourLabel}</Text>
            </View>

            {matching.length > 0 ? (
              <View style={{ flex: 1, gap: 6 }}>
                {matching.map(ev => {
                  const assignee = members.find(m => m.id === ev.memberId);
                  const rs = assigneeStyle(assignee, colors, isDark);
                  // Same "everyone this touches, not just the first name"
                  // treatment as the boxed EventCardRow's time chip —
                  // several people sharing one event (not to be confused
                  // with DIFFERENT people's events landing in the same
                  // hour bucket above, which this view already stacks as
                  // separate cards, never overlapping).
                  const multiPersonColors = (ev.memberIds?.length ?? 0) > 1
                    ? ev.memberIds!.map(id => assigneeStyle(members.find(m => m.id === id), colors, isDark).dot)
                    : null;
                  return (
                    <TouchableOpacity key={ev.id} onPress={() => onSelect(ev)}
                      onLongPress={onLongPressEvent ? () => onLongPressEvent(ev) : undefined} delayLongPress={450}
                      style={{ borderRadius: 14, backgroundColor: isDark ? rs.dot + '1A' : rs.badge, padding: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>
                          {ev.title}
                        </Text>
                        {assignee && (
                          <View style={{ backgroundColor: multiPersonColors ? colors.card : rs.dot, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' }}>
                            {multiPersonColors && (
                              <MultiPersonTimeFill hexColors={multiPersonColors} scrimColor={colors.card} size={20} radius={6} />
                            )}
                            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: multiPersonColors ? colors.textPrimary : '#fff' }}>{assignee.name.split(' ')[0]}</Text>
                          </View>
                        )}
                      </View>
                      {(ev.location || ev.category) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          {ev.location && <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>📍 {ev.location}</Text>}
                          {ev.location && ev.category && <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>·</Text>}
                          {ev.category && <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>🏷️ {ev.category}</Text>}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity onPress={() => onAddAtTime(hourTimeKey)}
                style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
                  borderColor: isDark ? colors.border : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontWeight: '600' }}>+ Tap to add event</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}
