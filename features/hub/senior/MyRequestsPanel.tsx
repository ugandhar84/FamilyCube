/**
 * MyRequestsPanel — the top of the grandparent's "Need a hand" page: a banner to raise a new request, then the requests THIS person has
 * raised, in tabs (Pending, Confirmed, Declined, History) with a small progress line on each (Asked, Driver asked, Confirmed, Done).
 * Tapping a request opens its event page (details, reassign, change history).
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { HandHeart, CalendarDays, MapPin, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { fromRow, eventAssignee, type FamilyEvent } from '@/store/eventStore';
import { localDateStr } from '@/lib/dates';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { GP } from './seniorTheme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import EventDetailScreen from '@/features/calendar/components/EventDetailScreen';
import { useEventStore } from '@/store/eventStore';

type Tab = 'pending' | 'confirmed' | 'declined' | 'history';
const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' }, { key: 'confirmed', label: 'Confirmed' }, { key: 'declined', label: 'Declined' }, { key: 'history', label: 'History' },
];
const STEPS = ['Asked', 'Driver asked', 'Confirmed', 'Done'];

function fmtDay(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmt12(t?: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function MyRequestsPanel({ familyId, memberId, onAsk, colors, isDark }: {
  familyId: string | undefined; memberId: string; onAsk: () => void; colors: any; isDark: boolean;
}) {
  const [rows, setRows] = useState<FamilyEvent[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [detailEv, setDetailEv] = useState<FamilyEvent | null>(null);

  const reload = useCallback(async () => {
    if (!familyId) return;
    const from = new Date(); from.setDate(from.getDate() - 60);
    const to = new Date(); to.setDate(to.getDate() + 90);
    const { data } = await supabase.from('calendar_events').select('*')
      .eq('family_id', familyId).is('deleted_at', null)
      .or(`created_by_id.eq.${memberId},member_id.eq.${memberId},member_ids.cs.{${memberId}}`)
      .gte('date', localDateStr(from)).lte('date', localDateStr(to)).order('date', { ascending: false }).limit(200);
    // Everything I asked for, plus any ride where I'm the rider (a parent may have booked it for me). Other events of mine are not requests.
    setRows((data ?? [])
      .filter((r: any) => r.created_by_id === memberId || r.ride_required || r.category === 'Ride')
      .map(fromRow));
  }, [familyId, memberId]);

  useEffect(() => {
    reload();
    const ch = supabase.channel(`my_requests_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => reload()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  const today = localDateStr(new Date());
  const classify = (ev: FamilyEvent): Tab => {
    if (ev.date < today) return 'history';
    const a = eventAssignee(ev);
    if (a.status === 'rejected') return 'declined';
    if (a.name && a.status === 'confirmed') return 'confirmed';
    return 'pending';
  };
  const stage = (ev: FamilyEvent): number => {
    if (ev.date < today || (ev as any).pickupConfirmedAt) return 3;
    const a = eventAssignee(ev);
    if (a.status === 'confirmed') return 2;
    if (a.name) return 1;
    return 0;
  };
  const counts: Record<Tab, number> = { pending: 0, confirmed: 0, declined: 0, history: 0 };
  rows.forEach(ev => { counts[classify(ev)]++; });
  const list = rows.filter(ev => classify(ev) === tab);
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const title = isDark ? colors.textPrimary : GEMINI.titleColor;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const shadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;

  return (
    <View style={{ gap: RHYTHM.item }}>
      <AnimatedPressable onPress={onAsk} accessibilityRole="button" accessibilityLabel="Ask for help"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: RHYTHM.card, borderRadius: 22, backgroundColor: colors.amberLight,
          borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, ...shadow }}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: cardBg, alignItems: 'center', justifyContent: 'center' }}>
          <HandHeart size={28} color={colors.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: GP.title, fontWeight: '800', color: title }}>What do you need?</Text>
          <Text style={{ fontSize: GP.sub, color: body, marginTop: 2 }}>Ask the family for a ride or help with something.</Text>
        </View>
        <View style={{ paddingHorizontal: 16, minHeight: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textInverse }}>New request</Text>
        </View>
      </AnimatedPressable>

      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textTertiary }}>My requests</Text>
      <View style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: 16, padding: 4 }}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="button" accessibilityLabel={`${t.label} ${counts[t.key]}`}
              style={{ flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.card : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: on ? colors.textPrimary : colors.textSecondary }} numberOfLines={1}>
                {t.label}{counts[t.key] > 0 ? ` · ${counts[t.key]}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {list.length === 0 ? (
        <View style={{ backgroundColor: cardBg, borderRadius: 18, padding: RHYTHM.card, ...shadow }}>
          <Text style={{ fontSize: GP.sub, color: body, lineHeight: 20 }}>
            {tab === 'pending' ? 'Nothing waiting. Tap New request to ask for help.' : tab === 'confirmed' ? 'No confirmed requests right now.' : tab === 'declined' ? 'No declined requests.' : 'No past requests yet.'}
          </Text>
        </View>
      ) : list.map(ev => {
        const a = eventAssignee(ev);
        const st = stage(ev);
        const status = tab === 'declined' ? `${a.name ?? 'The driver'} can't make it` : a.name ? (a.status === 'confirmed' ? `${a.name} confirmed` : `Waiting for ${a.name}`) : 'Waiting for someone to help';
        return (
          <Pressable key={ev.id} onPress={() => setDetailEv(ev)} accessibilityRole="button" accessibilityLabel={ev.title}
            style={{ backgroundColor: cardBg, borderRadius: 18, padding: RHYTHM.card, gap: 10, ...shadow }}>
            <Text style={{ fontSize: GP.body, fontWeight: '800', color: title }} numberOfLines={2}>{ev.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CalendarDays size={14} color={colors.textTertiary} />
              <Text style={{ fontSize: GP.sub, color: body }}>{fmtDay(ev.date)}{ev.time ? ` · ${fmt12(ev.time)}` : ''}</Text>
            </View>
            {!!ev.location && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} color={colors.textTertiary} />
                <Text style={{ fontSize: GP.sub, color: body }} numberOfLines={1}>{ev.location.split(',')[0]}</Text>
              </View>
            )}
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: tab === 'declined' ? colors.danger : a.status === 'confirmed' ? colors.success : colors.amber }}>{status}</Text>
            {tab !== 'declined' && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {STEPS.map((label, i) => (
                  <View key={label} style={{ flex: 1, gap: 4 }}>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: i <= st ? colors.success : colors.border }} />
                    <Text style={{ fontSize: 10, fontWeight: i <= st ? '700' : '500', color: i <= st ? colors.textPrimary : colors.textTertiary }} numberOfLines={1}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}

      {detailEv && (
        <EventDetailScreen ev={detailEv} onClose={() => { setDetailEv(null); reload(); }}
          onDelete={async (id) => { await useEventStore.getState().deleteEvent(id); setDetailEv(null); reload(); }} />
      )}
    </View>
  );
}
