/**
 * OnboardingIllos — first-launch carousel illustrations for Family Cube.
 * Hand-drawn flat-SVG scenes (soft gradient backdrop + floating accent dots),
 * each built around one real app feature (Hub, Quests, Schedule, Chat, GPS,
 * Store, Ask Cube) rather than generic stock art — matched to the palette in
 * constants/colors.ts, not a separate one-off scheme.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import Svg, {
  Circle, Ellipse, Path, Rect, Line, G, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText,
} from 'react-native-svg';

const { width, height } = Dimensions.get('window');
export const ILLO_H = Math.round(height * 0.52);

export type IlloProps = { isDark: boolean };

// These illustrations always render on OnboardingScreen.tsx's own colored
// gradient backdrop (isDark is always passed false), not on colors.background
// — so accent fills below are the brand primary's light-mode hex directly
// (constants/colors.ts's colors.primary), not a useTheme() token.
const BRAND_PRIMARY = '#DF613C';

// ── Slide 1: Welcome — a family of silhouettes under one roof ───────────────
export const IlloWelcome = React.memo(function IlloWelcome({ isDark }: IlloProps) {
  const bg0 = isDark ? '#241A3D' : '#F0E8FA';
  const bg1 = isDark ? '#160E2B' : '#FBF8FE';
  const shadow = isDark ? '#2A1E40' : '#DDD8F8';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="w-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#w-bg)" />
      <Ellipse cx="195" cy="205" rx="130" ry="40" fill={shadow} />

      {/* Roof over the group — literal "one household" framing */}
      <Path d="M100 95 L195 40 L290 95 L275 95 L195 55 L115 95 Z" fill={BRAND_PRIMARY} />

      {/* Parent */}
      <Circle cx="150" cy="140" r="22" fill="#00BBA4" />
      <Ellipse cx="150" cy="185" rx="30" ry="34" fill="#00BBA4" />
      {/* Kid */}
      <Circle cx="205" cy="150" r="17" fill="#F5A623" />
      <Ellipse cx="205" cy="185" rx="22" ry="26" fill="#F5A623" />
      {/* Senior */}
      <Circle cx="250" cy="142" r="20" fill="#F04E98" />
      <Ellipse cx="250" cy="185" rx="26" ry="30" fill="#F04E98" />

      {/* Heart above the group */}
      <Path
        d="M195 92 C195 92 178 78 178 65 A12 12 0 0 1 195 55 A12 12 0 0 1 212 65 C212 78 195 92 195 92 Z"
        fill="#F04E98"
      />

      <Circle cx="70" cy="90" r="5" fill="#F5A623" opacity={0.5} />
      <Circle cx="320" cy="100" r="4" fill="#00BBA4" opacity={0.5} />
      <Circle cx="330" cy="140" r="3" fill={BRAND_PRIMARY} opacity={0.4} />
      <Circle cx="60" cy="150" r="3" fill="#F04E98" opacity={0.4} />
    </Svg>
  );
});

// ── Slide 2: Quests — a chore checklist card with a completed check ─────────
export const IlloHealth = React.memo(function IlloQuests({ isDark }: IlloProps) {
  const bg0 = isDark ? '#231607' : '#FEF0D3';
  const bg1 = isDark ? '#160E05' : '#FFFAF0';
  const card = isDark ? '#221708' : 'white';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="q-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#q-bg)" />
      <Ellipse cx="195" cy="205" rx="140" ry="40" fill={isDark ? '#2E1D08' : '#FDE6B8'} />
      <Rect x="110" y="40" width="170" height="180" rx="16" fill={card} />
      <Rect x="110" y="40" width="170" height="180" rx="16" fill="none" stroke="#FCD9A0" strokeWidth="2" />
      <Rect x="150" y="28" width="90" height="22" rx="11" fill="#F5A623" />
      <SvgText x="195" y="44" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">TODAY'S QUESTS</SvgText>
      {[0, 1, 2].map(i => (
        <G key={i}>
          <Rect x="128" y={72 + i * 40} width="26" height="26" rx="7"
            fill={i < 2 ? '#FEF0D3' : '#F5A623'} stroke="#F5A623" strokeWidth="1.5" />
          {i < 2
            ? <Path d={`M135 ${86 + i * 40} L140 ${91 + i * 40} L150 ${79 + i * 40}`} stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            : <Path d={`M135 ${86 + i * 40} L140 ${91 + i * 40} L150 ${79 + i * 40}`} stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
          <Rect x="166" y={78 + i * 40} width={i === 1 ? 78 : 96} height="12" rx="6" fill={isDark ? '#3A2A12' : '#F5E4C4'} />
        </G>
      ))}
      <Circle cx="248" cy="175" r="22" fill="#00BBA4" />
      <SvgText x="248" y="181" textAnchor="middle" fontSize="16" fill="white" fontWeight="bold">+10</SvgText>

      <Circle cx="70" cy="80" r="5" fill="#F5A623" opacity={0.4} />
      <Circle cx="330" cy="90" r="4" fill="#00BBA4" opacity={0.5} />
      <Circle cx="60" cy="150" r="3" fill="#F04E98" opacity={0.4} />
    </Svg>
  );
});

