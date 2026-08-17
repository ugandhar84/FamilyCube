import { View } from 'react-native';

// Connector primitives for FamilyTreeView, modeled on a standard family-tree
// diagram: a short horizontal line joins a couple, a vertical drops from
// their midpoint to a horizontal bar spanning their children's x-range,
// then a vertical drops into each child. Built from plain positioned Views
// (not SVG) so pixel math stays simple and predictable at this small scale.

const LINE_COLOR_LIGHT = '#D8D8E4';
const LINE_COLOR_DARK  = '#334155';
// Vertical space reserved between two generation rows. Each node's full
// stack (avatar + name + icon row) runs close to the row height it's given
// (see NODE_ROW_HEIGHT in FamilyTreeView), so this needs real clearance —
// too small and the connector visually laps into the avatar above/below it.
const GAP = 48;

export function lineColor(isDark: boolean, colors: any) {
  return isDark ? (colors.border ?? LINE_COLOR_DARK) : LINE_COLOR_LIGHT;
}

/** Horizontal line joining two x-positions at a given y, centered vertically in a node row. */
export function CoupleLine({ x1, x2, y, color }: { x1: number; x2: number; y: number; color: string }) {
  const left = Math.min(x1, x2);
  const width = Math.abs(x2 - x1);
  if (width <= 0) return null;
  return (
    <View style={{ position: 'absolute', left, top: y - 1, width, height: 2, backgroundColor: color }} />
  );
}

/** The drop-and-spread connector between one generation row and the next. */
export function GenerationLinks({ fromX, toXs, color }: { fromX: number; toXs: number[]; color: string }) {
  if (toXs.length === 0) return null;
  const minX = Math.min(fromX, ...toXs);
  const maxX = Math.max(fromX, ...toXs);
  const midY = GAP / 2;
  return (
    <View style={{ height: GAP, width: maxX - minX || 2 }}>
      {/* drop from parent midpoint to the horizontal bar */}
      <View style={{ position: 'absolute', left: fromX - minX - 1, top: 0, width: 2, height: midY, backgroundColor: color }} />
      {/* horizontal bar spanning all children (collapses to a point if only one) */}
      <View style={{ position: 'absolute', left: 0, top: midY - 1, width: maxX - minX, height: 2, backgroundColor: color }} />
      {/* drop into each child */}
      {toXs.map((x, i) => (
        <View key={i} style={{ position: 'absolute', left: x - minX - 1, top: midY, width: 2, height: midY, backgroundColor: color }} />
      ))}
    </View>
  );
}

export const GENERATION_GAP = GAP;
