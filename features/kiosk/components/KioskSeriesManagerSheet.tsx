/**
 * KioskSeriesManagerSheet — kiosk-native reproduction of the real
 * SeriesManagerScreen.tsx [fresh-audit gap]. Real mobile reaches this via
 * a full expo-router screen push from AgendaView's own "+N more · Manage
 * →" chip; kiosk has no navigation stack to route to (same reasoning as
 * every other phone-native full-screen flow this session rebuilt as a
 * kiosk-native sheet instead, e.g. KioskAskParentFlow.tsx's own precedent)
 * — so this reproduces that screen's real logic (same deleteEvent/
 * deleteEventScoped calls, same "Delete from here forward"/"Delete entire
 * series"/multi-select-delete trichotomy) as a KioskFormDrawer sheet.
 *
 * Real screen's own header comment: built after a daily-rule typo
 * materialized ~170 rows with no way to review or bulk-clean them beyond
 * deleting one card at a time in a flooded Agenda list.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Repeat2 } from 'lucide-react-native';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { isEventPast } from '@/features/calendar/components/calendarDateHelpers';
import { showToast } from '@/components/AppToast';
import { KioskFormDrawer } from './KioskFormDrawer';
import { KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { type KioskColors } from '../kioskPalette';

const FREQ_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export function KioskSeriesManagerSheet({ seriesId, onClose, colors, isDark, k }: {
  seriesId: string | null;
  onClose: () => void;
  colors: any; isDark: boolean; k: KioskColors;
}) {
  const rangeEvents = useEventStore(st => st.rangeEvents);
  const dayEvents = useEventStore(st => st.dayEvents);
  const deleteEvent = useEventStore(st => st.deleteEvent);
  const deleteEventScoped = useEventStore(st => st.deleteEventScoped);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Same in-memory-only source real SeriesManagerScreen.tsx uses (its own
  // comment: rangeEvents/dayEvents together are "good enough for a
  // same-session drill-in from the chip that just rendered this exact
  // series" — a cold-start deep link isn't this sheet's real entry path
  // either, only tapping a chip that already has the full series loaded).
  const occurrences = useMemo(() => {
    if (!seriesId) return [] as FamilyEvent[];
    const byId = new Map<string, FamilyEvent>();
    for (const ev of [...rangeEvents, ...dayEvents]) if (ev.seriesId === seriesId) byId.set(ev.id, ev);
    return [...byId.values()].sort((a, b) => a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date));
  }, [rangeEvents, dayEvents, seriesId]);

  const anchor = occurrences.find(ev => ev.isSeriesAnchor) ?? occurrences[0];

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const close = () => { setSelectedIds(new Set()); onClose(); };

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
    Alert.alert(
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
            close();
          },
        },
      ],
    );
  };

  const deleteFromHereForward = () => {
    const nextUpcoming = occurrences.find(ev => !isEventPast(ev.date, ev.time));
    if (!nextUpcoming) return;
    const count = occurrences.filter(ev => ev.date >= nextUpcoming.date).length;
    Alert.alert(
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
            close();
          },
        },
      ],
    );
  };

  const deleteSelected = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
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
    <KioskFormDrawer
      visible={!!seriesId}
      title={anchor?.title ?? 'Series'}
      subtitle={anchor ? `${ruleLabel} · ${occurrences.length} occurrence${occurrences.length === 1 ? '' : 's'} · ${dateRangeLabel}` : undefined}
      accent={k.purple}
      Icon={Repeat2}
      k={k}
      onClose={close}
      variant="drawer"
      submitLabel={selectedIds.size > 0 ? `Delete ${selectedIds.size} selected` : undefined}
      onSubmit={selectedIds.size > 0 ? deleteSelected : undefined}
      canSubmit={selectedIds.size > 0 && !busy}
      submitting={busy}
    >
      {!anchor ? (
        <Text style={{ color: k.textFaint, textAlign: 'center', paddingVertical: KIOSK_SPACE.xl }}>
          This series is no longer available — it may have already been deleted.
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md }}>
            <Pressable
              onPress={deleteFromHereForward}
              disabled={busy}
              style={{ flex: 1, borderRadius: KIOSK_RADIUS.md, paddingVertical: 11, alignItems: 'center', backgroundColor: k.well, borderWidth: 1, borderColor: k.cardBorder }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: k.text }}>Delete from here forward</Text>
            </Pressable>
            <Pressable
              onPress={deleteWholeSeries}
              disabled={busy}
              style={{ flex: 1, borderRadius: KIOSK_RADIUS.md, paddingVertical: 11, alignItems: 'center', backgroundColor: k.danger }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Delete entire series</Text>
            </Pressable>
          </View>

          <View style={{ gap: KIOSK_SPACE.xs }}>
            {occurrences.map(ev => {
              const past = isEventPast(ev.date, ev.time);
              const selected = selectedIds.has(ev.id);
              return (
                <Pressable
                  key={ev.id}
                  onPress={() => toggleSelect(ev.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
                    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
                    borderColor: selected ? k.purple : k.cardBorder,
                    backgroundColor: selected ? k.purpleSoft : k.card,
                    paddingVertical: 10, paddingHorizontal: 12, opacity: past ? 0.55 : 1,
                  }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                    borderColor: selected ? k.purple : k.cardBorder,
                    backgroundColor: selected ? k.purple : 'transparent',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {selected && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: k.text }}>
                      {fmtLong(ev.date)}{ev.time ? ` · ${fmtTime(ev.time)}` : ''}
                    </Text>
                    {ev.isSeriesAnchor && (
                      <Text style={{ fontSize: 11, color: k.textFaint, marginTop: 1 }}>Series start</Text>
                    )}
                  </View>
                  {past && (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: k.textFaint }}>Past</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </KioskFormDrawer>
  );
}
