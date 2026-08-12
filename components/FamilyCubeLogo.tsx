/**
 * FamilyCubeLogo
 * Renders the official brand mark: isometric cube + wordmark + optional tagline.
 * Based on the brand identity:
 *   Top face  = Amber  #F5A623  (Organize / Home)
 *   Left face = Teal   #00BBA4  (Connect  / Family)
 *   Right face= Purple #9261C7  (Care     / Grow)
 *   Wordmark  = "family" Navy + "cube" multicolor gradient
 *   Tagline   = CONNECT. ORGANIZE. CARE. GROW.
 */
import React from 'react';
import { View, Text } from 'react-native';
import Svg, {
  Polygon, Path, Defs, LinearGradient, Stop, G, Circle,
} from 'react-native-svg';

// Brand colors — matches constants/colors.ts
const AMBER   = '#F5A623';
const AMBER2  = '#FFB830';
const TEAL    = '#00BBA4';
const PURPLE  = '#9261C7';
const PINK    = '#F04E98';
const NAVY    = '#1E2D6B';
const WHITE   = '#FFFFFF';

// ── Isometric cube mark ───────────────────────────────────────────────────────
// viewBox 0 0 200 220
// Vertices:
//   topCenter     (100, 18)
//   midLeft       (15,  68)
//   midRight      (185, 68)
//   center        (100, 118)
//   botLeft       (15,  168)
//   botRight      (185, 168)
//   botCenter     (100, 218)
//
// Faces:
//   Top   (amber): topCenter → midRight → center → midLeft
//   Left  (teal) : midLeft → center → botCenter → botLeft
//   Right (purple): midRight → botRight → botCenter → center

function CubeMark({ size = 100 }: { size?: number }) {
  const s = size / 200;

  // Isometric points
  const pts = {
    topC:  [100, 18],
    midL:  [15,  68],
    midR:  [185, 68],
    ctr:   [100, 118],
    botL:  [15,  168],
    botR:  [185, 168],
    botC:  [100, 218],
  };

  const poly = (keys: (keyof typeof pts)[]) =>
    keys.map(k => pts[k].join(',')).join(' ');

  // Scale transform applied to G element
  const scale = size / 236; // fit into 'size' px with padding

  return (
    <Svg width={size} height={size * 1.18} viewBox="0 0 200 236">
      <Defs>
        <LinearGradient id="topGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={AMBER2} />
          <Stop offset="100%" stopColor={AMBER} />
        </LinearGradient>
        <LinearGradient id="leftGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={TEAL} />
          <Stop offset="100%" stopColor="#009985" />
        </LinearGradient>
        <LinearGradient id="rightGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#A97DD4" />
          <Stop offset="100%" stopColor={PURPLE} />
        </LinearGradient>
      </Defs>

      <G>
        {/* ── Top face — Amber — Home icon (Lucide style) ── */}
        <Polygon points={poly(['topC', 'midR', 'ctr', 'midL'])} fill="url(#topGrad)" />
        {/* Roof */}
        <Path d="M100 34 L130 55 L70 55 Z"
          fill="none" stroke={WHITE} strokeWidth={4} strokeLinejoin="round"
          strokeLinecap="round" opacity={0.95} />
        {/* Body */}
        <Path d="M78 55 L78 73 L122 73 L122 55"
          fill="none" stroke={WHITE} strokeWidth={4} strokeLinejoin="round"
          strokeLinecap="round" opacity={0.95} />
        {/* Door */}
        <Path d="M93 73 L93 62 Q100 58 107 62 L107 73"
          fill="none" stroke={WHITE} strokeWidth={3} strokeLinejoin="round"
          strokeLinecap="round" opacity={0.88} />

        {/* ── Left face — Teal — People icon (Lucide style) ── */}
        <Polygon points={poly(['midL', 'ctr', 'botC', 'botL'])} fill="url(#leftGrad)" />
        {/* Left person head */}
        <Circle cx={72} cy={134} r={8} fill="none" stroke={WHITE} strokeWidth={3.5} opacity={0.95} />
        {/* Left person body arc */}
        <Path d="M55 163 Q72 148 89 163"
          fill="none" stroke={WHITE} strokeWidth={3.5} strokeLinecap="round" opacity={0.88} />
        {/* Right person head */}
        <Circle cx={98} cy={128} r={8} fill="none" stroke={WHITE} strokeWidth={3.5} opacity={0.95} />
        {/* Right person body arc */}
        <Path d="M81 157 Q98 142 115 157"
          fill="none" stroke={WHITE} strokeWidth={3.5} strokeLinecap="round" opacity={0.88} />

        {/* ── Right face — Purple — Heart icon (Lucide style) ── */}
        <Polygon points={poly(['midR', 'botR', 'botC', 'ctr'])} fill="url(#rightGrad)" />
        {/* Heart */}
        <Path d="M143 128 C143 128, 131 118, 127 127 C123 136, 131 145, 143 155 C155 145, 163 136, 159 127 C155 118, 143 128, 143 128 Z"
          fill="none" stroke={WHITE} strokeWidth={3.5} strokeLinejoin="round"
          strokeLinecap="round" opacity={0.95} />

        {/* Subtle edge lines for depth */}
        <Path
          d="M100 18 L15 68 M100 18 L185 68 M100 118 L15 68 M100 118 L185 68 M100 118 L100 218 M15 68 L15 168 L100 218 M185 68 L185 168 L100 218"
          fill="none" stroke={WHITE} strokeWidth={1} strokeOpacity={0.15}
        />
      </G>
    </Svg>
  );
}

