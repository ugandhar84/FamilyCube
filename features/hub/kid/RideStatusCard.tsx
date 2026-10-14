/**
 * RideStatusCard — full-width Hub-home entry point into AskParentUnifiedPage's
 * ride pill, decoupled from the Ask Parent landing page per explicit
 * direction ("decouple ride from ask parent and keep its own quick
 * action") — its own card, own icon/accent (amber, matching
 * AskParentHubScreen's own 'ride' tile color), opens the ride form
 * directly instead of going through the Ask Parent picker first. Built
 * on the shared HubFullWidthActionCard chrome.
 *
 * confirmedRide carries the actual ongoing/upcoming ride FamilyEvent so
 * the card can show real metadata (date · time · driver) below the
 * title instead of just the bare "Confirmed · <title>" subtitle string
 * [live-requested: "in kids view ride card we can show ongoing/upnext
 * one event with nice meta data"]. Falls back to the old plain subtitle
 * when no event is passed, so existing callers aren't broken.
 */
import { Car, Clock, User } from 'lucide-react-native';
import { View, Text } from 'react-native';
import { HubFullWidthActionCard } from './HubFullWidthActionCard';
import { fmtHumanDateShort, fmtTime } from '../hubUtils';

export function RideStatusCard({
  colors, isDark, pendingCount, confirmedLabel, confirmedRideDate, confirmedRideTime, driverName, onPress,
}: {
  colors: any; isDark: boolean;
  pendingCount: number;
  confirmedLabel?: string;
  // Date/time of the confirmed ride, if any — formatted via fmtHumanDateShort/
  // fmtTime below (12h human format, per CLAUDE.md's non-negotiable rule).
  confirmedRideDate?: string;
  confirmedRideTime?: string;
  driverName?: string;
  onPress: () => void;
}) {
  const hasConfirmed = !!confirmedLabel;
  const hasPending = pendingCount > 0;
  const metaLabel = confirmedRideDate
    ? `${fmtHumanDateShort(confirmedRideDate)}${confirmedRideTime ? ` · ${fmtTime(confirmedRideTime)}` : ''}`
    : undefined;

  return (
    <HubFullWidthActionCard
      colors={colors} isDark={isDark}
      Icon={Car} iconBg={colors.amberLight} iconColor={colors.amber}
      title="Ask for a Ride"
      subtitle={
        hasConfirmed ? confirmedLabel!
          : hasPending ? `${pendingCount} waiting on a reply`
          : 'Pickup, drop-off, or both'
      }
      badgeLabel={hasConfirmed ? 'Confirmed' : hasPending ? 'Awaiting reply' : undefined}
      badgeBg={colors.amberLight} badgeColor={colors.amber}
      onPress={onPress}
    >
      {hasConfirmed && (metaLabel || driverName) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 }}>
          {metaLabel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Clock size={12} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600' }}>{metaLabel}</Text>
            </View>
          )}
          {driverName && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <User size={12} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600' }}>{driverName}</Text>
            </View>
          )}
        </View>
      )}
    </HubFullWidthActionCard>
  );
}
