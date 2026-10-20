import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { openInMaps } from '@/features/calendar/components/EventCard';
import { useFamilyStore } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { acceptSos, resolveSos } from '@/lib/sos';

/** The card the app posts to the Grandparent squad channel when someone presses SOS: who, when, and where (tap the address for maps). */
export function SosCardBubble({ payload, colors, onLongPress }: { payload: Record<string, any>; colors: any; onLongPress?: () => void }) {
  const members = useFamilyStore(s => s.members);
  const viewer = useFamilyStore(s => s.members.find(m => m.id === s.activeMemberId));
  // Cards posted before the request id was attached are matched to their request by sender name and time (within 3 minutes).
  const req = useKidRequestStore(s => {
    if (payload.requestId) return s.requests.find(r => r.id === payload.requestId);
    const at = payload.at ? new Date(payload.at).getTime() : NaN;
    if (!Number.isFinite(at)) return undefined;
    const names = new Map(useFamilyStore.getState().members.map(m => [m.id, m.name.split(' ')[0]]));
    return s.requests
      .filter(r => r.type === 'emergency' && names.get(r.fromMemberId) === payload.name && Math.abs(new Date(r.requestedAt).getTime() - at) < 3 * 60_000)
      .sort((a, b) => Math.abs(new Date(a.requestedAt).getTime() - at) - Math.abs(new Date(b.requestedAt).getTime() - at))[0];
  });
  const [busy, setBusy] = useState(false);
  const isSender = !!viewer && (viewer.id === payload.senderId || (!payload.senderId && viewer.id === req?.fromMemberId));
  const status = req?.status;
  const acceptedBy = req?.respondedBy ? members.find(m => m.id === req.respondedBy)?.name?.split(' ')[0] : undefined;
  const acceptedAt = req?.respondedAt ? new Date(req.respondedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const when = payload.at ? new Date(payload.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  const address: string | undefined = payload.address && payload.address !== 'Location not shared' && payload.address !== 'Location unavailable' ? payload.address : undefined;
  const query = address ?? (payload.lat != null && payload.lng != null ? `${payload.lat},${payload.lng}` : undefined);
  return (
    <Pressable onLongPress={onLongPress} style={{ borderRadius: 18, padding: 14, gap: 6, minWidth: 240, backgroundColor: colors.dangerLight, borderWidth: 2, borderColor: colors.danger }}>
      <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 0.8, color: colors.danger }}>🚨 EMERGENCY SOS</Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>{payload.name ?? 'Someone'} needs help{when ? ` · ${when}` : ''}</Text>
      {query ? (
        <Text onPress={() => openInMaps(query)} accessibilityRole="link" style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>
          📍 {address ?? 'Open location in maps'}
        </Text>
      ) : (
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>Location was not shared. Call them.</Text>
      )}
      {/* Status and the one action that fits who is looking: a parent can accept, the sender can say they are OK now. */}
      {status === 'approved' && (
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.success }}>✓ Accepted by {acceptedBy ?? 'a parent'}{acceptedAt ? ` · ${acceptedAt}` : ''}, on the way</Text>
      )}
      {(status === 'cancelled' || status === 'completed') && (
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.success }}>✓ Resolved</Text>
      )}
      {status === 'pending' && viewer?.role === 'parent' && (
        <Pressable disabled={busy} onPress={() => run(() => acceptSos(req!.id, viewer.id))} accessibilityRole="button" accessibilityLabel="Accept SOS"
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.danger + '40', marginTop: 4 }}>
          <Text style={{ fontSize: 18, color: colors.success }}>✓</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.success }}>Accept, I'm on my way</Text>
        </Pressable>
      )}
      {isSender && (status === 'pending' || status === 'approved') && (
        <Pressable disabled={busy} onPress={() => run(() => resolveSos(req!.id, viewer!))} accessibilityRole="button" accessibilityLabel="I'm OK now"
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.danger + '40', marginTop: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.primary }}>I'm OK now</Text>
        </Pressable>
      )}
      {!status && (
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>{payload.role ?? 'Family member'}</Text>
      )}
    </Pressable>
  );
}

/** The "I'm OK now" card posted when the person resolves their SOS: green, calm, with the time. */
export function SosSafeCardBubble({ payload, colors, onLongPress }: { payload: Record<string, any>; colors: any; onLongPress?: () => void }) {
  const when = payload.at ? new Date(payload.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  return (
    <Pressable onLongPress={onLongPress} style={{ borderRadius: 18, padding: 14, gap: 6, minWidth: 240, backgroundColor: colors.successLight, borderWidth: 2, borderColor: colors.success }}>
      <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 0.8, color: colors.success }}>✅ SOS RESOLVED</Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>{payload.name ?? 'Someone'} is OK now{when ? ` · ${when}` : ''}</Text>
      <Text style={{ fontSize: 13, color: colors.textSecondary }}>No further help is needed. Thank you to everyone who was on the way.</Text>
    </Pressable>
  );
}
