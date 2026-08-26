import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Keyboard, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check, Calendar, ChevronLeft } from 'lucide-react-native';
import StepProgressBar from '@/components/StepProgressBar';
import StepTransition from '@/components/StepTransition';
import {
  VaxForm, BLANK_VAX, VAX_TYPES, VAX_SUGGESTIONS,
  fmtDate, fmtDateDisplay, aStyles,
} from './types';

// Stepper — same rationale as AddMedModal.tsx's own comment: was one long
// scroll across 5 sections, broken into steps matching the existing
// section boundaries. Steps 1–2 required, step 3 skippable via Next.
const STEPS = ['basics', 'dates', 'notes'] as const;
type Step = typeof STEPS[number];
const STEP_TITLES: Record<Step, string> = {
  basics: 'What & Who', dates: 'Dates & Series', notes: 'Provider & Notes',
};

export default function AddVaxModal({ visible, onClose, onSave, members, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSave: (memberId: string, form: VaxForm) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
}) {
  const [form, setForm]               = useState<VaxForm>(BLANK_VAX);
  const [selectedMember, setSelectedMember] = useState(members[0]?.id ?? '');
  const [saving, setSaving]           = useState(false);
  const [adminDate, setAdminDate]     = useState<Date>(new Date());
  const [nextDate, setNextDate]       = useState<Date | null>(null);
  const [showAdminPick, setShowAdminPick]   = useState(false);
  const [showNextPick, setShowNextPick]     = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [stepIndex, setStepIndex]     = useState(0);
  const step = STEPS[stepIndex];

  const set = (k: keyof VaxForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const [vaxTouched, setVaxTouched]           = useState<Record<string, boolean>>({});
  const [vaxSubmitAttempted, setVaxSubmitAttempted] = useState(false);

  const vaxErrors = useMemo(() => ({
    title:  !form.title.trim()  ? 'Vaccine name is required' : '',
    member: !selectedMember     ? 'Select a family member'   : '',
  }), [form.title, selectedMember]);

  const showVaxErr = (k: keyof typeof vaxErrors) =>
    !!(vaxErrors[k] && (vaxTouched[k] || vaxSubmitAttempted));

  const touchVax = (k: string) => setVaxTouched(t => ({ ...t, [k]: true }));

  const reset = () => {
    setForm(BLANK_VAX); setAdminDate(new Date()); setNextDate(null);
    setShowAdminPick(false); setShowNextPick(false); setNameFocused(false);
    setVaxTouched({}); setVaxSubmitAttempted(false); setStepIndex(0);
  };

  useEffect(() => { if (visible) setStepIndex(0); }, [visible]);

  const handleClose = () => { reset(); onClose(); };

  const goNext = () => {
    if (step === 'basics' && (vaxErrors.title || vaxErrors.member)) {
      setVaxTouched(t => ({ ...t, title: true, member: true }));
      return;
    }
    if (stepIndex < STEPS.length - 1) setStepIndex(i => i + 1);
  };
  const goBack = () => { if (stepIndex > 0) setStepIndex(i => i - 1); };

  const handleSave = async () => {
    setVaxSubmitAttempted(true);
    if (vaxErrors.title || vaxErrors.member) {
      setStepIndex(0);
      return;
    }
    setSaving(true);
    await onSave(selectedMember, {
      ...form,
      date: fmtDate(adminDate),
      next_due_date: nextDate ? fmtDate(nextDate) : '',
    });
    setSaving(false);
    reset();
    onClose();
  };

  const suggestions = useMemo(() => {
    if (!form.title.trim()) return VAX_SUGGESTIONS.slice(0, 6);
    return VAX_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(form.title.toLowerCase())).slice(0, 6);
  }, [form.title]);

  const inp = [
    aStyles.inp,
    { backgroundColor: isDark ? colors.card : colors.tealLight, borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card,
            borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8 }}>

            {/* Drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            {/* Fixed header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              {stepIndex > 0 && (
                <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ marginRight: 10 }}>
                  <ChevronLeft size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>
                  {stepIndex === 0 ? 'Log Vaccine' : STEP_TITLES[step]}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                  Step {stepIndex + 1} of {STEPS.length}
                </Text>
              </View>
            </View>

            {/* Step progress — animated fill instead of an instant snap */}
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <StepProgressBar stepCount={STEPS.length} activeIndex={stepIndex} accentColor={colors.teal} trackColor={colors.border} />
            </View>

            <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 8, gap: 18 }}>
              <StepTransition stepKey={step}>

              {step === 'basics' && (
                <>
                  {/* ── Vaccine name + suggestions ── */}
                  <View>
                    <Text style={[aStyles.label, { color: showVaxErr('title') ? colors.danger : colors.textSecondary }]}>
                      Vaccine Name *
                    </Text>
                    <TextInput value={form.title} onChangeText={v => set('title', v)}
                      onFocus={() => setNameFocused(true)}
                      onBlur={() => { touchVax('title'); setNameFocused(false); }}
                      placeholder="e.g. Flu Shot 2025" placeholderTextColor={colors.textTertiary}
                      style={[inp, { borderColor: showVaxErr('title') ? colors.danger : form.title ? colors.border : colors.teal + '60' }]} />
                    {showVaxErr('title') && (
                      <Text style={[aStyles.errText, { color: colors.danger }]}>{vaxErrors.title}</Text>
                    )}
                    {suggestions.length > 0 && (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 5, fontWeight: '600' }}>
                          {form.title.trim() ? 'Matching — tap to fill' : 'Quick picks'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                          <View style={{ flexDirection: 'row', gap: 7 }}>
                            {suggestions.map((s, i) => (
                              <TouchableOpacity key={i} onPress={() => { set('title', s.name); setNameFocused(false); }}
                                style={[aStyles.suggPill, {
                                  backgroundColor: form.title === s.name ? colors.teal + '20' : colors.tealLight,
                                  borderColor: form.title === s.name ? colors.teal : colors.teal + '40',
                                }]}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>{s.name}</Text>
                                <Text style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 4 }}>{s.hint}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* ── Vaccine type chips ── */}
                  <View>
                    <Text style={[aStyles.label, { color: colors.textSecondary }]}>Vaccine Type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 2 }}>
                        {VAX_TYPES.map(t => {
                          const sel = form.vaccine_type === t;
                          return (
                            <TouchableOpacity key={t} onPress={() => set('vaccine_type', sel ? '' : t)}
                              style={{
                                borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6,
                                backgroundColor: sel ? colors.teal + '18' : 'transparent',
                                borderColor: sel ? colors.teal : colors.border,
                              }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
                                color: sel ? colors.teal : colors.textSecondary }}>{t}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>

                  {/* ── Member avatar picker ── */}
                  <View>
                    <Text style={[aStyles.sectionLabel, { color: showVaxErr('member') ? colors.danger : colors.teal }]}>
                      For Member {showVaxErr('member') ? '— ' + vaxErrors.member : ''}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ flexDirection: 'row', gap: 14, paddingBottom: 4 }}>
                      {members.map(m => {
                        const sel = selectedMember === m.id;
                        const mc = m.role === 'parent' ? colors.accent : m.role === 'senior' ? colors.info : colors.success;
                        return (
                          <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 5 }}
                            onPress={() => { setSelectedMember(m.id); touchVax('member'); }}>
                            <View style={{
                              width: 52, height: 52, borderRadius: 26,
                              backgroundColor: sel ? mc + '20' : colors.surface,
                              borderWidth: sel ? 2.5 : 0, borderColor: mc,
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Text style={{ fontSize: 20, fontWeight: '900', color: sel ? mc : colors.textSecondary }}>
                                {m.name.charAt(0).toUpperCase()}
                              </Text>
                              {sel && (
                                <View style={{ position: 'absolute', bottom: -2, right: -2,
                                  width: 16, height: 16, borderRadius: 8,
                                  backgroundColor: mc, alignItems: 'center', justifyContent: 'center' }}>
                                  <Check size={9} color={colors.textInverse} />
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: '700',
                              color: sel ? mc : colors.textTertiary }} numberOfLines={1}>
                              {m.name.split(' ')[0]}
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'capitalize' }}>{m.role}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </>
              )}

              {step === 'dates' && (
                <>
                  {/* ── Dates ── */}
                  <View>
                    <Text style={[aStyles.sectionLabel, { color: colors.teal }]}>Administration Dates</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Date Administered *</Text>
                        <TouchableOpacity onPress={() => { setShowAdminPick(p => !p); setShowNextPick(false); }}
                          style={[aStyles.dateBtn, {
                            backgroundColor: showAdminPick ? colors.teal + '20' : colors.tealLight,
                            borderColor: showAdminPick ? colors.teal : colors.border,
                          }]}>
                          <Calendar size={14} color={showAdminPick ? colors.teal : colors.textTertiary} />
                          <Text style={{ fontSize: 13, fontWeight: '700',
                            color: showAdminPick ? colors.teal : colors.textPrimary }}>
                            {fmtDateDisplay(adminDate)}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Next Due (optional)</Text>
                        <TouchableOpacity onPress={() => { setShowNextPick(p => !p); setShowAdminPick(false); }}
                          style={[aStyles.dateBtn, {
                            backgroundColor: showNextPick ? colors.amber + '20' : colors.amberLight,
                            borderColor: showNextPick ? colors.amber : (nextDate ? colors.amber + '80' : colors.border),
                          }]}>
                          <Calendar size={14} color={nextDate ? colors.amber : colors.textTertiary} />
                          <Text style={{ fontSize: 13, fontWeight: '700',
                            color: nextDate ? (showNextPick ? colors.amber : colors.textPrimary) : colors.textTertiary }}>
                            {nextDate ? fmtDateDisplay(nextDate) : 'Pick date'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {(showAdminPick || showNextPick) && (
                      <Modal transparent animationType="fade" visible onRequestClose={() => { setShowAdminPick(false); setShowNextPick(false); }}>
                        <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1}
                          onPress={() => { setShowAdminPick(false); setShowNextPick(false); }}>
                          <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: colors.card }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>
                                {showAdminPick ? 'Date Administered' : 'Next Due Date'}
                              </Text>
                              <TouchableOpacity onPress={() => { setShowAdminPick(false); setShowNextPick(false); }}>
                                <Text style={{ color: colors.teal, fontWeight: '900', fontSize: 15 }}>Done</Text>
                              </TouchableOpacity>
                            </View>
                            <DateTimePicker
                              value={showAdminPick ? adminDate : (nextDate ?? new Date())}
                              mode="date" display="spinner"
                              onChange={(_, d) => {
                                if (d) { showAdminPick ? setAdminDate(d) : setNextDate(d); }
                              }}
                              textColor={colors.textPrimary} style={{ height: 180, width: '100%' }}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </Modal>
                    )}
                  </View>

                  {/* ── Series ── */}
                  <View>
                    <Text style={[aStyles.sectionLabel, { color: colors.teal }]}>Dose Series</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Current Dose #</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {['1', '2', '3', '4'].map(n => (
                            <TouchableOpacity key={n} onPress={() => set('series_current', n)}
                              style={[aStyles.chipSmall, {
                                flex: 1, alignItems: 'center',
                                borderColor: form.series_current === n ? colors.teal : colors.border,
                                backgroundColor: form.series_current === n ? colors.teal + '15' : 'transparent',
                              }]}>
                              <Text style={{ fontSize: 13, fontWeight: '800',
                                color: form.series_current === n ? colors.teal : colors.textSecondary }}>{n}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Total Doses</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {['1', '2', '3', '4'].map(n => (
                            <TouchableOpacity key={n} onPress={() => set('series_total', n)}
                              style={[aStyles.chipSmall, {
                                flex: 1, alignItems: 'center',
                                borderColor: form.series_total === n ? colors.info : colors.border,
                                backgroundColor: form.series_total === n ? colors.info + '15' : 'transparent',
                              }]}>
                              <Text style={{ fontSize: 13, fontWeight: '800',
                                color: form.series_total === n ? colors.info : colors.textSecondary }}>{n}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>
                </>
              )}

              {step === 'notes' && (
                <>
                  {/* ── Administered by / location ── */}
                  <View>
                    <Text style={[aStyles.sectionLabel, { color: colors.teal }]}>Provider & Location</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Administered By</Text>
                        <TextInput value={form.administered_by} onChangeText={v => set('administered_by', v)}
                          placeholder="Dr. Name / CVS" placeholderTextColor={colors.textTertiary} style={inp} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Location</Text>
                        <TextInput value={form.location} onChangeText={v => set('location', v)}
                          placeholder="Clinic / School" placeholderTextColor={colors.textTertiary} style={inp} />
                      </View>
                    </View>
                  </View>

                  {/* Notes */}
                  <View>
                    <Text style={[aStyles.label, { color: colors.textSecondary }]}>Notes / Lot Number</Text>
                    <TextInput value={form.notes} onChangeText={v => set('notes', v)}
                      placeholder="Reactions, lot number, clinic notes…"
                      placeholderTextColor={colors.textTertiary}
                      style={[inp, { height: 68, textAlignVertical: 'top' }]} multiline />
                  </View>

                  {/* ── Review — compact summary before Save ── */}
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                    backgroundColor: colors.surface, padding: 14, gap: 6 }}>
                    <Text style={[aStyles.sectionLabel, { color: colors.textSecondary, marginBottom: 2 }]}>Review</Text>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                      {form.title.trim() || 'Untitled vaccine'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      Dose {form.series_current}/{form.series_total} · {fmtDateDisplay(adminDate)}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      For {members.find(m => m.id === selectedMember)?.name ?? '—'}
                    </Text>
                  </View>
                </>
              )}
              </StepTransition>
            </ScrollView>

            {/* Fixed footer — Back/Next through steps 1-2, Save on the last */}
            <View style={[aStyles.saveRow, { borderColor: colors.border }]}>
              <TouchableOpacity onPress={stepIndex === 0 ? handleClose : goBack}
                style={[aStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>
                  {stepIndex === 0 ? 'Cancel' : 'Back'}
                </Text>
              </TouchableOpacity>
              {stepIndex < STEPS.length - 1 ? (
                <TouchableOpacity onPress={goNext} style={[aStyles.saveBtn, { backgroundColor: colors.teal }]}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textInverse }}>Next</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleSave}
                  style={[aStyles.saveBtn, { backgroundColor: colors.teal }]} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color={colors.textInverse} />
                    : <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textInverse }}>Save Vaccine</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
