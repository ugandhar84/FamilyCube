/**
 * RequestTrail — an expandable, step-by-step trail for one request: who did what and when. Works for a ride/event (activity_log) and for
 * a kid_request such as an SOS (kid_request_events). Collapsed by default so lists stay short; loads when first opened.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { fetchActivityLog } from '@/lib/activityLog';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useFamilyStore } from '@/store/familyStore';

type Line = { key: string; label: string; who?: string; when: string; note?: string; detail?: string };

const EVENT_LABEL: Record<string, string> = {
  created: 'Request sent', deleted: 'Removed', date_changed: 'Day changed', time_changed: 'Time changed', recurrence_changed: 'Repeat changed',
  recurrence_cancelled: 'Repeat cancelled', driver_assigned: 'Driver asked', driver_reassigned: 'Driver changed', driver_removed: 'Driver removed',
  gp_welcome_changed: 'Grandparent option changed', teen_welcome_changed: 'Teen option changed', notes_changed: 'Notes changed',
  claimed: 'Claimed', submitted: 'Submitted', approved: 'Accepted', declined: 'Declined', reassigned: 'Handed to someone else',
  status_changed: 'Status changed', reward_changed: 'Reward changed', due_date_changed: 'Due date changed', other: 'Update',
};
const REQUEST_LABEL: Record<string, string> = {
  created: 'Request sent', approved: 'Accepted', declined: 'Declined', assigned: 'Someone asked to help', reassigned: 'Handed to someone else',
  completed: 'Completed', cancelled: 'Cancelled', gp_toggled: 'Grandparent option changed', read: 'Seen', items_approved: 'Items approved',
  items_rejected: 'Items declined', items_appended: 'Items added',
};

function stamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day} · ${time}`;
}

export function RequestTrail({ kind, id, colors, defaultOpen = false, refreshKey }: { kind: 'event' | 'kidRequest'; id: string; colors: any; defaultOpen?: boolean; refreshKey?: string }) {
  const members = useFamilyStore(s => s.members);
  const [open, setOpen] = useState(defaultOpen);
  const [lines, setLines] = useState<Line[] | null>(null);
  const first = (mid?: string | null) => members.find(m => m.id === mid)?.name?.split(' ')[0];

  const load = async () => {
    if (kind === 'event') {
      const rows = (await fetchActivityLog('event', id, 40)).slice().reverse();
      setLines(rows.map(r => {
        const oldM = first(r.oldValue); const newM = first(r.newValue);
        const detail = oldM && newM ? `${oldM} → ${newM}` : r.oldValue && r.newValue ? `${r.oldValue} → ${r.newValue}` : newM ? newM : undefined;
        return { key: r.id, label: EVENT_LABEL[r.action] ?? 'Update', who: first(r.actorId), when: stamp(r.createdAt), note: r.note ?? undefined, detail };
      }));
    } else {
      const rows = await useKidRequestStore.getState().getEventsForRequest(id);
      const out: Line[] = rows.map(r => ({ key: r.id, label: REQUEST_LABEL[r.eventType] ?? 'Update', who: first(r.actorId), when: stamp(r.createdAt), note: r.note }));
      // Requests made before the trail existed have no recorded steps: rebuild the basics from the request itself.
      const req = useKidRequestStore.getState().requests.find(r => r.id === id);
      if (req) {
        if (!rows.some(r => r.eventType === 'created')) out.unshift({ key: 'c', label: 'Request sent', who: first(req.fromMemberId), when: stamp(req.requestedAt) });
        const decided = req.status === 'approved' ? 'Accepted' : req.status === 'declined' ? 'Declined' : req.status === 'completed' ? 'Completed' : req.status === 'cancelled' ? 'Cancelled' : null;
        if (decided && req.respondedAt && !rows.some(r => ['approved', 'declined', 'completed', 'cancelled'].includes(r.eventType)))
          out.push({ key: 'd', label: decided, who: first(req.respondedBy), when: stamp(req.respondedAt), note: req.parentNote });
      }
      setLines(out);
    }
  };
  const toggle = () => { const next = !open; setOpen(next); if (next && !lines) load(); };
  useEffect(() => { if (open) load(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={open ? 'Hide trail' : 'Show trail'} hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{open ? 'Hide trail' : 'Show trail'}</Text>
        {open ? <ChevronUp size={14} color={colors.primary} /> : <ChevronDown size={14} color={colors.primary} />}
      </Pressable>
      {open && (
        <View style={{ marginTop: 6, gap: 10 }}>
          {lines === null ? <ActivityIndicator size="small" color={colors.primary} />
            : lines.length === 0 ? <Text style={{ fontSize: 13, color: colors.textTertiary, fontStyle: 'italic' }}>No steps recorded yet.</Text>
            : lines.map((l, i) => (
              <View key={l.key} style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ alignItems: 'center', width: 12 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: i === lines.length - 1 ? colors.primary : colors.border }} />
                  {i < lines.length - 1 && <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginTop: 2 }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{l.label}{l.who ? ` · ${l.who}` : ''}</Text>
                  {!!l.detail && <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>{l.detail}</Text>}
                  <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>{l.when}</Text>
                  {!!l.note && <Text style={{ fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 }}>"{l.note}"</Text>}
                </View>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}
