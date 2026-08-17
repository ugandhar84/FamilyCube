/**
 * icons — shared inline SVG icon set used across QuestsScreen and its
 * extracted sub-components (DeclineModal, CollapsibleQuestCard, AddQuestModal,
 * EditQuestModal, AI panel cards, and the QuestsScreen orchestrator itself).
 */
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

// ─── Icons ────────────────────────────────────────────────────────────────────
export const I = {
  PlusCircle: ({ c }: { c: string }) => (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,16 M8,12 L16,12" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  ThumbsUp: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M14,9 V5 C14,3.3 12.7,2 11,2 L7,13 V22 H18.3 C19.3,22 20.1,21.3 20.3,20.3 L21.7,12.3 C21.9,11 20.9,10 19.6,10 H14 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M7,13 H4 C2.9,13 2,13.9 2,15 V20 C2,21.1 2.9,22 4,22 H7" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Camera: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M23,19 C23,20.1 22.1,21 21,21 H3 C1.9,21 1,20.1 1,19 V8 C1,6.9 1.9,6 3,6 H7 L9,3 H15 L17,6 H21 C22.1,6 23,6.9 23,8 Z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={4} stroke={c} strokeWidth={2} fill="none" />
    </Svg>
  ),
  CheckCircle: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8,13 L11,16 L16,8" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Bot: ({ c }: { c: string }) => (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={9} cy={14} r={1.5} fill={c} />
      <Circle cx={15} cy={14} r={1.5} fill={c} />
      <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Sparkles: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" stroke={c} strokeWidth={1.5} fill={c} strokeLinejoin="round" />
    </Svg>
  ),
  Flame: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12,22 C8.7,22 6,19.3 6,16 C6,12 9,9 10,8 C10,10 12,11 12,13 C13.5,11.5 14,9.5 13,8 C15,9 18,12 18,16 C18,19.3 15.3,22 12,22 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Award: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={6} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8.2,14.2 L6,22 L12,19 L18,22 L15.8,14.2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  AlertCircle: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,13 M12,16 L12,17" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  RotateCcw: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M1,4 L1,10 L7,10" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M3.5,15 C4.8,18.3 8,20.5 11.8,20.5 C16.8,20.5 20.8,16.5 20.8,11.5 C20.8,6.5 16.8,2.5 11.8,2.5 C8,2.5 4.8,4.7 3.5,8 L1,4" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  X: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6,6 L18,18 M18,6 L6,18" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Check: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5,13 L9,17 L19,7" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
  User: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M4,20 C4,16.7 7.6,14 12,14 C16.4,14 20,16.7 20,20" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Edit2: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M11,4 H4 C2.9,4 2,4.9 2,6 V20 C2,21.1 2.9,22 4,22 H18 C19.1,22 20,21.1 20,20 V13" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M18.5,2.5 C19.3,1.7 20.7,1.7 21.5,2.5 C22.3,3.3 22.3,4.7 21.5,5.5 L12,15 L8,16 L9,12 L18.5,2.5 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  AlertTriangle: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10.3,3.3 L2.2,18 C1.7,18.9 2.4,20 3.5,20 H20.5 C21.6,20 22.3,18.9 21.8,18 L13.7,3.3 C13.2,2.4 10.8,2.4 10.3,3.3 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M12,9 L12,13 M12,16 L12,17" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
};
