/**
 * PetSvg — cute SVG illustrations for each pet species.
 * Used in species picker grid, pet avatar (when no photo), and pet pill.
 */
import Svg, {
  Circle, Ellipse, Path, Rect, Line, Polygon, G,
} from 'react-native-svg';

// Map species key → component
import type { ReactElement } from 'react';

type Props = { size?: number; color?: string };

export function DogSvg({ size = 56, color = '#FF8C55' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Left ear */}
      <Ellipse cx={14} cy={18} rx={7} ry={10} fill={color} opacity={0.9} />
      {/* Right ear */}
      <Ellipse cx={42} cy={18} rx={7} ry={10} fill={color} opacity={0.9} />
      {/* Head */}
      <Circle cx={28} cy={26} r={18} fill={color} />
      {/* Muzzle */}
      <Ellipse cx={28} cy={34} rx={10} ry={7} fill="#fff" opacity={0.5} />
      {/* Nose */}
      <Ellipse cx={28} cy={32} rx={4} ry={2.5} fill="#5C3310" />
      {/* Nostrils */}
      <Circle cx={26} cy={32} r={1} fill="#3A1F08" />
      <Circle cx={30} cy={32} r={1} fill="#3A1F08" />
      {/* Eyes */}
      <Circle cx={21} cy={23} r={4} fill="#fff" />
      <Circle cx={35} cy={23} r={4} fill="#fff" />
      <Circle cx={22} cy={23} r={2.5} fill="#2D1A0A" />
      <Circle cx={36} cy={23} r={2.5} fill="#2D1A0A" />
      {/* Eye shine */}
      <Circle cx={23} cy={22} r={1} fill="#fff" />
      <Circle cx={37} cy={22} r={1} fill="#fff" />
      {/* Mouth */}
      <Path d="M24 37 Q28 40 32 37" stroke="#5C3310" strokeWidth={1.5} fill="none" strokeLinecap="round" />
      {/* Inner ear tint */}
      <Ellipse cx={14} cy={19} rx={4} ry={6} fill="#fff" opacity={0.25} />
      <Ellipse cx={42} cy={19} rx={4} ry={6} fill="#fff" opacity={0.25} />
    </Svg>
  );
}

