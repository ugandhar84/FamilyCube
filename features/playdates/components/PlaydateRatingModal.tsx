import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { TYPO } from '@/constants/theme';

export interface RatingTarget {
  playdateRequestId: string;
  raterPetId: string;
  ratedPet: {
    id: string;
    name: string;
    emoji: string;
    accent_color: string | null;
    avatar_url: string | null;
  };
  agreedDate?: string | null;
}

// ── Category definitions ───────────────────────────────────────────────────────

const PET_CATEGORIES = [
  { key: 'friendliness',     label: 'Friendliness',   emoji: '🐾', hint: 'Was the pet friendly and well-socialised?' },
  { key: 'energy_match',     label: 'Energy Match',   emoji: '⚡', hint: 'Did your pets vibe well energy-wise?' },
  { key: 'punctuality',      label: 'Punctuality',    emoji: '⏰', hint: 'Did the owner show up on time?' },
  { key: 'well_behaved',     label: 'Well-Behaved',   emoji: '✨', hint: 'Calm, no incidents, respectful of space?' },
  { key: 'would_play_again', label: 'Play Again',     emoji: '💚', hint: 'Overall — would you meet again?' },
] as const;

const HOST_CATEGORIES = [
  { key: 'communication',   label: 'Communication',  emoji: '💬', hint: 'Replied promptly and was clear?' },
  { key: 'punctuality',     label: 'Punctuality',    emoji: '⏰', hint: 'Showed up on time?' },
  { key: 'friendliness',    label: 'Friendliness',   emoji: '😊', hint: 'Warm, welcoming, easy to chat with?' },
  { key: 'would_meet_again',label: 'Meet Again',     emoji: '🤝', hint: 'Overall — great playdate parent?' },
] as const;

