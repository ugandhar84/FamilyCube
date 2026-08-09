import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { EXPENSE_CATEGORY_CONFIG, type ExpenseCategory } from '@/lib/db/expenses';
import { TYPO } from '@/constants/theme';

export const DS = 168;
const DW = 22;
export const DR = (DS - DW) / 2;
const DC = 2 * Math.PI * DR;

export interface DonutSeg { key: string; pct: number; color: string; amount: number }

export const DonutChart = React.memo(function DonutChart({ segments, selectedKey, total, trackColor, textColors }: {
  segments: DonutSeg[];
  selectedKey: string | null;
  total: number;
  trackColor: string;
  textColors: { primary: string; secondary: string };
}) {
  const cx = DS / 2, cy = DS / 2;
  const active = segments.filter(s => s.pct > 0.008);
  const GAP = active.length > 1 ? 2.5 : 0;
  let offset = 0;
  const arcs = active.map(seg => {
    const arcLen = Math.max(0, seg.pct * DC - GAP);
    const rotation = offset * 360 - 90;
    offset += seg.pct;
    return { ...seg, arcLen, rotation };
  });
  const sel = arcs.find(a => a.key === selectedKey);

  return (
    <View style={{ width: DS, height: DS, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={DS} height={DS} style={{ position: 'absolute' }}>
        <Circle cx={cx} cy={cy} r={DR} fill="none" stroke={trackColor} strokeWidth={DW} />
        {arcs.map(a => (
          <Circle
            key={a.key}
            cx={cx} cy={cy} r={DR}
            fill="none"
            stroke={a.color}
            strokeWidth={selectedKey === a.key ? DW + 5 : DW}
            strokeDasharray={[a.arcLen, DC]}
            strokeLinecap="butt"
            transform={`rotate(${a.rotation}, ${cx}, ${cy})`}
            opacity={selectedKey && selectedKey !== a.key ? 0.22 : 1}
          />
        ))}
      </Svg>
      <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
        {sel ? (
          <>
            <Text style={{ fontSize: TYPO.title }}>
              {EXPENSE_CATEGORY_CONFIG[sel.key as ExpenseCategory]?.emoji}
            </Text>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: sel.color, marginTop: 2 }}>
              ${sel.amount.toFixed(0)}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: sel.color, fontWeight: '700', opacity: 0.75 }}>
              {(sel.pct * 100).toFixed(0)}%
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: TYPO.label, color: textColors.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {total > 0 ? 'TOTAL' : 'NO DATA'}
            </Text>
            {total > 0 && (
              <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: textColors.primary, marginTop: 2, letterSpacing: -0.5, textAlign: 'center' }}>
                ${total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total.toFixed(0)}
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
});
