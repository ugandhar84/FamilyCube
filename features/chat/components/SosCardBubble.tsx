import { View, Text, Pressable } from 'react-native';
import { openInMaps } from '@/features/calendar/components/EventCard';

/** The card the app posts to the Grandparent squad channel when someone presses SOS: who, when, and where (tap the address for maps). */
export function SosCardBubble({ payload, colors, onLongPress }: { payload: Record<string, any>; colors: any; onLongPress?: () => void }) {
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
      {query ? (
        // Flat action: no filled button, just a divider and a bold blue label.
        <Pressable onPress={() => openInMaps(query)} accessibilityRole="button" accessibilityLabel="Open in maps"
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderTopWidth: 1, borderTopColor: colors.danger + '40' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.primary }}>Open in Maps</Text>
        </Pressable>
      ) : null}
      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{payload.role ?? 'Family member'} · Accept it from Review inbox, Grandparent requests.</Text>
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