// ── Wordmark ──────────────────────────────────────────────────────────────────
// "family" in navy bold + heart dot above 'i' + "cube" in multicolor

function Wordmark({ fontSize = 38, dark = false }: { fontSize?: number; dark?: boolean }) {
  const familyColor = dark ? WHITE : NAVY;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{
          fontSize,
          fontWeight: '800',
          color: familyColor,
          letterSpacing: -0.5,
          fontFamily: undefined,
        }}>
          family{' '}
        </Text>
        {/* "cube" multicolor: each letter a different brand color */}
        <Text style={{ fontSize, fontWeight: '800', letterSpacing: -0.5 }}>
          <Text style={{ color: TEAL }}>c</Text>
          <Text style={{ color: AMBER }}>u</Text>
          <Text style={{ color: PINK }}>b</Text>
          <Text style={{ color: PURPLE }}>e</Text>
        </Text>
      </View>
    </View>
  );
}

// ── Tagline ───────────────────────────────────────────────────────────────────

function Tagline({ fontSize = 10, opacity = 1, dark = false }: {
  fontSize?: number; opacity?: number; dark?: boolean;
}) {
  const sep = dark ? 'rgba(255,255,255,0.3)' : 'rgba(30,45,107,0.35)';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity }}>
      <Text style={{ color: TEAL,   fontSize, fontWeight: '800', letterSpacing: 1 }}>CONNECT</Text>
      <Text style={{ color: sep,    fontSize }}>·</Text>
      <Text style={{ color: AMBER,  fontSize, fontWeight: '800', letterSpacing: 1 }}>ORGANIZE</Text>
      <Text style={{ color: sep,    fontSize }}>·</Text>
      <Text style={{ color: PINK,   fontSize, fontWeight: '800', letterSpacing: 1 }}>CARE</Text>
      <Text style={{ color: sep,    fontSize }}>·</Text>
      <Text style={{ color: PURPLE, fontSize, fontWeight: '800', letterSpacing: 1 }}>GROW</Text>
    </View>
  );
}

// ── Exported tagline components ───────────────────────────────────────────────
export { CubeMark, Wordmark, Tagline };

// ── Full logo (mark + wordmark + optional tagline) ────────────────────────────
interface FamilyCubeLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  dark?: boolean;          // true = white wordmark text (for dark backgrounds)
}

const SIZE_MAP = {
  xs: { cube: 44,  font: 20, tag: 8  },
  sm: { cube: 56,  font: 26, tag: 9  },
  md: { cube: 80,  font: 34, tag: 10 },
  lg: { cube: 110, font: 44, tag: 12 },
};

export default function FamilyCubeLogo({
  size = 'md',
  showTagline = true,
  dark = false,
}: FamilyCubeLogoProps) {
  const cfg = SIZE_MAP[size];
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <CubeMark size={cfg.cube} />
      <Wordmark fontSize={cfg.font} dark={dark} />
      {showTagline && <Tagline fontSize={cfg.tag} opacity={dark ? 0.8 : 1} dark={dark} />}
    </View>
  );
}
