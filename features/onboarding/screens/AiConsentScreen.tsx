import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import BackButton from '@/components/BackButton';
import { SPACING, RADIUS , TYPO } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

const POINTS = [
  {
    emoji: '📱',
    title: 'On-device first',
    body: 'Mood Scan runs entirely on your device when the local AI model is available. Your pet\'s photos never leave your phone in that case.',
  },
  {
    emoji: '☁️',
    title: 'Cloud fallback',
    body: 'On older devices or when the local model is unavailable, photos are sent to a secure third-party AI API operated by PeopleOnTech LLC\'s service providers. They are analysed and immediately discarded — never stored.',
  },
  {
    emoji: '🚫',
    title: 'No photos stored without approval',
    body: 'PeopleOnTech LLC never stores or trains on your pet\'s photos unless you explicitly opt in via a separate setting.',
  },
  {
    emoji: '🔄',
    title: 'Revocable any time',
    body: 'You can turn off cloud fallback in Settings → Privacy at any time. Mood Scan will only run when on-device AI is available.',
  },
];

export default function AiConsentScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { acceptAiConsent, completeOnboarding } = useAuthStore();

  const handleConsent = async (granted: boolean) => {
    setLoading(true);
    try {
      await acceptAiConsent(granted);
      await completeOnboarding();
      router.replace('/(tabs)');
    } catch (e: any) {
      // Even if the network call fails we still proceed — preferences can be re-set later
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <BackButton />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={s.inner}>
          {/* Header */}
          <View style={s.heroWrap}>
            <Text style={s.heroEmoji}>🧠</Text>
            <Text style={s.title}>AI Mood Analysis</Text>
            <Text style={s.subtitle}>
              Family Cube's Mood Scan feature can read your pet's emotional state from photos using AI.
              Here's exactly how PeopleOnTech LLC handles your data.
            </Text>
          </View>

          {/* Consent points */}
          <View style={s.pointsList}>
            {POINTS.map((p, idx) => (
              <View key={idx} style={s.pointCard}>
                <Text style={s.pointEmoji}>{p.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.pointTitle}>{p.title}</Text>
                  <Text style={s.pointBody}>{p.body}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Summary box */}
          <View style={[s.summaryBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
            <Text style={[s.summaryText, { color: colors.textPrimary }]}>
              By tapping <Text style={{ fontWeight: '700' }}>"Allow cloud fallback"</Text>, you consent to occasional photo processing by PeopleOnTech LLC's third-party AI providers when on-device AI is unavailable. Photos are analysed and discarded — never stored by PeopleOnTech LLC, never used for model training without your separate explicit opt-in.
            </Text>
          </View>

          <View style={s.spacer} />

          {/* CTA buttons */}
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
            onPress={() => handleConsent(true)}
            disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Text style={s.primaryBtnText}>Allow cloud fallback</Text>
                  <Text style={s.primaryBtnSub}>Best mood accuracy · photos never stored</Text>
                </>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.secondaryBtn, { borderColor: colors.border, opacity: loading ? 0.7 : 1 }]}
            onPress={() => handleConsent(false)}
            disabled={loading}>
            <Text style={s.secondaryBtnText}>On-device only</Text>
            <Text style={[s.secondaryBtnSub, { color: colors.textSecondary }]}>Mood scans only work when device AI is available</Text>
          </TouchableOpacity>

          <Text style={s.privacyNote}>
            You can change this any time in{' '}
            <Text style={[s.privacyLink, { color: colors.primaryText ?? colors.primary }]}>Settings → Privacy</Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, padding: SPACING.xl, paddingTop: SPACING.xxl },

  heroWrap: { alignItems: 'center', marginBottom: SPACING.xxl },
  heroEmoji: { fontSize: 60, marginBottom: SPACING.lg },
  title: { fontSize: TYPO.hero, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.8, marginBottom: SPACING.sm },
  subtitle: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  pointsList: { gap: 10, marginBottom: SPACING.xl },
  pointCard: { flexDirection: 'row', gap: 14, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 0.5, borderColor: colors.border, alignItems: 'flex-start' },
  pointEmoji: { fontSize: TYPO.hero, marginTop: 1 },
  pointTitle: { fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  pointBody: { fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 19 },

  summaryBox: { borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, marginBottom: SPACING.xxl },
  summaryText: { fontSize: TYPO.body, lineHeight: 19 },

  spacer: { flex: 1 },

  primaryBtn: { borderRadius: RADIUS.lg, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { fontSize: TYPO.subheading, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  primaryBtnSub: { fontSize: TYPO.body, color: 'rgba(255,255,255,0.75)', marginTop: 3 },

  secondaryBtn: { borderRadius: RADIUS.lg, paddingVertical: 16, alignItems: 'center', borderWidth: 1, marginBottom: SPACING.lg },
  secondaryBtnText: { fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary },
  secondaryBtnSub: { fontSize: TYPO.body, marginTop: 3 },

  privacyNote: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginBottom: SPACING.xl },
  privacyLink: { fontWeight: '600' },
});
