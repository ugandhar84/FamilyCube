import Svg, { Line } from 'react-native-svg';

// A short vertical connector between two generation rows in FamilyTreeView —
// deliberately just "these two rows are connected," not a precise fan-out to
// every individual node. At roster scale (a handful of people) that reads
// clearly without needing per-person wiring geometry.
export function GenerationBridge({ colors, isDark }: { colors: any; isDark: boolean }) {
  const stroke = isDark ? colors.border : '#D8D8E4';
  return (
    <Svg width={2} height={22}>
      <Line x1={1} y1={0} x2={1} y2={22} stroke={stroke} strokeWidth={2} />
    </Svg>
  );
}