// ── Slide 3: Schedule — a 7-day strip with one highlighted event ────────────
export const IlloReminders = React.memo(function IlloSchedule({ isDark }: IlloProps) {
  const bg0 = isDark ? '#1A2440' : '#E9F0FF';
  const bg1 = isDark ? '#0E1526' : '#F5F9FF';
  const card = isDark ? '#141C33' : 'white';
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="s-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#s-bg)" />
      <Ellipse cx="195" cy="205" rx="140" ry="40" fill={isDark ? '#152040' : '#DCE8FF'} />
      <Rect x="95" y="55" width="200" height="150" rx="16" fill={card} />
      <Rect x="95" y="55" width="200" height="150" rx="16" fill="none" stroke="#C7DBFF" strokeWidth="2" />
      {days.map((d, i) => (
        <G key={i}>
          <Circle cx={117 + i * 26} cy="85" r="12" fill={i === 3 ? '#3B82F6' : (isDark ? '#1E2A4A' : '#EDF3FF')} />
          <SvgText x={117 + i * 26} y="89" textAnchor="middle" fontSize="10" fontWeight="700" fill={i === 3 ? 'white' : (isDark ? '#7FA6E8' : '#3B82F6')}>{d}</SvgText>
        </G>
      ))}
      <Rect x="110" y="112" width="170" height="34" rx="10" fill="#3B82F6" opacity={0.12} />
      <Rect x="115" y="119" width="4" height="20" rx="2" fill="#3B82F6" />
      <Rect x="126" y="120" width="90" height="9" rx="4.5" fill={isDark ? '#3A4C7A' : '#B9CFF5'} />
      <Rect x="126" y="133" width="60" height="7" rx="3.5" fill={isDark ? '#2A3A5F' : '#D3E1FA'} />
      <Rect x="110" y="154" width="170" height="34" rx="10" fill={isDark ? '#182446' : '#F2F6FF'} />
      <Rect x="126" y="162" width="70" height="9" rx="4.5" fill={isDark ? '#2A3A5F' : '#D3E1FA'} />
      <Rect x="126" y="175" width="50" height="7" rx="3.5" fill={isDark ? '#20304F' : '#E3ECFB'} />

      <Circle cx="70" cy="90" r="5" fill="#3B82F6" opacity={0.35} />
      <Circle cx="325" cy="80" r="4" fill={BRAND_PRIMARY} opacity={0.4} />
      <Circle cx="330" cy="150" r="3" fill="#00BBA4" opacity={0.4} />
    </Svg>
  );
});

