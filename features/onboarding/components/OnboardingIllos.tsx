import React from 'react';
import { Dimensions } from 'react-native';
import Svg, {
  Circle, Ellipse, Path, Rect, Line, G, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText,
} from 'react-native-svg';

const { width, height } = Dimensions.get('window');
export const ILLO_H = Math.round(height * 0.52);

export type IlloProps = { isDark: boolean };

export const IlloWelcome = React.memo(function IlloWelcome({ isDark }: IlloProps) {
  const bg0 = isDark ? '#1E1535' : '#EDE9FC';
  const bg1 = isDark ? '#160E2B' : '#F5F2FF';
  const shadow = isDark ? '#2A1E40' : '#DDD8F8';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="bg1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#bg1)" />
      <Ellipse cx="195" cy="200" rx="130" ry="50" fill={shadow} />
      <Ellipse cx="148" cy="185" rx="38" ry="26" fill="#FF8C55" />
      <Circle cx="148" cy="140" r="36" fill="#FF8C55" />
      <Path d="M114 136 C104 120 100 136 104 150 C107 160 116 160 120 154 Z" fill="#E06030" />
      <Path d="M178 135 C188 120 192 136 188 150 C185 160 176 160 172 154 Z" fill="#E06030" />
      <Ellipse cx="148" cy="152" rx="18" ry="13" fill="#FFB080" />
      <Path d="M136 134 Q140 128 144 134" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <Path d="M152 134 Q156 128 160 134" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <Ellipse cx="148" cy="150" rx="8" ry="6" fill="#C04818" />
      <Ellipse cx="248" cy="185" rx="34" ry="25" fill="#7C5CBF" />
      <Circle cx="248" cy="140" r="33" fill="#7C5CBF" />
      <Path d="M218 133 L224 112 L234 132 Z" fill="#7C5CBF" />
      <Path d="M232 131 L242 110 L250 131 Z" fill="#7C5CBF" />
      <Path d="M220 132 L225 115 L233 131 Z" fill="#A880E0" />
      <Path d="M234 131 L242 114 L249 131 Z" fill="#A880E0" />
      <Ellipse cx="248" cy="152" rx="16" ry="11" fill="#9870D0" />
      <Path d="M237 134 Q241 128 245 134" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <Path d="M251 134 Q255 128 259 134" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <Line x1="230" y1="150" x2="240" y2="152" stroke="white" strokeWidth="1.2" opacity={0.7} />
      <Line x1="230" y1="155" x2="240" y2="156" stroke="white" strokeWidth="1.2" opacity={0.7} />
      <Line x1="266" y1="150" x2="256" y2="152" stroke="white" strokeWidth="1.2" opacity={0.7} />
      <Line x1="266" y1="155" x2="256" y2="156" stroke="white" strokeWidth="1.2" opacity={0.7} />
      <Path d="M195 118 C195 118 182 110 182 101 A8.5 8.5 0 0 1 195 94 A8.5 8.5 0 0 1 208 101 C208 110 195 118 195 118 Z" fill="#FF3B5C" />
      <Circle cx="80" cy="100" r="5" fill="#FF8C55" opacity={0.4} />
      <Circle cx="310" cy="95" r="4" fill="#14B8A6" opacity={0.5} />
      <Circle cx="320" cy="130" r="3" fill="#7C5CBF" opacity={0.4} />
      <Circle cx="70" cy="150" r="3" fill="#FF3B5C" opacity={0.4} />
      <Circle cx="340" cy="80" r="5" fill="#FF8C55" opacity={0.3} />
    </Svg>
  );
});

