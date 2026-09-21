// One-time consent gate for Ask Cube — App Store rejection (guidelines
// 5.1.1(i)/5.1.2(i)): the app sends a member's message and relevant family
// context to a third-party AI provider (Google Gemini, with a fallback
// provider) to generate a response, but never explicitly disclosed what's
// sent or asked permission before this session — only mentioned at a
// high level in the Terms of Service, which Apple's review response
// explicitly says isn't sufficient on its own.
//
// Consent is per-member (not global) — each family member who uses Ask
// Cube gives their own consent once, since consent to share YOUR OWN
// messages with an AI provider isn't something one parent can give on
// behalf of everyone in the family.
//
// The real, auditable record lives in ask_cube_ai_consents (Postgres) —
// AsyncStorage is only a fast local cache so re-opening Ask Cube doesn't
// have to round-trip the DB every time; a reinstall/new device falls back
// to the DB check. [live-requested: "we should record that concent in
// the DB, concent notes also should present in DB"]
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const CONSENT_KEY_PREFIX = 'familycube_ask_cube_consent_v1_';
const CONSENT_VERSION = 'v1';

// The exact text shown to the member — stored verbatim alongside the
// consent record so what they actually agreed to is preserved even if
// this copy changes later.
export const ASK_CUBE_CONSENT_TEXT =
  "Ask Cube is an AI assistant. To answer you, what you type — along with relevant " +
  "family context needed to help (like upcoming events or your chore list) — is sent " +
  "to Google Gemini (and a backup AI provider if needed) to generate a response. " +
  "We don't send your full chat history, health records, or location to the AI provider — " +
  "only what's needed to answer your specific question.";

async function hasLocalConsent(memberId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY_PREFIX + memberId)) === 'true';
  } catch {
    return false;
  }
}

async function hasDbConsent(memberId: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('ask_cube_ai_consents')
      .select('id').eq('member_id', memberId).limit(1).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function hasAskCubeConsent(memberId: string): Promise<boolean> {
  if (await hasLocalConsent(memberId)) return true;
  // Local cache miss doesn't necessarily mean "never consented" — could be
  // a reinstall or a different device for the same member. Check the real
  // record before deciding to ask again.
  const dbConsented = await hasDbConsent(memberId);
  if (dbConsented) {
    try { await AsyncStorage.setItem(CONSENT_KEY_PREFIX + memberId, 'true'); } catch {}
  }
  return dbConsented;
}

async function recordAskCubeConsent(memberId: string, familyId: string | undefined): Promise<void> {
  try { await AsyncStorage.setItem(CONSENT_KEY_PREFIX + memberId, 'true'); } catch {}
  if (!familyId) return;
  try {
    await supabase.from('ask_cube_ai_consents').insert({
      member_id: memberId,
      family_id: familyId,
      consent_version: CONSENT_VERSION,
      consent_text: ASK_CUBE_CONSENT_TEXT,
    });
  } catch (e) {
    // Local cache already set above — the member isn't re-prompted even if
    // this write fails, but log so a missing DB record is at least visible.
    console.warn('[AskCubeConsentGate] failed to record consent in DB:', e);
  }
}

export default function AskCubeConsentSheet({
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

  // A real nested <Modal> here (React Native's Modal renders into its own
  // separate native window/layer on iOS) competed with AskCubeChat's own
  // outer Modal, which was already presenting — a second Modal mounted
  // while the first is up doesn't reliably stack visibly above it on iOS,
  // and could render invisible/behind/not-at-all depending on OS version
  // [live-reported: "still that oncent is not visible since askfam is the
  // bottomsheet is somthing blocking that"]. This is now a plain absolute-
  // positioned overlay INSIDE the parent Modal's own layer instead — no
  // second native modal to fight with.
  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.xl, padding: 24, maxWidth: 420, width: '100%', gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Sparkles size={24} color={colors.accent} />
            <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>Before you chat with Cube</Text>
          </View>
          <ScrollView style={{ maxHeight: 280 }}>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 22 }}>
              {ASK_CUBE_CONSENT_TEXT}
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
              onPress={async () => { await recordAskCubeConsent(memberId, familyId); onAgree(); }}
              style={{ flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: colors.accent }}
            >
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>I agree</Text>
            </Pressable>
          </View>
      </View>
    </View>
  );
}

// Convenience hook — resolves whether the given member has already
// consented, exposing a simple boolean + the sheet's visibility state so a
// caller (AskCubeChat.tsx) only needs a few lines to wire this in.
export function useAskCubeConsent(memberId: string | undefined) {
  const [checked, setChecked] = useState(false);
  const [consented, setConsented] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!memberId) return;
    hasAskCubeConsent(memberId).then(ok => {
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
