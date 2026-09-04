/**
 * AgendaView — chronological list grouped by date, spanning many upcoming
 * days. Per-event rows render through the shared EventCardRow('boxed').
 *
 * Redesigned per live feedback ("this feature sucks.. need good design to
 * show the recurrence - i want simplest and easiest way to manage them")
 * after a daily-recurrence typo (should've been weekly) materialized ~170
 * rows and flooded this view with one full card per occurrence, no
 * grouping, no bulk cleanup. Two changes:
 *
 *  - Collapsing: rows sharing a seriesId are grouped; only the SOONEST
 *    upcoming occurrence renders as a normal card, the rest collapse into
 *    one "+N more Ã‚Â· Daily Ride" chip per series, sorted into that first
 *    hidden occurrence's own date group. Tapping the chip opens
 *    SeriesManagerScreen (the full per-occurrence list with bulk delete) —
 *    Agenda itself never again shows more than one card per series.
 *  - Select mode: an explicit header toggle (not long-press, which already
 *    means "edit") turns every row into a checkbox tap, with a bottom bar
 *    showing "N selected" + Delete. Swipe-to-delete is still available per
 *    row outside select mode, via the same SwipeableEventCard Day view
 *    uses, for a quick single delete without entering select mode at all.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { EventCardRow } from './EventCard';
import SwipeableEventCard from './SwipeableEventCard';
import { toDateStr, parseDate, isEventPast } from './calendarDateHelpers';
import { showAlert } from '@/components/AppAlert';
import { showToast } from '@/components/AppToast';

export default function AgendaView({
  events, members, colors, isDark, onSelectEvent, onLongPressEvent, isViewerParent = false, canDeleteEvent,
}: {
  events: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelectEvent: (ev: FamilyEvent) => void;
  onLongPressEvent?: (ev: FamilyEvent) => void;
  isViewerParent?: boolean;
  // Same per-event RBAC CalendarScreen's Day view already computes
  // (future + parent, or kid/teen's own still-pending request) — Agenda
  // previously had no delete affordance at all, so nothing enforced this
  // here; reusing the caller's own check keeps the rule in exactly one
  // place instead of Agenda re-deriving role logic it doesn't otherwise need.
  canDeleteEvent?: (ev: FamilyEvent) => boolean;
}) {
  const deleteEvent = useEventStore(s => s.deleteEvent);
  const todayStr = toDateStr(new Date());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // One representative row per seriesId (the soonest occurrence — today's
  // own if present, else next upcoming, else the last one if the whole
  // series has elapsed — same "what would a parent actually want to see"
  // rule collapseSeries already uses elsewhere in Calendar), everything
  // else rolled into that representative's own hiddenCount.
  const { visibleEvents, hiddenCountByRepId, seriesMetaByRepId } = useMemo(() => {
    const bySeriesId = new Map<string, FamilyEvent[]>();
    const standalone: FamilyEvent[] = [];
    for (const ev of events) {
      if (ev.category === 'Holiday') continue;
      if (!ev.seriesId) { standalone.push(ev); continue; }
      const group = bySeriesId.get(ev.seriesId);
      if (group) group.push(ev); else bySeriesId.set(ev.seriesId, [ev]);
    }
    const reps: FamilyEvent[] = [...standalone];
    const hiddenCountByRepId = new Map<string, number>();
    const seriesMetaByRepId = new Map<string, { seriesId: string; total: number }>();
    for (const [seriesId, group] of bySeriesId) {
      if (group.length === 1) { reps.push(group[0]); continue; }
      const sorted = [...group].sort((a, b) => a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date));
      const todaysOwn = sorted.find(ev => ev.date === todayStr);
      const upcoming = sorted.find(ev => !isEventPast(ev.date, ev.time) && ev.date !== todayStr);
      const rep = todaysOwn ?? upcoming ?? sorted[sorted.length - 1];
      reps.push(rep);
      hiddenCountByRepId.set(rep.id, sorted.length - 1);
      seriesMetaByRepId.set(rep.id, { seriesId, total: sorted.length });
    }
    return { visibleEvents: reps, hiddenCountByRepId, seriesMetaByRepId };
  }, [events, todayStr]);

  const grouped = useMemo(() => {
    const byDate: Record<string, FamilyEvent[]> = {};
    for (const ev of visibleEvents) (byDate[ev.date] ??= []).push(ev);
    const dates = Object.keys(byDate).sort();
    return dates.map(date => ({
      date,
      events: byDate[date].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    }));
  }, [visibleEvents]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const bulkDelete = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    showAlert(
      `Delete ${count} event${count === 1 ? '' : 's'}?`,
      'This only removes the selected occurrence(s) — any series they belong to keeps its other dates.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            const ids = [...selectedIds];
            exitSelectMode();
            await Promise.all(ids.map(id => deleteEvent(id)));
            showToast(`Deleted ${ids.length} event${ids.length === 1 ? '' : 's'}`);
          },
        },
      ],
    );
  };

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
    <View style={{ paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, marginBottom: 4 }}>
        <TouchableOpacity onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
            {selectMode ? 'Cancel' : 'Select'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 14, gap: 14, paddingBottom: selectMode ? 72 : 0 }}>
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
              {group.events.map(ev => {
                const hiddenCount = hiddenCountByRepId.get(ev.id) ?? 0;
                const seriesMeta = seriesMetaByRepId.get(ev.id);
                const canDelete = !selectMode && (canDeleteEvent?.(ev) ?? false);
                return (
                  <View key={ev.id} style={{ gap: 6 }}>
                    <SwipeableEventCard
                      canDelete={canDelete}
                      selectMode={selectMode}
                      selected={selectedIds.has(ev.id)}
                      onToggleSelect={() => toggleSelect(ev.id)}
                      onPress={() => onSelectEvent(ev)}
                      onLongPress={() => onLongPressEvent?.(ev)}
                      onDelete={() => {
                        showAlert(
                          ev.approvalPending ? 'Withdraw Request' : 'Remove Event',
                          `${ev.approvalPending ? 'Withdraw' : 'Remove'} "${ev.title}"?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: ev.approvalPending ? 'Withdraw' : 'Delete', style: 'destructive', onPress: () => deleteEvent(ev.id) },
                          ],
                        );
                      }}
                    >
                      <EventCardRow
                        ev={ev}
                        members={members}
                        colors={colors} isDark={isDark}
                        onPress={() => onSelectEvent(ev)}
                        timeStyle="boxed"
                        showCategory
                        showHelperStatus
                        isViewerParent={isViewerParent}
                      />
                    </SwipeableEventCard>
                    {seriesMeta && hiddenCount > 0 && (
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/calendar/series/[seriesId]', params: { seriesId: seriesMeta.seriesId } })}
                        style={{
                          marginLeft: selectMode ? 32 : 0, flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
                          backgroundColor: isDark ? colors.surface : '#F5F3FA',
                          borderWidth: 1, borderColor: isDark ? colors.border : '#E9E5F5', alignSelf: 'flex-start',
                        }}
                      >
                        <Text style={{ fontSize: 14 }}>🔁</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>
                          +{hiddenCount} more · {seriesMeta.total} total in series
                        </Text>
                        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>Manage →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>

      {selectMode && (
        <View style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: isDark ? colors.card : '#fff',
          borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
            {selectedIds.size} selected
          </Text>
          <TouchableOpacity
            onPress={bulkDelete}
            disabled={selectedIds.size === 0}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingVertical: 9, paddingHorizontal: 16, borderRadius: RADIUS.md,
              backgroundColor: selectedIds.size === 0 ? colors.border : '#EF4444',
            }}
          >
            <Text style={{ fontSize: 16 }}>🗑️</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
