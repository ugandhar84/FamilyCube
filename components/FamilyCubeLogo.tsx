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
        {/* ── Top face — Amber — House icon ── */}
        <Polygon
          points={poly(['topC', 'midR', 'ctr', 'midL'])}
          fill="url(#topGrad)"
        />
        {/* House roof */}
        <Path
          d="M100 36 L128 56 L72 56 Z"
          fill={WHITE}
          opacity={0.92}
        />
        {/* House body + window */}
        <Path
          d="M78 56 L78 72 L122 72 L122 56 Z"
          fill={WHITE}
          opacity={0.85}
        />
        <Path
          d="M92 60 L92 68 L108 68 L108 60 Z"
          fill={AMBER}
          opacity={0.7}
        />

        {/* ── Left face — Teal — Family icon ── */}
        <Polygon
          points={poly(['midL', 'ctr', 'botC', 'botL'])}
          fill="url(#leftGrad)"
        />
        {/* Parent 1 head */}
        <Circle cx={75} cy={136} r={7} fill={WHITE} opacity={0.92} />
        {/* Parent 2 head */}
        <Circle cx={95} cy={130} r={7} fill={WHITE} opacity={0.92} />
        {/* Kid head */}
        <Circle cx={85} cy={153} r={5.5} fill={WHITE} opacity={0.92} />
        {/* Arms / body gesture */}
        <Path
          d="M68 148 Q75 142 85 153 Q95 142 102 148"
          fill="none"
          stroke={WHITE}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.88}
        />
        {/* Heart */}
        <Path
          d="M86 122 C84 119, 80 120, 80 124 C80 128, 86 132, 86 132 C86 132, 92 128, 92 124 C92 120, 88 119, 86 122 Z"
          fill={WHITE}
          opacity={0.9}
        />

        {/* ── Right face — Purple — Hands + Heart icon ── */}
        <Polygon
          points={poly(['midR', 'botR', 'botC', 'ctr'])}
          fill="url(#rightGrad)"
        />
        {/* Heart */}
        <Path
          d="M143 130 C141 127, 137 128, 137 132 C137 136, 143 140, 143 140 C143 140, 149 136, 149 132 C149 128, 145 127, 143 130 Z"
          fill={WHITE}
          opacity={0.92}
        />
        {/* Cupped hands — left */}
        <Path
          d="M130 148 C128 144, 126 148, 128 153 Q133 162, 143 163"
          fill="none"
          stroke={WHITE}
          strokeWidth={3.5}
          strokeLinecap="round"
          opacity={0.88}
        />
        {/* Cupped hands — right */}
        <Path
          d="M156 148 C158 144, 160 148, 158 153 Q153 162, 143 163"
          fill="none"
          stroke={WHITE}
          strokeWidth={3.5}
          strokeLinecap="round"
          opacity={0.88}
        />

        {/* Edge lines for depth */}
        <Path
          d="M100 18 L15 68 M100 18 L185 68 M100 118 L15 68 M100 118 L185 68 M100 118 L100 218 M15 68 L15 168 L100 218 M185 68 L185 168 L100 218"
          fill="none"
          stroke={WHITE}
          strokeWidth={1}
          strokeOpacity={0.18}
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

function Tagline({ fontSize = 10, opacity = 1 }: { fontSize?: number; opacity?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, opacity }}>
      <Text style={{ color: NAVY, opacity: 0.4, fontSize, marginRight: 4 }}>—</Text>
      <Text style={{ color: TEAL,   fontSize, fontWeight: '700', letterSpacing: 0.8 }}>CONNECT</Text>
      <Text style={{ color: NAVY, opacity: 0.4, fontSize, marginHorizontal: 2 }}>.</Text>
      <Text style={{ color: AMBER,  fontSize, fontWeight: '700', letterSpacing: 0.8 }}>ORGANIZE</Text>
      <Text style={{ color: NAVY, opacity: 0.4, fontSize, marginHorizontal: 2 }}>.</Text>
      <Text style={{ color: PINK,   fontSize, fontWeight: '700', letterSpacing: 0.8 }}>CARE</Text>
      <Text style={{ color: NAVY, opacity: 0.4, fontSize, marginHorizontal: 2 }}>.</Text>
      <Text style={{ color: PURPLE, fontSize, fontWeight: '700', letterSpacing: 0.8 }}>GROW</Text>
      <Text style={{ color: NAVY, opacity: 0.4, fontSize, marginLeft: 4 }}>—</Text>
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
      {showTagline && <Tagline fontSize={cfg.tag} opacity={dark ? 0.7 : 1} />}
    </View>
  );
}
