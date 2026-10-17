/**
 * KioskAddressInput — the phone's address autocomplete (suggestions as you type,
 * biased to where the device is) for any kiosk form field that holds a place.
 * Thin wrapper so every kiosk form gets it with the same two lines.
 */
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { useTheme } from '@/lib/ThemeContext';
import { useKioskColors } from '../kioskPalette';

export function KioskAddressInput({ value, onChange, placeholder = 'Address or place', accent }: {
  value: string; onChange: (t: string) => void; placeholder?: string; accent?: string;
}) {
  const { colors } = useTheme();
  const { k } = useKioskColors();
  return (
    <LocationAutocompleteInput
      value={value} onChangeText={onChange} placeholder={placeholder}
      colors={colors} accent={accent ?? k.primary}
    />
  );
}
