import { View, Text, Pressable, TextInput } from 'react-native';
import { PartyPopper } from 'lucide-react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import { showToast } from '@/components/AppToast';
import { GP } from './seniorTheme';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// These free-text fields fed straight into SeniorView.tsx's
// withinDriveWindow, which parses via `.split(':').map(Number)` — a
// malformed value ("2pm", "2:00" meaning PM, a stray letter) silently
// produced NaN comparisons, which silently stopped open rides from
// appearing on this screen with no error shown anywhere. Accepts a few
// common shorthand forms (12-hour with am/pm, a bare hour) and normalizes
// to 24-hour HH:MM; anything it can't confidently parse is rejected and
// reverted rather than let through as garbage.
function normalizeTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return null;
  }
  m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const isPm = m[3] === 'pm';
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    if (h === 12) h = 0;
    if (isPm) h += 12;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

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
        <Pressable onPress={() => { setCheerleaderMode(m => !m); }}
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
                    onPress={() => { setDriveWindowDays(prev =>
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
                  onBlur={() => {
                    const normalized = normalizeTimeInput(driveWindowStart);
                    if (normalized) setDriveWindowStart(normalized);
                    else { setDriveWindowStart('14:00'); showToast("Couldn't read that time — reset to 2:00 PM", 'info'); }
                  }}
                  placeholder="14:00" placeholderTextColor={colors.textTertiary}
                />
                <Text style={{ fontSize: GP.sub, color: colors.textTertiary, fontWeight: '700' }}>to</Text>
                <TextInput
                  style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 9, textAlign: 'center',
                    fontSize: GP.body, fontWeight: '700', color: colors.textPrimary,
                    borderColor: colors.border, backgroundColor: colors.card }}
                  value={driveWindowEnd} onChangeText={setDriveWindowEnd}
                  onBlur={() => {
                    const normalized = normalizeTimeInput(driveWindowEnd);
                    if (normalized) setDriveWindowEnd(normalized);
                    else { setDriveWindowEnd('17:30'); showToast("Couldn't read that time — reset to 5:30 PM", 'info'); }
                  }}
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
                  <Pressable key={n} onPress={() => { setWeeklyRideCap(n); }}
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

        {/* Every field here commits live with no explicit save step and no
            way to review before it takes effect — for a setting this
            consequential (it silently hides/shows every ride request on
            the Hub), an older/less tech-savvy user closing via backdrop
            tap or swipe has no clear signal that what they set actually
            stuck. A "Done" button gives an explicit, confidence-building
            close point; it doesn't change the underlying live-commit
            behavior, since every value is already saved the moment it's
            set. */}
        <Pressable onPress={onClose}
          style={{ marginTop: 4, borderRadius: 12, backgroundColor: colors.accent, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: GP.body, fontWeight: '800', color: '#fff' }}>Done</Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}
