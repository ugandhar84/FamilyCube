/**
 * KioskHealthAiWidget — kiosk mount of the real Health AI Q&A flow
 * (useHealthAi's askAI/shareAiToChat), as its own standalone CubeAI-style
 * card, matching KioskAiChoresEngine.tsx's own shell pattern
 * [live-reported: "i want to move the cube ai as a separate section
 * similar to the chores"] — Health's AI assistant was only ever available
 * inline inside HealthTabComp's meds/vax view before this, with no
 * standalone equivalent.
 *
 * Reuses the exact real hook (features/vault/tabs/health/useHealthAi.ts) —
 * extracted OUT of HealthTab.tsx specifically so both callers share one
 * real implementation instead of two copies that could drift; HealthTab.tsx
 * itself now calls the same hook. Same real `family-ai` edge-function call,
 * same fallback copy, same shareAiToChat message format as the phone.
 *
 * Scope note: this covers the plain question/answer flow only. The
 * prescription/vaccine SCAN feature (camera + OCR + redaction review) stays
 * phone-only inside HealthTabComp — same reasoning kiosk already applies to
 * photo-proof capture on Chores (no camera flow on kiosk; viewing an
 * already-submitted photo is the kiosk-side affordance instead).
 */
import { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Bot, Send, Share2 } from 'lucide-react-native';
import { WidgetCard, ActionButton } from './KioskOS';
import { KIOSK_RADIUS, KIOSK_SPACE, KIOSK_TYPO } from '../kioskTheme';
import type { KioskColors } from '../kioskPalette';
import { useHealthAi } from '@/features/vault/tabs/health/useHealthAi';
import type { FamilyMember } from '@/store/familyStore';

export function KioskHealthAiWidget({ members, activeMemberId, isDark, k }: {
  members: FamilyMember[];
  activeMemberId?: string;
  isDark: boolean;
  k: KioskColors;
}) {
  const { aiQuery, setAiQuery, aiResult, aiLoading, aiShared, askAI, shareAiToChat } =
    useHealthAi({ members, activeMemberId });
  const [open, setOpen] = useState(false);

  return (
    <View style={{ width: '100%' }}>
      {/* Shell matches KioskAiChoresEngine's own CubeAI card exactly — icon
          chip, "CubeAI ●" + status line, one right-aligned action button. */}
      <WidgetCard k={k} isDark={isDark} style={{ borderRadius: KIOSK_RADIUS.xl }}>
        <Pressable
          onPress={() => setOpen(o => !o)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm }}
          accessibilityRole="button"
          accessibilityLabel="Health CubeAI"
          accessibilityHint="Ask a general health question"
        >
          <View style={{
            width: 38, height: 38, borderRadius: KIOSK_RADIUS.md,
            backgroundColor: k.danger + '18', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={18} color={k.danger} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '800', color: k.text }}>CubeAI</Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k.sage }} />
            </View>
            <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.textMuted }} numberOfLines={1}>
              Ask a general health question for the family.
            </Text>
          </View>
          <ActionButton
            label={open ? 'Close' : 'Ask CubeAI'}
            accent={k.danger}
            k={k} isDark={isDark} variant="soft"
            onPress={() => setOpen(o => !o)}
            accessibilityHint="Toggles the health question box"
          />
        </Pressable>

        {open && (
          <View style={{ marginTop: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm }}>
            <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs, alignItems: 'center' }}>
              <TextInput
                value={aiQuery}
                onChangeText={setAiQuery}
                placeholder="e.g. What's a safe fever for a 6-year-old?"
                placeholderTextColor={k.textFaint}
                style={{
                  flex: 1, minHeight: 44, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
                  borderColor: k.cardBorder, backgroundColor: k.well, color: k.text,
                  paddingHorizontal: KIOSK_SPACE.sm, fontSize: KIOSK_TYPO.body,
                }}
                onSubmitEditing={() => askAI()}
                returnKeyType="send"
                editable={!aiLoading}
              />
              <ActionButton
                label="" Icon={Send} accent={k.danger}
                k={k} isDark={isDark} variant="solid"
                disabled={aiLoading || !aiQuery.trim()}
                onPress={() => askAI()}
                accessibilityHint="Send your question to Health CubeAI"
              />
            </View>

            {aiLoading && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs }}>
                <ActivityIndicator size="small" color={k.danger} />
                <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.textMuted }}>Thinking…</Text>
              </View>
            )}

            {!!aiResult && !aiLoading && (
              <View style={{ borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, borderColor: k.cardBorder, backgroundColor: k.well, padding: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm }}>
                <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.text, lineHeight: KIOSK_TYPO.caption * 1.4 }}>{aiResult}</Text>
                <Text style={{ fontSize: KIOSK_TYPO.micro, color: k.textFaint, fontStyle: 'italic' }}>
                  General information only — not medical advice.
                </Text>
                <ActionButton
                  label={aiShared ? 'Shared to Family Chat ✓' : 'Share to Family Chat'}
                  Icon={Share2} accent={k.sage}
                  k={k} isDark={isDark} variant="soft"
                  disabled={aiShared}
                  onPress={shareAiToChat}
                  accessibilityHint="Posts this answer to the family chat"
                />
              </View>
            )}
          </View>
        )}
      </WidgetCard>
    </View>
  );
}