export const IlloHealth = React.memo(function IlloHealth({ isDark }: IlloProps) {
  const bg0 = isDark ? '#071A12' : '#E1F5EE';
  const bg1 = isDark ? '#0A1F17' : '#F0FBF7';
  const card = isDark ? '#112218' : 'white';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="bg2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#bg2)" />
      <Ellipse cx="195" cy="205" rx="140" ry="40" fill={isDark ? '#0D2B1E' : '#C2EEE0'} />
      <Rect x="110" y="40" width="160" height="185" rx="16" fill={card} />
      <Rect x="110" y="40" width="160" height="185" rx="16" fill="none" stroke="#9FE1CB" strokeWidth="2" />
      <Rect x="155" y="30" width="70" height="22" rx="11" fill="#14B8A6" />
      <SvgText x="190" y="46" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">HEALTH LOG</SvgText>
      {[0,1,2,3].map((i) => (
        <G key={i}>
          <Rect x="126" y={80 + i*34} width="26" height="26" rx="6"
            fill={i < 3 ? '#E1F5EE' : '#FFF0E8'}
            stroke={i < 3 ? '#9FE1CB' : '#FFB080'} strokeWidth="1.5" />
          {i < 3
            ? <Path d={`M130 ${93 + i*34} L136 ${99 + i*34} L144 ${87 + i*34}`}
                stroke="#14B8A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            : <><Rect x="136" y={85 + i*34} width="6" height="12" rx="2" fill="#FF8C55" />
               <Rect x="133" y={89 + i*34} width="12" height="4" rx="2" fill="#FF8C55" /></>
          }
          <Rect x="162" y={85 + i*34} width={60 - i*6} height="7" rx="3.5"
            fill={i < 3 ? '#C2EEE0' : '#FFE4CC'} />
          <Rect x="162" y={96 + i*34} width={40 - i*4} height="5" rx="2.5"
            fill={i < 3 ? '#E1F5EE' : '#FFF0E8'} />
        </G>
      ))}
      <Path d="M40 220 L80 220 L90 200 L100 238 L110 215 L120 220 L350 220"
        stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx="320" cy="100" r="34" fill="#FF8C55" />
      <Path d="M298 95 C290 82 287 95 290 106 C293 114 300 114 303 108 Z" fill="#E06030" />
      <Path d="M338 94 C346 82 349 95 346 106 C343 114 336 114 333 108 Z" fill="#E06030" />
      <Ellipse cx="320" cy="110" rx="14" ry="10" fill="#FFB080" />
      <Circle cx="313" cy="96" r="4" fill="#1a1a2e" />
      <Circle cx="327" cy="96" r="4" fill="#1a1a2e" />
      <Circle cx="314.5" cy="94.5" r="1.5" fill="white" />
      <Circle cx="328.5" cy="94.5" r="1.5" fill="white" />
      <Ellipse cx="320" cy="108" rx="5" ry="4" fill="#C04818" />
    </Svg>
  );
});

export const IlloReminders = React.memo(function IlloReminders({ isDark }: IlloProps) {
  const bg0 = isDark ? '#1E0E04' : '#FFF0E8';
  const bg1 = isDark ? '#180A02' : '#FFF8F3';
  const phone = isDark ? '#1A1230' : 'white';
  const n1bg  = isDark ? '#1E1535' : '#F5F2FF';
  const n2bg  = isDark ? '#071A17' : '#E8FDF9';
  const n3bg  = isDark ? '#1E0E04' : '#FFF0E8';
  const sub   = isDark ? '#aaa'    : '#999';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="bgRM" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#bgRM)" />
      <Ellipse cx="195" cy="212" rx="148" ry="34" fill={isDark ? '#2A1508' : '#FFE4CC'} />
      <Rect x="118" y="10" width="154" height="210" rx="22" fill={phone} />
      <Rect x="118" y="10" width="154" height="210" rx="22" fill="none" stroke="#FFB080" strokeWidth="2" />
      <Rect x="158" y="16" width="74" height="10" rx="5" fill={isDark ? '#2A1508' : '#FFE4CC'} />
      <Rect x="130" y="38" width="130" height="48" rx="12" fill={n1bg} />
      <Rect x="130" y="38" width="4" height="48" rx="2" fill="#7C5CBF" />
      <Ellipse cx="152" cy="56" rx="8" ry="5" fill="#7C5CBF" transform="rotate(-35 152 56)" />
      <Ellipse cx="161" cy="63" rx="8" ry="5" fill="#C4B8F0" transform="rotate(-35 161 63)" />
      <Line x1="145" y1="61" x2="168" y2="50" stroke="white" strokeWidth="1.5" />
      <SvgText x="174" y="53" fontSize="10" fill="#A990E8" fontWeight="700">Medication</SvgText>
      <SvgText x="174" y="66" fontSize="9" fill="#7C5CBF">Carprofen 25mg</SvgText>
      <SvgText x="174" y="78" fontSize="8" fill={sub}>Due in 2 hours</SvgText>
      <Rect x="130" y="94" width="130" height="48" rx="12" fill={n2bg} />
      <Rect x="130" y="94" width="4" height="48" rx="2" fill="#14B8A6" />
      <Rect x="143" y="108" width="18" height="6" rx="3" fill="#14B8A6" transform="rotate(-40 143 108)" />
      <Path d="M149 120 L154 112 L158 116 Z" fill="#14B8A6" />
      <Line x1="158" y1="106" x2="163" y2="100" stroke="#14B8A6" strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="155" y1="103" x2="160" y2="97" stroke="#14B8A6" strokeWidth="1.5" strokeLinecap="round" />
      <SvgText x="174" y="109" fontSize="10" fill={isDark ? '#4DD9C8' : '#0F6E56'} fontWeight="700">Vaccine Due</SvgText>
      <SvgText x="174" y="122" fontSize="9" fill="#14B8A6">FVRCP Booster</SvgText>
      <SvgText x="174" y="134" fontSize="8" fill={sub}>Tomorrow · Dr. Patel</SvgText>
      <Rect x="130" y="150" width="130" height="48" rx="12" fill={n3bg} />
      <Rect x="130" y="150" width="4" height="48" rx="2" fill="#FF8C55" />
      <Rect x="140" y="158" width="20" height="18" rx="4" fill="none" stroke="#FF8C55" strokeWidth="1.5" />
      <Line x1="140" y1="164" x2="160" y2="164" stroke="#FF8C55" strokeWidth="1.5" />
      <Rect x="144" y="153" width="3" height="6" rx="1.5" fill="#FF8C55" />
      <Rect x="153" y="153" width="3" height="6" rx="1.5" fill="#FF8C55" />
      <Rect x="143" y="168" width="5" height="4" rx="1" fill="#FFB080" />
      <Rect x="151" y="168" width="5" height="4" rx="1" fill="#FFB080" />
      <SvgText x="174" y="165" fontSize="10" fill={isDark ? '#FFB080' : '#993C1D'} fontWeight="700">Appointment</SvgText>
      <SvgText x="174" y="178" fontSize="9" fill="#FF8C55">Dental Cleaning</SvgText>
      <SvgText x="174" y="190" fontSize="8" fill={sub}>Sat 10am · City Vet</SvgText>
      <Circle cx="314" cy="36" r="26" fill="#FF8C55" />
      <Path d="M314 22 C310 22 306 26 306 32 L306 40 L303 44 L325 44 L322 40 L322 32 C322 26 318 22 314 22 Z" fill="white" />
      <Rect x="310" y="44" width="8" height="3" rx="1.5" fill="white" opacity={0.6} />
      <Ellipse cx="314" cy="48" rx="4" ry="3" fill="white" />
      <Circle cx="324" cy="22" r="7" fill="#FF3B5C" />
      <SvgText x="324" y="26" textAnchor="middle" fontSize="9" fill="white" fontWeight="700">3</SvgText>
      <Circle cx="58" cy="190" r="32" fill="#FF8C55" />
      <Path d="M30 182 C22 168 18 182 22 194 C25 203 34 203 37 197 Z" fill="#E06030" />
      <Path d="M82 180 C90 168 94 182 90 194 C87 203 78 203 75 197 Z" fill="#E06030" />
      <Ellipse cx="58" cy="200" rx="18" ry="12" fill="#FFB080" />
      <Circle cx="50" cy="184" r="5" fill="#1a1a2e" />
      <Circle cx="66" cy="184" r="5" fill="#1a1a2e" />
      <Circle cx="51.5" cy="182.5" r="2" fill="white" />
      <Circle cx="67.5" cy="182.5" r="2" fill="white" />
      <Ellipse cx="58" cy="198" rx="7" ry="5.5" fill="#C04818" />
      <Circle cx="30" cy="80" r="4" fill="#7C5CBF" opacity={0.3} />
      <Circle cx="366" cy="100" r="4" fill="#14B8A6" opacity={0.3} />
      <Circle cx="370" cy="60" r="3" fill="#FF3B5C" opacity={0.3} />
    </Svg>
  );
});

