/**
 * KioskDueDateTimePicker — kiosk-only fork of DueDateTimePicker.tsx (the
 * date pill + time pill + native spinner block AddQuestModal's own "Due
 * Date & Time" uses), rebuilt on KioskDateTimePicker instead of a floating
 * Modal spinner card — same rationale as every other kiosk date field this
 * session (KioskAddMedForm/KioskAddVaxForm/KioskAddRecordForm/
 * KioskEventEditor): iOS renders inline, Android opens its own native
 * dialog. DueDateTimePicker.tsx itself is untouched.
 *
 * Same real merge behavior as the original: changing the date keeps the
 * existing time-of-day, changing the time keeps the existing calendar
 * date.
 */
import { Platform, View, Text, Pressable } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import { KioskDateTimePicker, openAndroidPicker } from './KioskDateTimePicker';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_TYPO, KIOSK_HIT } from '../kioskTheme';

export function KioskDueDateTimePicker({
  value, setValue,
  showDatePick, setShowDatePick,
  showTimePick, setShowTimePick,
  fmtDateLabel, fmtTimeLabel,
  accentColor,
  label = 'Due Date & Time',
  minimumDate,
}: {
  value: Date;
  setValue: React.Dispatch<React.SetStateAction<Date>>;
  showDatePick: boolean; setShowDatePick: React.Dispatch<React.SetStateAction<boolean>>;
  showTimePick: boolean; setShowTimePick: React.Dispatch<React.SetStateAction<boolean>>;
  fmtDateLabel: (d: Date) => string;
  fmtTimeLabel: (d: Date) => string;
  accentColor: string;
  label?: string;
  minimumDate?: Date;
}) {
  const { k, isDark } = useKioskColors();

  const onDateChange = (selected: Date) => {
    const merged = new Date(selected);
    merged.setHours(value.getHours(), value.getMinutes(), 0, 0);
    setValue(merged);
  };
  const onTimeChange = (selected: Date) => {
    const merged = new Date(value);
    merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setValue(merged);
  };

  const pillStyle = {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md,
  };

  return (
    <>
      {!!label && (
        <Text style={{ fontSize: KIOSK_TYPO.label, fontWeight: '700', color: k.textMuted, marginBottom: 5 }}>
          {label}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.sm }}>
        <Pressable
          style={[pillStyle, { backgroundColor: showDatePick ? accentColor + '18' : k.well, borderColor: showDatePick ? accentColor : k.cardBorder }]}
          onPress={() => {
            if (Platform.OS === 'android') openAndroidPicker({ mode: 'date', value, minimumDate, onChange: onDateChange });
            else { setShowDatePick(p => !p); setShowTimePick(false); }
          }}
        >
          <Calendar size={14} color={showDatePick ? accentColor : k.textMuted} />
          <Text style={{ fontSize: KIOSK_TYPO.label, fontWeight: '700', color: showDatePick ? accentColor : k.text }}>
            {fmtDateLabel(value)}
          </Text>
        </Pressable>

        <Pressable
          style={[pillStyle, { backgroundColor: showTimePick ? accentColor + '18' : k.well, borderColor: showTimePick ? accentColor : k.cardBorder }]}
          onPress={() => {
            if (Platform.OS === 'android') openAndroidPicker({ mode: 'time', value, onChange: onTimeChange });
            else { setShowTimePick(p => !p); setShowDatePick(false); }
          }}
        >
          <Clock size={14} color={showTimePick ? accentColor : k.textMuted} />
          <Text style={{ fontSize: KIOSK_TYPO.label, fontWeight: '700', color: showTimePick ? accentColor : k.text }}>
            {fmtTimeLabel(value)}
          </Text>
        </Pressable>
      </View>

      {Platform.OS === 'ios' && (
        <>
          <KioskDateTimePicker mode="date" visible={showDatePick} k={k} isDark={isDark}
            value={value} minimumDate={minimumDate} onChange={onDateChange} onDone={() => setShowDatePick(false)} />
          <KioskDateTimePicker mode="time" visible={showTimePick} k={k} isDark={isDark}
            value={value} onChange={onTimeChange} onDone={() => setShowTimePick(false)} />
        </>
      )}
    </>
  );
}
