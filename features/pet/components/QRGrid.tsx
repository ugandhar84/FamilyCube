import React, { useMemo } from 'react';
import { View } from 'react-native';

interface QRGridProps {
  value: string;
  size: number;
  color: string;
  padding?: number;
  borderRadius?: number;
}

export const QRGrid = React.memo(function QRGrid({ value, size, color, padding = 3, borderRadius = 10 }: QRGridProps) {
  const grid = useMemo(() => {
    const N = 21;
    const cells: boolean[] = [];
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const corner = (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
      cells.push(corner || (((hash ^ (r * 73 + c * 37)) & 1) === 1));
    }
    return { cells, N };
  }, [value]);
  const cell = size / grid.N;
  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff', borderRadius, padding }}>
      {Array.from({ length: grid.N }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {Array.from({ length: grid.N }).map((_, c) => (
            <View key={c} style={{ width: cell, height: cell,
              backgroundColor: grid.cells[r * grid.N + c] ? color : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
  );
});