export const IlloAIHealth = React.memo(function IlloAIHealth({ isDark }: IlloProps) {
  const bg0  = isDark ? '#1E1535' : '#EDE9FC';
  const bg1  = isDark ? '#160E2B' : '#F5F2FF';
  const doc  = isDark ? '#1A1230' : 'white';
  const card = isDark ? '#1A1230' : 'white';
  const sub  = isDark ? '#aaa'    : '#666';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="bgAH" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#bgAH)" />
      <Ellipse cx="195" cy="212" rx="145" ry="34" fill={isDark ? '#2A1E40' : '#DDD8F8'} />
      <Rect x="28" y="22" width="130" height="178" rx="14" fill={doc} />
      <Rect x="28" y="22" width="130" height="178" rx="14" fill="none" stroke="#C4B8F0" strokeWidth="1.5" />
      <Rect x="60" y="14" width="66" height="18" rx="9" fill="#7C5CBF" />
      <SvgText x="93" y="27" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">VET REPORT</SvgText>
      <Rect x="42" y="44" width="100" height="7" rx="3.5" fill={isDark ? '#2A1E40' : '#DDD8F8'} />
      <Rect x="42" y="56" width="70" height="6" rx="3" fill={isDark ? '#1E1535' : '#EDE9FC'} />
      <Rect x="28" y="78" width="130" height="14" rx="0" fill="#7C5CBF" opacity={0.12} />
      <Line x1="28" y1="85" x2="158" y2="85" stroke="#7C5CBF" strokeWidth="1.5" strokeDasharray="4,3" opacity={0.6} />
      {[0,1,2,3,4,5,6].map((i) => (
        <G key={i}>
          <Rect x="42" y={72 + i * 18} width={i % 3 === 0 ? 90 : i % 3 === 1 ? 70 : 80} height="5" rx="2.5" fill={isDark ? '#2A1E40' : '#EDE9FC'} />
          <Rect x="42" y={79 + i * 18} width={i % 2 === 0 ? 60 : 50} height="4" rx="2" fill={isDark ? '#1E1535' : '#F5F2FF'} />
        </G>
      ))}
      <Circle cx="183" cy="118" r="20" fill="#7C5CBF" />
      <Path d="M174 118 L185 108 L185 114 L192 114 L192 122 L185 122 L185 128 Z" fill="white" />
      <Rect x="208" y="18" width="158" height="196" rx="16" fill={card} />
      <Rect x="208" y="18" width="158" height="196" rx="16" fill="none" stroke={isDark ? '#2A1E40' : '#DDD8F8'} strokeWidth="1.5" />
      <SvgText x="218" y="38" fontSize="10" fill="#7C5CBF" fontWeight="700">✨ AI Extracted</SvgText>
      <Rect x="218" y="44" width="138" height="36" rx="10" fill={isDark ? '#071A17' : '#F0FBF9'} />
      <Rect x="218" y="44" width="4" height="36" rx="2" fill="#14B8A6" />
      <SvgText x="228" y="58" fontSize="9" fill={isDark ? '#4DD9C8' : '#0F6E56'} fontWeight="700">💉 Rabies</SvgText>
      <SvgText x="228" y="71" fontSize="8" fill={sub}>Due: Jan 2026</SvgText>
      <Rect x="306" y="50" width="42" height="16" rx="8" fill={isDark ? '#0D2B1E' : '#C2EEE0'} />
      <SvgText x="327" y="62" textAnchor="middle" fontSize="8" fill={isDark ? '#4DD9C8' : '#0F6E56'} fontWeight="700">NORMAL</SvgText>
      <Rect x="218" y="86" width="138" height="36" rx="10" fill={isDark ? '#2D0E0E' : '#FFF5F5'} />
      <Rect x="218" y="86" width="4" height="36" rx="2" fill="#EF4444" />
      <SvgText x="228" y="100" fontSize="9" fill={isDark ? '#F87171' : '#B91C1C'} fontWeight="700">🧪 ALT (Liver)</SvgText>
      <SvgText x="228" y="113" fontSize="8" fill={sub}>142 U/L · ref 10–100</SvgText>
      <Rect x="302" y="92" width="46" height="16" rx="8" fill={isDark ? '#4A1515' : '#FEE2E2'} />
      <SvgText x="325" y="104" textAnchor="middle" fontSize="8" fill={isDark ? '#F87171' : '#B91C1C'} fontWeight="700">HIGH ⚠</SvgText>
      <Rect x="218" y="128" width="138" height="36" rx="10" fill={isDark ? '#1E1535' : '#F5F2FF'} />
      <Rect x="218" y="128" width="4" height="36" rx="2" fill="#7C5CBF" />
      <SvgText x="228" y="142" fontSize="9" fill={isDark ? '#A990E8' : '#534AB7'} fontWeight="700">💊 Carprofen</SvgText>
      <SvgText x="228" y="155" fontSize="8" fill={sub}>25mg · twice daily</SvgText>
      <Rect x="306" y="134" width="42" height="16" rx="8" fill={isDark ? '#2A1E40' : '#EDE9FC'} />
      <SvgText x="327" y="146" textAnchor="middle" fontSize="8" fill={isDark ? '#A990E8' : '#534AB7'} fontWeight="700">ACTIVE</SvgText>
      <Rect x="218" y="170" width="138" height="36" rx="10" fill={isDark ? '#1E0E04' : '#FFF8F3'} />
      <Rect x="218" y="170" width="4" height="36" rx="2" fill="#FF8C55" />
      <SvgText x="228" y="184" fontSize="9" fill={isDark ? '#FFB080' : '#993C1D'} fontWeight="700">⚖️ Weight</SvgText>
      <SvgText x="228" y="197" fontSize="8" fill={sub}>4.3 kg · stable</SvgText>
      <Rect x="306" y="176" width="42" height="16" rx="8" fill={isDark ? '#2A1508' : '#FFE4CC'} />
      <SvgText x="327" y="188" textAnchor="middle" fontSize="8" fill={isDark ? '#FFB080' : '#993C1D'} fontWeight="700">NORMAL</SvgText>
      <Circle cx="20" cy="60" r="4" fill="#7C5CBF" opacity={0.3} />
      <Circle cx="22" cy="190" r="3" fill="#14B8A6" opacity={0.35} />
      <Circle cx="378" cy="30" r="4" fill="#FF8C55" opacity={0.3} />
    </Svg>
  );
});

