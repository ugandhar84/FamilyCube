import React from 'react';
import Svg, { Circle, Path, Ellipse } from 'react-native-svg';

interface Props {
  type: 'breakfast' | 'lunch' | 'dinner';
  size?: number;
  color?: string;
}

export default function MealTimeIcon({ type, size = 24, color = '#7C5CBF' }: Props) {
  if (type === 'breakfast') {
    // Sunrise: arc of sun above horizon line
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* Horizon line */}
        <Path d="M 2 16 L 22 16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        {/* Sun arc */}
        <Circle cx="12" cy="16" r="6" fill="none" stroke={color} strokeWidth="1.5" />
        {/* Sun rays */}
        <Path d="M 12 4 L 12 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 6.5 7.5 L 8.5 9.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 3 13 L 5.5 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }

  if (type === 'lunch') {
    // Full sun high in sky
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* Sun circle */}
        <Circle cx="12" cy="10" r="4" fill="none" stroke={color} strokeWidth="1.5" />
        {/* Sun rays */}
        <Path d="M 12 2 L 12 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 12 16 L 12 18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 20 10 L 22 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 2 10 L 4 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 17.7 4.3 L 19.1 2.9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 4.9 17.1 L 6.3 18.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 17.7 15.7 L 19.1 17.1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M 4.9 2.9 L 6.3 4.3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }

  // Dinner: moon and stars
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Crescent moon */}
      <Circle cx="10" cy="12" r="5" fill="none" stroke={color} strokeWidth="1.5" />
      <Circle cx="11" cy="11" r="5" fill={color} opacity="0.1" />
      {/* Stars */}
      <Path d="M 18 6 L 18.5 7.5 L 20 8 L 18.5 8.5 L 18 10 L 17.5 8.5 L 16 8 L 17.5 7.5 Z" fill={color} />
      <Path d="M 20 14 L 20.3 15 L 21.3 15.3 L 20.3 15.6 L 20 16.6 L 19.7 15.6 L 18.7 15.3 L 19.7 15 Z" fill={color} />
      <Path d="M 16 18 L 16.4 19.2 L 17.6 19.6 L 16.4 20 L 16 21.2 L 15.6 20 L 14.4 19.6 L 15.6 19.2 Z" fill={color} />
    </Svg>
  );
}