export function CatSvg({ size = 56, color = '#7C5CBF' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Left pointed ear */}
      <Polygon points="10,22 16,6 22,22" fill={color} />
      {/* Right pointed ear */}
      <Polygon points={`34,22 40,6 46,22`} fill={color} />
      {/* Inner ear */}
      <Polygon points="12,20 16,9 20,20" fill="#fff" opacity={0.35} />
      <Polygon points="36,20 40,9 44,20" fill="#fff" opacity={0.35} />
      {/* Head */}
      <Circle cx={28} cy={29} r={18} fill={color} />
      {/* Muzzle cheeks */}
      <Ellipse cx={22} cy={34} rx={5} ry={4} fill="#fff" opacity={0.3} />
      <Ellipse cx={34} cy={34} rx={5} ry={4} fill="#fff" opacity={0.3} />
      {/* Nose */}
      <Polygon points="28,31 26,34 30,34" fill="#FF9999" />
      {/* Eyes */}
      <Ellipse cx={21} cy={26} rx={4} ry={5} fill="#fff" />
      <Ellipse cx={35} cy={26} rx={4} ry={5} fill="#fff" />
      <Ellipse cx={21} cy={26} rx={2} ry={4} fill="#2D1A0A" />
      <Ellipse cx={35} cy={26} rx={2} ry={4} fill="#2D1A0A" />
      {/* Eye shine */}
      <Circle cx={22} cy={25} r={1} fill="#fff" />
      <Circle cx={36} cy={25} r={1} fill="#fff" />
      {/* Whiskers */}
      <Line x1={8} y1={33} x2={22} y2={34} stroke="#fff" strokeWidth={1} opacity={0.6} />
      <Line x1={8} y1={36} x2={22} y2={35} stroke="#fff" strokeWidth={1} opacity={0.6} />
      <Line x1={34} y1={34} x2={48} y2={33} stroke="#fff" strokeWidth={1} opacity={0.6} />
      <Line x1={34} y1={35} x2={48} y2={36} stroke="#fff" strokeWidth={1} opacity={0.6} />
      {/* Mouth */}
      <Path d="M26 35 Q28 37 30 35" stroke="#CC7777" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export function RabbitSvg({ size = 56, color = '#94A3B8' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Left long ear */}
      <Ellipse cx={19} cy={13} rx={5} ry={13} fill={color} />
      {/* Right long ear */}
      <Ellipse cx={37} cy={13} rx={5} ry={13} fill={color} />
      {/* Inner ear */}
      <Ellipse cx={19} cy={13} rx={2.5} ry={9} fill="#FFB6C1" opacity={0.6} />
      <Ellipse cx={37} cy={13} rx={2.5} ry={9} fill="#FFB6C1" opacity={0.6} />
      {/* Head */}
      <Circle cx={28} cy={32} r={18} fill={color} />
      {/* Muzzle */}
      <Ellipse cx={28} cy={38} rx={8} ry={6} fill="#fff" opacity={0.4} />
      {/* Nose */}
      <Ellipse cx={28} cy={36} rx={3} ry={2} fill="#FFB6C1" />
      {/* Eyes */}
      <Circle cx={21} cy={28} r={4} fill="#fff" />
      <Circle cx={35} cy={28} r={4} fill="#fff" />
      <Circle cx={21} cy={28} r={2.5} fill="#CC4477" />
      <Circle cx={35} cy={28} r={2.5} fill="#CC4477" />
      <Circle cx={22} cy={27} r={1} fill="#fff" />
      <Circle cx={36} cy={27} r={1} fill="#fff" />
      {/* Mouth */}
      <Path d="M25 38 Q28 41 31 38" stroke="#CC4477" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export function BirdSvg({ size = 56, color = '#4ECDC4' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Body */}
      <Ellipse cx={28} cy={33} rx={16} ry={14} fill={color} />
      {/* Head */}
      <Circle cx={28} cy={18} r={13} fill={color} />
      {/* Wing */}
      <Ellipse cx={14} cy={33} rx={7} ry={10} fill={color} opacity={0.7} transform="rotate(-15 14 33)" />
      <Ellipse cx={42} cy={33} rx={7} ry={10} fill={color} opacity={0.7} transform="rotate(15 42 33)" />
      {/* Wing feather lines */}
      <Path d="M10 30 Q14 36 18 30" stroke="#fff" strokeWidth={1} fill="none" opacity={0.4} />
      <Path d="M38 30 Q42 36 46 30" stroke="#fff" strokeWidth={1} fill="none" opacity={0.4} />
      {/* Beak */}
      <Polygon points="28,22 24,25 32,25" fill="#FF8C55" />
      {/* Eye */}
      <Circle cx={22} cy={16} r={4} fill="#fff" />
      <Circle cx={22} cy={16} r={2.5} fill="#1A1025" />
      <Circle cx={23} cy={15} r={1} fill="#fff" />
      {/* Crest */}
      <Path d="M28 6 Q32 10 28 14 Q24 10 28 6" fill={color} stroke="#fff" strokeWidth={0.5} />
      {/* Tail */}
      <Path d="M20 44 Q28 48 36 44 Q32 38 28 40 Q24 38 20 44" fill={color} opacity={0.8} />
    </Svg>
  );
}

export function FishSvg({ size = 56, color = '#3B82F6' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Tail fin */}
      <Path d="M38 28 L50 18 L50 38 Z" fill={color} opacity={0.8} />
      {/* Body */}
      <Ellipse cx={24} cy={28} rx={20} ry={14} fill={color} />
      {/* Belly */}
      <Ellipse cx={22} cy={31} rx={14} ry={8} fill="#fff" opacity={0.25} />
      {/* Top fin */}
      <Path d="M18 14 Q24 12 30 14 Q26 20 18 14" fill={color} opacity={0.7} />
      {/* Scales */}
      <Path d="M12 24 Q16 20 20 24" stroke="#fff" strokeWidth={0.8} fill="none" opacity={0.3} />
      <Path d="M18 22 Q22 18 26 22" stroke="#fff" strokeWidth={0.8} fill="none" opacity={0.3} />
      <Path d="M14 29 Q18 25 22 29" stroke="#fff" strokeWidth={0.8} fill="none" opacity={0.3} />
      {/* Eye */}
      <Circle cx={12} cy={25} r={5} fill="#fff" />
      <Circle cx={12} cy={25} r={3} fill="#1A1025" />
      <Circle cx={13} cy={24} r={1.2} fill="#fff" />
      {/* Mouth */}
      <Path d="M6 28 Q8 30 6 32" stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export function HamsterSvg({ size = 56, color = '#E8A320' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Small round ears */}
      <Circle cx={16} cy={16} r={7} fill={color} />
      <Circle cx={40} cy={16} r={7} fill={color} />
      <Circle cx={16} cy={16} r={4} fill="#FFB6C1" opacity={0.5} />
      <Circle cx={40} cy={16} r={4} fill="#FFB6C1" opacity={0.5} />
      {/* Chubby head/body */}
      <Circle cx={28} cy={30} r={20} fill={color} />
      {/* Chubby cheeks */}
      <Circle cx={14} cy={32} r={9} fill="#fff" opacity={0.3} />
      <Circle cx={42} cy={32} r={9} fill="#fff" opacity={0.3} />
      {/* Belly */}
      <Ellipse cx={28} cy={36} rx={11} ry={9} fill="#fff" opacity={0.35} />
      {/* Eyes */}
      <Circle cx={21} cy={25} r={4.5} fill="#fff" />
      <Circle cx={35} cy={25} r={4.5} fill="#fff" />
      <Circle cx={21} cy={25} r={2.8} fill="#1A1025" />
      <Circle cx={35} cy={25} r={2.8} fill="#1A1025" />
      <Circle cx={22} cy={24} r={1.2} fill="#fff" />
      <Circle cx={36} cy={24} r={1.2} fill="#fff" />
      {/* Nose */}
      <Ellipse cx={28} cy={31} rx={3} ry={2} fill="#FFB6C1" />
      {/* Mouth */}
      <Path d="M25 33 Q28 36 31 33" stroke="#CC7755" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export function TurtleSvg({ size = 56, color = '#16A34A' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Shell */}
      <Ellipse cx={28} cy={28} rx={20} ry={17} fill={color} />
      {/* Shell pattern */}
      <Ellipse cx={28} cy={27} rx={10} ry={9} fill="#fff" opacity={0.2} />
      <Path d="M18 20 Q28 16 38 20" stroke="#fff" strokeWidth={1} fill="none" opacity={0.3} />
      <Path d="M16 28 Q28 24 40 28" stroke="#fff" strokeWidth={1} fill="none" opacity={0.3} />
      <Path d="M18 36 Q28 40 38 36" stroke="#fff" strokeWidth={1} fill="none" opacity={0.3} />
      <Line x1={28} y1={16} x2={28} y2={40} stroke="#fff" strokeWidth={1} opacity={0.2} />
      <Line x1={16} y1={22} x2={40} y2={34} stroke="#fff" strokeWidth={1} opacity={0.2} />
      <Line x1={40} y1={22} x2={16} y2={34} stroke="#fff" strokeWidth={1} opacity={0.2} />
      {/* Head */}
      <Circle cx={28} cy={12} r={9} fill={color} />
      {/* Eyes */}
      <Circle cx={24} cy={10} r={3} fill="#fff" />
      <Circle cx={32} cy={10} r={3} fill="#fff" />
      <Circle cx={24} cy={10} r={1.8} fill="#1A1025" />
      <Circle cx={32} cy={10} r={1.8} fill="#1A1025" />
      <Circle cx={25} cy={9} r={0.8} fill="#fff" />
      <Circle cx={33} cy={9} r={0.8} fill="#fff" />
      {/* Legs */}
      <Ellipse cx={12} cy={22} rx={6} ry={4} fill={color} transform="rotate(-30 12 22)" />
      <Ellipse cx={44} cy={22} rx={6} ry={4} fill={color} transform="rotate(30 44 22)" />
      <Ellipse cx={12} cy={36} rx={6} ry={4} fill={color} transform="rotate(30 12 36)" />
      <Ellipse cx={44} cy={36} rx={6} ry={4} fill={color} transform="rotate(-30 44 36)" />
      {/* Tail */}
      <Ellipse cx={28} cy={44} rx={3} ry={5} fill={color} />
    </Svg>
  );
}

export function OtherPetSvg({ size = 56, color = '#94A3B8' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Paw print */}
      {/* Main pad */}
      <Ellipse cx={28} cy={34} rx={13} ry={11} fill={color} />
      {/* Toe beans */}
      <Circle cx={16} cy={22} r={6} fill={color} />
      <Circle cx={25} cy={18} r={6} fill={color} />
      <Circle cx={35} cy={18} r={6} fill={color} />
      <Circle cx={44} cy={22} r={6} fill={color} />
      {/* Inner pads */}
      <Ellipse cx={28} cy={35} rx={8} ry={6} fill="#fff" opacity={0.25} />
      <Circle cx={16} cy={22} r={3.5} fill="#fff" opacity={0.25} />
      <Circle cx={25} cy={18} r={3.5} fill="#fff" opacity={0.25} />
      <Circle cx={35} cy={18} r={3.5} fill="#fff" opacity={0.25} />
      <Circle cx={44} cy={22} r={3.5} fill="#fff" opacity={0.25} />
    </Svg>
  );
}

export function HorseSvg({ size = 56, color = '#D4A574' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Body/neck bulk */}
      <Ellipse cx={32} cy={28} rx={14} ry={12} fill={color} />
      {/* Head profile (side view) - larger */}
      <Ellipse cx={22} cy={18} rx={13} ry={15} fill={color} />
      {/* Snout/muzzle - larger and more visible */}
      <Ellipse cx={32} cy={22} rx={9} ry={7} fill="#fff" opacity={0.4} />
      {/* Nostril */}
      <Circle cx={38} cy={21} r={1.5} fill="#8B6F47" />
      {/* Ear (pointed, back of head) - larger */}
      <Polygon points="14,8 10,2 18,10" fill={color} />
      <Polygon points="14,8 12,5 16,9" fill="#fff" opacity={0.35} />
      {/* Forelock (hair falling forward) - thicker */}
      <Path d="M18 10 Q16 16 18 22" stroke={color} strokeWidth={3} fill="none" opacity={0.95} strokeLinecap="round" />
      <Path d="M21 9 Q19 17 21 24" stroke={color} strokeWidth={3} fill="none" opacity={0.95} strokeLinecap="round" />
      {/* Mane (flowing down neck) - prominent */}
      <Path d="M19 18 Q16 24 17 32" stroke={color} strokeWidth={3.5} fill="none" opacity={0.9} strokeLinecap="round" />
      <Path d="M22 17 Q20 26 21 34" stroke={color} strokeWidth={3.5} fill="none" opacity={0.9} strokeLinecap="round" />
      <Path d="M25 18 Q24 28 25 36" stroke={color} strokeWidth={3} fill="none" opacity={0.85} strokeLinecap="round" />
      {/* Eye - larger */}
      <Circle cx={26} cy={16} r={4} fill="#fff" />
      <Circle cx={26} cy={16} r={2.2} fill="#2D1A0A" />
      {/* Eye shine */}
      <Circle cx={27.5} cy={15} r={1} fill="#fff" />
      {/* Mouth line */}
      <Path d="M31 24 L40 24" stroke="#8B6F47" strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
    </Svg>
  );
}