export const IlloSocial = React.memo(function IlloSocial({ isDark }: IlloProps) {
  const bg0 = isDark ? '#1A0E04' : '#FFF0E8';
  const bg1 = isDark ? '#110905' : '#FFF8F3';
  const shadow = isDark ? '#3A1A08' : '#FFE4CC';
  const card = isDark ? '#1E1208' : 'white';
  const sub = isDark ? '#8A8A9A' : '#666';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="bg3" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#bg3)" />
      <Ellipse cx="195" cy="210" rx="140" ry="38" fill={shadow} />
      <Rect x="30" y="30" width="180" height="90" rx="20" fill={card} />
      <Rect x="30" y="30" width="180" height="90" rx="20" fill="none" stroke="#FFB080" strokeWidth="2" />
      <Path d="M50 120 L40 140 L75 120 Z" fill={card} stroke="#FFB080" strokeWidth="2" strokeLinejoin="round" />
      <Circle cx="60" cy="75" r="24" fill="#FF8C55" />
      <Path d="M40 69 C33 58 30 69 33 78 C36 85 43 85 46 80 Z" fill="#E06030" />
      <Path d="M76 68 C83 58 86 69 83 78 C80 85 73 85 70 80 Z" fill="#E06030" />
      <Ellipse cx="60" cy="82" rx="10" ry="7" fill="#FFB080" />
      <Circle cx="54" cy="71" r="3" fill="#1a1a2e" />
      <Circle cx="66" cy="71" r="3" fill="#1a1a2e" />
      <Ellipse cx="60" cy="80" rx="4" ry="3" fill="#C04818" />
      <Rect x="92" y="58" width="100" height="10" rx="5" fill={shadow} />
      <Rect x="92" y="73" width="70" height="8" rx="4" fill={shadow} />
      <Rect x="92" y="87" width="84" height="8" rx="4" fill={shadow} />
      <Rect x="180" y="130" width="180" height="80" rx="20" fill="#7C5CBF" />
      <Path d="M340 210 L355 228 L320 210 Z" fill="#7C5CBF" />
      <Circle cx="358" cy="170" r="22" fill="white" opacity={0.9} />
      <Path d="M340 162 L344 150 L351 162 Z" fill="white" opacity={0.9} />
      <Path d="M349 162 L356 150 L360 162 Z" fill="white" opacity={0.9} />
      <Path d="M341 161 L344 153 L350 161 Z" fill="#EDE9FC" />
      <Path d="M350 161 L356 153 L359 161 Z" fill="#EDE9FC" />
      <Circle cx="352" cy="171" r="3" fill="#7C5CBF" />
      <Circle cx="364" cy="171" r="3" fill="#7C5CBF" />
      <Rect x="196" y="148" width="90" height="9" rx="4.5" fill="rgba(255,255,255,0.35)" />
      <Rect x="196" y="162" width="65" height="8" rx="4" fill="rgba(255,255,255,0.25)" />
      <Rect x="196" y="175" width="80" height="8" rx="4" fill="rgba(255,255,255,0.25)" />
      <Circle cx="200" cy="128" r="20" fill="white" />
      <Circle cx="200" cy="128" r="20" fill="none" stroke="#FFE4CC" strokeWidth="1.5" />
      <Path d="M200 137 C200 137 186 130 186 121 A8 8 0 0 1 200 117 A8 8 0 0 1 214 121 C214 130 200 137 200 137 Z" fill="#FF3B5C" />
      <Ellipse cx="348" cy="50" rx="7" ry="8" fill="#FF8C55" opacity={0.3} transform="rotate(-22 348 50)" />
      <Ellipse cx="362" cy="42" rx="6" ry="7" fill="#FF8C55" opacity={0.3} transform="rotate(-5 362 42)" />
      <Ellipse cx="374" cy="50" rx="6" ry="7" fill="#FF8C55" opacity={0.3} transform="rotate(18 374 50)" />
      <Path d="M361 68 C361 68 348 61 348 52 A7 7 0 0 1 361 47 A7 7 0 0 1 374 52 C374 61 361 68 361 68 Z" fill="#FF8C55" opacity={0.3} />
    </Svg>
  );
});

