import React from 'react';
import Svg, { Path } from 'react-native-svg';

// ─── Icons ─────────────────────────────────────────────────────────────────────
export const X = ({ c, size = 14 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);