// ── Slide 4: Chat — family group thread with reactions ──────────────────────
export const IlloAIHealth = React.memo(function IlloChat({ isDark }: IlloProps) {
  const bg0 = isDark ? '#231729' : '#FCE8F3';
  const bg1 = isDark ? '#160E1B' : '#FFF6FB';
  const card = isDark ? '#211527' : 'white';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="c-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#c-bg)" />
      <Ellipse cx="195" cy="205" rx="140" ry="40" fill={isDark ? '#2E1A31' : '#FBDCEC'} />

      <Circle cx="118" cy="90" r="16" fill="#00BBA4" />
      <Rect x="140" y="76" width="130" height="30" rx="15" fill={card} />
      <Rect x="154" y="86" width="90" height="9" rx="4.5" fill={isDark ? '#3A2A38' : '#F5D6E8'} />

      <Circle cx="272" cy="135" r="16" fill="#F5A623" />
      <Rect x="130" y="121" width="128" height="30" rx="15" fill="#F04E98" />
      <Rect x="144" y="131" width="98" height="9" rx="4.5" fill="rgba(255,255,255,0.75)" />

      <Circle cx="118" cy="180" r="16" fill={BRAND_PRIMARY} />
      <Rect x="140" y="166" width="150" height="30" rx="15" fill={card} />
      <Rect x="154" y="176" width="112" height="9" rx="4.5" fill={isDark ? '#3A2A38' : '#F5D6E8'} />
      <Circle cx="272" cy="199" r="9" fill="#F5A623" />
      <SvgText x="272" y="203" textAnchor="middle" fontSize="10">❤️</SvgText>

      <Circle cx="70" cy="90" r="5" fill="#F04E98" opacity={0.4} />
      <Circle cx="330" cy="90" r="4" fill="#F5A623" opacity={0.45} />
      <Circle cx="60" cy="150" r="3" fill="#00BBA4" opacity={0.4} />
    </Svg>
  );
});

// ── Slide 5: GPS — family map with pins ──────────────────────────────────────
export const IlloSocial = React.memo(function IlloGps({ isDark }: IlloProps) {
  const bg0 = isDark ? '#131E1A' : '#DFF5F1';
  const bg1 = isDark ? '#0B1512' : '#F0FCFA';
  const card = isDark ? '#0F1A16' : 'white';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="g-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#g-bg)" />
      <Ellipse cx="195" cy="205" rx="140" ry="40" fill={isDark ? '#122019' : '#C9EFE6'} />
      <Rect x="90" y="48" width="210" height="150" rx="18" fill={card} />
      <Rect x="90" y="48" width="210" height="150" rx="18" fill="none" stroke="#9FE1CB" strokeWidth="2" />
      <Path d="M105 90 L155 65 L210 100 L285 70" stroke={isDark ? '#1E3A2E' : '#CFF0E4'} strokeWidth="8" strokeLinecap="round" fill="none" />
      <Path d="M105 150 L180 130 L240 165 L285 140" stroke={isDark ? '#1E3A2E' : '#CFF0E4'} strokeWidth="8" strokeLinecap="round" fill="none" />

      {/* Pins */}
      <G>
        <Path d="M155 95 C155 108 168 118 168 130 C168 118 181 108 181 95 A13 13 0 0 0 155 95 Z" fill="#00BBA4" />
        <Circle cx="168" cy="97" r="5" fill="white" />
      </G>
      <G>
        <Path d="M215 65 C215 78 228 88 228 100 C228 88 241 78 241 65 A13 13 0 0 0 215 65 Z" fill="#F5A623" />
        <Circle cx="228" cy="67" r="5" fill="white" />
      </G>
      <G>
        <Path d="M245 128 C245 141 258 151 258 163 C258 151 271 141 271 128 A13 13 0 0 0 245 128 Z" fill="#F04E98" />
        <Circle cx="258" cy="130" r="5" fill="white" />
      </G>

      <Circle cx="70" cy="80" r="5" fill="#00BBA4" opacity={0.4} />
      <Circle cx="325" cy="100" r="4" fill="#F5A623" opacity={0.4} />
      <Circle cx="330" cy="150" r="3" fill="#F04E98" opacity={0.4} />
    </Svg>
  );
});

// ── Slide 6: Store — reward jar filling with coins ───────────────────────────
export const IlloPlaydates = React.memo(function IlloStore({ isDark }: IlloProps) {
  const bg0 = isDark ? '#241a07' : '#FEF0D3';
  const bg1 = isDark ? '#160f03' : '#FFF9EC';
  const glass = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="j-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#j-bg)" />
      <Ellipse cx="195" cy="205" rx="130" ry="40" fill={isDark ? '#2E2108' : '#FDE6B8'} />

      {/* Jar */}
      <Path d="M150 80 h90 a14 14 0 0 1 14 14 v90 a20 20 0 0 1 -20 20 h-78 a20 20 0 0 1 -20 -20 v-90 a14 14 0 0 1 14 -14 Z" fill={glass} stroke="#F5A623" strokeWidth="3" />
      <Rect x="164" y="64" width="62" height="18" rx="6" fill="#F5A623" />

      {/* Coins inside, stacked */}
      <Circle cx="175" cy="175" r="14" fill="#F5A623" />
      <Circle cx="205" cy="180" r="14" fill="#FCD34D" />
      <Circle cx="195" cy="155" r="14" fill="#F5A623" />
      <Circle cx="220" cy="150" r="14" fill="#FCD34D" />
      <SvgText x="195" y="160" textAnchor="middle" fontSize="13" fontWeight="bold" fill="white">¢</SvgText>

      {/* Floating coin above, mid-drop */}
      <Circle cx="255" cy="95" r="16" fill="#FCD34D" />
      <SvgText x="255" y="101" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#B45309">¢</SvgText>

      <Circle cx="70" cy="90" r="5" fill="#F5A623" opacity={0.4} />
      <Circle cx="330" cy="130" r="4" fill="#FCD34D" opacity={0.5} />
      <Circle cx="60" cy="150" r="3" fill="#F04E98" opacity={0.35} />
    </Svg>
  );
});