export const IlloAI = React.memo(function IlloAI({ isDark }: IlloProps) {
  const bg0 = isDark ? '#071714' : '#E8F8F6';
  const bg1 = isDark ? '#0A1D1B' : '#F0FBFA';
  const shadow = isDark ? '#0D2B27' : '#B8EDE8';
  const phone = isDark ? '#0F1E1C' : 'white';
  const notch = isDark ? '#0D2B27' : '#B8EDE8';
  const badgeBg = isDark ? '#121212' : 'white';
  const badgeText = isDark ? '#E8E8F0' : '#1a1a2e';
  const barTrack = isDark ? '#0D2B27' : '#E1F5F4';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="bgAI" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
        <SvgLinearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#14B8A6" stopOpacity="0.18" />
          <Stop offset="1" stopColor="#14B8A6" stopOpacity="0.04" />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#bgAI)" />
      <Ellipse cx="195" cy="210" rx="145" ry="36" fill={shadow} />
      <Rect x="52" y="18" width="120" height="180" rx="18" fill={phone} />
      <Rect x="52" y="18" width="120" height="180" rx="18" fill="none" stroke="#14B8A6" strokeWidth="2" />
      <Rect x="97" y="22" width="30" height="8" rx="4" fill={notch} />
      <Rect x="68" y="44" width="88" height="88" rx="12" fill="url(#scanGrad)" />
      <Path d="M68 64 L68 44 L88 44" stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M136 44 L156 44 L156 64" stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M68 112 L68 132 L88 132" stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M156 112 L156 132 L136 132" stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Line x1="68" y1="88" x2="156" y2="88" stroke="#14B8A6" strokeWidth="1.5" strokeDasharray="5,4" opacity={0.7} />
      <Circle cx="112" cy="88" r="28" fill="#7C5CBF" />
      <Path d="M88 80 L93 66 L101 80 Z" fill="#7C5CBF" />
      <Path d="M100 79 L108 65 L114 79 Z" fill="#7C5CBF" />
      <Path d="M89 79 L93 69 L100 79 Z" fill="#9870D0" />
      <Path d="M101 79 L108 68 L113 79 Z" fill="#9870D0" />
      <Ellipse cx="112" cy="98" rx="13" ry="9" fill="#9870D0" />
      <Path d="M102 82 Q106 77 110 82" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
      <Path d="M114 82 Q118 77 122 82" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
      <Line x1="96" y1="96" x2="104" y2="97.5" stroke="white" strokeWidth="1" opacity={0.6} />
      <Line x1="128" y1="96" x2="120" y2="97.5" stroke="white" strokeWidth="1" opacity={0.6} />
      <Rect x="66" y="142" width="92" height="12" rx="6" fill={barTrack} />
      <Rect x="66" y="142" width="70" height="12" rx="6" fill="#14B8A6" opacity={0.85} />
      <Rect x="66" y="160" width="92" height="8" rx="4" fill={barTrack} />
      <Rect x="66" y="172" width="92" height="8" rx="4" fill={barTrack} />
      <Rect x="66" y="172" width="55" height="8" rx="4" fill="#7C5CBF" opacity={0.5} />
      <Rect x="186" y="28" width="76" height="28" rx="14" fill={badgeBg} />
      <Rect x="186" y="28" width="76" height="28" rx="14" fill="none" stroke="#FFB080" strokeWidth="1.5" />
      <SvgText x="198" y="47" fontSize="14">😊</SvgText>
      <SvgText x="218" y="47" fontSize="11" fill={badgeText} fontWeight="600">Happy</SvgText>
      <SvgText x="248" y="47" fontSize="10" fill="#14B8A6" fontWeight="700">88%</SvgText>
      <Rect x="196" y="70" width="82" height="28" rx="14" fill={badgeBg} />
      <Rect x="196" y="70" width="82" height="28" rx="14" fill="none" stroke="#7C5CBF" strokeWidth="1.5" />
      <SvgText x="208" y="89" fontSize="14">⚡</SvgText>
      <SvgText x="228" y="89" fontSize="11" fill={badgeText} fontWeight="600">Playful</SvgText>
      <SvgText x="264" y="89" fontSize="10" fill="#7C5CBF" fontWeight="700">92%</SvgText>
      <Rect x="186" y="112" width="74" height="28" rx="14" fill={badgeBg} />
      <Rect x="186" y="112" width="74" height="28" rx="14" fill="none" stroke="#14B8A6" strokeWidth="1.5" />
      <SvgText x="198" y="131" fontSize="14">🌿</SvgText>
      <SvgText x="218" y="131" fontSize="11" fill={badgeText} fontWeight="600">Calm</SvgText>
      <SvgText x="248" y="131" fontSize="10" fill="#14B8A6" fontWeight="700">75%</SvgText>
      <Rect x="200" y="154" width="160" height="58" rx="16" fill="#7C5CBF" />
      <Path d="M212 212 L202 228 L228 212 Z" fill="#7C5CBF" />
      <Circle cx="224" cy="178" r="10" fill="none" stroke="white" strokeWidth="2.2" />
      <Path d="M224 188 Q224 196 232 196 Q240 196 240 188 L240 182" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <Circle cx="240" cy="180" r="3" fill="white" />
      <Rect x="244" y="167" width="96" height="8" rx="4" fill="rgba(255,255,255,0.4)" />
      <Rect x="244" y="180" width="70" height="8" rx="4" fill="rgba(255,255,255,0.3)" />
      <Rect x="244" y="193" width="84" height="8" rx="4" fill="rgba(255,255,255,0.3)" />
      <Circle cx="40" cy="50" r="5" fill="#14B8A6" opacity={0.35} />
      <Circle cx="370" cy="44" r="4" fill="#7C5CBF" opacity={0.35} />
      <Circle cx="374" cy="140" r="3" fill="#FF8C55" opacity={0.4} />
      <Circle cx="34" cy="170" r="3" fill="#14B8A6" opacity={0.35} />
    </Svg>
  );
});

