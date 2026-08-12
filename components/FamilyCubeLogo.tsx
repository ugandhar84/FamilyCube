/**
 * FamilyCubeLogo — v3
 * Pixel-matched to brand reference:
 *   Top  (Amber)  : house + chimney + 4-pane window
 *   Left (Teal)   : family silhouette (2 adults + child + 2 hearts)
 *   Right (Purple): cupped hands holding heart
 * Rounded cube faces, solid-filled white icons.
 */
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Rect } from 'react-native-svg';

export const BRAND = {
  amber:  '#F5A623',
  amber2: '#FFB830',
  teal:   '#00BBA4',
  teal2:  '#2DD4BF',
  purple: '#9261C7',
  purple2:'#B98EDB',
  pink:   '#F04E98',
  navy:   '#1E2D6B',
  white:  '#FFFFFF',
} as const;

// ── Rounded parallelogram paths (corner radius ≈ 14) ────────────────────────
// viewBox 0 0 200 236
// Cube vertices: topC(100,18) midL(15,68) midR(185,68)
//                ctr(100,118) botL(15,168) botR(185,168) botC(100,218)
const TOP_FACE   = 'M112,25 L173,61 Q185,68 173,75 L112,111 Q100,118 88,111 L27,75 Q15,68 27,61 L88,25 Q100,18 112,25 Z';
const LEFT_FACE  = 'M27,75 L88,111 Q100,118 100,132 L100,204 Q100,218 88,211 L27,175 Q15,168 15,154 L15,82 Q15,68 27,75 Z';
const RIGHT_FACE = 'M185,82 L185,154 Q185,168 173,175 L112,211 Q100,218 100,204 L100,132 Q100,118 112,111 L173,75 Q185,68 185,82 Z';

