/**
 * KioskScanReviewForm — kiosk-native port of ScanReviewSheet.tsx, matching
 * KioskReceiptScanSheet.tsx's own established shell pattern (KioskFormDrawer,
 * simplified scan-in-progress indicator, same real logic underneath)
 * [live-reported: "same for the kiosik scan ai related model we should
 * use" / "i asked like receipt scan like model for the scan" / "we can use
 * same core logic of the mobile just the shell we should use for the
 * kiosk style component"].
 *
 * Logic reused, not re-derived:
 * - usePrescriptionScanner (features/vault/usePrescriptionScanner.ts) —
 *   the exact same hook ScanReviewSheet.tsx itself uses: same
 *   parse-prescription edge function call, same pendingImages/scanResult
 *   state, same pickImage/scan/pickAndScan.
 * - RedactStep (features/vault/tabs/health/RedactStep.tsx) — the real
 *   drag-to-black-box privacy redaction, extracted VERBATIM out of
 *   ScanReviewSheet.tsx this same session specifically so both the phone
 *   screen and this kiosk form share one real implementation. Its own
 *   fixed near-black photo-review chrome is intentionally kept as-is here
 *   too (matching ScanReviewSheet.tsx's own documented reasoning) — a
 *   redact screen is a full-screen camera-review UI, not a themed kiosk
 *   card, so it doesn't take k.* tokens.
 * - The onSaveMed/onSaveVax callbacks are KioskHealthTab.tsx's own
 *   saveScannedMed/saveScannedVax — the same real insert logic already
 *   verified against HealthTab.tsx's own saveScannedMed/saveScannedVax.
 *
 * Kept, unchanged in spirit from ScanReviewSheet.tsx: the two-page flow
 * (source picker → redact → AI review with per-field editing), the
 * low-confidence/additional-items warnings, the "who is this for" member
 * row, doc-type toggle when a scan finds both a medication and a vaccine.
 * Simplified the same way KioskReceiptScanSheet.tsx's own header documents:
 * the phone's beam/corner-bracket/dot-loader scanning animation becomes a
 * plain ActivityIndicator + copy — real polish for a phone held close to a
 * face, not meaningfully different from a spinner on a kitchen-wall display
 * glanced at from a few feet away.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Camera, Image as ImageIcon, FileText, ScanLine, Syringe } from 'lucide-react-native';
import { usePrescriptionScanner, ParsedMedication, ParsedVaccine } from '@/features/vault/usePrescriptionScanner';
import { RedactStep } from '@/features/vault/tabs/health/RedactStep';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_TYPO, KIOSK_HIT } from '../kioskTheme';
import type { KioskColors } from '../kioskPalette';

const MED_FIELDS: [string, keyof ParsedMedication][] = [
  ['Medication name', 'name'], ['Dosage', 'dosage'], ['Frequency', 'frequency'],
  ['Duration', 'duration'], ['Instructions', 'instructions'],
  ['Prescribing doctor', 'prescriber'], ['Pharmacy', 'pharmacy'], ['Notes', 'notes'],
];
const VAX_FIELDS: [string, keyof ParsedVaccine][] = [
  ['Vaccine name', 'vaccine_name'], ['Manufacturer', 'manufacturer'], ['Lot number', 'lot_number'],
  ['Date administered (YYYY-MM-DD)', 'administered_date'], ['Next due date (YYYY-MM-DD)', 'next_due_date'],
  ['Dose #', 'dose_number'], ['Total doses', 'total_doses'],
  ['Administered by', 'administered_by'], ['Site (e.g. Left arm)', 'site'],
];

export function KioskScanReviewForm({ visible, scanMode, activeMemberId, members, colors, isDark, onClose, onSaveMed, onSaveVax }: {
  visible: boolean;
  scanMode: 'rx' | 'vaccine';
  activeMemberId: string;
  members: any[];
  colors: any;
  isDark: boolean;
  onClose: () => void;
  onSaveMed: (med: ParsedMedication, memberId: string) => Promise<void>;
  onSaveVax: (vax: ParsedVaccine, memberId: string) => Promise<void>;
}) {
  const { k } = useKioskColors();
  const {
    scanning, scanResult, scanError,
    pendingImages, maxPhotos,
    pickImage, scan, pickAndScan,
    clearPending, clearScan,
  } = usePrescriptionScanner();

  const [reviewMed, setReviewMed] = useState<ParsedMedication | null>(null);
  const [reviewVax, setReviewVax] = useState<ParsedVaccine | null>(null);
  const [reviewDocType, setReviewDocType] = useState<'medication' | 'vaccine'>('medication');
  const [reviewMemberId, setReviewMemberId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const accent = scanMode === 'vaccine' ? k.sage : k.danger;

  useEffect(() => {
    if (!scanResult) return;
    const dt = scanResult.doc_type === 'vaccine' ? 'vaccine' : 'medication';
    setReviewDocType(dt);
    if (scanResult.medication) setReviewMed({ ...scanResult.medication });
    if (scanResult.vaccine) setReviewVax({ ...scanResult.vaccine });
    setReviewMemberId(activeMemberId ?? '');
  }, [scanResult]);

  useEffect(() => {
    if (!visible) {
      clearScan();
      setReviewMed(null); setReviewVax(null); setSaveError(null);
    }
  }, [visible]);

  const handleClose = () => { clearScan(); onClose(); };

  const handleSave = async () => {
    if (!reviewMemberId) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (reviewDocType === 'medication' && reviewMed) await onSaveMed(reviewMed, reviewMemberId);
      else if (reviewDocType === 'vaccine' && reviewVax) await onSaveVax(reviewVax, reviewMemberId);
      handleClose();
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const input = kioskInputStyle(k);
  const showReview = !!scanResult && pendingImages.length === 0 && !scanning;

  // Redact mode takes over the WHOLE screen (matching ScanReviewSheet.tsx's
  // own real behavior) — a KioskFormDrawer card is the wrong shell for a
  // full-screen camera-review step, so this renders RedactStep directly
  // instead of nesting it inside the drawer.
  if (visible && pendingImages.length > 0 && !scanning) {
    return (
      <RedactStep
        pendingImages={pendingImages}
        maxPhotos={maxPhotos}
        pickImage={pickImage}
        clearPending={clearPending}
        scanError={scanError}
        accent={accent}
        onScan={scan}
      />
    );
  }

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title={showReview ? `Review ${reviewDocType === 'vaccine' ? 'Vaccine' : 'Medication'}` : (scanMode === 'vaccine' ? 'Scan Vaccine Record' : 'Scan Prescription')}
      subtitle={showReview
        ? 'Confirm the details before saving'
        : (scanning ? 'CubeAI is reading your document…' : 'Choose how to add your document')}
      accent={accent}
      Icon={scanMode === 'vaccine' ? Syringe : ScanLine}
      k={k}
      onClose={handleClose}
      onSubmit={showReview ? handleSave : undefined}
      canSubmit={!!reviewMemberId}
      submitting={saving}
      submitLabel={`Save ${reviewDocType === 'vaccine' ? 'Vaccine' : 'Medication'}`}
      error={saveError}
    >
      {!showReview ? (
        <>
          <View style={{
            height: 140, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5,
            backgroundColor: k.well, borderColor: accent + '40',
            alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm,
            marginBottom: KIOSK_SPACE.md,
          }}>
            {scanning ? (
              <>
                <ActivityIndicator size="large" color={accent} />
                <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.textMuted, fontWeight: '700' }}>CubeAI is reading your document…</Text>
              </>
            ) : (
              <>
                {scanMode === 'vaccine' ? <Syringe size={36} color={k.textFaint} /> : <ScanLine size={36} color={k.textFaint} />}
                <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.textFaint, fontWeight: '700' }}>Choose how to add your document</Text>
              </>
            )}
          </View>

          {!!scanError && (
            <View style={{ borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, backgroundColor: k.dangerSoft, borderColor: k.dangerEdge, padding: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md }}>
              <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.danger, fontWeight: '600' }}>{scanError}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm }}>
            {[
              { label: 'Camera', sub: 'Scan now', Icon: Camera, onPress: () => pickImage('camera') },
              { label: 'Photos', sub: 'From library', Icon: ImageIcon, onPress: () => pickImage('library') },
              { label: 'File', sub: 'PDF, max 5MB', Icon: FileText, onPress: () => pickAndScan('document') },
            ].map(btn => (
              <Pressable
                key={btn.label}
                disabled={scanning}
                onPress={btn.onPress}
                style={({ pressed }) => [
                  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md, borderWidth: 1, backgroundColor: k.card, borderColor: k.cardBorder, paddingVertical: KIOSK_SPACE.sm },
                  (pressed || scanning) && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${btn.label}, ${btn.sub}`}
              >
                <btn.Icon size={24} color={accent} />
                <Text style={{ fontSize: KIOSK_TYPO.label, fontWeight: '800', color: k.text }}>{btn.label}</Text>
                <Text style={{ fontSize: KIOSK_TYPO.micro, color: k.textFaint }}>{btn.sub}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          {/* Low-confidence / additional-items warnings — verbatim copy
              from ScanReviewSheet.tsx's own real fields. */}
          {scanResult?.confidence === 'low' && (
            <View style={{ borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, backgroundColor: k.dangerSoft, borderColor: k.dangerEdge, padding: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.sm }}>
              <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.danger, fontWeight: '600' }}>
                {scanResult.confidenceNote ?? 'Some details were hard to read clearly — please double-check the fields below against the original document before saving.'}
              </Text>
            </View>
          )}
          {scanResult?.additionalItemsFound && (
            <View style={{ borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, backgroundColor: k.goldSoft, borderColor: k.goldEdge, padding: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.sm }}>
              <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.gold, fontWeight: '600' }}>
                {scanResult.additionalItemsNote ?? 'This document listed more than one item — only one was extracted here.'}
              </Text>
            </View>
          )}

          {/* Who is this for */}
          <KioskFieldLabel k={k}>WHO IS THIS FOR?</KioskFieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md }}>
            {members.map((m: any) => (
              <KioskPill key={m.id} label={m.name} selected={reviewMemberId === m.id}
                onPress={() => setReviewMemberId(m.id)} accent={accent} k={k} />
            ))}
          </View>

          {/* Doc-type toggle when both were found */}
          {scanResult?.doc_type === 'both' && (
            <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md }}>
              {(['medication', 'vaccine'] as const).map(t => (
                <KioskPill key={t} label={t === 'vaccine' ? 'Vaccine' : 'Medication'}
                  selected={reviewDocType === t} onPress={() => setReviewDocType(t)}
                  accent={t === 'vaccine' ? k.sage : k.danger} k={k} />
              ))}
            </View>
          )}

          {/* Medication fields */}
          {reviewDocType === 'medication' && reviewMed && (
            <View style={{ gap: KIOSK_SPACE.sm }}>
              {MED_FIELDS.map(([label, field]) => (
                <View key={field}>
                  <KioskFieldLabel k={k}>{label.toUpperCase()}</KioskFieldLabel>
                  <TextInput
                    value={String(reviewMed[field] ?? '')}
                    onChangeText={v => setReviewMed(prev => prev ? { ...prev, [field]: v } : prev)}
                    placeholder="—" placeholderTextColor={k.textFaint}
                    style={[input, { borderColor: field === 'name' && !reviewMed.name ? k.danger : input.borderColor }]}
                  />
                </View>
              ))}
            </View>
          )}

          {/* Vaccine fields */}
          {reviewDocType === 'vaccine' && reviewVax && (
            <View style={{ gap: KIOSK_SPACE.sm }}>
              {VAX_FIELDS.map(([label, field]) => (
                <View key={field}>
                  <KioskFieldLabel k={k}>{label.toUpperCase()}</KioskFieldLabel>
                  <TextInput
                    value={reviewVax[field] != null ? String(reviewVax[field]) : ''}
                    onChangeText={v => setReviewVax(prev => prev ? { ...prev, [field]: (v || null) as any } : prev)}
                    placeholder="—" placeholderTextColor={k.textFaint}
                    keyboardType={(field === 'dose_number' || field === 'total_doses') ? 'numeric' : 'default'}
                    style={[input, { borderColor: field === 'vaccine_name' && !reviewVax.vaccine_name ? k.danger : input.borderColor }]}
                  />
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </KioskFormDrawer>
  );
}