export const IlloGetStarted = React.memo(function IlloGetStarted({ isDark }: IlloProps) {
  const bg0 = isDark ? '#120C24' : '#EDE9FC';
  const bg1 = isDark ? '#18102E' : '#F5F2FF';
  const shadow = isDark ? '#1E1538' : '#DDD8F8';
  const innerEar = isDark ? '#2A1E4A' : '#EDE9FC';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="bg4" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
        <SvgLinearGradient id="pawGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7C5CBF" />
          <Stop offset="1" stopColor="#14B8A6" />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#bg4)" />
      <Ellipse cx="195" cy="210" rx="140" ry="38" fill={shadow} />
      <Ellipse cx="130" cy="115" rx="28" ry="32" fill="url(#pawGrad)" transform="rotate(-22 130 115)" />
      <Ellipse cx="178" cy="92" rx="28" ry="32" fill="url(#pawGrad)" transform="rotate(-5 178 92)" />
      <Ellipse cx="228" cy="95" rx="28" ry="32" fill="url(#pawGrad)" transform="rotate(8 228 95)" />
      <Ellipse cx="270" cy="118" rx="28" ry="32" fill="url(#pawGrad)" transform="rotate(24 270 118)" />
      <Path d="M200 210 C200 210 132 174 132 132 A44 44 0 0 1 200 110 A44 44 0 0 1 268 132 C268 174 200 210 200 210 Z" fill="#FF8C55" />
      <Circle cx="182" cy="162" r="22" fill="#FF8C55" />
      <Path d="M163 156 C156 145 153 156 157 165 C159 172 166 172 169 167 Z" fill="#E06030" />
      <Path d="M198 155 C205 145 208 156 204 165 C202 172 195 172 192 167 Z" fill="#E06030" />
      <Ellipse cx="182" cy="170" rx="12" ry="8.5" fill="#FFB080" />
      <Path d="M174 157 Q178 152 182 157" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" fill="none" />
      <Path d="M182 157 Q186 152 190 157" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" fill="none" />
      <Ellipse cx="182" cy="168" rx="5" ry="4" fill="#C04818" />
      <Circle cx="220" cy="163" r="20" fill="white" opacity={0.95} />
      <Path d="M207 155 L211 144 L218 155 Z" fill="white" opacity={0.95} />
      <Path d="M216 155 L223 144 L227 155 Z" fill="white" opacity={0.95} />
      <Path d="M209 154 L212 147 L217 154 Z" fill={innerEar} />
      <Path d="M217 154 L223 147 L226 154 Z" fill={innerEar} />
      <Path d="M213 159 Q215 156 217 159" stroke="#7C5CBF" strokeWidth="2" strokeLinecap="round" fill="none" />
      <Path d="M217 159 Q219 156 221 159" stroke="#7C5CBF" strokeWidth="2" strokeLinecap="round" fill="none" />
      <Line x1="205" y1="162" x2="213" y2="163.5" stroke="#9870D0" strokeWidth="1" opacity={0.6} />
      <Line x1="235" y1="162" x2="227" y2="163.5" stroke="#9870D0" strokeWidth="1" opacity={0.6} />
      <Circle cx="60" cy="80" r="6" fill="#FF8C55" opacity={0.4} />
      <Circle cx="330" cy="70" r="5" fill="#14B8A6" opacity={0.5} />
      <Circle cx="345" cy="110" r="4" fill="#FF3B5C" opacity={0.4} />
      <Circle cx="50" cy="130" r="4" fill="#7C5CBF" opacity={0.4} />
    </Svg>
  );
});

