/**
 * AgendaView — chronological list grouped by date, spanning many upcoming
 * days. Extracted 1:1 from CalendarScreen.tsx's inline AgendaView function;
 * per-event rows now render through the shared EventCardRow('boxed')
 * instead of hand-rolled markup — showCategory is forced true to preserve
 * Agenda's original "always show category chip when present" behavior.
 */
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { EventCardRow } from './EventCard';
import { toDateStr, parseDate } from './calendarDateHelpers';

// ─── Agenda view — chronological list grouped by date, sticky headers ─────────
// Spans many upcoming days (not just one selected date) — the "what's
// coming up" view, matching the reference's grouped-by-date list pattern.
export default function AgendaView({
  events, members, colors, isDark, onSelectEvent,
}: {
  events: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelectEvent: (ev: FamilyEvent) => void;
}) {
  const todayStr = toDateStr(new Date());

  const grouped = useMemo(() => {
    const byDate: Record<string, FamilyEvent[]> = {};
    for (const ev of events) {
      if (ev.category === 'Holiday') continue;
      (byDate[ev.date] ??= []).push(ev);
    }
    const dates = Object.keys(byDate).sort();
    return dates.map(date => ({
      date,
      events: byDate[date].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    }));
  }, [events]);

  if (grouped.length === 0) {
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: isDark ? colors.border : '#F1F5F9', backgroundColor: isDark ? colors.card : '#fff', padding: 28, alignItems: 'center' }}>
          <Text style={{ fontSize: 26, marginBottom: 6 }}>📋</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No upcoming events in this window</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 4, gap: 14 }}>
      {grouped.map(group => {
        const date = parseDate(group.date);
        const isToday = group.date === todayStr;
        return (
          <View key={group.date} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: isToday ? BRAND.purple : colors.textSecondary }}>
                {isToday ? 'TODAY · ' : ''}{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary }}>
                {group.events.length} event{group.events.length === 1 ? '' : 's'}
              </Text>
            </View>
            {group.events.map(ev => (
              <EventCardRow
                key={ev.id}
                ev={ev}
                members={members}
                colors={colors} isDark={isDark}
                onPress={() => onSelectEvent(ev)}
                timeStyle="boxed"
                showCategory
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}
