import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGrad, Stop, Line, Text as SvgText } from 'react-native-svg';
import { format, parseISO } from 'date-fns';

interface Point { logged_at: string; weight_kg: number }

interface Props {
  data: Point[];
  width: number;
  height?: number;
  color?: string;
  textColor?: string;
  unit?: string;
}

export default function WeightChart({ data, width, height = 130, color = '#7C5CBF', textColor = '#A1A1AA', unit = 'kg' }: Props) {
  if (!data || data.length < 2) {
    return (
      <View style={[s.empty, { width, height }]}>
        <Text style={[s.emptyText, { color: textColor }]}>Log at least 2 weights to see chart</Text>
      </View>
    );
  }

  const PAD = { top: 10, right: 12, bottom: 28, left: 36 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  const sorted = [...data].sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  const weights = sorted.map(d => d.weight_kg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  const xOf = (i: number) => PAD.left + (i / (sorted.length - 1)) * W;
  const yOf = (w: number) => PAD.top + H - ((w - min) / range) * H;

  // Build path
  const linePts = sorted.map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(d.weight_kg)}`).join(' ');
  const areaPath = `${linePts} L${xOf(sorted.length - 1)},${PAD.top + H} L${xOf(0)},${PAD.top + H} Z`;

  // Y axis labels (3 lines)
  const yLabels = [min, (min + max) / 2, max].map(v => v.toFixed(1));

  // X axis labels (first and last)
  const xLabels = [
    { x: xOf(0), label: format(parseISO(sorted[0].logged_at), 'MMM d') },
    { x: xOf(sorted.length - 1), label: format(parseISO(sorted[sorted.length - 1].logged_at), 'MMM d') },
  ];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id="wg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </SvgGrad>
      </Defs>

      {/* Horizontal grid lines */}
      {[0, 0.5, 1].map((t, i) => {
        const y = PAD.top + H - t * H;
        return (
          <React.Fragment key={i}>
            <Line x1={PAD.left} y1={y} x2={PAD.left + W} y2={y}
              stroke="rgba(124,92,191,0.08)" strokeWidth={1} strokeDasharray="4,3" />
            <SvgText
              x={PAD.left - 4} y={y + 4}
              fontSize={9} fill={textColor} textAnchor="end"
            >{yLabels[i]}</SvgText>
          </React.Fragment>
        );
      })}

      {/* Area fill */}
      <Path d={areaPath} fill="url(#wg)" />

      {/* Line */}
      <Path d={linePts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots */}
      {sorted.map((d, i) => (
        <Circle key={i} cx={xOf(i)} cy={yOf(d.weight_kg)}
          r={i === sorted.length - 1 ? 4 : 3}
          fill={i === sorted.length - 1 ? color : '#fff'}
          stroke={color} strokeWidth={2} />
      ))}

      {/* X labels */}
      {xLabels.map(({ x, label }, i) => (
        <SvgText key={i} x={x} y={height - 4} fontSize={9} fill={textColor} textAnchor="middle">{label}</SvgText>
      ))}

      {/* Unit tag */}
      <SvgText x={PAD.left} y={PAD.top - 2} fontSize={8} fill={`${textColor}88`}>{unit}</SvgText>
    </Svg>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#A1A1AA', textAlign: 'center' },
});
