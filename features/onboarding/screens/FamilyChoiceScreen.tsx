/**
 * FamilyChoiceScreen — shown after Terms acceptance.
 * Parent chooses "Create My Family" or member enters "Join with Code".
 */
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import Svg, { Circle, Path, Rect, G, Ellipse, Polygon } from 'react-native-svg';

const { width } = Dimensions.get('window');

// ─── Hero SVG — family silhouette ─────────────────────────────────────────────
function FamilyHeroSvg() {
  return (
    <Svg width={width * 0.82} height={220} viewBox="0 0 340 220">
      {/* Sky gradient backdrop */}
      <Ellipse cx="170" cy="200" rx="160" ry="28" fill="#E8D5FA" opacity="0.6" />

      {/* House */}
      <Rect x="110" y="110" width="120" height="90" rx="4" fill="#C4A0EC" />
      <Polygon points="100,115 170,60 240,115" fill="#9261C7" />
      {/* Door */}
      <Rect x="150" y="155" width="40" height="45" rx="6" fill="#6A3FA0" />
      <Circle cx="183" cy="178" r="3" fill="#E8D5FA" />
      {/* Windows */}
      <Rect x="120" y="128" width="30" height="25" rx="4" fill="#F0E8FA" />
      <Rect x="190" y="128" width="30" height="25" rx="4" fill="#F0E8FA" />
      {/* Window panes */}
      <Rect x="134" y="128" width="2" height="25" fill="#C4A0EC" />
      <Rect x="120" y="140" width="30" height="2" fill="#C4A0EC" />
      <Rect x="204" y="128" width="2" height="25" fill="#C4A0EC" />
      <Rect x="190" y="140" width="30" height="2" fill="#C4A0EC" />

      {/* Parent left */}
      <Circle cx="68" cy="90" r="18" fill="#F59E0B" />
      <Path d="M45 200 Q68 140 91 200" fill="#F59E0B" opacity="0.9" />
      {/* Parent right */}
      <Circle cx="272" cy="90" r="18" fill="#10B981" />
      <Path d="M249 200 Q272 140 295 200" fill="#10B981" opacity="0.9" />

      {/* Kid center */}
      <Circle cx="170" cy="50" r="14" fill="#9261C7" />
      <Path d="M152 200 Q170 155 188 200" fill="#9261C7" opacity="0.9" />

      {/* Grandparent small */}
      <Circle cx="310" cy="115" r="12" fill="#EC4899" />
      <Path d="M297 200 Q310 165 323 200" fill="#EC4899" opacity="0.9" />

      {/* Stars */}
      <Circle cx="30" cy="30" r="3" fill="#9261C7" opacity="0.5" />
      <Circle cx="50" cy="18" r="2" fill="#F59E0B" opacity="0.6" />
      <Circle cx="300" cy="25" r="3" fill="#10B981" opacity="0.5" />
      <Circle cx="320" cy="40" r="2" fill="#EC4899" opacity="0.6" />
      <Circle cx="15" cy="55" r="2" fill="#9261C7" opacity="0.4" />

      {/* Connecting arcs */}
      <Path d="M86 88 Q130 70 156 58" stroke="#9261C7" strokeWidth="2" fill="none" strokeDasharray="4,4" opacity="0.5" />
      <Path d="M254 88 Q210 70 184 58" stroke="#9261C7" strokeWidth="2" fill="none" strokeDasharray="4,4" opacity="0.5" />
    </Svg>
  );
}

// ─── Card SVG icons ────────────────────────────────────────────────────────────
function CreateFamilySvg() {
  return (
    <Svg width="52" height="52" viewBox="0 0 52 52">
      <Circle cx="26" cy="26" r="26" fill="#F0E8FA" />
      <Circle cx="26" cy="18" r="8" fill="#9261C7" />
      <Path d="M10 44 Q26 30 42 44" fill="#9261C7" opacity="0.8" />
      <Circle cx="38" cy="30" r="6" fill="#C4A0EC" />
      <Path d="M36 38 H40 M38 36 V40" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

function JoinCodeSvg() {
  return (
    <Svg width="52" height="52" viewBox="0 0 52 52">
      <Circle cx="26" cy="26" r="26" fill="#E8F5E9" />
      <Rect x="13" y="18" width="26" height="20" rx="4" fill="#10B981" />
      <Rect x="17" y="23" width="6" height="6" rx="2" fill="#fff" />
      <Rect x="25" y="23" width="6" height="6" rx="2" fill="#fff" />
      <Rect x="17" y="31" width="6" height="3" rx="1.5" fill="rgba(255,255,255,0.5)" />
      <Rect x="25" y="31" width="10" height="3" rx="1.5" fill="rgba(255,255,255,0.5)" />
      <Rect x="33" y="23" width="3" height="6" rx="1.5" fill="#fff" />
    </Svg>
  );
}

export default function FamilyChoiceScreen() {
  const { colors, isDark } = useTheme();

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* Hero */}
        <View style={s.heroWrap}>
          <FamilyHeroSvg />
        </View>

        {/* Headline */}
        <View style={s.headWrap}>
          <Text style={[s.headline, { color: colors.textPrimary }]}>Your Family,{'\n'}One App</Text>
          <Text style={[s.sub, { color: colors.textSecondary }]}>
            Quests, chores, chat, calendar and coins —{'\n'}all in one place for every family member.
          </Text>
        </View>

        {/* Cards */}
        <View style={s.cards}>
          {/* Create family */}
          <TouchableOpacity
            style={[s.card, { backgroundColor: colors.card ?? colors.surface, borderColor: '#9261C7' }]}
            activeOpacity={0.85}
            onPress={() => router.push('/onboarding/setup-family')}
          >
            <CreateFamilySvg />
            <View style={s.cardText}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Create My Family</Text>
              <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
                I'm a parent — set up our family and invite members
              </Text>
            </View>
            <Text style={s.arrow}>→</Text>
          </TouchableOpacity>

          {/* Join with code */}
          <TouchableOpacity
            style={[s.card, { backgroundColor: colors.card ?? colors.surface, borderColor: '#10B981' }]}
            activeOpacity={0.85}
            onPress={() => router.push('/onboarding/join-family')}
          >
            <JoinCodeSvg />
            <View style={s.cardText}>
              <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Join with Code</Text>
              <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
                I have an invite code from a parent
              </Text>
            </View>
            <Text style={s.arrow}>→</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1 },
  safe:      { flex: 1, paddingHorizontal: 20 },
  heroWrap:  { alignItems: 'center', marginTop: 16, marginBottom: 8 },
  headWrap:  { alignItems: 'center', marginBottom: 28 },
  headline:  { fontSize: 30, fontWeight: '800', textAlign: 'center', lineHeight: 36, marginBottom: 8 },
  sub:       { fontSize: TYPO.body, textAlign: 'center', lineHeight: 22, opacity: 0.8 },
  cards:     { gap: 14 },
  card:      {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 18, padding: 18,
    borderWidth: 1.5,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardText:  { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  cardDesc:  { fontSize: 13, lineHeight: 18, opacity: 0.75 },
  arrow:     { fontSize: 20, color: '#9261C7' },
});
