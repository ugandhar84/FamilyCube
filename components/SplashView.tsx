import { View, StyleSheet, useColorScheme } from 'react-native';
import Svg, { Ellipse, Circle, Polyline } from 'react-native-svg';

const LIGHT_BG  = '#6B2FD4';
const DARK_BG   = '#1C0A3A';
const AMBER     = '#FFB347';

export default function SplashView() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const bg = isDark ? DARK_BG : LIGHT_BG;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Svg width={220} height={220} viewBox="0 0 1024 1024">
        {/* Toe pads */}
        <Ellipse cx="0" cy="0" rx="9" ry="7"     transform="translate(154 327) rotate(-22) scale(8.6)" fill="white" />
        <Ellipse cx="0" cy="0" rx="8.5" ry="6.5" transform="translate(309 241) rotate(-8) scale(8.6)"  fill="white" />
        <Ellipse cx="0" cy="0" rx="8.5" ry="6.5" transform="translate(550 241) rotate(8) scale(8.6)"   fill="white" />
        <Ellipse cx="0" cy="0" rx="9" ry="7"     transform="translate(705 327) rotate(22) scale(8.6)"  fill="white" />
        {/* Main pad */}
        <Circle cx="512" cy="580" r="189" fill="white" />
        {/* Amber heartbeat */}
        <Polyline
          points="34,577 224,577 284,413 344,723 396,499 448,577 826,577"
          fill="none"
          stroke={AMBER}
          strokeWidth="34"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
