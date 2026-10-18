/**
 * AskCubeRequestCard — pending kid requests and reward requests as one compact card, same shape as the schedule and chore
 * cards: a row per request (who, what, coins) with Approve and Decline on the row. Parents only.
 */
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { RHYTHM } from '@/constants/theme';

export interface AskCubeRequest {
  id: string; kind: 'kid_request' | 'redemption'; title: string; label: string; who: string | null; whoId?: string | null; when?: string | null; coins: number;
}
export type RequestAction = 'approve' | 'decline';

const TYPE_LABEL: Record<string, string> = { ride: 'Ride', help: 'Help', tutor: 'Tutor', permission: 'Permission', appointment: 'Appointment', checkin: 'Check-in', Reward: 'Reward' };

export default function AskCubeRequestCard({ requests, doneKeys, onAction }: {
  requests: AskCubeRequest[]; doneKeys?: Record<string, string>; onAction: (r: AskCubeRequest, a: RequestAction) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ width: '94%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' }}>
      {requests.map((r, i) => {
        const done = doneKeys?.[r.id];
        const sub = [r.who, r.coins ? `${r.coins} coins` : null, r.when].filter(Boolean).join(' · ');
        return (
          <View key={r.id} style={{ paddingHorizontal: RHYTHM.card - 4, paddingVertical: 11, gap: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary, lineHeight: 18 }}>{r.title}</Text>
              <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: r.kind === 'redemption' ? colors.amber + '24' : colors.primaryLight }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: r.kind === 'redemption' ? colors.amber : colors.primary }}>{TYPE_LABEL[r.label] ?? r.label}</Text>
              </View>
            </View>
            {!!sub && <Text style={{ fontSize: 12, color: colors.textSecondary }}>{sub}</Text>}
            {done ? (
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.success }}>{done}</Text>
            ) : (
              <View style={{ flexDirection: 'row', gap: RHYTHM.inline }}>
                <Pressable onPress={() => onAction(r, 'approve')} accessibilityRole="button" accessibilityLabel="Approve"
                  style={{ minHeight: 36, paddingHorizontal: 16, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textInverse }}>Approve</Text>
                </Pressable>
                <Pressable onPress={() => onAction(r, 'decline')} accessibilityRole="button" accessibilityLabel="Decline"
                  style={{ minHeight: 36, paddingHorizontal: 16, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>Decline</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
