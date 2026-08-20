import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, Switch, KeyboardAvoidingView, Platform, Keyboard, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check, Calendar } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { BRAND } from '../shared';
import {
  MedForm, BLANK_MED, MED_SUGGESTIONS, CAT_COLORS, FREQ_LABELS,
  fmtDate, fmtDateDisplay, aStyles,
} from './types';

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
  const [nameFocused, setNameFocused] = useState(false);
  const [globalSuggestions, setGlobalSuggestions] = useState<{ name: string; hint: string; category: string }[]>([]);
  const [touched, setTouched]         = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Load global suggestions once when modal opens
  useEffect(() => {
    if (!visible) return;
    supabase.from('global_med_suggestions')
      .select('name, hint, category')
      .order('use_count', { ascending: false })
      .limit(100)
      .then(({ data }) => { if (data) setGlobalSuggestions(data as any); });
  }, [visible]);

  const set = (k: keyof MedForm, v: string) => setForm(f => ({ ...f, [k]: v }));
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }));

  // Derived validation errors
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
    setTouched({}); setSubmitAttempted(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    setSubmitAttempted(true);
    if (medErrors.name || medErrors.dosage || medErrors.member) return;
    setSaving(true);
    await onSave(selectedMember, { ...form, refill_date: refillDate ? fmtDate(refillDate) : '' });
    setSaving(false);
    reset();
    onClose();
  };

  const catColor = CAT_COLORS[form.category] ?? colors.primary;
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
    { backgroundColor: isDark ? colors.card : '#F5F3FF', borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card }}>

            {/* Drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            {/* Fixed header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Add Medication</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                  {form.category} · {form.frequency.replace('_', ' ')}
                </Text>
              </View>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 8, gap: 18 }}>

              {/* ── Category chips (horizontal scroll) ── */}
              <View>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                    {Object.entries(CAT_COLORS).map(([cat, color]) => {
                      const active = form.category === cat;
                      return (
                        <TouchableOpacity key={cat} onPress={() => { set('category', cat); set('name', ''); }}
                          style={{
                            borderRadius: 16, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 9,
                            backgroundColor: active ? color + '18' : (isDark ? colors.surface : '#F5F4FA'),
                            borderColor: active ? color : (isDark ? colors.border : '#E2E8F0'),
                          }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', textTransform: 'capitalize',
                            color: active ? color : colors.textSecondary }}>{cat}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* ── Medication name + suggestions ── */}
              <View>
                <Text style={[aStyles.label, { color: showErr('name') ? BRAND.rose : colors.textSecondary }]}>
                  Medication Name *
                </Text>
                <TextInput value={form.name} onChangeText={v => set('name', v)}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => { touch('name'); setNameFocused(false); }}
                  placeholder={MED_SUGGESTIONS[form.category]?.[0]?.name ?? 'e.g. Aspirin'}
                  placeholderTextColor={colors.textTertiary}
                  style={[inp, { borderColor: showErr('name') ? BRAND.rose : form.name ? colors.border : catColor + '60' }]} />
                {showErr('name') && (
                  <Text style={aStyles.errText}>{medErrors.name}</Text>
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
                              backgroundColor: form.name === s.name ? catColor + '20' : (isDark ? colors.surface : '#F5F4FA'),
                              borderColor: form.name === s.name ? catColor : (isDark ? colors.border : '#E2E8F0'),
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

              {/* ── Dosage + Unit ── */}
              <View>
                <Text style={[aStyles.sectionLabel, { color: catColor }]}>Dosage & Schedule</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[aStyles.label, { color: showErr('dosage') ? BRAND.rose : colors.textSecondary }]}>
                      Dosage *
                    </Text>
                    <TextInput value={form.dosage} onChangeText={v => set('dosage', v)}
                      onBlur={() => touch('dosage')}
                      placeholder="10" keyboardType="decimal-pad"
                      placeholderTextColor={colors.textTertiary}
                      style={[inp, { borderColor: showErr('dosage') ? BRAND.rose : colors.border }]} />
                    {showErr('dosage') && (
                      <Text style={aStyles.errText}>{medErrors.dosage}</Text>
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
                            <Text style={{ fontSize: 11, fontWeight: '700',
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
                    <TouchableOpacity key={k} onPress={() => set('frequency', k)}
                      style={[aStyles.chipSmall, {
                        borderColor: form.frequency === k ? catColor : colors.border,
                        backgroundColor: form.frequency === k ? catColor + '15' : 'transparent',
                      }]}>
                      <Text style={{ fontSize: 12, fontWeight: '700',
                        color: form.frequency === k ? catColor : colors.textSecondary }}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

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
                        backgroundColor: showRefillPicker ? catColor + '20' : (isDark ? colors.card : '#F5F3FF'),
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

              {/* ── Member picker (avatar row) ── */}
              <View>
                <Text style={[aStyles.sectionLabel, { color: showErr('member') ? BRAND.rose : catColor }]}>
                  Assigned To {showErr('member') ? '— ' + medErrors.member : ''}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: 'row', gap: 14, paddingBottom: 4 }}>
                  {members.map(m => {
                    const sel = selectedMember === m.id;
                    const mc = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? BRAND.blue : BRAND.emerald;
                    return (
                      <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 5 }}
                        onPress={() => setSelectedMember(m.id)}>
                        <View style={{
                          width: 52, height: 52, borderRadius: 26,
                          backgroundColor: sel ? mc + '20' : (isDark ? colors.surface : '#F1F5F9'),
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

              {/* ── Escalation alert ── */}
              <View style={[aStyles.escBox, {
                borderColor: form.escalation_enabled ? BRAND.amber + '60' : colors.border,
                backgroundColor: form.escalation_enabled ? BRAND.amber + '06' : 'transparent',
              }]}>
                <Text style={[aStyles.sectionLabel, { color: BRAND.amber, marginBottom: 10 }]}>
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
                    trackColor={{ false: colors.border, true: BRAND.amber + '80' }}
                    thumbColor={form.escalation_enabled ? BRAND.amber : colors.textTertiary}
                  />
                </View>
                {form.escalation_enabled && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[aStyles.label, { color: colors.textSecondary }]}>Alert after (minutes)</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {[30, 60, 90, 120].map(m => (
                        <TouchableOpacity key={m} onPress={() => set('escalation_after_min', String(m))}
                          style={[aStyles.chipSmall, {
                            borderColor: form.escalation_after_min === String(m) ? BRAND.amber : colors.border,
                            backgroundColor: form.escalation_after_min === String(m) ? BRAND.amber + '20' : 'transparent',
                          }]}>
                          <Text style={{ fontSize: 12, fontWeight: '700',
                            color: form.escalation_after_min === String(m) ? BRAND.amber : colors.textSecondary }}>
                            {m} min
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Fixed footer */}
            <View style={[aStyles.saveRow, { borderColor: colors.border }]}>
              <TouchableOpacity onPress={handleClose} style={[aStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave}
                style={[aStyles.saveBtn, { backgroundColor: catColor }]} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color={colors.textInverse} />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textInverse }}>Save Medication</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
