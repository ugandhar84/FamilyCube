import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface CatIconPathProps {
  category: string;
  color: string;
  size?: number;
}

export const CatIconPath = React.memo(function CatIconPath({ category, color, size = 14 }: CatIconPathProps) {
  const s = size;
  switch (category) {
    case 'milestone':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" fill={color} />
          <Path d="M9 21V12h6v9" fill="white" fillOpacity={0.6} />
        </Svg>
      );
    case 'health':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill={color} />
        </Svg>
      );
    case 'achievement':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill={color} />
        </Svg>
      );
    default:
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" fill={color} />
          <Circle cx="12" cy="13" r="4" fill="white" fillOpacity={0.5} />
        </Svg>
      );
  }
});
