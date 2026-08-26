import { View, Text, Pressable } from 'react-native';
import { UserCheck, X } from 'lucide-react-native';
import { fmtTime } from '../hubUtils';
import { KID } from './kidTheme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { eventAssignee } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';

// A driver has been named for a kid's ride request but hasn't tapped
// confirm yet — the gap between "nobody's looked at my request" (the
// pending-rides alert row in KidUrgentAlerts) and "confirmed, it's
// happening" (KidRideBanner). Deliberately a plain named-driver banner, not
// a countdown — there's nothing to count down to until the driver actually
// confirms, so borrowing KidRideBanner's countdown states here would just
// show a misleading "arrives in Nm" for a ride that isn't locked in yet.
export function AwaitingDriverBanner({ ev, colors, isDark, onDismiss }: {
  ev: FamilyEvent; colors: any; isDark: boolean;
  onDismiss: (id: string) => void;
}) {
  // Was ev.helper?.split(' ')[0] — undefined for every driverName-based
  // kid ride request, rendering "Someone" here even after a real driver
  // was named (QA sweep, kid-role audit, High).
  const driverFirst = eventAssignee(ev).name?.split(' ')[0] ?? 'Someone';

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <View style={{ borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: isDark ? BRAND.purple + '18' : BRAND.purple + '0C',
        borderWidth: 1.5, borderColor: BRAND.purple + '40' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
          <UserCheck size={22} color={BRAND.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KID.body, fontWeight: '900', color: BRAND.purple }}>
            {driverFirst} was asked to drive you
          </Text>
          <Text style={{ fontSize: KID.tiny, color: colors.textSecondary, marginTop: 2 }}>
            {ev.title} · {fmtTime(ev.time)} · waiting for {driverFirst} to confirm
          </Text>
        </View>
        <Pressable onPress={() => { onDismiss(`awaiting-${ev.id}`); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}
