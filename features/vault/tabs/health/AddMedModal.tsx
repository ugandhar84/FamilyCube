import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, Switch, KeyboardAvoidingView, Platform, Keyboard, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check, Calendar, ChevronLeft } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import StepProgressBar from '@/components/StepProgressBar';
import StepTransition from '@/components/StepTransition';
import {
  MedForm, BLANK_MED, MED_SUGGESTIONS, getCatColors, FREQ_LABELS,
  fmtDate, fmtDateDisplay, aStyles, doseCountForFrequency,
} from './types';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

// Stepper — was one long scroll cramming 7 sections (category, name,
// dosage, frequency, prescriber, supply, escalation) into a single pass;
// broken into steps matching the form's own existing section boundaries so
// each screen is a short, focused decision instead of a wall of fields.
// Only steps 1–2 are required to save; 3–4 are skippable via Next.
const STEPS = ['basics', 'dosage', 'supply', 'alert'] as const;
type Step = typeof STEPS[number];
const STEP_TITLES: Record<Step, string> = {
  basics: 'What & Who', dosage: 'Dosage & Schedule',
  supply: 'Prescriber & Supply', alert: 'Missed-Dose Alert',
};

export default function AddMedModal({ visible, onClose, onSave, members, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSave: (memberId: string, form: MedForm) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
}) {
  const [form, setForm]               = useState<MedForm>(BLANK_MED);
  const [selectedMember, setSelectedMember] = useState(members[0]?.id ?? '');
  const [saving, setSaving]           = useState(false);
  const [showRefillPicker, setShowRefillPicker] = useState(false);
  const [refillDate, setRefillDate]   = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker]     = useState(false);
  // Which reminder_times INDEX is currently showing its picker — null when
  // none is open. Was a plain boolean when there was only ever one
  // reminder time; now needs to track which of potentially several
  // (twice_daily = 2) dose times the user tapped.
  const [showTimePickerIdx, setShowTimePickerIdx] = useState<number | null>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [globalSuggestions, setGlobalSuggestions] = useState<{ name: string; hint: string; category: string }[]>([]);
  const [touched, setTouched]         = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [stepIndex, setStepIndex]     = useState(0);
  const step = STEPS[stepIndex];

  // Load global suggestions once when modal opens
  useEffect(() => {
    if (!visible) return;
    supabase.from('global_med_suggestions')
      .select('name, hint, category')
      .order('use_count', { ascending: false })
      .limit(100)
      .then(({ data }) => { if (data) setGlobalSuggestions(data as any); });
  }, [visible]);

  useEffect(() => { if (visible) setStepIndex(0); }, [visible]);

  const set = (k: keyof MedForm, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setReminderTime = (idx: number, time: string) =>
    setForm(f => ({ ...f, reminder_times: f.reminder_times.map((t, i) => i === idx ? time : t) }));
  // Grows/shrinks reminder_times to match what the newly-picked frequency
  // needs (twice_daily = 2 dose times, everything else = 1) — never
  // silently discards a time the user already set: switching FROM
  // twice_daily back to daily keeps only the first time, and switching TO
  // twice_daily keeps the existing time as dose 1 and adds a sensible
  // default (12 hours later) as dose 2 rather than a blank/duplicate.
  const setFrequency = (freq: string) => {
    setForm(f => {
      const wanted = doseCountForFrequency(freq);
      let times = f.reminder_times;
      if (times.length > wanted) times = times.slice(0, wanted);
      else if (times.length < wanted) {
        const [h, m] = (times[0] ?? '08:00').split(':').map(Number);
        const secondHour = ((h || 8) + 12) % 24;
        times = [...times, `${String(secondHour).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`];
      }
      return { ...f, frequency: freq, reminder_times: times };
    });
  };
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }));

  // Derived validation errors — name/dosage/member gate steps 1 & 2, not
  // the whole form, so Next on step 1 catches a missing name immediately
  // instead of only surfacing it at final Save.
  const medErrors = useMemo(() => ({
    name:   !form.name.trim()   ? 'Medication name is required' : '',
    dosage: !form.dosage.trim() ? 'Dosage amount is required'   : '',
    member: !selectedMember     ? 'Select a family member'      : '',
  }), [form.name, form.dosage, selectedMember]);

  const showErr = (k: keyof typeof medErrors) =>
    !!(medErrors[k] && (touched[k] || submitAttempted));

  const reset = () => {
    setForm(BLANK_MED); setRefillDate(null);
    setShowRefillPicker(false); setNameFocused(false);
    setShowStartPicker(false); setShowEndPicker(false); setShowTimePickerIdx(null);
    setTouched({}); setSubmitAttempted(false); setStepIndex(0);
  };

  const handleClose = () => { reset(); onClose(); };

  const goNext = () => {
    if (step === 'basics' && (medErrors.name || medErrors.member)) {
      setTouched(t => ({ ...t, name: true, member: true }));
      return;
    }
    if (step === 'dosage' && medErrors.dosage) {
      setTouched(t => ({ ...t, dosage: true }));
      return;
    }
    if (stepIndex < STEPS.length - 1) setStepIndex(i => i + 1);
  };
  const goBack = () => { if (stepIndex > 0) setStepIndex(i => i - 1); };

  const handleSave = async () => {
    setSubmitAttempted(true);
    if (medErrors.name || medErrors.dosage || medErrors.member) {
      // Jump back to whichever step actually has the problem instead of
      // just refusing silently — Save is only reachable from the last
      // step, so a still-missing required field means the user skipped
      // past it via Next's guard somehow (defensive, shouldn't normally fire).
      setStepIndex(medErrors.name || medErrors.member ? 0 : 1);
      return;
    }
    setSaving(true);
    await onSave(selectedMember, { ...form, refill_date: refillDate ? fmtDate(refillDate) : '' });
    setSaving(false);
    reset();
    onClose();
  };

  const catColors = getCatColors(colors);
  const catColor = catColors[form.category] ?? colors.primary;
  const suggestions = useMemo(() => {
    const builtIn = MED_SUGGESTIONS[form.category] ?? [];
    const global = globalSuggestions
      .filter(s => s.category === form.category)
      .map(s => ({ name: s.name, hint: s.hint ?? s.category }));
    // Merge: global first (community-sourced), then built-in, deduplicated
    const seen = new Set<string>();
    const merged: { name: string; hint: string }[] = [];
    for (const s of [...global, ...builtIn]) {
      const key = s.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); merged.push(s); }
    }
    if (!form.name.trim()) return merged.slice(0, 8);
    const q = form.name.toLowerCase();
    return merged.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [form.category, form.name, globalSuggestions]);

  const inp = [
    aStyles.inp,
    { backgroundColor: isDark ? colors.card : colors.surface, borderColor: colors.border, color: colors.textPrimary },
  ];

  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '90%', backgroundColor: colors.card,
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
                  {stepIndex === 0 ? 'Add Medication' : STEP_TITLES[step]}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                  Step {stepIndex + 1} of {STEPS.length}
                </Text>
              </View>
            </View>

            {/* Step progress — animated fill instead of an instant snap */}
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <StepProgressBar stepCount={STEPS.length} activeIndex={stepIndex} accentColor={catColor} trackColor={colors.border} />
            </View>

            <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 8, gap: 18 }}>
              <StepTransition stepKey={step}>

              {step === 'basics' && (
                <>
                  {/* ── Category chips (horizontal scroll) ── */}
                  <View>
                    <Text style={[aStyles.label, { color: colors.textSecondary }]}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                        {Object.entries(catColors).map(([cat, color]) => {
                          const active = form.category === cat;
                          return (
                            <TouchableOpacity key={cat} onPress={() => { set('category', cat); set('name', ''); }}
                              style={{
                                borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 7,
                                backgroundColor: active ? color + '18' : colors.surface,
                                borderColor: active ? color : colors.border,
                              }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', textTransform: 'capitalize',
                                color: active ? color : colors.textSecondary }}>{cat}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>

                  {/* ── Medication name + suggestions ── */}
                  <View>
                    <Text style={[aStyles.label, { color: showErr('name') ? colors.danger : colors.textSecondary }]}>
                      Medication Name *
                    </Text>
                    <TextInput value={form.name} onChangeText={v => set('name', v)}
                      onFocus={() => setNameFocused(true)}
                      onBlur={() => { touch('name'); setNameFocused(false); }}
                      placeholder={MED_SUGGESTIONS[form.category]?.[0]?.name ?? 'e.g. Aspirin'}
                      placeholderTextColor={colors.textTertiary}
                      style={[inp, { borderColor: showErr('name') ? colors.danger : form.name ? colors.border : catColor + '60' }]} />
                    {showErr('name') && (
                      <Text style={[aStyles.errText, { color: colors.danger }]}>{medErrors.name}</Text>
                    )}
                    {suggestions.length > 0 && (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 5, fontWeight: '600' }}>
                          {form.name.trim() ? 'Matching — tap to fill' : 'Quick picks'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                          <View style={{ flexDirection: 'row', gap: 7 }}>
                            {suggestions.map((s, i) => (
                              <TouchableOpacity key={i} onPress={() => { set('name', s.name); setNameFocused(false); }}
                                style={[aStyles.suggPill, {
                                  backgroundColor: form.name === s.name ? catColor + '20' : colors.surface,
                                  borderColor: form.name === s.name ? catColor : colors.border,
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

                  {/* ── Member picker (avatar row) ── */}
                  <View>
                    <Text style={[aStyles.sectionLabel, { color: showErr('member') ? colors.danger : catColor }]}>
                      Assigned To {showErr('member') ? '— ' + medErrors.member : ''}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ flexDirection: 'row', gap: 14, paddingBottom: 4 }}>
                      {members.map(m => {
                        const sel = selectedMember === m.id;
                        const mc = m.role === 'parent' ? colors.accent : m.role === 'senior' ? colors.info : colors.success;
                        return (
                          <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 5 }}
                            onPress={() => { setSelectedMember(m.id); touch('member'); }}>
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
                            <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'capitalize' }}>
                              {m.role}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </>
              )}

              {step === 'dosage' && (
                <View>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[aStyles.label, { color: showErr('dosage') ? colors.danger : colors.textSecondary }]}>
                        Dosage *
                      </Text>
                      <TextInput value={form.dosage} onChangeText={v => set('dosage', v)}
                        onBlur={() => touch('dosage')}
                        placeholder="10" keyboardType="decimal-pad"
                        placeholderTextColor={colors.textTertiary}
                        style={[inp, { borderColor: showErr('dosage') ? colors.danger : colors.border }]} />
                      {showErr('dosage') && (
                        <Text style={[aStyles.errText, { color: colors.danger }]}>{medErrors.dosage}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[aStyles.label, { color: colors.textSecondary }]}>Unit</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {['mg', 'ml', 'tablet', 'capsule', 'drop', 'puff'].map(unit => (
                            <TouchableOpacity key={unit} onPress={() => set('dosage_unit', unit)}
                              style={[aStyles.chipSmall, {
                                borderColor: form.dosage_unit === unit ? catColor : colors.border,
                                backgroundColor: form.dosage_unit === unit ? catColor + '15' : 'transparent',
                              }]}>
                              <Text style={{ fontSize: 10, fontWeight: '700',
                                color: form.dosage_unit === unit ? catColor : colors.textSecondary }}>{unit}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  </View>

                  {/* Frequency chips */}
                  <Text style={[aStyles.label, { color: colors.textSecondary }]}>Frequency</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(FREQ_LABELS).map(([k, v]) => (
                      <TouchableOpacity key={k} onPress={() => setFrequency(k)}
                        style={[aStyles.chipSmall, {
                          borderColor: form.frequency === k ? catColor : colors.border,
                          backgroundColor: form.frequency === k ? catColor + '15' : 'transparent',
                        }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700',
                          color: form.frequency === k ? catColor : colors.textSecondary }}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* ── Reminder Schedule — start/end dates + a daily
                      reminder time, materialized as a real recurring
                      calendar entry on save (see HealthTab.tsx's addMed). ── */}
                  <View style={{ marginTop: 16 }}>
                    <Text style={[aStyles.sectionLabel, { color: catColor }]}>Reminder Schedule</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Starts</Text>
                        <TouchableOpacity onPress={() => setShowStartPicker(p => !p)}
                          style={[aStyles.dateBtn, {
                            backgroundColor: showStartPicker ? catColor + '20' : colors.surface,
                            borderColor: showStartPicker ? catColor : colors.border,
                          }]}>
                          <Calendar size={14} color={showStartPicker ? catColor : colors.textTertiary} />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: showStartPicker ? catColor : colors.textPrimary }}>
                            {fmtDateDisplay(new Date(form.start_date + 'T00:00:00'))}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Ends (optional)</Text>
                        <TouchableOpacity onPress={() => setShowEndPicker(p => !p)}
                          style={[aStyles.dateBtn, {
                            backgroundColor: showEndPicker ? catColor + '20' : colors.surface,
                            borderColor: showEndPicker ? catColor : colors.border,
                          }]}>
                          <Calendar size={14} color={showEndPicker ? catColor : colors.textTertiary} />
                          <Text style={{ fontSize: 13, fontWeight: '700',
                            color: form.end_date ? (showEndPicker ? catColor : colors.textPrimary) : colors.textTertiary }}>
                            {form.end_date ? fmtDateDisplay(new Date(form.end_date + 'T00:00:00')) : 'Ongoing'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {showStartPicker && (
                      <Modal transparent animationType="fade" visible onRequestClose={() => setShowStartPicker(false)}>
                        <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowStartPicker(false)}>
                          <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: colors.card }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>Start Date</Text>
                              <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                                <Text style={{ color: catColor, fontWeight: '900', fontSize: 15 }}>Done</Text>
                              </TouchableOpacity>
                            </View>
                            <DateTimePicker
                              value={new Date(form.start_date + 'T00:00:00')} mode="date" display="spinner"
                              onChange={(_, d) => { if (d) set('start_date', fmtDate(d)); }}
                              textColor={colors.textPrimary} style={{ height: 180, width: '100%' }}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </Modal>
                    )}
                    {showEndPicker && (
                      <Modal transparent animationType="fade" visible onRequestClose={() => setShowEndPicker(false)}>
                        <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowEndPicker(false)}>
                          <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: colors.card }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>End Date</Text>
                              <View style={{ flexDirection: 'row', gap: 16 }}>
                                {!!form.end_date && (
                                  <TouchableOpacity onPress={() => { set('end_date', ''); setShowEndPicker(false); }}>
                                    <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 15 }}>Clear</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                                  <Text style={{ color: catColor, fontWeight: '900', fontSize: 15 }}>Done</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                            <DateTimePicker
                              value={form.end_date ? new Date(form.end_date + 'T00:00:00') : new Date(form.start_date + 'T00:00:00')}
                              mode="date" display="spinner"
                              onChange={(_, d) => { if (d) set('end_date', fmtDate(d)); }}
                              textColor={colors.textPrimary} style={{ height: 180, width: '100%' }}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </Modal>
                    )}

                    <View style={{ marginTop: 10 }}>
                      <Text style={[aStyles.label, { color: colors.textSecondary }]}>
                        {form.reminder_times.length > 1 ? 'Reminder Times' : 'Reminder Time'}
                      </Text>
                      {/* One button per dose — twice_daily shows 2, keeping
                          each dose's own independent time instead of the
                          old single field that silently only ever
                          scheduled the first dose (live-reported). */}
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {form.reminder_times.map((time, idx) => (
                          <TouchableOpacity key={idx} onPress={() => setShowTimePickerIdx(idx)}
                            style={[aStyles.dateBtn, { alignSelf: 'flex-start', minWidth: 110,
                              backgroundColor: showTimePickerIdx === idx ? catColor + '20' : colors.surface,
                              borderColor: showTimePickerIdx === idx ? catColor : colors.border }]}>
                            <Calendar size={14} color={showTimePickerIdx === idx ? catColor : colors.textTertiary} />
                            <Text style={{ fontSize: 13, fontWeight: '700', color: showTimePickerIdx === idx ? catColor : colors.textPrimary }}>
                              {form.reminder_times.length > 1 ? `Dose ${idx + 1} · ${time}` : time}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    {showTimePickerIdx !== null && (
                      <Modal transparent animationType="fade" visible onRequestClose={() => setShowTimePickerIdx(null)}>
                        <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowTimePickerIdx(null)}>
                          <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: colors.card }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>
                                {form.reminder_times.length > 1 ? `Dose ${showTimePickerIdx + 1} Time` : 'Reminder Time'}
                              </Text>
                              <TouchableOpacity onPress={() => setShowTimePickerIdx(null)}>
                                <Text style={{ color: catColor, fontWeight: '900', fontSize: 15 }}>Done</Text>
                              </TouchableOpacity>
                            </View>
                            <DateTimePicker
                              value={(() => { const [h, m] = form.reminder_times[showTimePickerIdx].split(':').map(Number); const d = new Date(); d.setHours(h || 8, m || 0, 0, 0); return d; })()}
                              mode="time" display="spinner"
                              onChange={(_, d) => { if (d) setReminderTime(showTimePickerIdx, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }}
                              textColor={colors.textPrimary} style={{ height: 180, width: '100%' }}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </Modal>
                    )}

                    {/* Ring-style reminder toggle — same CallKit ringing
                        infrastructure chores/events already use, riding
                        the existing call-reminder-sweeper with zero new
                        native/server work. */}
                    <TouchableOpacity onPress={() => setForm(f => ({ ...f, alert_call: !f.alert_call }))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
                        borderRadius: 12, borderWidth: 1.5, padding: 12,
                        borderColor: form.alert_call ? catColor : colors.border,
                        backgroundColor: form.alert_call ? catColor + '10' : 'transparent' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: form.alert_call ? catColor : colors.textPrimary }}>
                          Ring like a call
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                          A loud ringing alert instead of a normal notification
                        </Text>
                      </View>
                      <Switch value={form.alert_call} onValueChange={v => setForm(f => ({ ...f, alert_call: v }))}
                        trackColor={{ false: colors.border, true: catColor + '80' }}
                        thumbColor={form.alert_call ? catColor : colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {step === 'supply' && (
                <>
                  {/* ── Prescriber details ── */}
                  <View>
                    <Text style={[aStyles.sectionLabel, { color: catColor }]}>Prescriber & Pharmacy</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Doctor</Text>
                        <TextInput value={form.prescribing_doctor} onChangeText={v => set('prescribing_doctor', v)}
                          placeholder="Dr. Smith" placeholderTextColor={colors.textTertiary} style={inp} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Pharmacy</Text>
                        <TextInput value={form.pharmacy} onChangeText={v => set('pharmacy', v)}
                          placeholder="CVS / Walgreens" placeholderTextColor={colors.textTertiary} style={inp} />
                      </View>
                    </View>
                  </View>

                  {/* ── Refill & count ── */}
                  <View>
                    <Text style={[aStyles.sectionLabel, { color: catColor }]}>Supply</Text>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <View style={{ flex: 1.5 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Refill Date</Text>
                        <TouchableOpacity
                          onPress={() => setShowRefillPicker(p => !p)}
                          style={[aStyles.dateBtn, {
                            backgroundColor: showRefillPicker ? catColor + '20' : colors.surface,
                            borderColor: showRefillPicker ? catColor : colors.border,
                          }]}>
                          <Calendar size={14} color={showRefillPicker ? catColor : colors.textTertiary} />
                          <Text style={{ fontSize: 13, fontWeight: '700',
                            color: refillDate ? (showRefillPicker ? catColor : colors.textPrimary) : colors.textTertiary }}>
                            {refillDate ? fmtDateDisplay(refillDate) : 'Pick date'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[aStyles.label, { color: colors.textSecondary }]}>Pills left</Text>
                        <TextInput value={form.pills_remaining} onChangeText={v => set('pills_remaining', v)}
                          placeholder="30" keyboardType="numeric"
                          placeholderTextColor={colors.textTertiary} style={inp} />
                      </View>
                    </View>

                    {showRefillPicker && (
                      <Modal transparent animationType="fade" visible onRequestClose={() => setShowRefillPicker(false)}>
                        <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1}
                          onPress={() => setShowRefillPicker(false)}>
                          <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: colors.card }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>Refill Date</Text>
                              <TouchableOpacity onPress={() => setShowRefillPicker(false)}>
                                <Text style={{ color: catColor, fontWeight: '900', fontSize: 15 }}>Done</Text>
                              </TouchableOpacity>
                            </View>
                            <DateTimePicker
                              value={refillDate ?? new Date()} mode="date" display="spinner"
                              onChange={(_, d) => { if (d) setRefillDate(d); }}
                              textColor={colors.textPrimary} style={{ height: 180, width: '100%' }}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </Modal>
                    )}
                  </View>

                  {/* ── Instructions ── */}
                  <View>
                    <Text style={[aStyles.label, { color: colors.textSecondary }]}>Special Instructions</Text>
                    <TextInput value={form.instructions} onChangeText={v => set('instructions', v)}
                      placeholder="Take with food, avoid grapefruit…"
                      placeholderTextColor={colors.textTertiary}
                      style={[inp, { height: 72, textAlignVertical: 'top' }]} multiline />
                  </View>
                </>
              )}

              {step === 'alert' && (
                <View style={[aStyles.escBox, {
                  borderColor: form.escalation_enabled ? colors.amber + '60' : colors.border,
                  backgroundColor: form.escalation_enabled ? colors.amber + '06' : 'transparent',
                }]}>
                  <Text style={[aStyles.sectionLabel, { color: colors.amber, marginBottom: 10 }]}>
                    Missed-Dose Alert
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                        Alert if not taken
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                        Notifies assigner when dose is missed (for seniors & kids)
                      </Text>
                    </View>
                    <Switch
                      value={form.escalation_enabled}
                      onValueChange={v => setForm(f => ({ ...f, escalation_enabled: v }))}
                      trackColor={{ false: colors.border, true: colors.amber + '80' }}
                      thumbColor={form.escalation_enabled ? colors.amber : colors.textTertiary}
                    />
                  </View>
                  {form.escalation_enabled && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={[aStyles.label, { color: colors.textSecondary }]}>Alert after (minutes)</Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {[30, 60, 90, 120].map(m => (
                          <TouchableOpacity key={m} onPress={() => set('escalation_after_min', String(m))}
                            style={[aStyles.chipSmall, {
                              borderColor: form.escalation_after_min === String(m) ? colors.amber : colors.border,
                              backgroundColor: form.escalation_after_min === String(m) ? colors.amber + '20' : 'transparent',
                            }]}>
                            <Text style={{ fontSize: 12, fontWeight: '700',
                              color: form.escalation_after_min === String(m) ? colors.amber : colors.textSecondary }}>
                              {m} min
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* ── Review — compact summary of what's about to be saved,
                  visible on the last step right before Save. ── */}
              {step === 'alert' && (
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                  backgroundColor: colors.surface, padding: 14, gap: 6 }}>
                  <Text style={[aStyles.sectionLabel, { color: colors.textSecondary, marginBottom: 2 }]}>Review</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                    {form.name.trim() || 'Untitled medication'}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {form.dosage ? `${form.dosage} ${form.dosage_unit}` : 'No dosage set'} · {FREQ_LABELS[form.frequency] ?? form.frequency}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    For {members.find(m => m.id === selectedMember)?.name ?? '—'}
                    {form.prescribing_doctor ? ` · Dr. ${form.prescribing_doctor}` : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    Reminds daily at {form.reminder_times.join(' & ')}{form.alert_call ? ' (ringing alert)' : ''}
                    {form.end_date ? ` until ${fmtDateDisplay(new Date(form.end_date + 'T00:00:00'))}` : ', ongoing'}
                  </Text>
                </View>
              )}
              </StepTransition>
            </ScrollView>

            {/* Fixed footer — Back/Next through steps 1-3, Save on the last */}
            <View style={[aStyles.saveRow, { borderColor: colors.border }]}>
              <TouchableOpacity onPress={stepIndex === 0 ? handleClose : goBack}
                style={[aStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>
                  {stepIndex === 0 ? 'Cancel' : 'Back'}
                </Text>
              </TouchableOpacity>
              {stepIndex < STEPS.length - 1 ? (
                <TouchableOpacity onPress={goNext} style={[aStyles.saveBtn, { backgroundColor: catColor }]}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textInverse }}>Next</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleSave}
                  style={[aStyles.saveBtn, { backgroundColor: catColor }]} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color={colors.textInverse} />
                    : <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textInverse }}>Save Medication</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
