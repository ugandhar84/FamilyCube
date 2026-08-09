import React from 'react';
import Svg, { Rect, Line, Path } from 'react-native-svg';

interface Props { size?: number; color?: string; }

export const CalendarIcon = React.memo(function CalendarIcon({ size = 12, color = '#000' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="17" rx="3" stroke={color} strokeWidth="1.8" />
      <Line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="1.8" />
      <Line x1="8"  y1="2" x2="8"  y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Line x1="16" y1="2" x2="16" y2="6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"
        stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
});

export default CalendarIcon;
