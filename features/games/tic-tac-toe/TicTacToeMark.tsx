/**
 * TicTacToeMark — X/O rendered as rounded-cap SVG strokes, not text
 * glyphs. Per the design plan: rounded stroke caps read as neon-drawn
 * rather than typeset, and this shape also gives the placement animation
 * (a stroke scaling in) something to actually animate.
 */
import Svg, { Line, Circle } from 'react-native-svg';
import { ARCADE } from '../theme/gameTheme';

export function TicTacToeMark({ symbol, size }: { symbol: 'X' | 'O'; size: number }) {
  const stroke = symbol === 'X' ? ARCADE.ticTacToeX : ARCADE.ticTacToeO;
  const strokeWidth = size * 0.16;
  const pad = size * 0.18;

  if (symbol === 'O') {
    const r = size / 2 - pad;
    return (
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size}>
      <Line x1={pad} y1={pad} x2={size - pad} y2={size - pad} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={size - pad} y1={pad} x2={pad} y2={size - pad} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
