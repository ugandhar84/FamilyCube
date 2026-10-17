/**
 * KioskDayEventsPanel — the side list beside the Month grid: every event on
 * the selected day as a pastel card (time, title, who, where), tap to open
 * the event detail. Applies the same sensitive-event rules as the grid:
 * hidden events are dropped, busy-block events show as "Busy" with no title.
 */
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { FamilyMember } from '@/store/familyStore';
import { canViewSensitiveEventDetail, type FamilyEvent } from '@/store/eventStore';
import { fmtTime } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { Eyebrow } from './KioskHomeParts';

const toMin = (t?: string | null) => {
  const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

export function KioskDayEventsPanel({ dateLabel, events, members, active, involvedFor, onEventPress }: {
  dateLabel: string;
  events: FamilyEvent[];
  members: FamilyMember[];
  active: FamilyMember;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void;
}) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const rows = events
    .map(ev => ({ ev, vis: canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name) }))
    .filter(r => r.vis !== 'hidden')
    .sort((a, b) => (a.ev.allDay ? -1 : toMin(a.ev.time)) - (b.ev.allDay ? -1 : toMin(b.ev.time)));

  return (
    <View style={[s.panel, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
      <Eyebrow label="SELECTED DAY" accent={k.primary} k={k} right={`${rows.length} plan${rows.length === 1 ? '' : 's'}`} />
      <Text style={[s.date, { color: k.text }]} numberOfLines={2}>{dateLabel}</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.md }}>
        {rows.length === 0 && <Text style={[s.empty, { color: k.textMuted }]}>Nothing planned. A free day.</Text>}
        {rows.map(({ ev, vis }) => {
          const busy = vis === 'busy-block';
          const who = involvedFor(ev);
          const tone = busy || !who[0]
            ? { card: k.well, fg: k.textMuted }
            : pastels[Math.max(0, members.findIndex(m => m.id === who[0].id)) % pastels.length];
          const when = ev.allDay || !ev.time ? 'All day' : `${fmtTime(ev.time)}${ev.endTime ? ` – ${fmtTime(ev.endTime)}` : ''}`;
          const sub = busy ? '' : [who.map(w => w.name.trim().split(' ')[0]).join(', '), (ev as any).location || (ev as any).venueLocation || ''].filter(Boolean).join(' · ');
          return (
            <Pressable key={ev.id} onPress={() => onEventPress(ev)} accessibilityRole="button" accessibilityLabel={`${busy ? 'Busy' : ev.title}, ${when}`}
              style={({ pressed }) => [s.card, { backgroundColor: tone.card }, pressed && { opacity: 0.75 }]}>
              <Text style={[s.when, { color: tone.fg }]} numberOfLines={1}>{when}</Text>
              <Text style={[s.title, { color: k.text }]} numberOfLines={2}>{busy ? '🔒 Busy' : ev.title}</Text>
              {!!sub && <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={1}>{sub}</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { flex: 1, borderRadius: KIOSK_RADIUS.xl, borderWidth: 1, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  date: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  card: { borderRadius: KIOSK_RADIUS.lg, paddingHorizontal: KIOSK_SPACE.md, paddingVertical: 12, gap: 2 },
  when: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  title: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  sub: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.xl },
});
