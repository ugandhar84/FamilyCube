/**
 * KioskDateTimePicker — kiosk-only date/time picker, replacing
 * PickerOverlay (features/calendar/components/eventForm/PickerOverlay.tsx)
 * in KioskAddMedForm.tsx/KioskAddVaxForm.tsx specifically
 * [live-reported: "forms dates are using the date pickets like date time
 * pickers inline not the bottom sheet date / time pickers"].
 *
 * Built as its own kiosk-only component rather than changing
 * PickerOverlay itself — that component is shared by ~9 real screens app-
 * wide (EventFormModal, KidRequestModal, CreateRunSheet, MealFormSheet,
 * several other kiosk forms), most of which were never part of this
 * conversation, and the user explicitly said not to touch any mobile file
 * ["i dont want to modify anything in the mobile app"]. PickerOverlay.tsx
 * and every one of its other real callers are completely untouched by
 * this file.
 *
 * Platform behavior is a real capability split, not a style choice:
 * @react-native-community/datetimepicker's `display="inline"` (a true
 * embedded calendar grid, no popup) only exists on iOS — Android's
 * picker has no inline mode at all, only a spinner or the OS's own native
 * calendar/clock dialog. So:
 *   - iOS: renders inline, directly in the form, no Modal at all — this
 *     is the literal "inline, not bottom sheet" fix.
 *   - Android: renders nothing itself and instead calls the native
 *     imperative API directly (DateTimePickerAndroid.open), which shows
 *     Android's own system calendar/clock dialog — the real native
 *     picker for that OS, not PickerOverlay's spinner-in-a-floating-card.
 */
import { Platform, View, Text, Pressable } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { KioskColors } from '../kioskPalette';
import { KIOSK_RADIUS, KIOSK_SPACE, KIOSK_TYPO } from '../kioskTheme';

export function KioskDateTimePicker({ mode, value, onChange, minimumDate, k, isDark, visible = true, onDone }: {
  mode: 'date' | 'time';
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
  k: KioskColors;
  // Real isDark from useKioskColors(), not guessed from a color value.
  // [live-reported: "in dark theme the calender digits are not even
  // visible"] — the previous version compared k.text against a hardcoded
  // hex literal ('#FDFCF9') that didn't actually match this palette's own
  // dark-mode text color, so themeVariant silently resolved to 'light'
  // in dark mode — iOS then painted its own light-on-white calendar
  // digits over this component's dark k.well background, unreadable.
  isDark: boolean;
  /** iOS only — Android has no persistent inline view to hide/show; its
   *  picker is a one-shot imperative dialog instead (see openAndroidPicker
   *  below), so this prop only matters for the iOS branch. */
  visible?: boolean;
  /** Closes the picker (sets the caller's own visible/showXPicker state
   *  false) — PickerOverlay's floating card always had a "Done" button to
   *  dismiss it; going inline dropped that affordance entirely, leaving no
   *  way to close the calendar once opened [live-reported: "show done one
   *  the calender also to close it"]. */
  onDone: () => void;
}) {
  if (Platform.OS === 'android') return null; // Android uses openAndroidPicker below instead.
  if (!visible) return null;
  return (
    <View style={{ borderRadius: KIOSK_RADIUS.md, borderWidth: 1, borderColor: k.cardBorder, backgroundColor: k.well, overflow: 'hidden' }}>
      <DateTimePicker
        value={value}
        mode={mode}
        display="inline"
        minimumDate={minimumDate}
        onChange={(_, d) => { if (d) onChange(d); }}
        themeVariant={isDark ? 'dark' : 'light'}
        accentColor={k.primary}
      />
      <Pressable
        onPress={onDone}
        style={{
          alignSelf: 'flex-end', margin: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.xs,
          borderRadius: KIOSK_RADIUS.sm, backgroundColor: k.primary,
        }}
        accessibilityRole="button"
        accessibilityLabel="Done"
      >
        <Text style={{ color: k.onPrimary, fontWeight: '800', fontSize: KIOSK_TYPO.label }}>Done</Text>
      </Pressable>
    </View>
  );
}

/** Android's own native calendar/clock dialog — call this directly from a
 *  Pressable's onPress instead of rendering <KioskDateTimePicker> at all
 *  when Platform.OS === 'android'. */
export function openAndroidPicker({ mode, value, onChange, minimumDate }: {
  mode: 'date' | 'time';
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
}) {
  DateTimePickerAndroid.open({
    value, mode, is24Hour: false, minimumDate,
    onChange: (_, d) => { if (d) onChange(d); },
  });
}