// ── Isometric cube mark ───────────────────────────────────────────────────────
export function CubeMark({ size = 100, uid = 'a' }: { size?: number; uid?: string }) {
  const h = size * 1.18;
  return (
    <Svg width={size} height={h} viewBox="0 0 200 236">
      <Defs>
        <LinearGradient id={`top_${uid}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%"   stopColor={BRAND.amber2} />
          <Stop offset="100%" stopColor={BRAND.amber} />
        </LinearGradient>
        <LinearGradient id={`left_${uid}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%"   stopColor={BRAND.teal2} />
          <Stop offset="100%" stopColor={BRAND.teal} />
        </LinearGradient>
        <LinearGradient id={`right_${uid}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%"   stopColor={BRAND.purple2} />
          <Stop offset="100%" stopColor={BRAND.purple} />
        </LinearGradient>
      </Defs>

      {/* ══ TOP FACE — Amber — House ══ */}
      <Path d={TOP_FACE} fill={`url(#top_${uid})`} />
      {/* Chimney (sticks above roofline) */}
      <Rect x={117} y={26} width={12} height={20} fill={BRAND.white} rx={2.5} opacity={0.95} />
      {/* Roof: wide filled triangle */}
      <Path d="M100,37 L142,62 L58,62 Z" fill={BRAND.white} opacity={0.95} />
      {/* Wall body */}
      <Rect x={60} y={61} width={80} height={36} fill={BRAND.white} rx={2.5} opacity={0.95} />
      {/* 4-pane window — amber squares cut into white wall */}
      <Rect x={67} y={66} width={18} height={13} fill={BRAND.amber} rx={2} opacity={0.92} />
      <Rect x={89} y={66} width={18} height={13} fill={BRAND.amber} rx={2} opacity={0.92} />
      <Rect x={67} y={82} width={18} height={11} fill={BRAND.amber} rx={2} opacity={0.92} />
      <Rect x={89} y={82} width={18} height={11} fill={BRAND.amber} rx={2} opacity={0.92} />

      {/* ══ LEFT FACE — Teal — Family ══ */}
      <Path d={LEFT_FACE} fill={`url(#left_${uid})`} />

      {/* Heart above left adult */}
      <Path
        d="M36,116 C36,116 26,106 21,110 C16,114 16,124 28,132 C40,124 40,114 36,110 C34,108 36,116 36,116 Z"
        fill={BRAND.white} opacity={0.95}
      />
      {/* Heart above right adult */}
      <Path
        d="M70,112 C70,112 60,102 55,106 C50,110 50,120 62,128 C74,120 74,110 70,106 C68,104 70,112 70,112 Z"
        fill={BRAND.white} opacity={0.95}
      />

      {/* Left adult head */}
      <Circle cx={36} cy={128} r={10.5} fill={BRAND.white} opacity={0.95} />
      {/* Left adult body */}
      <Path d="M24,148 C24,137 48,137 48,148 L50,172 L22,172 Z" fill={BRAND.white} opacity={0.88} />
      {/* Left adult — left arm up */}
      <Path d="M29,144 L13,126" stroke={BRAND.white} strokeWidth={11} strokeLinecap="round" fill="none" opacity={0.9} />
      {/* Left adult — right arm toward center */}
      <Path d="M43,143 L60,132" stroke={BRAND.white} strokeWidth={11} strokeLinecap="round" fill="none" opacity={0.9} />

      {/* Right adult head */}
      <Circle cx={72} cy={130} r={10.5} fill={BRAND.white} opacity={0.95} />
      {/* Right adult body */}
      <Path d="M60,150 C60,139 84,139 84,150 L86,174 L58,174 Z" fill={BRAND.white} opacity={0.88} />
      {/* Right adult — left arm toward center */}
      <Path d="M65,147 L50,136" stroke={BRAND.white} strokeWidth={11} strokeLinecap="round" fill="none" opacity={0.9} />
      {/* Right adult — right arm up */}
      <Path d="M79,145 L95,132" stroke={BRAND.white} strokeWidth={11} strokeLinecap="round" fill="none" opacity={0.9} />

      {/* Child head */}
      <Circle cx={54} cy={167} r={8.5} fill={BRAND.white} opacity={0.95} />
      {/* Child body */}
      <Path d="M44,183 C44,174 64,174 64,183 L66,204 L42,204 Z" fill={BRAND.white} opacity={0.82} />

      {/* ══ RIGHT FACE — Purple — Care (hands + heart) ══ */}
      <Path d={RIGHT_FACE} fill={`url(#right_${uid})`} />

      {/* Large heart */}
      <Path
        d="M143,150 C138,145 119,137 119,122 C119,107 129,103 143,118 C157,103 167,107 167,122 C167,137 148,145 143,150 Z"
        fill={BRAND.white} opacity={0.95}
      />
      {/* Left hand (cupped palm, wrist at bottom-left) */}
      <Path
        d="M112,198 Q105,180 108,161 Q112,146 123,143 Q134,141 139,153 Q143,162 140,176 L132,198 Z"
        fill={BRAND.white} opacity={0.90}
      />
      {/* Right hand (mirror) */}
      <Path
        d="M168,198 Q175,180 172,161 Q168,146 157,143 Q146,141 141,153 Q137,162 140,176 L148,198 Z"
        fill={BRAND.white} opacity={0.90}
      />
      {/* Palm bridge */}
      <Rect x={132} y={176} width={26} height={22} fill={BRAND.white} opacity={0.88} rx={4} />

      {/* Edge highlights for 3D depth */}
      <Path
        d="M100,18 L15,68 M100,18 L185,68 M100,118 L15,68 M100,118 L185,68 M100,118 L100,218 M15,68 L15,168 L100,218 M185,68 L185,168 L100,218"
        fill="none" stroke={BRAND.white} strokeWidth={1.5} strokeOpacity={0.2}
      />
    </Svg>
  );
}

// ── Wordmark ──────────────────────────────────────────────────────────────────
// "Family" bold + small ♥ above the "i" + "Cube" multicolor

export function Wordmark({ fontSize = 38, dark = false }: { fontSize?: number; dark?: boolean }) {
  const familyColor = dark ? BRAND.white : BRAND.navy;
  const heartSz = Math.round(fontSize * 0.21);
  // Approximate x-offset of the "i" in "Family" bold (empirically ~65-68% through "Fam")
  const heartX = Math.round(fontSize * 1.75);

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <View style={{ position: 'relative' }}>
          {/* Purple heart above the "i" */}
          <Svg
            width={heartSz}
            height={heartSz}
            viewBox="0 0 20 18"
            style={{
              position: 'absolute',
              left: heartX,
              top: -(heartSz + 3),
              zIndex: 1,
            }}
          >
            <Path
              d="M10,16 C7,13 0,9 0,5 C0,0 5,-1 10,6 C15,-1 20,0 20,5 C20,9 13,13 10,16 Z"
              fill={BRAND.purple}
            />
          </Svg>
          <Text style={{ fontSize, fontWeight: '800', color: familyColor, letterSpacing: -0.5 }}>
            Family{' '}
          </Text>
        </View>
        <Text style={{ fontSize, fontWeight: '800', letterSpacing: -0.5 }}>
          <Text style={{ color: BRAND.teal   }}>C</Text>
          <Text style={{ color: BRAND.amber  }}>u</Text>
          <Text style={{ color: BRAND.pink   }}>b</Text>
          <Text style={{ color: BRAND.purple }}>e</Text>
        </Text>
      </View>
    </View>
  );
}

// ── Tagline ───────────────────────────────────────────────────────────────────

export function Tagline({
  fontSize = 10,
  opacity = 1,
  dark = false,
}: { fontSize?: number; opacity?: number; dark?: boolean }) {
  const dot = dark ? 'rgba(255,255,255,0.3)' : 'rgba(30,45,107,0.3)';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, opacity }}>
      <Text style={{ color: BRAND.teal,   fontSize, fontWeight: '700', letterSpacing: 1.2 }}>CONNECT</Text>
      <Text style={{ color: dot,           fontSize, fontWeight: '400' }}>·</Text>
      <Text style={{ color: BRAND.amber,  fontSize, fontWeight: '700', letterSpacing: 1.2 }}>ORGANIZE</Text>
      <Text style={{ color: dot,           fontSize, fontWeight: '400' }}>·</Text>
      <Text style={{ color: BRAND.pink,   fontSize, fontWeight: '700', letterSpacing: 1.2 }}>CARE</Text>
      <Text style={{ color: dot,           fontSize, fontWeight: '400' }}>·</Text>
      <Text style={{ color: BRAND.purple, fontSize, fontWeight: '700', letterSpacing: 1.2 }}>GROW</Text>
    </View>
  );
}

// ── Full logo (mark + wordmark + tagline) ─────────────────────────────────────

const SIZE_MAP = {
  xs: { cube: 44,  font: 20, tag: 8  },
  sm: { cube: 56,  font: 26, tag: 9  },
  md: { cube: 80,  font: 34, tag: 10 },
  lg: { cube: 110, font: 44, tag: 12 },
};

interface FamilyCubeLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  dark?: boolean;
}

export default function FamilyCubeLogo({
  size = 'md',
  showTagline = true,
  dark = false,
}: FamilyCubeLogoProps) {
  const cfg = SIZE_MAP[size];
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <CubeMark size={cfg.cube} uid={size} />
      <Wordmark fontSize={cfg.font} dark={dark} />
      {showTagline && <Tagline fontSize={cfg.tag} opacity={dark ? 0.8 : 1} dark={dark} />}
    </View>
  );
}