const PET_SVG_MAP: Record<string, (props: Props) => ReactElement> = {
  dog:     DogSvg,
  cat:     CatSvg,
  rabbit:  RabbitSvg,
  horse:   HorseSvg,
  bird:    BirdSvg,
  fish:    FishSvg,
  hamster: HamsterSvg,
  turtle:  TurtleSvg,
  other:   OtherPetSvg,
};

const SPECIES_COLORS: Record<string, string> = {
  dog:     '#E8724A', // Coral
  cat:     '#F03E6E', // Hot Coral-Pink
  rabbit:  '#C4647A', // Dusty Rose
  horse:   '#D4A574', // Palomino (golden bay)
  bird:    '#2D9B8A', // Deep Teal
  fish:    '#4896D8', // Ocean Blue
  hamster: '#C47A2A', // Warm Amber
  turtle:  '#3D8B5E', // Forest Green
  other:   '#FF8C00', // Vibrant Amber-Orange
};

interface PetSvgProps {
  species: string;
  size?: number;
  color?: string;
}

export function PetSvg({ species, size = 56, color }: PetSvgProps) {
  const Component = PET_SVG_MAP[species] ?? OtherPetSvg;
  const resolvedColor = color ?? SPECIES_COLORS[species] ?? '#94A3B8';
  return <Component size={size} color={resolvedColor} />;
}

export { SPECIES_COLORS };
