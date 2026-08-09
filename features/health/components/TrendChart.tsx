import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SPACING, TYPO } from '@/constants/theme';
import { format, parseISO } from 'date-fns';
import { usesImperial } from '@/lib/units';
import type { WeightLog } from '@/lib/db/weight';

export const TrendChart = React.memo(function TrendChart({ weights, accent, colors }: { weights: WeightLog[]; accent: string; colors: any }) {
  const imperial = usesImperial();
  const data = [...weights].reverse().slice(-16);
  if (data.length < 2) return null;

  const vals = data.map(w => imperial ? w.weight_kg * 2.20462 : w.weight_kg);
  const maxV = Math.max(...vals);
  const minV = Math.min(...vals);
  const range = maxV - minV || 0.1;
  const H = 72;

  return (
    <View style={{ marginHorizontal: SPACING.xl, marginBottom: 4 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary,
          letterSpacing: 0.5, marginBottom: 12 }}>
          TREND — LAST {data.length} READINGS
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 4 }}>
          {vals.map((v, i) => {
            const barH = Math.max(6, ((v - minV) / range) * (H - 8) + 4);
            const isLast = i === vals.length - 1;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                <View style={{ width: '100%', height: barH, borderRadius: 4,
                  backgroundColor: isLast ? accent : accent + '35' }} />
                {(i === 0 || i === vals.length - 1 || vals.length <= 6) && (
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }} numberOfLines={1}>
                    {v.toFixed(1)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
            {(() => { try { return format(parseISO(data[0].logged_at), 'MMM d'); } catch { return ''; } })()}
          </Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
            {(() => { try { return format(parseISO(data[data.length - 1].logged_at), 'MMM d'); } catch { return ''; } })()}
          </Text>
        </View>
      </View>
    </View>
  );
});