// ── Slide 7: Ask Cube — the animated cube mark as a chat assistant ──────────
export const IlloAI = React.memo(function IlloAskCube({ isDark }: IlloProps) {
  const bg0 = isDark ? '#1E1030' : '#F0E8FA';
  const bg1 = isDark ? '#130A20' : '#FAF6FE';
  const card = isDark ? '#1C1330' : 'white';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="a-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#a-bg)" />
      <Ellipse cx="195" cy="205" rx="140" ry="40" fill={isDark ? '#251840' : '#E4D6F7'} />

      {/* Cube face, simplified */}
      <Path d="M195 45 L245 70 L245 120 L195 145 L145 120 L145 70 Z" fill={BRAND_PRIMARY} />
      <Path d="M195 45 L245 70 L195 95 L145 70 Z" fill="#C4A0EC" />
      <Circle cx="170" cy="105" r="4" fill="white" />
      <Circle cx="195" cy="115" r="4" fill="white" />
      <Circle cx="220" cy="105" r="4" fill="white" />

      {/* Speech bubble reply */}
      <Rect x="120" y="160" width="150" height="42" rx="18" fill={card} />
      <Path d="M175 202 L165 216 L190 202 Z" fill={card} />
      <Rect x="138" y="172" width="110" height="8" rx="4" fill={isDark ? '#3A2C50' : '#E4D6F7'} />
      <Rect x="138" y="185" width="80" height="8" rx="4" fill={isDark ? '#2E2340' : '#EFE6FA'} />

      <Circle cx="70" cy="90" r="5" fill={BRAND_PRIMARY} opacity={0.4} />
      <Circle cx="330" cy="90" r="4" fill="#F04E98" opacity={0.4} />
      <Circle cx="320" cy="150" r="3" fill="#00BBA4" opacity={0.4} />
    </Svg>
  );
});

// ── Slide 8: Get started — cube mark + rising confetti ───────────────────────
export const IlloGetStarted = React.memo(function IlloGetStarted({ isDark }: IlloProps) {
  const bg0 = isDark ? '#1E1030' : '#F0E8FA';
  const bg1 = isDark ? '#130A20' : '#FBF8FE';
  const shadow = isDark ? '#2A1E40' : '#DDD8F8';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="gs-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#gs-bg)" />
      <Ellipse cx="195" cy="205" rx="130" ry="40" fill={shadow} />

      <Path d="M195 55 L255 85 L255 145 L195 175 L135 145 L135 85 Z" fill={BRAND_PRIMARY} />
      <Path d="M195 55 L255 85 L195 115 L135 85 Z" fill="#C4A0EC" />
      <Path d="M135 85 L195 115 L195 175 L135 145 Z" fill="#7C4EAD" />

      <Circle cx="80" cy="70" r="6" fill="#F5A623" />
      <Rect x="300" y="60" width="10" height="10" rx="2" fill="#00BBA4" transform="rotate(20 305 65)" />
      <Circle cx="320" cy="120" r="5" fill="#F04E98" />
      <Rect x="60" y="140" width="9" height="9" rx="2" fill={BRAND_PRIMARY} transform="rotate(-15 64 144)" />
      <Circle cx="90" cy="180" r="4" fill="#F5A623" opacity={0.7} />
      <Circle cx="310" cy="170" r="4" fill="#00BBA4" opacity={0.7} />
    </Svg>
  );
});
