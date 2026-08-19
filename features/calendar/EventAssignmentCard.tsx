import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Car, Check, X, RotateCcw } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';

type Role = 'helper' | 'driver';

const DECLINE_PRESETS = ['Schedule conflict', "Can't drive today", 'Feeling unwell', 'Something came up'];

// Contextual, inline decision card for a helper/driver assignment — reads
// live from the event store (not a stale sheet-open snapshot) so a
// reassignment or accept lands here immediately, no separate Edit Event
// detour needed.
//
// Status alone drives the UI: 'pending' always means "someone (the
// zero-touch engine, or another parent) put this on you and it's awaiting
// your yes/no" — Accept / Reassign / Decline. 'confirmed' means it's
// settled (whether you accepted it or picked yourself directly — either
// path writes 'confirmed', see EventFormModal's self-pick handling) and
// the only action left is "Can't Make It" for a conflict that comes up
// later. Decline hands it to the other parent, pending their own accept.
export function EventAssignmentCard({
  event, role, active, members, colors, isDark,
}: {
  event: FamilyEvent; role: Role; active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const updateEvent = useEventStore(s => s.updateEvent);
  const [mode, setMode] = useState<'idle' | 'reassign' | 'decline'>('idle');
  const [note, setNote] = useState('');
  const [pickedId, setPickedId] = useState<string | undefined>();

  const name     = role === 'driver' ? event.driverName   : event.helper;
  const status   = role === 'driver' ? event.driverStatus : event.helperStatus;
  const assignee = members.find(m => m.name === name);
  const isMe     = assignee?.id === active.id;
  const label    = role === 'driver' ? 'Driven by' : (
    event.category === 'Medical' ? 'Accompanied by' :
    event.category === 'Study'   ? 'Tutored by'      :
    event.category === 'Sports'  ? 'Drop-off by'      : 'Helper');

  if (!name) return null;

  // Eligible adults to reassign to — parents always, GPs only if this
  // event has opted in (matches EventFormModal's own GP-Welcome gating).
  const otherAdults = members.filter(m =>
    m.id !== active.id &&
    (m.role === 'parent' || (m.role === 'senior' && event.isOpenToGrandparents))
  );

  const reset = () => { setMode('idle'); setNote(''); setPickedId(undefined); };

  const writeAssignment = (patch: { name?: string; status?: 'confirmed' | 'pending'; notes?: string }) => {
    updateEvent(event.id, role === 'driver'
      ? { driverName: patch.name, driverStatus: patch.status, notes: patch.notes ?? event.notes }
      : { helper: patch.name, helperStatus: patch.status, notes: patch.notes ?? event.notes });
  };

  const accept = () => writeAssignment({ name, status: 'confirmed' });

  const confirmDecline = () => {
    // Hand off to the other parent, pending their own accept — falls back
    // to clearing the assignment if there's no second parent.
    const otherParent = members.find(m => m.role === 'parent' && m.id !== active.id);
    const reasonNote = note.trim()
      ? `${active.name.split(' ')[0]} can't do "${label.toLowerCase()}" — "${note.trim()}"${otherParent ? ` · reassigned to ${otherParent.name.split(' ')[0]}` : ''}`
      : event.notes;
    writeAssignment({ name: otherParent?.name, status: otherParent ? 'pending' : undefined, notes: reasonNote });
    reset();
  };

  const confirmReassign = () => {
    const target = members.find(m => m.id === pickedId);
    if (!target) return;
    const reasonNote = note.trim()
      ? `${active.name.split(' ')[0]} reassigned "${label.toLowerCase()}" to ${target.name.split(' ')[0]} — "${note.trim()}"`
      : event.notes;
    // Reassigning to yourself settles it immediately — no accept-your-own-pick loop.
    writeAssignment({ name: target.name, status: target.id === active.id ? 'confirmed' : 'pending', notes: reasonNote });
    reset();
  };

  const statusBadge = (
    <>
      {status === 'confirmed' && <View style={{ backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#6EE7B7' }}><Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>Confirmed ✓</Text></View>}
      {status === 'pending'   && <View style={{ backgroundColor: isDark ? '#1C1700' : '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FCD34D' }}><Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#D97706' }}>⏳ Pending</Text></View>}
      {status === 'rejected'  && <View style={{ backgroundColor: isDark ? '#450A0A' : '#FEE2E2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FCA5A5' }}><Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#EF4444' }}>Declined ✕</Text></View>}
    </>
  );

  const needsMyDecision = isMe && status === 'pending';
  const isMyConfirmed    = isMe && status === 'confirmed';

  return (
    <View style={{
      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? '#1E293B' : '#E8E8F0',
      overflow: 'hidden',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Car size={14} color={isDark ? '#FBBF24' : '#D97706'} />
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            {label}:{' '}
            <Text style={{ fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{name}</Text>
          </Text>
        </View>
        {statusBadge}
      </View>

      {/* Already confirmed (self-picked or previously accepted) — the only
          action left is flagging a conflict that comes up later. */}
      {isMyConfirmed && mode === 'idle' && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <Pressable onPress={() => setMode('decline')}
            style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.danger + '40', backgroundColor: colors.danger + '10',
              paddingVertical: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <X size={13} color={colors.danger} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>Can't Make It</Text>
          </Pressable>
        </View>
      )}

      {/* Awaiting this person's decision — the full accept/reassign/decline set. */}
      {needsMyDecision && mode === 'idle' && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
          <Pressable onPress={accept}
            style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Check size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Accept</Text>
          </Pressable>
          <Pressable onPress={() => setMode('reassign')}
            style={{ flex: 1, backgroundColor: BRAND.purple + '15', borderWidth: 1, borderColor: BRAND.purple + '40', borderRadius: 10, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <RotateCcw size={13} color={BRAND.purple} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>Reassign</Text>
          </Pressable>
          <Pressable onPress={() => setMode('decline')}
            style={{ flex: 1, backgroundColor: colors.danger + '10', borderWidth: 1, borderColor: colors.danger + '40', borderRadius: 10, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <X size={13} color={colors.danger} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger }}>Decline</Text>
          </Pressable>
        </View>
      )}

      {/* Reassign panel */}
      {mode === 'reassign' && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Reassign to</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {otherAdults.map(m => (
              <Pressable key={m.id} onPress={() => setPickedId(m.id)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                  borderColor: pickedId === m.id ? BRAND.purple : (isDark ? colors.border : '#E2E8F0'),
                  backgroundColor: pickedId === m.id ? BRAND.purple + '15' : 'transparent' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: pickedId === m.id ? BRAND.purple : colors.textPrimary }}>
                  {m.name.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={note} onChangeText={setNote}
            placeholder="Optional note…"
            placeholderTextColor={colors.textTertiary}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9,
              fontSize: TYPO.label, color: colors.textPrimary, backgroundColor: isDark ? colors.surface : '#fff' }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={reset} style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={confirmReassign} disabled={!pickedId}
              style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: BRAND.purple, opacity: pickedId ? 1 : 0.5 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Decline panel */}
      {mode === 'decline' && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>
            {isMyConfirmed ? "What's the conflict?" : 'Reason for declining'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {DECLINE_PRESETS.map(p => (
              <Pressable key={p} onPress={() => setNote(p)}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
                  backgroundColor: note === p ? colors.danger : (isDark ? colors.card : '#fff'),
                  borderColor: note === p ? colors.danger : '#FCA5A5' }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: note === p ? '#fff' : colors.danger }}>{p}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={note} onChangeText={setNote}
            placeholder="Or type your own reason…"
            placeholderTextColor={colors.textTertiary}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9,
              fontSize: TYPO.label, color: colors.textPrimary, backgroundColor: isDark ? colors.surface : '#fff' }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={reset} style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={confirmDecline} disabled={!note.trim()}
              style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.danger, opacity: note.trim() ? 1 : 0.5 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
