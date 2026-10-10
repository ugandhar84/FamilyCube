/**
 * ReviewFindingsScreen — "Screen C" of the Health Documents scan/upload
 * flow: full-page, flat-Figma review of a pending AI analysis before it's
 * approved and saved, replacing AiReviewSheet.tsx's bottom-sheet chrome
 * for THIS flow's entry point. AiReviewSheet.tsx itself is untouched and
 * still used by RecordVisitSheet.tsx's separate appointment-recording
 * flow — this screen re-implements the SAME approve/dismiss calls
 * (onApprove/onDismiss passed in by RecordsTab.tsx are the real
 * approveAnalysis/dismissReview handlers, unchanged) with the document
 * review's own rows instead.
 *
 * HONESTY NOTE (verified against features/vault/records/types.ts and
 * supabase/functions/analyze-medical-record/index.ts before writing this
 * screen's copy):
 * - AiAnalysis has NO per-field confidence/certainty score. Only a
 *   document-level `urgency` ('routine'|'attention'|'urgent') +
 *   `urgency_reason` exists. The mockup's per-field "· high confidence" /
 *   "· verify source" / "· verify with clinician" annotations are NOT
 *   fabricated here — each field below shows a plain "tap to edit"-style
 *   affordance instead. This is a real, documented gap: confidence-per-
 *   field is a mockup-implied feature the current analyze-medical-record
 *   function does not produce.
 * - The pink/coral "uncertain field" callout is likewise only shown for
 *   the one real uncertainty signal that DOES exist: urgency something
 *   other than 'routine', using urgency_reason as the explanation — never
 *   a fabricated per-field flag.
 * - There is no server-side "draft save" — dismissing here just clears
 *   the in-memory `pending` analysis (RecordsTab.tsx's dismissReview),
 *   nothing persists. The secondary action is therefore a plain
 *   cancel/discard, not a "kept for later" draft.
 * - "Redacted source only" / private-region count is shown ONLY when the
 *   record's file actually went through the redaction step (tracked via
 *   `wasRedacted`/`redactionCount` passed in by the caller from real
 *   state) — never asserted unconditionally.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, AlertTriangle, Check, Sparkles } from 'lucide-react-native';
import { MedRecord, AiAnalysis, AppointmentAnalysis, TAG_MAP, URGENCY_META } from './types';
import { GEMINI } from '@/constants/geminiRhythm';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception) — imported from
// the shared module instead of redeclared locally
// [live-requested: "make modularize for simplicity"].
const PAGE_BG   = GEMINI.canvas;
const TITLE_CLR = GEMINI.titleColor;
const BODY_CLR  = GEMINI.bodyColor;
const BLUE      = GEMINI.blue;
const LINK_BLUE = GEMINI.linkBlue;
const BORDER    = GEMINI.border;
const CARD_BG   = GEMINI.cardBg;

function contentGroupStyle(cardBg: string, isDark: boolean, border: string) {
  return isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: 16, gap: 12 as const }
    : {
        backgroundColor: cardBg, borderRadius: 22, padding: 16, gap: 12 as const,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      };
}

function isAppointmentAnalysis(a: AiAnalysis | AppointmentAnalysis): a is AppointmentAnalysis {
  return 'discussion_topics' in a;
}

// A "Populated field" row showing one AI-extracted value, read-only here —
// editing happens back in AddRecordModal/BringInDocumentScreen's own form
// fields, not inline on this review screen, since AiAnalysis's fields
// (summary/key_findings/follow_up_items/tags/doc_type) aren't 1:1 with
// MedRecord's own editable columns (title/tag/record_date/notes).
function FieldRow({ label, value, isDark, colors, bodyC, titleC, border, cardBg }: {
  label: string; value: string; isDark: boolean; colors: any;
  bodyC: string; titleC: string; border: string; cardBg: string;
}) {
  return (
    <View style={{
      backgroundColor: isDark ? colors.card : cardBg,
      borderWidth: 1, borderColor: border, borderRadius: 14, padding: 14, gap: 4,
    }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: titleC, lineHeight: 19 }}>{value || '—'}</Text>
    </View>
  );
}

export default function ReviewFindingsScreen({
  colors, isDark, rec, analysis, memberName,
  approving, onApprove, onDismiss,
  wasRedacted, redactionCount,
  onClose,
}: {
  colors: any; isDark: boolean;
  rec: MedRecord;
  analysis: AiAnalysis | AppointmentAnalysis;
  memberName: string;
  approving: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  // Only true when THIS record's file actually went through
  // RedactDocumentScreen/PhotoRedactModal — never assumed.
  wasRedacted?: boolean;
  redactionCount?: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const pageBg = isDark ? colors.background : PAGE_BG;

  const [verified, setVerified] = useState(false);
  const isAppointment = isAppointmentAnalysis(analysis);
  const tagMeta = TAG_MAP[rec.tag] ?? TAG_MAP.other;
  const urgMeta = URGENCY_META[analysis.urgency ?? 'routine'];
  const hasUncertainty = analysis.urgency !== 'routine';

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Health records</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 10, lineHeight: 36 }}>
          Check the findings
        </Text>
        <View style={{ backgroundColor: BLUE + '15', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: BLUE }}>Draft findings · nothing saved</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 24, gap: 14 }}>

        <Text style={{ fontSize: 13, color: bodyC, lineHeight: 19 }}>
          Review every field before approving — AI can misread medical text.
        </Text>

        {/* Redacted-source card — only shown when a redaction step for
            THIS record actually ran (verified via caller-supplied real
            state, not asserted unconditionally). */}
        {wasRedacted && (
          <View style={{ backgroundColor: colors.tealLight, borderRadius: 16, padding: 16, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Shield size={13} color={colors.teal} />
              <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.teal, textTransform: 'uppercase' }}>
                Redacted source only
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: isDark ? colors.textPrimary : '#1D3B2E', lineHeight: 18 }}>
              {redactionCount ? `${redactionCount} private region${redactionCount > 1 ? 's' : ''} excluded` : 'Private regions excluded'} ·
              {' '}this is the flattened copy that was analyzed and will be stored.
            </Text>
          </View>
        )}

        {/* Fields — mapped 1:1 to AiAnalysis's REAL output shape. No
            fabricated confidence labels — see module header. */}
        <View style={{ gap: 10 }}>
          <FieldRow label="Record type" value={tagMeta.label} isDark={isDark} colors={colors} bodyC={bodyC} titleC={titleC} border={border} cardBg={cardBg} />
          <FieldRow label="Record owner" value={memberName} isDark={isDark} colors={colors} bodyC={bodyC} titleC={titleC} border={border} cardBg={cardBg} />
          <FieldRow label="Document title" value={rec.title} isDark={isDark} colors={colors} bodyC={bodyC} titleC={titleC} border={border} cardBg={cardBg} />
          <FieldRow label="AI summary" value={analysis.summary} isDark={isDark} colors={colors} bodyC={bodyC} titleC={titleC} border={border} cardBg={cardBg} />
          {!isAppointment && analysis.tags?.length > 0 && (
            <FieldRow label="Tags" value={analysis.tags.join(', ')} isDark={isDark} colors={colors} bodyC={bodyC} titleC={titleC} border={border} cardBg={cardBg} />
          )}
        </View>

        {!isAppointment && analysis.key_findings?.length > 0 && (
          <View style={contentGroupStyle(cardBg, isDark, border)}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Key findings</Text>
            {analysis.key_findings.map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BLUE, marginTop: 6 }} />
                <Text style={{ fontSize: 13, color: titleC, flex: 1, lineHeight: 19 }}>{f}</Text>
              </View>
            ))}
          </View>
        )}

        {!isAppointment && analysis.follow_up_items?.length > 0 && (
          <View style={contentGroupStyle(cardBg, isDark, border)}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Follow-up actions</Text>
            {analysis.follow_up_items.map((f, i) => (
              <Text key={i} style={{ fontSize: 13, color: titleC, lineHeight: 19 }}>· {f}</Text>
            ))}
          </View>
        )}

        {/* Uncertain-field callout — only the real signal (urgency !==
            routine, with urgency_reason), never a fabricated per-field flag. */}
        {hasUncertainty && (
          <View style={{ flexDirection: 'row', gap: 10, backgroundColor: urgMeta.color + '15', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: urgMeta.color + '40' }}>
            <AlertTriangle size={16} color={urgMeta.color} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: urgMeta.color }}>
                {analysis.urgency === 'urgent' ? 'Flagged urgent — verify with a clinician' : 'Flagged for attention'}
              </Text>
              {analysis.urgency_reason ? (
                <Text style={{ fontSize: 12, color: titleC, marginTop: 3, lineHeight: 17 }}>{analysis.urgency_reason}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* AI-fallibility disclaimer — real, unconditional, matches
            AiReviewSheet.tsx's own banner copy. */}
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 14, padding: 14 }}>
          <Sparkles size={14} color={bodyC} style={{ marginTop: 1 }} />
          <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17, flex: 1 }}>
            This summary was generated by AI and may be incomplete or contain mistakes — it isn't a substitute
            for medical advice. Verify anything important against the real document.
          </Text>
        </View>

        {/* Required verification checkbox — a real, cheap safety gate on
            real component state, wired to disable the save button below. */}
        <TouchableOpacity onPress={() => setVerified(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            backgroundColor: colors.primaryLight, borderRadius: 16, padding: 16 }}>
          <View style={{ width: 22, height: 22, borderRadius: 7, marginTop: 1,
            borderWidth: 1.8, borderColor: verified ? BLUE : bodyC,
            alignItems: 'center', justifyContent: 'center', backgroundColor: verified ? BLUE : 'transparent' }}>
            {verified && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: titleC }}>I verified the source values</Text>
            <Text style={{ fontSize: 12, color: bodyC, marginTop: 2, lineHeight: 17 }}>
              Approval is required before any record can be saved.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Privacy footer — same rhythm as every other module card */}
        <View style={{ backgroundColor: colors.tealLight, borderRadius: 16, padding: 16, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Shield size={13} color={colors.teal} />
            <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.teal, textTransform: 'uppercase' }}>
              Private · Family Cube
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : '#3E5A4D', marginTop: 1, lineHeight: 17 }}>
            Approving encrypts this analysis to your family vault. Only your family's own devices can decrypt it.
          </Text>
        </View>

        <View style={{ gap: 10, marginTop: 4 }}>
          <TouchableOpacity onPress={onApprove} disabled={approving || !verified}
            style={{ backgroundColor: BLUE, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: (approving || !verified) ? 0.5 : 1 }}>
            {approving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Check size={16} color="#fff" />}
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
              {approving ? 'Saving…' : 'Approve & save reviewed record'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} disabled={approving} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC }}>Cancel · don't save record</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