type PetKey  = typeof PET_CATEGORIES[number]['key'];
type HostKey = typeof HOST_CATEGORIES[number]['key'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAW = '🐾';

function overallLabel(avg: number): string {
  if (avg >= 4.5) return 'Amazing!';
  if (avg >= 3.5) return 'Great!';
  if (avg >= 2.5) return 'Good';
  if (avg >= 1.5) return 'Fair';
  return 'Poor';
}

function avgOf(scores: Record<string, number>, keys: readonly { key: string }[]): number {
  return keys.reduce((s, c) => s + (scores[c.key] ?? 0), 0) / keys.length;
}

// ── Star row ──────────────────────────────────────────────────────────────────

function StarRow({ label, emoji, hint, value, onChange, ac }: {
  label: string; emoji: string; hint: string;
  value: number; onChange: (n: number) => void; ac: string;
}) {
  return (
    <View style={r.catRow}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[r.catLabel, { color: ac }]}>{emoji} {label}</Text>
        <Text style={r.catHint}>{hint}</Text>
      </View>
      <View style={r.pawRow}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} activeOpacity={0.7}>
            <Text style={[r.paw, { opacity: n <= value ? 1 : 0.22, color: n <= value ? ac : '#94A3B8' }]}>
              {PAW}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Score banner ──────────────────────────────────────────────────────────────

function ScoreBanner({ avg, ac, label }: { avg: number; ac: string; label?: string }) {
  return (
    <View style={[r.overallBanner, { backgroundColor: `${ac}14`, borderColor: `${ac}28` }]}>
      <Text style={[r.overallScore, { color: ac }]}>{avg.toFixed(1)}</Text>
      <View>
        <Text style={[r.overallLabel, { color: ac }]}>{overallLabel(avg)}</Text>
        <Text style={[r.overallSub, { color: '#94A3B8' }]}>{label ?? 'Overall score'}</Text>
      </View>
    </View>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDots({ step, ac }: { step: 1 | 2; ac: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
      {[1, 2].map(n => (
        <View key={n} style={[r.dot, {
          backgroundColor: step === n ? ac : `${ac}30`,
          width: step === n ? 20 : 8,
        }]} />
      ))}
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  target: RatingTarget | null;
  ac: string;
  colors: any;
  onClose: () => void;
  onSubmitted: (playdateRequestId: string) => void;
}

export function PlaydateRatingModal({ visible, target, ac, colors, onClose, onSubmitted }: Props) {
  const [step,        setStep]        = useState<1 | 2>(1);
  const [petScores,   setPetScores]   = useState<Record<PetKey, number>>({} as any);
  const [hostScores,  setHostScores]  = useState<Record<HostKey, number>>({} as any);
  const [review,      setReview]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // Reset everything when the modal opens (or opens for a different target)
  useEffect(() => {
    if (visible) {
      setStep(1);
      setPetScores({} as any);
      setHostScores({} as any);
      setReview('');
      setSubmitting(false);
    }
  }, [visible, target?.playdateRequestId]);

  if (!target) return null;

  const petAc = target.ratedPet.accent_color ?? ac;

  const petAllFilled  = PET_CATEGORIES.every(c => (petScores[c.key] ?? 0) > 0);
  const hostAllFilled = HOST_CATEGORIES.every(c => (hostScores[c.key] ?? 0) > 0);
  const petAvg        = petAllFilled  ? avgOf(petScores, PET_CATEGORIES)   : 0;
  const hostAvg       = hostAllFilled ? avgOf(hostScores, HOST_CATEGORIES) : 0;

  const setPetScore  = (key: PetKey,  n: number) => setPetScores(prev  => ({ ...prev, [key]: n }));
  const setHostScore = (key: HostKey, n: number) => setHostScores(prev => ({ ...prev, [key]: n }));

  const handleSkip = () => onClose();

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);

  const handleSubmit = async () => {
    if (!petAllFilled || submitting) return;
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        playdate_request_id: target.playdateRequestId,
        rater_pet_id:        target.raterPetId,
        rated_pet_id:        target.ratedPet.id,
        pet_scores: {
          friendliness:     petScores.friendliness,
          energy_match:     petScores.energy_match,
          punctuality:      petScores.punctuality,
          well_behaved:     petScores.well_behaved,
          would_play_again: petScores.would_play_again,
        },
        review: review.trim() || null,
      };

      if (hostAllFilled) {
        body.host_scores = {
          communication:   hostScores.communication,
          punctuality:     hostScores.punctuality,
          friendliness:    hostScores.friendliness,
          would_meet_again: hostScores.would_meet_again,
        };
      }

      const { data, error } = await supabase.functions.invoke('notify-playdate-rating', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      onSubmitted(target.playdateRequestId);
    } catch (e: any) {
      showAlert('Could not save', e?.message ?? 'Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={handleSkip}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={r.overlay}>
          <View style={[r.sheet, { backgroundColor: colors.card }]}>
            {/* Handle */}
            <View style={[r.handle, { backgroundColor: colors.border }]} />

            {/* Step dots */}
            <StepDots step={step} ac={petAc} />

            {/* Header */}
            <View style={r.header}>
              <View style={[r.petAvatar, { backgroundColor: `${petAc}20` }]}>
                {target.ratedPet.avatar_url
                  ? <Image source={{ uri: target.ratedPet.avatar_url }} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="cover" cachePolicy="memory-disk" />
                  : <Text style={{ fontSize: TYPO.hero }}>{target.ratedPet.emoji}</Text>
                }
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[r.headerTitle, { color: colors.textPrimary }]}>
                  {step === 1 ? 'Rate the playdate' : 'Rate the parent'}
                </Text>
                <Text style={[r.headerSub, { color: petAc }]}>
                  {step === 1 ? `with ${target.ratedPet.name}` : `${target.ratedPet.name}'s parent`}
                </Text>
                {target.agreedDate && step === 1 && (
                  <Text style={[r.headerMeta, { color: colors.textSecondary }]}>
                    {(() => { try { return new Date(target.agreedDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } })()}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* ── STEP 1: Pet rating ─────────────────────────────── */}
              {step === 1 && (
                <>
                  {petAllFilled && (
                    <ScoreBanner avg={petAvg} ac={petAc} label="Pet playdate score" />
                  )}

                  <View style={[r.catCard, { backgroundColor: colors.inputBg }]}>
                    {PET_CATEGORIES.map((cat, i) => (
                      <React.Fragment key={cat.key}>
                        <StarRow
                          label={cat.label} emoji={cat.emoji} hint={cat.hint}
                          value={petScores[cat.key] ?? 0}
                          onChange={n => setPetScore(cat.key, n)}
                          ac={petAc}
                        />
                        {i < PET_CATEGORIES.length - 1 && (
                          <View style={[r.divider, { backgroundColor: colors.border }]} />
                        )}
                      </React.Fragment>
                    ))}
                  </View>

                  <View style={r.actions}>
                    <TouchableOpacity onPress={handleSkip} style={[r.skipBtn, { borderColor: colors.border }]} activeOpacity={0.7}>
                      <Text style={[r.skipText, { color: colors.textSecondary }]}>Skip</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleNext}
                      disabled={!petAllFilled}
                      style={[r.nextBtn, { backgroundColor: petAllFilled ? petAc : colors.border }]}
                      activeOpacity={0.8}>
                      <Text style={r.submitText}>Next</Text>
                      <Ionicons name="chevron-forward" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* ── STEP 2: Parent/host rating ─────────────────────── */}
              {step === 2 && (
                <>
                  {/* Pet score recap pill */}
                  <View style={[r.recapPill, { backgroundColor: `${petAc}12`, borderColor: `${petAc}25` }]}>
                    <Text style={{ fontSize: TYPO.caption }}>🐾</Text>
                    <Text style={[r.recapText, { color: petAc }]}>
                      {target.ratedPet.name}: {petAvg.toFixed(1)} — {overallLabel(petAvg)}
                    </Text>
                  </View>

                  {hostAllFilled && (
                    <ScoreBanner avg={hostAvg} ac={petAc} label="Parent score" />
                  )}

                  <View style={[r.catCard, { backgroundColor: colors.inputBg }]}>
                    {HOST_CATEGORIES.map((cat, i) => (
                      <React.Fragment key={cat.key}>
                        <StarRow
                          label={cat.label} emoji={cat.emoji} hint={cat.hint}
                          value={hostScores[cat.key] ?? 0}
                          onChange={n => setHostScore(cat.key, n)}
                          ac={petAc}
                        />
                        {i < HOST_CATEGORIES.length - 1 && (
                          <View style={[r.divider, { backgroundColor: colors.border }]} />
                        )}
                      </React.Fragment>
                    ))}
                  </View>

                  {/* Review text — shared for both pet + host */}
                  <View style={[r.reviewBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <TextInput
                      style={[r.reviewInput, { color: colors.textPrimary }]}
                      placeholder={`Leave a note about your time with ${target.ratedPet.name}… (optional)`}
                      placeholderTextColor={colors.placeholder ?? colors.textTertiary}
                      value={review}
                      onChangeText={t => setReview(t.slice(0, 200))}
                      multiline
                      maxLength={200}
                    />
                    {review.length > 150 && (
                      <Text style={[r.charCount, { color: review.length >= 200 ? '#E0525A' : colors.textTertiary }]}>
                        {200 - review.length}
                      </Text>
                    )}
                  </View>

                  {!hostAllFilled && (
                    <Text style={[r.skipHint, { color: colors.textSecondary }]}>
                      Parent rating is optional — you can submit with just the pet rating.
                    </Text>
                  )}

                  <View style={r.actions}>
                    <TouchableOpacity onPress={handleBack} style={[r.skipBtn, { borderColor: colors.border }]} activeOpacity={0.7}>
                      <Ionicons name="chevron-back" size={14} color={colors.textSecondary} />
                      <Text style={[r.skipText, { color: colors.textSecondary }]}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSubmit}
                      disabled={submitting}
                      style={[r.nextBtn, { backgroundColor: petAc, opacity: submitting ? 0.6 : 1 }]}
                      activeOpacity={0.8}>
                      {submitting
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <>
                            <Text style={{ fontSize: TYPO.body }}>🐾</Text>
                            <Text style={r.submitText}>Submit Rating</Text>
                          </>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <View style={{ height: 28 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const r = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 18, maxHeight: '94%' },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  dot:          { height: 8, borderRadius: 4 },

  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  petAvatar:    { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: TYPO.subheading, fontWeight: '800', letterSpacing: -0.3 },
  headerSub:    { fontSize: TYPO.body, fontWeight: '700' },
  headerMeta:   { fontSize: TYPO.caption, fontWeight: '500', opacity: 0.8 },

  overallBanner:{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, borderWidth: 1,
                  paddingHorizontal: 16, paddingVertical: 12, marginBottom: 14 },
  overallScore: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  overallLabel: { fontSize: TYPO.subheading, fontWeight: '800' },
  overallSub:   { fontSize: TYPO.caption, marginTop: 1 },

  recapPill:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1,
                  paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  recapText:    { fontSize: TYPO.caption, fontWeight: '700' },

  catCard:      { borderRadius: 16, padding: 4, marginBottom: 14 },
  catRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12 },
  catLabel:     { fontSize: TYPO.body, fontWeight: '700' },
  catHint:      { fontSize: TYPO.label, color: '#94A3B8', marginTop: 1 },
  pawRow:       { flexDirection: 'row', gap: 4 },
  paw:          { fontSize: TYPO.heading },
  divider:      { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },

  reviewBox:    { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, minHeight: 80 },
  reviewInput:  { fontSize: TYPO.body, lineHeight: 21, minHeight: 60 },
  charCount:    { fontSize: TYPO.label, alignSelf: 'flex-end', marginTop: 4 },

  skipHint:     { fontSize: TYPO.caption, textAlign: 'center', marginBottom: 14, opacity: 0.7 },

  actions:      { flexDirection: 'row', gap: 10, marginBottom: 4 },
  skipBtn:      { flex: 0.55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 4, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  skipText:     { fontSize: TYPO.body, fontWeight: '600' },
  nextBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 14, borderRadius: 14 },
  submitText:   { fontSize: TYPO.body, fontWeight: '800', color: '#fff' },
});
