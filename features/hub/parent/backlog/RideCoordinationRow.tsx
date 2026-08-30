import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Car, UserCog } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { eventAssignee, useEventStore } from '@/store/eventStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { eventAssigneeRole } from '@/features/tasks/lib/deriveCardActions';
import { notifyTakeover } from '../../hubComponents';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';

// A co-parent's ride still finding a driver. Used to be purely read-only
// (no claim/assign action) — offering a REASSIGN here doesn't reopen the
// claim-race concern that design was protecting against (a GP/teen pool
// claim, which already has its own compare-and-swap RPC); reassigning is
// authority-based, the same one-tap override a parent already has via
// EventDetailSheet's DriverChipRow. Was fully read-only until a live
// review found a co-parent's pending/declined ride had NO actionable
// surface anywhere for the other parent — only this row's status text.
export function RideCoordinationRow({ ev, members, active, colors, isDark }: {
  ev: FamilyEvent; members: FamilyMember[]; active: FamilyMember; colors: any; isDark: boolean;
}) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const updateEvent = useEventStore(s => s.updateEvent);
  const creator = members.find(m => m.id === ev.createdBy);
  const assignee = eventAssignee(ev);
  const otherParents = members.filter(m => m.role === 'parent' && m.id !== active.id && m.name !== assignee.name);
  // Was binary (no assignee vs "claimed, awaiting confirmation") — the
  // whole point of this row is "so you know," but it couldn't actually
  // tell a co-parent whether the ride was fully resolved (confirmed
  // driver) or still needs someone to confirm (QA sweep, parent-role
  // audit, Medium M3).
  const status = !assignee.name
    ? 'Open to helpers — nobody has claimed it yet'
    : assignee.status === 'confirmed'
      ? `${assignee.name.split(' ')[0]} confirmed — all set`
      : assignee.status === 'rejected'
        ? `${assignee.name.split(' ')[0]} declined — back to open`
        : `${assignee.name.split(' ')[0]} claimed it, awaiting confirmation`;

  const reassignTo = (m: FamilyMember) => {
    const role = eventAssigneeRole(ev);
    notifyTakeover(ev, m.name, members, active.name);
    supabase.rpc('reassign_event', {
      p_event_id: ev.id, p_new_member_id: m.id, p_role: role, p_actor_id: active.id,
    }).then(({ error }) => {
      if (error) {
        console.warn('[RideCoordinationRow] reassignTo reassign_event failed', error.message);
        showToast("Couldn't reassign — please try again", 'error');
        return;
      }
      // DB write succeeds but nothing told the local Zustand store — same
      // gap as every other reassign call site; a co-parent handoff starts
      // 'pending' (the new parent still needs to confirm), same as
      // RideRequiredEventCard's own parent-to-parent reassignTo.
      updateEvent(ev.id, role === 'driver'
        ? { driverName: m.name, driverStatus: 'pending' }
        : { helper: m.name, helperStatus: 'pending' });
      showToast(`Assigned to ${m.name.split(' ')[0]} ✓`);
    });
    setReassignOpen(false);
  };

  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
      backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Car size={13} color={colors.textTertiary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
            {ev.title}{creator ? ` · ${creator.name.split(' ')[0]}'s request` : ''}
          </Text>
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }} numberOfLines={1}>
            {status}
          </Text>
        </View>
        {assignee.status !== 'confirmed' && otherParents.length > 0 && (
          <Pressable onPress={() => setReassignOpen(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5,
              borderRadius: 8, backgroundColor: reassignOpen ? colors.parent + '20' : colors.parent + '14' }}>
            <UserCog size={12} color={colors.parent} />
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.parent }}>Reassign</Text>
          </Pressable>
        )}
      </View>
      {reassignOpen && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {otherParents.map(m => (
            <Pressable key={m.id} onPress={() => reassignTo(m)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                borderWidth: 1, borderColor: colors.parent + '40', backgroundColor: colors.parent + '10' }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.parent }}>{m.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
