/**
 * useGpRideRequests — rides a grandparent has asked for (the grandparent is the rider on a ride event).
 *  - pending: upcoming and not yet confirmed by a driver (nobody assigned, still waiting, or the driver said no),
 *  - accepted: upcoming and confirmed by a driver,
 *  - history: recent past rides, so a parent can see how earlier requests ended.
 * Read straight from calendar_events (not the day-cache in eventStore), kept live by a realtime subscription.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fromRow, eventAssignee, type FamilyEvent } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { localDateStr } from '@/lib/dates';

export interface GpRideRow { ev: FamilyEvent; riderName: string; assigneeName?: string; assigneeStatus?: string }

export function useGpRideRequests(familyId: string | undefined) {
  const members = useFamilyStore(s => s.members);
  const [rows, setRows] = useState<FamilyEvent[]>([]);

  const reload = useCallback(async () => {
    if (!familyId) return;
    const from = new Date(); from.setDate(from.getDate() - 30);
    const to = new Date(); to.setDate(to.getDate() + 60);
    const { data } = await supabase.from('calendar_events').select('*')
      .eq('family_id', familyId).is('deleted_at', null)
      .or('ride_required.eq.true,category.eq.Ride')
      .gte('date', localDateStr(from)).lte('date', localDateStr(to))
      .order('date', { ascending: true }).limit(200);
    setRows((data ?? []).map(fromRow));
  }, [familyId]);

  useEffect(() => {
    reload();
    const ch = supabase.channel(`gp_rides_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => reload()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  const seniors = new Map(members.filter(m => m.role === 'senior').map(m => [m.id, m]));
  const today = localDateStr(new Date());
  const toRow = (ev: FamilyEvent): GpRideRow | null => {
    const riderIds = ev.memberIds?.length ? ev.memberIds : ev.memberId ? [ev.memberId] : [];
    const rider = riderIds.map(id => seniors.get(id)).find(Boolean);
    if (!rider) return null;
    const a = eventAssignee(ev);
    return { ev, riderName: rider.name.split(' ')[0], assigneeName: a.name, assigneeStatus: a.status };
  };
  const all = rows.map(toRow).filter((r): r is GpRideRow => !!r);
  const pending = all.filter(r => r.ev.date >= today && (!r.assigneeName || r.assigneeStatus !== 'confirmed'));
  const accepted = all.filter(r => r.ev.date >= today && r.assigneeName && r.assigneeStatus === 'confirmed');
  const history = all.filter(r => r.ev.date < today).sort((a, b) => b.ev.date.localeCompare(a.ev.date)).slice(0, 12);
  return { pending, accepted, history, reload };
}
