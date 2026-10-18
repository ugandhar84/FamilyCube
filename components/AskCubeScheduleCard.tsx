/**
 * AskCubeScheduleCard — the schedule answer as one compact card under Ask Cube's sentence: days as small headings, one row
 * per event with the time on the left and a clear status line. Tap a row to open the event; "Assign" asks Cube who can drive.
 * Colours come from the theme so it reads in light and dark.
 */
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { RHYTHM } from '@/constants/theme';

export interface AskCubeScheduleEvent {
  id: string; title: string; category?: string | null; date: string; time?: string | null; endTime?: string | null;
  people: string[]; isRide: boolean; driver: string | null; driverStatus: string | null; needsDriver: boolean;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayLabel(iso: string): string {
  const today = localToday();
  const add = (n: number) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const d = new Date(iso + 'T12:00:00');
  const nice = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (iso === today) return `Today · ${nice}`;
  if (iso === add(1)) return `Tomorrow · ${nice}`;
  if (iso === add(-1)) return `Yesterday · ${nice}`;
  return nice;
}
function parts(t?: string | null): { time: string; ampm: string } | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return { time: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, ampm: h >= 12 ? 'PM' : 'AM' };
}

export default function AskCubeScheduleCard({ events, canAssign, onOpen, onAssign }: {
  events: AskCubeScheduleEvent[];
  canAssign: boolean;
  onOpen: (ev: AskCubeScheduleEvent) => void;
  onAssign: (ev: AskCubeScheduleEvent) => void;
}) {
  const { colors } = useTheme();
  const byDay = new Map<string, AskCubeScheduleEvent[]>();
  [...events].sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))).forEach(e => {
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  });
  const today = localToday();

  return (
    <View style={{ maxWidth: '94%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' }}>
      {[...byDay.entries()].map(([date, list], gi) => (
        <View key={date}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textTertiary,
            paddingHorizontal: RHYTHM.card - 4, paddingTop: gi === 0 ? 10 : 12, paddingBottom: 2 }}>{dayLabel(date)}</Text>
          {list.map(ev => {
            const t = parts(ev.time);
            const past = date < today;
            const status = ev.needsDriver
              ? { text: 'Nobody driving', color: colors.danger }
              : ev.driver
                ? (ev.driverStatus === 'confirmed' || ev.driverStatus == null
                    ? { text: `${ev.driver} driving`, color: colors.success }
                    : ev.driverStatus === 'rejected'
                      ? { text: `${ev.driver} can't drive`, color: colors.danger }
                      : { text: `${ev.driver} driving · waiting to confirm`, color: colors.amber })
                : null;
            return (
              <Pressable key={ev.id} onPress={() => onOpen(ev)} accessibilityRole="button" accessibilityLabel={`${ev.title}${t ? ` at ${t.time} ${t.ampm}` : ''}`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: RHYTHM.card - 4, paddingVertical: 10,
                  borderTopWidth: 1, borderTopColor: colors.border, opacity: past ? 0.55 : pressed ? 0.75 : 1 })}>
                <View style={{ width: 50 }}>
                  {t ? (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>{t.time}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary }}>{t.ampm}</Text>
                    </>
                  ) : <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary }}>All day</Text>}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, lineHeight: 18 }}>{ev.title}</Text>
                  {!!status && <Text style={{ fontSize: 12, fontWeight: '700', color: status.color, marginTop: 2 }}>{status.text}</Text>}
                </View>
                {ev.needsDriver && canAssign ? (
                  <Pressable onPress={() => onAssign(ev)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Assign a driver"
                    style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textInverse }}>Assign</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
