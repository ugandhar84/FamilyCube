import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { fmtTime } from '../hubUtils';

// A kid's ride request never includes a pickup TIME — they usually don't
// know precisely when practice/class ends, and forcing a guess produced a
// confidently wrong time (or, per QA Round 12 Finding C-2, silently no
// time at all if the picker was never opened). The parent decides pickup
// timing instead, at the moment they're already deciding the ride, with
// better information and in one tap — this is that one tap. Pre-filled at
// event start + 90 minutes; +/- 15 min per tap.
export function PickupTimeStepper({ value, onChange, accentColor, colors }: {
  value: string; onChange: (time: string) => void; accentColor: string; colors: any;
}) {
  const step = (deltaMin: number) => {
    const [h, m] = value.split(':').map(Number);
    const total = (((h ?? 0) * 60 + (m ?? 0) + deltaMin) % (24 * 60) + 24 * 60) % (24 * 60);
    onChange(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Pickup</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: accentColor + '15',
        borderRadius: 10, borderWidth: 1, borderColor: accentColor + '40', paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accentColor, minWidth: 62, textAlign: 'center' }}>
          {fmtTime(value)}
        </Text>
        <View style={{ gap: 1 }}>
          <Pressable onPress={() => { console.log(`[UserAction] FORM screen=Hub role=parent selected "+15 min" for "Pickup Time Stepper" currentValue=${value} [features/hub/parent/PickupTimeStepper.tsx:32]`); step(15); }} hitSlop={{ top: 4, bottom: 2, left: 6, right: 6 }}>
            <ChevronUp size={12} color={accentColor} />
          </Pressable>
          <Pressable onPress={() => { console.log(`[UserAction] FORM screen=Hub role=parent selected "-15 min" for "Pickup Time Stepper" currentValue=${value} [features/hub/parent/PickupTimeStepper.tsx:35]`); step(-15); }} hitSlop={{ top: 2, bottom: 4, left: 6, right: 6 }}>
            <ChevronDown size={12} color={accentColor} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
