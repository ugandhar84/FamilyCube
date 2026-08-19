import { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { Navigation, Car, MapPin } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { SectionCard } from '../hubComponents';
import { fmtTime } from '../hubUtils';

const DEFAULT_ETA = 10;
// A driver can't sanely be "en route" to something hours away — only let
// dispatch open within this window before the ride's scheduled time.
const DISPATCH_WINDOW_HOURS = 1;

function formatCountdown(hours: number): string {
  const totalMin = Math.round(hours * 60);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.max(totalMin, 1)}m`;
}

export function EnRouteBanner({ colors, isDark, onDispatchRide, onPickupDone, onCancelTrip, nextRide, activeTrip, onUpdateEta }: {
  colors: any; isDark: boolean;
  // Dispatches immediately, no modal, no picker — matches the mock exactly:
  // tapping En Route flips the card in place to the active state right
  // there. Uses nextRide's kid when one is linked, else a generic "family"
  // broadcast with no named person.
  onDispatchRide: (etaMinutes: number) => void;
  // Clears the trip AND confirms the pickup happened — posts a ✅ to chat.
  onPickupDone: () => void;
  // Clears the trip WITHOUT claiming a pickup happened — for a mis-tap or
  // a plan that changed. Posts no confirmation, just quietly ends it.
  onCancelTrip: () => void;
  // The next confirmed ride this parent is driving today, if any — lets the
  // idle state link to a real pickup instead of only offering a blank
  // "broadcast something" button. hoursUntil gates dispatch: a driver can't
  // start "En Route" for something hours away — only within the window.
  nextRide?: { kidName: string; kidEmoji?: string; title: string; time?: string; location?: string; hoursUntil: number } | null;
  // Live "en route" state, lifted from HubScreen (set when dispatched) —
  // lets this section show the mock's "EN ROUTE" badge and in-place ETA
  // slider instead of only ever rendering the idle state. kidEmoji/
  // driverEmoji cover any family member, not just kids — a parent can be
  // picked up by another parent, or a grandparent.
  activeTrip?: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; etaMinutes: number; startedAtMs?: number } | null;
  onUpdateEta?: (etaMinutes: number) => void;
}) {
  const isActive = !!activeTrip;

  // Countdown timer — ticks every second so both the "N min left" label and
  // the progress bar visibly count down in real time, not just a static
  // slider value that only moves when dragged.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [isActive]);

  const elapsedMin = isActive && activeTrip!.startedAtMs ? (now - activeTrip!.startedAtMs) / 60_000 : 0;
  const remainingMin = isActive ? Math.max(0, Math.ceil(activeTrip!.etaMinutes - elapsedMin)) : 0;
  const progress = isActive ? Math.max(0, Math.min(1, elapsedMin / Math.max(activeTrip!.etaMinutes, 1))) : 0;
  // Overdue by 5+ min past ETA with no Pickup Done tap — matches the
  // threshold HubScreen uses to fire the one-time 🚨 chat alert, so the
  // card visually reads alarming right when that alert would go out.
  const isOverdue = isActive && elapsedMin - activeTrip!.etaMinutes >= 5;

  // Small header-level indicator for who's currently on duty (active trip)
  // or up next (a linked ride waiting to be dispatched) — visible even
  // while the section is collapsed, not just in the expanded body.
  const dutyEmoji = isActive ? activeTrip!.kidEmoji : nextRide?.kidEmoji;

  const activeColor = isOverdue ? colors.danger : colors.success;

  // A linked ride only unlocks for dispatch within DISPATCH_WINDOW_HOURS of
  // its scheduled time — no dispatching "En Route" to a 6 PM appointment
  // at 2 PM. A ride with no hoursUntil info (shouldn't happen for a real
  // nextRide) is treated as locked, not open, to fail safe.
  const rideLocked = !!nextRide && (nextRide.hoursUntil === undefined || nextRide.hoursUntil > DISPATCH_WINDOW_HOURS);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={<Car size={16} color={colors.success} />}
        title="Pick-up Radar"
        accent={colors.success}
        headerAccessory={dutyEmoji ? <Text style={{ fontSize: 14 }}>{dutyEmoji}</Text> : undefined}
        subtitle={isActive ? undefined : (nextRide ? undefined : 'Broadcast your trip to family chat')}
        statusBadge={isActive ? (isOverdue ? 'Overdue' : 'En Route') : undefined}
        badgeColor={activeColor}
        actionBtn={isActive || rideLocked ? undefined : { label: 'En Route', onPress: () => onDispatchRide(DEFAULT_ETA), color: colors.success }}
        colors={colors} isDark={isDark}>
        {isActive ? (
          <View style={{
            backgroundColor: isDark ? activeColor + '15' : (isOverdue ? colors.dangerLight : colors.successLight),
            borderRadius: 16, borderWidth: 1, borderColor: activeColor + '40',
            padding: 14, gap: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 22 }}>{activeTrip!.driverEmoji ?? '🚗'}</Text>
              <Navigation size={14} color={activeColor} />
              <Text style={{ fontSize: 22 }}>{activeTrip!.kidEmoji ?? '🧒'}</Text>
              <Text style={{ flex: 1, marginLeft: 2, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                {activeTrip!.driverName} picking up {activeTrip!.kidName}
              </Text>
            </View>

            {/* Countdown progress bar — ticks down every second in real
                time as the trip approaches its ETA, separate from the
                slider below (which adjusts the ETA target itself). Turns
                danger-red once overdue, matching the header pill. */}
            <View style={{ height: 6, borderRadius: 3, backgroundColor: activeColor + '25', overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: activeColor, borderRadius: 3 }} />
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: activeColor + '30', paddingTop: 10, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: activeColor }}>ETA Adjuster</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: activeColor }}>
                  {remainingMin > 0 ? `${remainingMin} min left` : isOverdue ? 'Overdue — confirm pickup' : 'Arriving now'}
                </Text>
              </View>
              <Slider
                minimumValue={5} maximumValue={45} step={5}
                value={activeTrip!.etaMinutes}
                onValueChange={(v: number) => onUpdateEta?.(v)}
                minimumTrackTintColor={activeColor}
                maximumTrackTintColor={activeColor + '30'}
                thumbTintColor={activeColor}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <Pressable
                  onPress={() => Alert.alert(
                    'Cancel trip?',
                    'This ends the trip without confirming a pickup — use this if you started En Route by mistake.',
                    [
                      { text: 'Keep trip', style: 'cancel' },
                      { text: 'Cancel Trip', style: 'destructive', onPress: onCancelTrip },
                    ]
                  )}
                  style={{
                    flex: 1, borderWidth: 1.5, borderColor: activeColor + '50', borderRadius: 12,
                    paddingVertical: 10, alignItems: 'center',
                  }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: activeColor }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={onPickupDone} style={{
                  flex: 2, backgroundColor: activeColor, borderRadius: 12,
                  paddingVertical: 10, alignItems: 'center',
                }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Pickup Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : nextRide ? (
          <Pressable
            disabled={rideLocked}
            onPress={() => onDispatchRide(DEFAULT_ETA)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: isDark ? colors.card : '#FFFFFF',
              borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
              padding: 12, opacity: rideLocked ? 0.75 : 1,
              shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
              shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
              elevation: isDark ? 3 : 2,
            }}>
            <Text style={{ fontSize: 22 }}>{nextRide.kidEmoji ?? '🧒'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.success, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Up Next
              </Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }}>
                {nextRide.title} — {nextRide.kidName}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                {nextRide.time && (
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{fmtTime(nextRide.time)}</Text>
                )}
                {nextRide.location && (
                  <>
                    <MapPin size={11} color={colors.textTertiary} />
                    <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }} numberOfLines={1}>{nextRide.location}</Text>
                  </>
                )}
              </View>
            </View>
            {rideLocked ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontWeight: '700' }}>Opens in</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontWeight: '800' }}>
                  {formatCountdown((nextRide.hoursUntil ?? DISPATCH_WINDOW_HOURS) - DISPATCH_WINDOW_HOURS)}
                </Text>
              </View>
            ) : (
              <View style={{ backgroundColor: colors.success, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>En Route</Text>
              </View>
            )}
          </Pressable>
        ) : (
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
            No active trip. Tap En Route to broadcast an ETA to the family.
          </Text>
        )}
      </SectionCard>
    </View>
  );
}
