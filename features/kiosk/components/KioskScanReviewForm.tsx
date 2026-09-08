/**
 * KioskScanReviewForm — kiosk-native shell for Scan Rx/Vax, matching
 * KioskFormDrawer's own narrow right-anchored drawer shape (same panelBase/
 * panelDrawer dimensions: width 520, full height, right-anchored, sliding
 * in) instead of the phone's bottom sheet [live-reported: "instead bottom
 * sheet in the koisek show the narrow window side like receipt scan style"
 * → "with stepper"].
 *
 * ── Why this owns its own <Modal> instead of using KioskFormDrawer directly ──
 * A first attempt passed RedactStep as KioskFormDrawer's `children`, and it
 * broke on device (blank/wrong screen after uploading a photo)
 * [live-reported: "i think you built a shit.. ive uploaded it it started
 * shoinw diffrent component"] — traced to a real structural bug: KioskFormDrawer
 * always renders its own <Modal>, but `children` renders INSIDE that
 * Modal's padded, scrollable body (header + footer chrome permanently
 * wrapped around it) — there is no way to make `children` take over the
 * full screen the way the redact step genuinely needs (full-bleed camera
 * image, no header/padding, its own bottom bar). So this file builds its
 * OWN single <Modal>+<KioskModalHost>, reusing the exact same
 * panelBase/panelDrawer/scrim/KeyboardAvoidingView values KioskFormDrawer
 * itself uses (copied, not re-derived, so the two forms feel identical),
 * and swaps what renders INSIDE that one panel between three real steps —
 * matching ScanReviewSheet.tsx's own real structure (one Modal, conditional
 * branches inside it), not KioskFormDrawer's fixed one-shape-fits-all body.
 *
 * Logic reused, not re-derived:
 * - usePrescriptionScanner — the exact same hook ScanReviewSheet.tsx itself
 *   uses (same parse-prescription edge function, same pendingImages/
 *   scanResult state).
 * - RedactStep (features/vault/tabs/health/RedactStep.tsx) — the real
 *   drag-to-black-box privacy redaction, extracted verbatim out of
 *   ScanReviewSheet.tsx so both the phone screen and this form share the
 *   exact same implementation. Rendered here at the SAME panelBase width
 *   (520, not the phone's full device width) so it reads as "this side
 *   window's own camera-review step," not a separate full-screen surface.
 * - onSaveMed/onSaveVax are still KioskHealthTab.tsx's own
 *   saveScannedMed/saveScannedVax — the same real insert logic already
 *   verified against HealthTab.tsx's own save functions.
 *
 * Stepper: 3 real steps (Choose source → Cover sensitive info → Review &
 * save) — the redact step only actually appears when reached (a picked
 * image exists), same as the phone's own 2-page flow collapses redact into
 * an implicit sub-state of page 1.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Camera, Image as ImageIcon, FileText, ScanLine, Syringe, X } from 'lucide-react-native';
import { usePrescriptionScanner, ParsedMedication, ParsedVaccine } from '@/features/vault/usePrescriptionScanner';
import { RedactStep } from '@/features/vault/tabs/health/RedactStep';
import { KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';
import { KioskModalHost } from '../KioskActivityContext';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_TYPO, KIOSK_HIT } from '../kioskTheme';

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

type Step = 'source' | 'redact' | 'review';

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

  // Real step derivation, mirroring ScanReviewSheet.tsx's own page logic:
  // a pending (not yet scanned) image means redact; a result with no
  // pending image means review; otherwise source-pick.
  const step: Step = scanResult && pendingImages.length === 0 && !scanning
    ? 'review'
    : pendingImages.length > 0 && !scanning
      ? 'redact'
      : 'source';
  const stepIndex = step === 'source' ? 0 : step === 'redact' ? 1 : 2;

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
  const canSubmit = !!reviewMemberId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KioskModalHost style={s.host}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
          onPress={step === 'redact' ? undefined : handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.right} pointerEvents="box-none">
          <View style={[s.panel, { backgroundColor: step === 'redact' ? '#000' : k.card, borderLeftColor: k.cardBorder }]} accessibilityViewIsModal>
            {step !== 'redact' && (
              <>
                {/* ── Head ── */}
                <View style={[s.head, { borderBottomColor: k.cardBorder }]}>
                  <View style={[s.headIcon, { backgroundColor: accent + '1A', borderColor: accent + '3D' }]}>
                    {scanMode === 'vaccine' ? <Syringe size={22} color={accent} /> : <ScanLine size={22} color={accent} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.title, { color: k.text }]} numberOfLines={1}>
                      {step === 'review' ? `Review ${reviewDocType === 'vaccine' ? 'Vaccine' : 'Medication'}` : (scanMode === 'vaccine' ? 'Scan Vaccine Record' : 'Scan Prescription')}
                    </Text>
                    <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={1}>Step {stepIndex + 1} of 3</Text>
                  </View>
                  <Pressable onPress={handleClose} hitSlop={12} style={[s.closeBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]} accessibilityRole="button" accessibilityLabel="Close">
                    <X size={20} color={k.textMuted} />
                  </Pressable>
                </View>

                {/* ── Stepper ── */}
                <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: KIOSK_SPACE.lg, paddingTop: KIOSK_SPACE.sm }}>
                  {[0, 1, 2].map(i => (
                    <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: stepIndex >= i ? accent : k.cardBorder }} />
                  ))}
                </View>
              </>
            )}

            {/* ── Body ── */}
            {step === 'redact' ? (
              <RedactStep
                pendingImages={pendingImages}
                maxPhotos={maxPhotos}
                pickImage={pickImage}
                clearPending={clearPending}
                scanError={scanError}
                accent={accent}
                onScan={scan}
              />
            ) : (
              <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {step === 'source' ? (
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

                    <KioskFieldLabel k={k}>WHO IS THIS FOR?</KioskFieldLabel>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md }}>
                      {members.map((m: any) => (
                        <KioskPill key={m.id} label={m.name} selected={reviewMemberId === m.id}
                          onPress={() => setReviewMemberId(m.id)} accent={accent} k={k} />
                      ))}
                    </View>

                    {scanResult?.doc_type === 'both' && (
                      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md }}>
                        {(['medication', 'vaccine'] as const).map(t => (
                          <KioskPill key={t} label={t === 'vaccine' ? 'Vaccine' : 'Medication'}
                            selected={reviewDocType === t} onPress={() => setReviewDocType(t)}
                            accent={t === 'vaccine' ? k.sage : k.danger} k={k} />
                        ))}
                      </View>
                    )}

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

                {step === 'review' && (
                  <View style={s.foot}>
                    {!!saveError && <Text style={[s.error, { color: k.danger }]} numberOfLines={3}>{saveError}</Text>}
                    <Pressable
                      onPress={handleSave}
                      disabled={!canSubmit || saving}
                      style={({ pressed }) => [
                        s.submit,
                        { backgroundColor: canSubmit ? accent : k.well, borderColor: canSubmit ? accent : k.cardBorder },
                        pressed && canSubmit && { opacity: 0.85 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Save ${reviewDocType === 'vaccine' ? 'Vaccine' : 'Medication'}`}
                      accessibilityState={{ disabled: !canSubmit, busy: saving }}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={k.onAccent} />
                      ) : (
                        <Text style={[s.submitText, { color: canSubmit ? k.onAccent : k.textFaint }]} numberOfLines={1}>
                          Save {reviewDocType === 'vaccine' ? 'Vaccine' : 'Medication'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </KioskModalHost>
    </Modal>
  );
}

const s = StyleSheet.create({
  host: { flex: 1 },
  right: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  // Same width/full-height/right-anchored shape as KioskFormDrawer's own
  // panelBase+panelDrawer, copied so this form's window feels identical.
  panel: { width: 520, maxWidth: '100%', height: '100%', borderLeftWidth: 1, overflow: 'hidden' },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    padding: KIOSK_SPACE.lg, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headIcon: { width: 48, height: 48, borderRadius: KIOSK_RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: KIOSK_RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  bodyContent: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  foot: { marginTop: KIOSK_SPACE.lg, gap: KIOSK_SPACE.sm },
  error: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  submit: {
    minHeight: KIOSK_HIT.primary, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.md,
  },
  submitText: { fontSize: KIOSK_TYPO.body, fontWeight: '900' },
});
