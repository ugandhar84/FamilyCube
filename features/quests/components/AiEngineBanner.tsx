/**
 * AiEngineBanner — compact collapsible CubeAI strip for QuestsScreen.
 *
 * Collapsed (default): bot icon + title + pulse dot + Expand button
 * Expanded: 3 tool buttons (Auto-Balance, FOMO & Penalties, Chores Advice)
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

// ── Inline icons (no external dep) ───────────────────────────────────────────
const BotIcon = ({ c }: { c: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24">
    <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
    <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    <Circle cx={9} cy={14} r={1.5} fill={c} />
    <Circle cx={15} cy={14} r={1.5} fill={c} />
    <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
  </Svg>
);
const SparklesIcon = ({ c }: { c: string }) => (
  <Svg width={12} height={12} viewBox="0 0 24 24">
    <Path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" stroke={c} strokeWidth={1.5} fill={c} strokeLinejoin="round" />
  </Svg>
);
const FlameIcon = ({ c }: { c: string }) => (
  <Svg width={12} height={12} viewBox="0 0 24 24">
    <Path d="M12,22 C8.7,22 6,19.3 6,16 C6,12 9,9 10,8 C10,10 12,11 12,13 C13.5,11.5 14,9.5 13,8 C15,9 18,12 18,16 C18,19.3 15.3,22 12,22 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
  </Svg>
);
const AwardIcon = ({ c }: { c: string }) => (
  <Svg width={12} height={12} viewBox="0 0 24 24">
    <Circle cx={12} cy={8} r={6} stroke={c} strokeWidth={2} fill="none" />
    <Path d="M8.2,14.2 L6,22 L12,19 L18,22 L15.8,14.2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const ChevronDownIcon = ({ c }: { c: string }) => (
  <Svg width={12} height={12} viewBox="0 0 24 24">
    <Path d="M6 9l6 6 6-6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const ChevronUpIcon = ({ c }: { c: string }) => (
  <Svg width={12} height={12} viewBox="0 0 24 24">
    <Path d="M18 15l-6-6-6 6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

export type AiTool = 'none' | 'autobalance' | 'spark' | 'advice';

interface Props {
  showAiTool: AiTool;
  isAiLoading: boolean;
  onRunAI: (tool: AiTool) => void;
}

export function AiEngineBanner({ showAiTool, isAiLoading, onRunAI }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{
      marginHorizontal: 14, marginBottom: 12,
      backgroundColor: '#0D1424',
      borderRadius: 20,
      borderWidth: 1, borderColor: '#1E2A42',
      overflow: 'hidden',
    }}>
      {/* ── Header row — always visible ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setExpanded(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
      >
        {/* Bot icon box */}
        <View style={{
          width: 32, height: 32, borderRadius: 10,
          backgroundColor: 'rgba(108,92,231,0.25)',
          borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <BotIcon c="#C4B5FD" />
        </View>

        {/* Title + subtitle */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#C4B5FD' }}>
              CubeAI Chores Engine
            </Text>
            {/* Live pulse dot */}
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981' }} />
            {isAiLoading && <ActivityIndicator size="small" color="#A78BFA" style={{ marginLeft: 2 }} />}
          </View>
          <Text style={{ fontSize: TYPO.micro + 1, color: 'rgba(196,181,253,0.7)', marginTop: 1 }}>
            Auto-balancing & age coaching active
          </Text>
        </View>

        {/* Expand / Collapse toggle */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          backgroundColor: 'rgba(255,255,255,0.09)',
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
        }}>
          <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: '#A78BFA' }}>
            {expanded ? 'Collapse' : 'Tools'}
          </Text>
          {expanded ? <ChevronUpIcon c="#A78BFA" /> : <ChevronDownIcon c="#A78BFA" />}
        </View>
      </TouchableOpacity>

      {/* ── Expanded: 3 tool buttons ── */}
      {expanded && (
        <View style={{
          flexDirection: 'row', gap: 8,
          paddingHorizontal: 14, paddingBottom: 14,
          borderTopWidth: 1, borderTopColor: '#1E2A42',
          paddingTop: 12,
        }}>
          <TouchableOpacity
            style={[toolBtn, showAiTool === 'autobalance' && { backgroundColor: BRAND.purple, borderColor: BRAND.purple }]}
            onPress={() => onRunAI('autobalance')}
            activeOpacity={0.8}
          >
            <SparklesIcon c={showAiTool === 'autobalance' ? '#fff' : '#FCD34D'} />
            <Text style={[toolTxt, showAiTool === 'autobalance' && { color: '#fff' }]}>Auto-Balance</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[toolBtn, showAiTool === 'spark' && { backgroundColor: BRAND.amber, borderColor: BRAND.amber }]}
            onPress={() => onRunAI('spark')}
            activeOpacity={0.8}
          >
            <FlameIcon c={showAiTool === 'spark' ? '#0F172A' : BRAND.amber} />
            <Text style={[toolTxt, showAiTool === 'spark' && { color: '#0F172A' }]}>Spark</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[toolBtn, showAiTool === 'advice' && { backgroundColor: '#4338CA', borderColor: '#6366F1' }]}
            onPress={() => onRunAI('advice')}
            activeOpacity={0.8}
          >
            <AwardIcon c="#818CF8" />
            <Text style={[toolTxt]}>Advice</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const toolBtn = {
  flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const,
  justifyContent: 'center' as const, gap: 5,
  paddingVertical: 10, borderRadius: 14,
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
};
const toolTxt = {
  fontSize: TYPO.micro + 1, fontWeight: '800' as const, color: '#C4B5FD',
};
