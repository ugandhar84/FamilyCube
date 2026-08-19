/**
 * AiEngineBanner — CubeAI Chores Engine, collapsed to a small pill button by
 * default. Tapping it slides open to the right, expanding into the 3 tool
 * buttons (Auto-Balance, Spark, Advice) inline in a single row instead of a
 * full-width banner permanently occupying the top of the screen. Each tool
 * gets a filled icon chip in a real brand token (colors.primary/kid/pink),
 * not a hardcoded dark-purple palette.
 */
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { TYPO } from '@/constants/theme';

// ── Inline icons (no external dep) ───────────────────────────────────────────
const BotIcon = ({ c }: { c: string }) => (
  <Svg width={15} height={15} viewBox="0 0 24 24">
    <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
    <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    <Circle cx={9} cy={14} r={1.5} fill={c} />
    <Circle cx={15} cy={14} r={1.5} fill={c} />
    <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
  </Svg>
);
const SparklesIcon = ({ c }: { c: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24">
    <Path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" fill={c} />
  </Svg>
);
const FlameIcon = ({ c }: { c: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24">
    <Path d="M12,22 C8.7,22 6,19.3 6,16 C6,12 9,9 10,8 C10,10 12,11 12,13 C13.5,11.5 14,9.5 13,8 C15,9 18,12 18,16 C18,19.3 15.3,22 12,22 Z" fill={c} />
  </Svg>
);
const AwardIcon = ({ c }: { c: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24">
    <Circle cx={12} cy={8} r={6} fill={c} />
    <Path d="M8.2,14.2 L6,22 L12,19 L18,22 L15.8,14.2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const XIcon = ({ c }: { c: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24">
    <Path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth={2.5} strokeLinecap="round" fill="none" />
  </Svg>
);

export type AiTool = 'none' | 'autobalance' | 'spark' | 'advice';

interface Props {
  showAiTool: AiTool;
  isAiLoading: boolean;
  onRunAI: (tool: AiTool) => void;
  colors: any;
  isDark: boolean;
}

export function AiEngineBanner({ showAiTool, isAiLoading, onRunAI, colors }: Props) {
  const [expanded, setExpanded] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const toggle = (next: boolean) => {
    setExpanded(next);
    Animated.timing(slideAnim, { toValue: next ? 1 : 0, duration: 240, useNativeDriver: false }).start();
  };

  const TOOLS: { key: AiTool; label: string; icon: (c: string) => React.ReactNode; tint: string }[] = [
    { key: 'autobalance', label: 'Balance', icon: c => <SparklesIcon c={c} />, tint: colors.primary },
    { key: 'spark',       label: 'Spark',   icon: c => <FlameIcon c={c} />,    tint: colors.kid },
    { key: 'advice',      label: 'Advice',  icon: c => <AwardIcon c={c} />,    tint: colors.pink },
  ];

  return (
    <View style={{ alignItems: 'flex-start' }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.card, borderRadius: 999,
        borderWidth: 1, borderColor: colors.border,
      }}>
        {/* Pill button — always visible, bot icon + label. Tapping slides
            the tool row open to the right instead of a full-width banner. */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => toggle(!expanded)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9 }}
        >
          <View style={{
            width: 24, height: 24, borderRadius: 8,
            backgroundColor: colors.primaryLight,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <BotIcon c={colors.primary} />
          </View>
          {!expanded && (
            <>
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.primary }}>CubeAI</Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
              {isAiLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 2 }} />}
            </>
          )}
          {expanded && <XIcon c={colors.primary} />}
        </TouchableOpacity>

        {/* ── Tool row — all three inline in one row, sliding in from the pill ── */}
        {expanded && (
          <Animated.View style={{
            flexDirection: 'row', gap: 6, paddingRight: 8,
            opacity: slideAnim,
            transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          }}>
            {TOOLS.map(tool => {
              const active = showAiTool === tool.key;
              return (
                <TouchableOpacity key={tool.key}
                  onPress={() => { onRunAI(tool.key); toggle(false); }}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
                    backgroundColor: active ? tool.tint : tool.tint + '18',
                    borderWidth: 1, borderColor: tool.tint + (active ? '' : '40'),
                  }}
                >
                  {tool.icon(active ? colors.textInverse : tool.tint)}
                  <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: active ? colors.textInverse : tool.tint }}>
                    {tool.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}
      </View>
    </View>
  );
}
