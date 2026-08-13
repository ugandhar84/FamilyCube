/**
 * Shared SVG icon library — themed, no external icon font dependency.
 * Each icon accepts `c` (color) and optional `size` (default varies per icon).
 * Import: import { I } from '@/components/icons';
 */
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

export const I = {
  PlusCircle: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,16 M8,12 L16,12" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  ThumbsUp: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14,9 V5 C14,3.3 12.7,2 11,2 L7,13 V22 H18.3 C19.3,22 20.1,21.3 20.3,20.3 L21.7,12.3 C21.9,11 20.9,10 19.6,10 H14 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M7,13 H4 C2.9,13 2,13.9 2,15 V20 C2,21.1 2.9,22 4,22 H7" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Camera: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M23,19 C23,20.1 22.1,21 21,21 H3 C1.9,21 1,20.1 1,19 V8 C1,6.9 1.9,6 3,6 H7 L9,3 H15 L17,6 H21 C22.1,6 23,6.9 23,8 Z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={4} stroke={c} strokeWidth={2} fill="none" />
    </Svg>
  ),
  CheckCircle: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8,13 L11,16 L16,8" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Check: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5,13 L9,17 L19,7" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Bot: ({ c, size = 18 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={9} cy={14} r={1.5} fill={c} />
      <Circle cx={15} cy={14} r={1.5} fill={c} />
      <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Sparkles: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" stroke={c} strokeWidth={1.5} fill={c} strokeLinejoin="round" />
    </Svg>
  ),
  Flame: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12,22 C8.7,22 6,19.3 6,16 C6,12 9,9 10,8 C10,10 12,11 12,13 C13.5,11.5 14,9.5 13,8 C15,9 18,12 18,16 C18,19.3 15.3,22 12,22 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Award: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={6} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8.2,14.2 L6,22 L12,19 L18,22 L15.8,14.2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  AlertCircle: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,13 M12,16 L12,17" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  AlertTriangle: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10.3,3.3 L2.2,18 C1.7,18.9 2.4,20 3.5,20 H20.5 C21.6,20 22.3,18.9 21.8,18 L13.7,3.3 C13.2,2.4 10.8,2.4 10.3,3.3 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M12,9 L12,13 M12,16 L12,17" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  RotateCcw: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M1,4 L1,10 L7,10" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M3.5,15 C4.8,18.3 8,20.5 11.8,20.5 C16.8,20.5 20.8,16.5 20.8,11.5 C20.8,6.5 16.8,2.5 11.8,2.5 C8,2.5 4.8,4.7 3.5,8 L1,4" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  X: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6,6 L18,18 M18,6 L6,18" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Zap: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13,2 L4.5,13.5 H11 L11,22 L19.5,10.5 H13 L13,2 Z" stroke={c} strokeWidth={1.5} fill={c} strokeLinejoin="round" />
    </Svg>
  ),
  Coins: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={9} r={7} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M15.5,5.5 C18.5,6.5 20.5,9.3 20.5,12.5 C20.5,16.6 17.1,20 13,20 C10.5,20 8.3,18.8 7,17" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M9,6.5 L9,9 L11,9.5" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Photo: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M23,19 C23,20.1 22.1,21 21,21 H3 C1.9,21 1,20.1 1,19 V8 C1,6.9 1.9,6 3,6 H7 L9,3 H15 L17,6 H21 C22.1,6 23,6.9 23,8 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={4} stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Trash: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3,6 L21,6 M19,6 L18,20 C18,21.1 17.1,22 16,22 H8 C6.9,22 6,21.1 6,20 L5,6" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M9,6 L9,4 C9,3.4 9.4,3 10,3 H14 C14.6,3 15,3.4 15,4 L15,6" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Mail: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4,4 H20 C21.1,4 22,4.9 22,6 V18 C22,19.1 21.1,20 20,20 H4 C2.9,20 2,19.1 2,18 V6 C2,4.9 2.9,4 4,4 Z" stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M22,6 L12,13 L2,6" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  ChevronUp: ({ c, size = 16 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18,15 L12,9 L6,15" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  ChevronDown: ({ c, size = 16 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6,9 L12,15 L18,9" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  ChevronRight: ({ c, size = 16 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9,6 L15,12 L9,18" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  User: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M4,20 C4,16.7 7.6,14 12,14 C16.4,14 20,16.7 20,20" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Users: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={7} r={4} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M2,21 C2,17.7 5.1,15 9,15" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M16,11 C18.2,11 20,9.2 20,7 C20,4.8 18.2,3 16,3" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M22,21 C22,17.7 19.3,15 16,15 C14.7,15 13.5,15.4 12.5,16" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Edit2: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M11,4 H4 C2.9,4 2,4.9 2,6 V20 C2,21.1 2.9,22 4,22 H18 C19.1,22 20,21.1 20,20 V13" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M18.5,2.5 C19.3,1.7 20.7,1.7 21.5,2.5 C22.3,3.3 22.3,4.7 21.5,5.5 L12,15 L8,16 L9,12 L18.5,2.5 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  MapPin: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21,10 C21,17 12,23 12,23 C12,23 3,17 3,10 C3,5 7,1 12,1 C17,1 21,5 21,10 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Circle cx={12} cy={10} r={3} stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Car: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5,11 L6.5,6.5 C7,5.1 8.3,4 9.8,4 H14.2 C15.7,4 17,5.1 17.5,6.5 L19,11" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M3,11 H21 V17 C21,18.1 20.1,19 19,19 H17 V18 C17,17.4 16.6,17 16,17 H8 C7.4,17 7,17.4 7,18 V19 H5 C3.9,19 3,18.1 3,17 V11 Z" stroke={c} strokeWidth={1.5} fill="none" />
      <Circle cx={7} cy={14} r={1} fill={c} />
      <Circle cx={17} cy={14} r={1} fill={c} />
    </Svg>
  ),
  Home: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3,9.5 L12,2 L21,9.5 V21 C21,21.6 20.6,22 20,22 H15 V16 H9 V22 H4 C3.4,22 3,21.6 3,21 V9.5 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Lock: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={11} width={18} height={11} rx={2} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M7,11 V7 C7,4.2 9.2,2 12,2 C14.8,2 17,4.2 17,7 V11" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={16} r={1} fill={c} />
    </Svg>
  ),
  Heart: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20.8,4.6 C19.7,3.5 18.3,3 16.8,3 C15.4,3 14.1,3.5 13.1,4.5 L12,5.6 L10.9,4.5 C9.9,3.5 8.6,3 7.2,3 C5.7,3 4.3,3.5 3.2,4.6 C1.1,6.7 1.1,10.1 3.2,12.2 L12,21 L20.8,12.2 C22.9,10.1 22.9,6.7 20.8,4.6 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Star: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12,2 L15.1,8.3 L22,9.3 L17,14.1 L18.2,21 L12,17.8 L5.8,21 L7,14.1 L2,9.3 L8.9,8.3 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  TrendingUp: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M23,6 L13.5,15.5 L8.5,10.5 L1,18" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M17,6 H23 V12" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Gift: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2} y={7} width={20} height={4} rx={1} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M4,11 L4,21 C4,21.6 4.4,22 5,22 H19 C19.6,22 20,21.6 20,21 V11" stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M12,7 V22" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M12,7 C12,7 9,7 9,4.5 C9,3 10,2 12,2 C14,2 15,3 15,4.5 C15,7 12,7 12,7 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Calendar: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={4} width={18} height={18} rx={2} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M3,10 H21" stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M8,2 V6 M16,2 V6" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Bell: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18,8 C18,4.7 15.3,2 12,2 C8.7,2 6,4.7 6,8 C6,13 4,14 4,16 H20 C20,14 18,13 18,8 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M9,16 C9,17.7 10.3,19 12,19 C13.7,19 15,17.7 15,16" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Shield: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12,2 L20,5.5 V11 C20,15.4 16.4,19.4 12,21 C7.6,19.4 4,15.4 4,11 V5.5 L12,2 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Vault: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2} y={3} width={20} height={17} rx={2} stroke={c} strokeWidth={1.5} fill="none" />
      <Circle cx={12} cy={11.5} r={4} stroke={c} strokeWidth={1.5} fill="none" />
      <Circle cx={12} cy={11.5} r={1.5} fill={c} />
      <Path d="M6,20 L6,22 M18,20 L18,22" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M16,11.5 L18,11.5 M6,11.5 L8,11.5" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Hearth: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3,7 L12,3 L21,7 V17 L12,21 L3,17 V7 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M12,3 L12,21 M3,7 L21,17 M21,7 L3,17" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
};
