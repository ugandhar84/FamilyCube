/**
 * SeriesManagerScreen — the full per-occurrence view for one recurring
 * series, reached by tapping an Agenda "+N more" chip (AgendaView.tsx).
 *
 * Built per live feedback after a daily-rule typo materialized ~170 rows
 * with zero way to review or bulk-clean them beyond deleting one card at a
 * time in a flooded Agenda list. This screen is the "simplest, easiest way
 * to manage them" — everything about one series in one place:
 *  - series summary (rule, date range, occurrence count)
 *  - every occurrence, chronological, with its own status
 *  - "Delete entire series" / "Delete from here forward" one-tap shortcuts
 *    (both already exist as deleteEventScoped('all'/'following') —
 *    this screen is new UI over existing, tested store logic, not new
 *    delete plumbing)
 *  - multi-select for arbitrary occurrences (e.g. keep the ones already
 *    completed/confirmed, wipe the rest)
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { isEventPast } from '@/features/calendar/components/calendarDateHelpers';
import { showAlert } from '@/components/AppAlert';
import { showToast } from '@/components/AppToast';

const FREQ_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SeriesManagerScreen() {
  const { colors, isDark } = useTheme();
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();
  const members = useFamilyStore(s => s.members);
  const { rangeEvents, dayEvents, deleteEvent, deleteEventScoped } = useEventStore();

  // The series' rows may span further than whatever window Agenda/Week
  // happened to have loaded (loadRange is a rolling SWR window, not "the
  // whole series") — rangeEvents/dayEvents together are what's already in
  // memory, good enough for a same-session drill-in from the chip that
  // just rendered this exact series. A cold-start deep link (not this
  // screen's real entry path today) would show whatever's cached instead
  // of the full 84-row set; acceptable since the only way in is tapping a
  // chip that already has the full series loaded moments earlier.
  const occurrences = useMemo(() => {
    const byId = new Map<string, FamilyEvent>();
    for (const ev of [...rangeEvents, ...dayEvents]) if (ev.seriesId === seriesId) byId.set(ev.id, ev);
    return [...byId.values()].sort((a, b) => a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date));
  }, [rangeEvents, dayEvents, seriesId]);

  const anchor = occurrences.find(ev => ev.isSeriesAnchor) ?? occurrences[0];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const ruleLabel = anchor?.recurrenceRule
    ? `${FREQ_LABEL[anchor.recurrenceRule.frequency] ?? anchor.recurrenceRule.frequency}${
        anchor.recurrenceRule.frequency === 'weekly' && anchor.recurrenceRule.days?.length
          ? ` · ${anchor.recurrenceRule.days.map(d => DAY_ABBR[d]).join('/')}` : ''
      }`
    : null;

  const dateRangeLabel = occurrences.length
    ? `${fmtShort(occurrences[0].date)} – ${fmtShort(occurrences[occurrences.length - 1].date)}`
    : '';

  const deleteWholeSeries = () => {
    if (!anchor) return;
    showAlert(
      `Delete all ${occurrences.length} events?`,
      `This removes every occurrence of "${anchor.title}", including any already past. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete all ${occurrences.length}`, style: 'destructive', onPress: async () => {
            setBusy(true);
            await deleteEventScoped(anchor.id, 'all');
            setBusy(false);
            showToast(`Deleted ${occurrences.length} events`);
            router.back();
          },
        },
      ],
    );
  };

  const deleteFromHereForward = () => {
    const nextUpcoming = occurrences.find(ev => !isEventPast(ev.date, ev.time));
    if (!nextUpcoming) return;
    const count = occurrences.filter(ev => ev.date >= nextUpcoming.date).length;
    showAlert(
      `Delete ${count} upcoming events?`,
      `This removes every occurrence from ${fmtShort(nextUpcoming.date)} onward. Past occurrences are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete ${count}`, style: 'destructive', onPress: async () => {
            setBusy(true);
            await deleteEventScoped(nextUpcoming.id, 'following');
            setBusy(false);
            showToast(`Deleted ${count} events`);
            router.back();
          },
        },
      ],
    );
  };

  const deleteSelected = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    showAlert(
      `Delete ${count} selected event${count === 1 ? '' : 's'}?`,
      'Only the events you checked are removed — the rest of the series is untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setBusy(true);
            const ids = [...selectedIds];
            await Promise.all(ids.map(id => deleteEvent(id)));
            setSelectedIds(new Set());
            setBusy(false);
            showToast(`Deleted ${ids.length} event${ids.length === 1 ? '' : 's'}`);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
          {anchor?.title ?? 'Series'}
        </Text>
      </View>

      {!anchor ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
            This series is no longer available — it may have already been deleted.
          </Text>
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <View style={{
              borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.card, padding: 14, gap: 4,
            }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                {ruleLabel} · {occurrences.length} occurrence{occurrences.length === 1 ? '' : 's'}
              </Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{dateRangeLabel}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={deleteFromHereForward}
                disabled={busy}
                style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: 11, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Delete from here forward</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={deleteWholeSeries}
                disabled={busy}
                style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: 11, alignItems: 'center', backgroundColor: '#EF4444' }}
              >
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Delete entire series</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: selectedIds.size > 0 ? 80 : 24, gap: 8 }}>
            {occurrences.map(ev => {
              const past = isEventPast(ev.date, ev.time);
              const selected = selectedIds.has(ev.id);
              return (
                <TouchableOpacity
                  key={ev.id}
                  onPress={() => toggleSelect(ev.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    borderRadius: RADIUS.md, borderWidth: 1,
                    borderColor: selected ? '#7B5EA7' : colors.border,
                    backgroundColor: selected ? (isDark ? '#2A2438' : '#F5F3FA') : colors.card,
                    paddingVertical: 10, paddingHorizontal: 12, opacity: past ? 0.55 : 1,
                  }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                    borderColor: selected ? '#7B5EA7' : '#C4C0CC',
                    backgroundColor: selected ? '#7B5EA7' : 'transparent',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {selected && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                      {fmtLong(ev.date)}{ev.time ? ` · ${fmtTime(ev.time)}` : ''}
                    </Text>
                    {ev.isSeriesAnchor && (
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>Series start</Text>
                    )}
                  </View>
                  {past && (
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary }}>Past</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedIds.size > 0 && (
            <View style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 24,
              backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
            }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                {selectedIds.size} selected
              </Text>
              <TouchableOpacity
                onPress={deleteSelected}
                disabled={busy}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 16, borderRadius: RADIUS.md, backgroundColor: '#EF4444' }}
              >
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 16 }}>🗑️</Text>}
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function fmtShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
