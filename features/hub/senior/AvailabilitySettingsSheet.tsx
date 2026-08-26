import { View, Text, Pressable, TextInput } from 'react-native';
import { PartyPopper } from 'lucide-react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import { GP } from './seniorTheme';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * AvailabilitySettingsSheet — Lend a Hand's Cheerleader Mode toggle, drive
 * days/hours, and weekly ride cap, extracted out of LendAHandCard's own
 * inline expand-in-place panel. The inline version pushed every dispatch
 * section below it down the page whenever opened — a real bottom sheet
 * keeps the Hub feed's own scroll position and layout stable regardless of
 * whether this is open, matching the app's canonical AppBottomSheet pattern
 * every other settings surface already uses.
 */
export function AvailabilitySettingsSheet({
  visible, onClose,
  cheerleaderMode, setCheerleaderMode,
  driveWindowDays, setDriveWindowDays,
  driveWindowStart, setDriveWindowStart,
  driveWindowEnd, setDriveWindowEnd,
  weeklyRideCap, setWeeklyRideCap,
  ridesThisWeek,
  active, colors, isDark,
}: {
  visible: boolean; onClose: () => void;
  cheerleaderMode: boolean; setCheerleaderMode: (fn: (prev: boolean) => boolean) => void;
  driveWindowDays: number[]; setDriveWindowDays: (fn: (prev: number[]) => number[]) => void;
  driveWindowStart: string; setDriveWindowStart: (v: string) => void;
  driveWindowEnd: string; setDriveWindowEnd: (v: string) => void;
  weeklyRideCap: number; setWeeklyRideCap: (v: number) => void;
  ridesThisWeek: number;
  active: { name: string }; colors: any; isDark: boolean;
}) {
  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Availability Settings"
      subtitle="When you're free to help with rides" accentColor={colors.accent}
      minHeight="45%" maxHeight="80%">
      <View style={{ gap: 14 }}>
        {/* Cheerleader Mode toggle */}
        <Pressable onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} toggled "Cheerleader Mode" on "Availability Settings" → setCheerleaderMode [features/hub/senior/AvailabilitySettingsSheet.tsx]`); setCheerleaderMode(m => !m); }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            padding: 12, borderRadius: 12, borderWidth: 1.5,
            borderColor: cheerleaderMode ? colors.accent : colors.border,
            backgroundColor: cheerleaderMode ? colors.accent + '12' : 'transparent' }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <PartyPopper size={14} color={cheerleaderMode ? colors.accent : colors.textPrimary} />
              <Text style={{ fontSize: GP.sub, fontWeight: '800',
                color: cheerleaderMode ? colors.accent : colors.textPrimary }}>
                Cheerleader Mode
              </Text>
            </View>
            <Text style={{ fontSize: GP.tiny, color: colors.textSecondary, marginTop: 2 }}>
              Hide all driving requests — I only want the celebration feed
            </Text>
          </View>
          <View style={{ width: 40, height: 24, borderRadius: 12,
            backgroundColor: cheerleaderMode ? colors.accent : colors.border,
            justifyContent: 'center', paddingHorizontal: 3 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
              alignSelf: cheerleaderMode ? 'flex-end' : 'flex-start' }} />
          </View>
        </Pressable>

        {!cheerleaderMode && (
          <>
            {/* Drive window days */}
            <View>
              <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                Drive Days
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {DAY_LABELS.map((d, i) => (
                  <Pressable key={i}
                    onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} selected "${d}" for "Drive Days" on "Availability Settings" [features/hub/senior/AvailabilitySettingsSheet.tsx]`); setDriveWindowDays(prev =>
                      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                    ); }}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: driveWindowDays.includes(i) ? colors.amber : colors.border,
                      backgroundColor: driveWindowDays.includes(i) ? colors.amberLight : 'transparent' }}>
                    <Text style={{ fontSize: GP.tiny, fontWeight: '800',
                      color: driveWindowDays.includes(i) ? colors.amberDark : colors.textSecondary }}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Time window */}
            <View>
              <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                Available Hours
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TextInput
                  style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 9, textAlign: 'center',
                    fontSize: GP.body, fontWeight: '700', color: colors.textPrimary,
                    borderColor: colors.border, backgroundColor: colors.card }}
                  value={driveWindowStart} onChangeText={setDriveWindowStart}
                  onBlur={() => console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} field="Available Hours start" on "Availability Settings" newValue=${driveWindowStart} [features/hub/senior/AvailabilitySettingsSheet.tsx]`)}
                  placeholder="14:00" placeholderTextColor={colors.textTertiary}
                />
                <Text style={{ fontSize: GP.sub, color: colors.textTertiary, fontWeight: '700' }}>to</Text>
                <TextInput
                  style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 9, textAlign: 'center',
                    fontSize: GP.body, fontWeight: '700', color: colors.textPrimary,
                    borderColor: colors.border, backgroundColor: colors.card }}
                  value={driveWindowEnd} onChangeText={setDriveWindowEnd}
                  onBlur={() => console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} field="Available Hours end" on "Availability Settings" newValue=${driveWindowEnd} [features/hub/senior/AvailabilitySettingsSheet.tsx]`)}
                  placeholder="17:30" placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>

            {/* Weekly cap */}
            <View>
              <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                Max Rides / Week ({ridesThisWeek} taken this week)
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Pressable key={n} onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} selected "${n}" for "Max Rides / Week" on "Availability Settings" [features/hub/senior/AvailabilitySettingsSheet.tsx]`); setWeeklyRideCap(n); }}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: weeklyRideCap === n ? colors.teal : colors.border,
                      backgroundColor: weeklyRideCap === n ? colors.teal + '18' : 'transparent' }}>
                    <Text style={{ fontSize: GP.sub, fontWeight: '900',
                      color: weeklyRideCap === n ? colors.teal : colors.textSecondary }}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
      </View>
    </AppBottomSheet>
  );
}