export const IlloPlaydates = React.memo(function IlloPlaydates({ isDark }: IlloProps) {
  const bg0 = isDark ? '#1A0E04' : '#FFF0E8';
  const bg1 = isDark ? '#110905' : '#FFF8F3';
  const shadow = isDark ? '#3A1A08' : '#FFE4CC';
  const mapCard = isDark ? '#1C1208' : 'white';
  const mapGrid = isDark ? '#2A1A0A' : '#FFF0E8';
  const bottomCard = isDark ? '#1C1208' : 'white';
  const bottomCard2 = isDark ? '#1C1530' : 'white';
  const sub = isDark ? '#8A8A9A' : '#666';
  return (
    <Svg width={width} height={ILLO_H} viewBox={`0 0 390 ${ILLO_H}`}>
      <Defs>
        <SvgLinearGradient id="bgPD" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={bg0} />
          <Stop offset="1" stopColor={bg1} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="390" height="240" fill="url(#bgPD)" />
      <Ellipse cx="195" cy="210" rx="145" ry="36" fill={shadow} />
      <Rect x="80" y="20" width="230" height="150" rx="20" fill={mapCard} />
      <Rect x="80" y="20" width="230" height="150" rx="20" fill="none" stroke="#FFB080" strokeWidth="1.5" />
      <Line x1="80" y1="65" x2="310" y2="65" stroke={mapGrid} strokeWidth="1.5" />
      <Line x1="80" y1="110" x2="310" y2="110" stroke={mapGrid} strokeWidth="1.5" />
      <Line x1="155" y1="20" x2="155" y2="170" stroke={mapGrid} strokeWidth="1.5" />
      <Line x1="235" y1="20" x2="235" y2="170" stroke={mapGrid} strokeWidth="1.5" />
      <Path d="M148 128 C148 100 242 100 242 72" stroke="#FF8C55" strokeWidth="2" strokeDasharray="6,4" strokeLinecap="round" fill="none" opacity={0.7} />
      <Ellipse cx="148" cy="138" rx="14" ry="6" fill="#E06030" opacity={0.25} />
      <Path d="M148 88 C148 88 126 108 126 122 A22 22 0 0 0 170 122 C170 108 148 88 148 88 Z" fill="#FF8C55" />
      <Circle cx="148" cy="118" r="16" fill="white" />
      <Circle cx="148" cy="116" r="11" fill="#FF8C55" />
      <Path d="M138 112 C134 106 132 112 134 117 C136 121 140 121 142 118 Z" fill="#E06030" />
      <Path d="M158 111 C162 106 164 112 162 117 C160 121 156 121 154 118 Z" fill="#E06030" />
      <Ellipse cx="148" cy="120" rx="6" ry="4.5" fill="#FFB080" />
      <Circle cx="144.5" cy="113" r="2.5" fill="#1a1a2e" />
      <Circle cx="151.5" cy="113" r="2.5" fill="#1a1a2e" />
      <Ellipse cx="148" cy="119" rx="2.5" ry="2" fill="#C04818" />
      <Ellipse cx="242" cy="82" rx="14" ry="6" fill="#9870D0" opacity={0.25} />
      <Path d="M242 32 C242 32 220 52 220 66 A22 22 0 0 0 264 66 C264 52 242 32 242 32 Z" fill="#7C5CBF" />
      <Circle cx="242" cy="62" r="16" fill="white" />
      <Circle cx="242" cy="60" r="11" fill="#7C5CBF" />
      <Path d="M232 54 L235 46 L240 54 Z" fill="#7C5CBF" />
      <Path d="M238 54 L243 46 L246 54 Z" fill="#7C5CBF" />
      <Path d="M233 53 L235 48 L239 53 Z" fill="#9870D0" />
      <Path d="M239 53 L243 48 L245 53 Z" fill="#9870D0" />
      <Ellipse cx="242" cy="64" rx="6" ry="4" fill="#9870D0" />
      <Circle cx="238.5" cy="58" r="2.5" fill="white" />
      <Circle cx="245.5" cy="58" r="2.5" fill="white" />
      <Rect x="148" y="176" width="94" height="28" rx="14" fill="#FF8C55" />
      <SvgText x="163" y="195" fontSize="13">📍</SvgText>
      <SvgText x="182" y="195" fontSize="11" fill="white" fontWeight="700">0.4 km away</SvgText>
      <Rect x="22" y="162" width="104" height="52" rx="14" fill={bottomCard} />
      <Rect x="22" y="162" width="104" height="52" rx="14" fill="none" stroke="#FFB080" strokeWidth="1.5" />
      <SvgText x="34" y="182" fontSize="11" fill="#993C1D" fontWeight="700">🐾 Playdate</SvgText>
      <SvgText x="34" y="197" fontSize="10" fill={sub}>Sat · 10am</SvgText>
      <SvgText x="34" y="210" fontSize="10" fill="#14B8A6" fontWeight="600">Confirmed ✓</SvgText>
      <Rect x="264" y="162" width="104" height="52" rx="14" fill={bottomCard2} />
      <Rect x="264" y="162" width="104" height="52" rx="14" fill="none" stroke="#DDD8F8" strokeWidth="1.5" />
      <SvgText x="276" y="182" fontSize="11" fill="#534AB7" fontWeight="700">💜 Match</SvgText>
      <SvgText x="276" y="197" fontSize="10" fill={sub}>Same breed</SvgText>
      <SvgText x="276" y="210" fontSize="10" fill="#7C5CBF" fontWeight="600">Golden · 2yr</SvgText>
      <Circle cx="38" cy="48" r="5" fill="#FF8C55" opacity={0.35} />
      <Circle cx="358" cy="148" r="4" fill="#7C5CBF" opacity={0.35} />
      <Circle cx="50" cy="160" r="3" fill="#FF3B5C" opacity={0.3} />
      <Circle cx="362" cy="38" r="4" fill="#FF8C55" opacity={0.3} />
    </Svg>
  );
});
