// One-time, app-wide consent gate for every AI-calling feature OTHER than
// Ask Cube (which has its own AskCubeConsentGate.tsx / ask_cube_ai_consents
// table, kept separate since it predates this one and its copy is
// chat-specific). This covers prescription scan, flyer scan, receipt scan,
// appointment-recording analysis, and medical-record analysis — all of
// which send a photo, audio, or document to a third-party AI provider
// (Google Gemini, with a fallback provider) but, before this, never
// disclosed that or asked permission outside the Terms of Service — the
// same App Store rejection (5.1.1(i)/5.1.2(i)) Ask Cube was fixed for.
//
// One consent covers all of these features (not a separate one per
// feature) since they're all the same underlying disclosure — "photos/
// documents/recordings you scan are sent to an AI provider to read them" —
// and a member only needs to agree to that once, not re-agree per scanner.
//
// Same pattern as AskCubeConsentGate: ai_consents (Postgres) is the only
// source of truth, consent is per-member (not global, since it's the
// member's own content being shared), and a per-app-run memory cache only
// avoids a redundant DB read within the same session — never trusted on
// its own across launches.
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const CONSENT_VERSION = 'v1';

export const AI_CONSENT_TEXT =
  "Some features in Family Cube — scanning a prescription, flyer, receipt, or medical record, " +
  "and recording a doctor's visit — use AI to read what you upload. To do that, the photo, audio, " +
  "or document you provide is sent to Google Gemini (and a backup AI provider if needed). " +
  "We don't send anything else from your account — only the specific item you choose to scan or record.";

async function hasDbConsent(memberId: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('ai_consents')
      .select('id').eq('member_id', memberId).limit(1).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

let dbConsentMemoCache = new Map<string, boolean>();

export async function hasAiConsent(memberId: string): Promise<boolean> {
  if (dbConsentMemoCache.has(memberId)) return dbConsentMemoCache.get(memberId)!;
  const dbConsented = await hasDbConsent(memberId);
  dbConsentMemoCache.set(memberId, dbConsented);
  return dbConsented;
}

async function recordAiConsent(memberId: string, familyId: string | undefined): Promise<void> {
  if (!familyId) return;
  try {
    await supabase.from('ai_consents').insert({
      member_id: memberId,
      family_id: familyId,
      consent_version: CONSENT_VERSION,
      consent_text: AI_CONSENT_TEXT,
    });
    dbConsentMemoCache.set(memberId, true);
  } catch (e) {
    console.warn('[AiConsentGate] failed to record consent in DB:', e);
  }
}

export default function AiConsentSheet({
  visible, memberId, familyId, onAgree, onDecline, colors: colorsProp, isDark: isDarkProp,
}: {
  visible: boolean;
  memberId: string;
  familyId?: string;
  onAgree: () => void;
  onDecline: () => void;
  colors?: any;
  isDark?: boolean;
}) {
  const theme = useTheme();
  const colors = colorsProp ?? theme.colors;

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.xl, padding: 24, maxWidth: 420, width: '100%', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Sparkles size={24} color={colors.accent} />
          <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>Before you use AI scan</Text>
        </View>
        <ScrollView style={{ maxHeight: 280 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 22 }}>
            {AI_CONSENT_TEXT}
            {'\n\n'}
            You can find the full details in our Privacy Policy.
          </Text>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={onDecline}
            style={{ flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Not now</Text>
          </Pressable>
          <Pressable
            onPress={async () => { await recordAiConsent(memberId, familyId); onAgree(); }}
            style={{ flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: colors.accent }}
          >
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>I agree</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Convenience hook — same shape as useAskCubeConsent, so each call site
// only needs a few lines: check `consented`, and if false when the scan
// action fires, show the sheet instead of calling the edge function.
export function useAiConsent(memberId: string | undefined) {
  const [checked, setChecked] = useState(false);
  const [consented, setConsented] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!memberId) return;
    hasAiConsent(memberId).then(ok => {
      if (cancelled) return;
      setConsented(ok);
      setChecked(true);
    });
    return () => { cancelled = true; };
  }, [memberId]);

  return {
    checked, consented, showSheet, setShowSheet,
    markConsented: () => setConsented(true),
  };
}
