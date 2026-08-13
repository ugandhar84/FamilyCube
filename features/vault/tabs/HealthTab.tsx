import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Switch, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Pill, Syringe, Trash2, Check, Clock, ChevronDown, ChevronUp,
  User, Calendar, AlertCircle, X, RefreshCw, Stethoscope, Send,
  MessageSquare, SlidersHorizontal, Share2, FileText, Download,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import { SCard, CardHeader, StatusPill, MemberAvatar, AddBtn, EmptyState, BRAND } from './shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Medication {
  id: string;
  member_id: string;
  assigned_by: string | null;
  modified_by: string | null;
  name: string;
  dosage: string;
  dosage_unit: string;
  frequency: string;
  frequency_times: string[];
  category: string;
  prescribing_doctor: string | null;
  pharmacy: string | null;
  refill_date: string | null;
  pills_remaining: number | null;
  is_ongoing: boolean;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  taken_date: string | null;
  escalation_enabled: boolean;
  escalation_after_min: number;
  escalation_to: string[];
  notes: string | null;
  updated_at: string | null;
}

interface Vaccine {
  id: string;
  member_id: string;
  added_by: string | null;
  title: string;
  vaccine_type: string | null;
  date: string;
  next_due_date: string | null;
  done: boolean;
  series_current: number;
  series_total: number;
  administered_by: string | null;
  location: string | null;
  notes: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily', twice_daily: '2× Daily', weekly: 'Weekly', as_needed: 'As Needed',
};
const CAT_COLORS: Record<string, string> = {
  prescription: BRAND.purple, otc: BRAND.teal, vitamin: BRAND.emerald,
  supplement: BRAND.amber, other: BRAND.blue,
};

const today = () => new Date().toISOString().slice(0, 10);

// ─── Add-Medication Modal ──────────────────────────────────────────────────────

interface MedForm {
  name: string; dosage: string; dosage_unit: string;
  frequency: string; category: string; prescribing_doctor: string;
  pharmacy: string; refill_date: string; pills_remaining: string;
  instructions: string; notes: string;
  escalation_enabled: boolean; escalation_after_min: string;
}
const BLANK_MED: MedForm = {
  name: '', dosage: '', dosage_unit: 'tablet', frequency: 'daily',
  category: 'prescription', prescribing_doctor: '', pharmacy: '',
  refill_date: '', pills_remaining: '', instructions: '', notes: '',
  escalation_enabled: false, escalation_after_min: '60',
};

// Quick pick suggestions by medication category
const MED_SUGGESTIONS: Record<string, { name: string; hint: string }[]> = {
  prescription: [
    { name: 'Lisinopril',    hint: 'Blood pressure' },
    { name: 'Metformin',     hint: 'Diabetes' },
    { name: 'Atorvastatin',  hint: 'Cholesterol' },
    { name: 'Levothyroxine', hint: 'Thyroid' },
    { name: 'Amlodipine',    hint: 'Blood pressure' },
    { name: 'Metoprolol',    hint: 'Heart rate' },
  ],
  otc: [
    { name: 'Tylenol',    hint: 'Pain / fever' },
    { name: 'Ibuprofen',  hint: 'Anti-inflammatory' },
    { name: 'Benadryl',   hint: 'Allergy' },
    { name: 'Claritin',   hint: 'Allergy' },
    { name: 'Robitussin', hint: 'Cough' },
    { name: 'Pepto-Bismol', hint: 'Stomach' },
  ],
  vitamin: [
    { name: 'Vitamin D3',  hint: '1000–5000 IU' },
    { name: 'Vitamin C',   hint: 'Immune support' },
    { name: 'Vitamin B12', hint: 'Energy' },
    { name: 'Folate',      hint: 'Prenatal / nerve' },
    { name: 'Iron',        hint: 'Blood health' },
  ],
  supplement: [
    { name: 'Fish Oil',   hint: 'Omega-3' },
    { name: 'Magnesium',  hint: 'Sleep / muscle' },
    { name: 'Probiotics', hint: 'Gut health' },
    { name: 'Zinc',       hint: 'Immune support' },
    { name: 'Melatonin',  hint: 'Sleep' },
  ],
  other: [],
};

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDateDisplay(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AddMedModal({ visible, onClose, onSave, members, colors, isDark }: {
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

  const catColor = CAT_COLORS[form.category] ?? BRAND.purple;
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
        <View style={aStyles.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
          <View style={[aStyles.sheet, { backgroundColor: colors.card }]}>
            <View style={[aStyles.handle, { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }]} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Add Medication</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: catColor, textTransform: 'capitalize' }}>
                  {form.category} · {form.frequency.replace('_', ' ')}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={aStyles.closeBtn}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48, gap: 18 }}>

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
                              <Check size={9} color="#fff" />
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

            {/* Footer */}
            <View style={[aStyles.saveRow, { borderColor: colors.border }]}>
              <TouchableOpacity onPress={handleClose} style={[aStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave}
                style={[aStyles.saveBtn, { backgroundColor: catColor }]} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save Medication</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add-Vaccine Modal ─────────────────────────────────────────────────────────

const VAX_TYPES = ['flu', 'covid', 'tdap', 'mmr', 'varicella', 'hpv', 'hepatitis-a', 'hepatitis-b', 'pneumonia', 'meningitis', 'shingles', 'polio'];
const VAX_SUGGESTIONS: { name: string; hint: string }[] = [
  { name: 'Flu Shot',         hint: 'Annual' },
  { name: 'COVID-19 Booster', hint: 'mRNA / bivalent' },
  { name: 'Tdap',             hint: 'Tetanus / pertussis' },
  { name: 'MMR',              hint: 'Measles / mumps / rubella' },
  { name: 'Varicella',        hint: 'Chicken pox' },
  { name: 'HPV',              hint: 'Gardasil 9' },
  { name: 'Hepatitis A',      hint: 'Travel / routine' },
  { name: 'Hepatitis B',      hint: 'HBV series' },
  { name: 'Pneumonia',        hint: 'Prevnar / Pneumovax' },
  { name: 'Meningitis',       hint: 'MenACWY' },
  { name: 'Shingles',         hint: 'Shingrix (50+)' },
];

interface VaxForm {
  title: string; vaccine_type: string; date: string;
  next_due_date: string; series_current: string; series_total: string;
  administered_by: string; location: string; notes: string;
}
const BLANK_VAX: VaxForm = {
  title: '', vaccine_type: '', date: today(),
  next_due_date: '', series_current: '1', series_total: '1',
  administered_by: '', location: '', notes: '',
};

function AddVaxModal({ visible, onClose, onSave, members, colors, isDark }: {
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
    setVaxTouched({}); setVaxSubmitAttempted(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    setVaxSubmitAttempted(true);
    if (vaxErrors.title || vaxErrors.member) return;
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
    { backgroundColor: isDark ? colors.card : '#F0FDFA', borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={aStyles.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
          <View style={[aStyles.sheet, { backgroundColor: colors.card }]}>
            <View style={[aStyles.handle, { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }]} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Log Vaccine</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: BRAND.teal }}>
                  Immunization record · {form.vaccine_type || 'all types'}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={aStyles.closeBtn}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48, gap: 18 }}>

              {/* ── Vaccine name + suggestions ── */}
              <View>
                <Text style={[aStyles.label, { color: showVaxErr('title') ? BRAND.rose : colors.textSecondary }]}>
                  Vaccine Name *
                </Text>
                <TextInput value={form.title} onChangeText={v => set('title', v)}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => { touchVax('title'); setNameFocused(false); }}
                  placeholder="e.g. Flu Shot 2025" placeholderTextColor={colors.textTertiary}
                  style={[inp, { borderColor: showVaxErr('title') ? BRAND.rose : form.title ? colors.border : BRAND.teal + '60' }]} />
                {showVaxErr('title') && (
                  <Text style={aStyles.errText}>{vaxErrors.title}</Text>
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
                              backgroundColor: form.title === s.name ? BRAND.teal + '20' : (isDark ? colors.surface : '#F0FDFA'),
                              borderColor: form.title === s.name ? BRAND.teal : (isDark ? colors.border : '#99F6E4'),
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
                            backgroundColor: sel ? BRAND.teal + '18' : 'transparent',
                            borderColor: sel ? BRAND.teal : colors.border,
                          }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
                            color: sel ? BRAND.teal : colors.textSecondary }}>{t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* ── Dates ── */}
              <View>
                <Text style={[aStyles.sectionLabel, { color: BRAND.teal }]}>Administration Dates</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[aStyles.label, { color: colors.textSecondary }]}>Date Administered *</Text>
                    <TouchableOpacity onPress={() => { setShowAdminPick(p => !p); setShowNextPick(false); }}
                      style={[aStyles.dateBtn, {
                        backgroundColor: showAdminPick ? BRAND.teal + '20' : (isDark ? colors.card : '#F0FDFA'),
                        borderColor: showAdminPick ? BRAND.teal : colors.border,
                      }]}>
                      <Calendar size={14} color={showAdminPick ? BRAND.teal : colors.textTertiary} />
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: showAdminPick ? BRAND.teal : colors.textPrimary }}>
                        {fmtDateDisplay(adminDate)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[aStyles.label, { color: colors.textSecondary }]}>Next Due (optional)</Text>
                    <TouchableOpacity onPress={() => { setShowNextPick(p => !p); setShowAdminPick(false); }}
                      style={[aStyles.dateBtn, {
                        backgroundColor: showNextPick ? BRAND.amber + '20' : (isDark ? colors.card : '#FFFBEB'),
                        borderColor: showNextPick ? BRAND.amber : (nextDate ? BRAND.amber + '80' : colors.border),
                      }]}>
                      <Calendar size={14} color={nextDate ? BRAND.amber : colors.textTertiary} />
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: nextDate ? (showNextPick ? BRAND.amber : colors.textPrimary) : colors.textTertiary }}>
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
                            <Text style={{ color: BRAND.teal, fontWeight: '900', fontSize: 15 }}>Done</Text>
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
                <Text style={[aStyles.sectionLabel, { color: BRAND.teal }]}>Dose Series</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[aStyles.label, { color: colors.textSecondary }]}>Current Dose #</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {['1', '2', '3', '4'].map(n => (
                        <TouchableOpacity key={n} onPress={() => set('series_current', n)}
                          style={[aStyles.chipSmall, {
                            flex: 1, alignItems: 'center',
                            borderColor: form.series_current === n ? BRAND.teal : colors.border,
                            backgroundColor: form.series_current === n ? BRAND.teal + '15' : 'transparent',
                          }]}>
                          <Text style={{ fontSize: 13, fontWeight: '800',
                            color: form.series_current === n ? BRAND.teal : colors.textSecondary }}>{n}</Text>
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
                            borderColor: form.series_total === n ? BRAND.blue : colors.border,
                            backgroundColor: form.series_total === n ? BRAND.blue + '15' : 'transparent',
                          }]}>
                          <Text style={{ fontSize: 13, fontWeight: '800',
                            color: form.series_total === n ? BRAND.blue : colors.textSecondary }}>{n}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              {/* ── Administered by / location ── */}
              <View>
                <Text style={[aStyles.sectionLabel, { color: BRAND.teal }]}>Provider & Location</Text>
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

              {/* ── Member avatar picker ── */}
              <View>
                <Text style={[aStyles.sectionLabel, { color: showVaxErr('member') ? BRAND.rose : BRAND.teal }]}>
                  For Member {showVaxErr('member') ? '— ' + vaxErrors.member : ''}
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
                              <Check size={9} color="#fff" />
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

              {/* Notes */}
              <View>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Notes / Lot Number</Text>
                <TextInput value={form.notes} onChangeText={v => set('notes', v)}
                  placeholder="Reactions, lot number, clinic notes…"
                  placeholderTextColor={colors.textTertiary}
                  style={[inp, { height: 68, textAlignVertical: 'top' }]} multiline />
              </View>
            </ScrollView>

            <View style={[aStyles.saveRow, { borderColor: colors.border }]}>
              <TouchableOpacity onPress={handleClose} style={[aStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave}
                style={[aStyles.saveBtn, { backgroundColor: BRAND.teal }]} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save Vaccine</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main HealthTab ────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  'Missed dose guidance for common meds',
  'When to visit ER vs urgent care?',
  'Flu vs cold — what to watch for?',
  'Safe OTC meds for kids under 12',
];

export default function HealthTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  const [meds, setMeds]     = useState<Medication[]>([]);
  const [vaxes, setVaxes]   = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMedModal, setShowMedModal] = useState(false);
  const [showVaxModal, setShowVaxModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [healthTab, setHealthTab] = useState<'meds' | 'vax'>('meds');
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // ── Medication filters (default: active = ongoing, all members) ──────────────
  const [medSearch, setMedSearch]         = useState('');
  const [medMemberFilter, setMedMemberFilter] = useState<string[]>([]);      // [] = all
  const [medCatFilter, setMedCatFilter]   = useState<string[]>([]);           // [] = all
  const [medStatusFilter, setMedStatusFilter] = useState<'active' | 'taken' | 'pending' | 'overdue' | 'all'>('active');
  const [medOngoingOnly, setMedOngoingOnly] = useState(true);
  const [medFreqFilter, setMedFreqFilter] = useState<string[]>([]);
  const [medRefillSoon, setMedRefillSoon] = useState(false);
  const [medEscalationOnly, setMedEscalationOnly] = useState(false);

  // ── Vaccine filters (default: all, all members) ───────────────────────────────
  const [vaxSearch, setVaxSearch]         = useState('');
  const [vaxMemberFilter, setVaxMemberFilter] = useState<string[]>([]);       // [] = all
  const [vaxStatusFilter, setVaxStatusFilter] = useState<'all' | 'done' | 'pending' | 'due_soon'>('pending');
  const [vaxDueSoonDays, setVaxDueSoonDays] = useState(30);

  // Draft filters shown inside bottom sheet before Apply
  type MedFilters = {
    search: string; members: string[]; categories: string[];
    status: typeof medStatusFilter; ongoing: boolean;
    frequencies: string[]; refillSoon: boolean; escalationOnly: boolean;
  };
  type VaxFilters = {
    search: string; members: string[];
    status: typeof vaxStatusFilter; dueSoonDays: number;
  };
  const [draftMed, setDraftMed] = useState<MedFilters>({
    search: '', members: [], categories: [], status: 'active',
    ongoing: true, frequencies: [], refillSoon: false, escalationOnly: false,
  });
  const [draftVax, setDraftVax] = useState<VaxFilters>({
    search: '', members: [], status: 'pending', dueSoonDays: 30,
  });

  // AI state
  const [aiQuery, setAiQuery]   = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiShared, setAiShared]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [medsRes, vaxRes] = await Promise.all([
      supabase.from('family_medications').select('*').eq('family_id', familyId).order('created_at', { ascending: false }),
      supabase.from('family_vaccines').select('*').eq('family_id', familyId).order('date', { ascending: false }),
    ]);
    if (medsRes.data) setMeds(medsRes.data as Medication[]);
    if (vaxRes.data)  setVaxes(vaxRes.data as Vaccine[]);
    setLoading(false);
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  // Mark medication taken today — records who marked it
  const markTaken = async (med: Medication) => {
    const todayStr = today();
    const alreadyTaken = med.taken_date === todayStr;
    const newDate = alreadyTaken ? null : todayStr;
    const { error } = await supabase.from('family_medications')
      .update({
        taken_date: newDate,
        modified_by: activeMember?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', med.id);
    if (!error) {
      setMeds(prev => prev.map(m => m.id === med.id
        ? { ...m, taken_date: newDate, modified_by: activeMember?.id ?? null }
        : m));
    }
  };

  // Toggle vaccine done
  const toggleVax = async (vax: Vaccine) => {
    const { error } = await supabase.from('family_vaccines')
      .update({
        done: !vax.done,
        modified_by: activeMember?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vax.id);
    if (!error) {
      setVaxes(prev => prev.map(v => v.id === vax.id ? { ...v, done: !v.done } : v));
    }
  };

  // Delete med — requires a comment/reason
  const deleteMed = (id: string) => {
    Alert.prompt(
      'Reason for removing',
      'Enter a brief note (required)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async (comment: string | undefined) => {
            if (!comment?.trim()) {
              Alert.alert('Comment required', 'Please enter a reason before removing.');
              return;
            }
            await supabase.from('family_medications')
              .update({ deleted_by: activeMember?.id ?? null, notes: comment.trim(), updated_at: new Date().toISOString() })
              .eq('id', id);
            await supabase.from('family_medications').delete().eq('id', id);
            setMeds(prev => prev.filter(m => m.id !== id));
          },
        },
      ],
      'plain-text'
    );
  };

  const deleteVax = async (id: string) => {
    await supabase.from('family_vaccines').delete().eq('id', id);
    setVaxes(prev => prev.filter(v => v.id !== id));
  };

  const toggleMedActive = (med: Medication) => {
    const newActive = !med.is_active;
    const action = newActive ? 'reactivate' : 'deactivate';
    Alert.prompt(
      `${newActive ? 'Reactivate' : 'Deactivate'} medication`,
      `Why are you ${action === 'deactivate' ? 'stopping' : 'restarting'} ${med.name}? (required)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newActive ? 'Reactivate' : 'Deactivate',
          style: newActive ? 'default' : 'destructive',
          onPress: async (comment: string | undefined) => {
            if (!comment?.trim()) {
              Alert.alert('Comment required', 'Please enter a reason.');
              return;
            }
            const { error } = await supabase.from('family_medications')
              .update({
                is_active: newActive,
                modified_by: activeMember?.id ?? null,
                notes: comment.trim(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', med.id);
            if (!error) setMeds(prev => prev.map(m =>
              m.id === med.id ? { ...m, is_active: newActive, modified_by: activeMember?.id ?? null } : m));
          },
        },
      ],
      'plain-text'
    );
  };

  const addMed = async (memberId: string, form: MedForm) => {
    const { data } = await supabase.from('family_medications').insert({
      family_id: familyId,
      member_id: memberId,
      assigned_by: activeMember?.id ?? null,
      name: form.name.trim(),
      dosage: form.dosage.trim(),
      dosage_unit: form.dosage_unit,
      frequency: form.frequency,
      frequency_times: ['08:00'],
      category: form.category,
      prescribing_doctor: form.prescribing_doctor || null,
      pharmacy: form.pharmacy || null,
      refill_date: form.refill_date || null,
      pills_remaining: form.pills_remaining ? parseInt(form.pills_remaining) : null,
      instructions: form.instructions || null,
      is_ongoing: true,
      is_active: true,
      escalation_enabled: form.escalation_enabled,
      escalation_after_min: parseInt(form.escalation_after_min) || 60,
    }).select().single();
    if (data) {
      setMeds(prev => [data as Medication, ...prev]);
      // Persist to global suggestions so other families see it; increment use_count on conflict
      supabase.rpc('upsert_med_suggestion', {
        p_name: form.name.trim(),
        p_category: form.category,
        p_hint: form.category,
      }).then(() => {});
    }
  };

  const addVax = async (memberId: string, form: VaxForm) => {
    const { data } = await supabase.from('family_vaccines').insert({
      family_id: familyId,
      member_id: memberId,
      title: form.title.trim(),
      vaccine_type: form.vaccine_type || null,
      date: form.date,
      next_due_date: form.next_due_date || null,
      series_current: parseInt(form.series_current) || 1,
      series_total: parseInt(form.series_total) || 1,
      administered_by: form.administered_by || null,
      location: form.location || null,
      notes: form.notes || null,
      done: false,
    }).select().single();
    if (data) setVaxes(prev => [data as Vaccine, ...prev]);
  };

  // Returns true if today's dose is overdue (past scheduled time + grace, not taken)
  const isOverdue = (med: Medication) => {
    if (med.taken_date === today()) return false;
    if (!med.frequency_times?.length) return false;
    const now = new Date();
    const firstTime = med.frequency_times[0]; // "HH:MM"
    const [hh, mm] = firstTime.split(':').map(Number);
    const scheduled = new Date();
    scheduled.setHours(hh, mm, 0, 0);
    const graceMins = med.escalation_enabled ? med.escalation_after_min : 60;
    scheduled.setMinutes(scheduled.getMinutes() + graceMins);
    return now > scheduled;
  };

  const askAI = async (q?: string) => {
    const text = (q ?? aiQuery).trim();
    if (!text) return;
    setAiLoading(true);
    setAiResult('');
    setAiShared(false);
    setAiQuery('');
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          tool: 'health_question',
          question: text,
          family: members.map(m => ({ name: m.name, role: m.role })),
        },
      });
      if (error || !data?.answer) {
        // Fallback response
        setAiResult(
          `Health guidance for: "${text}"\n\n` +
          `• This is general information only — not medical advice.\n` +
          `• For children and seniors, consult your family doctor for personalized guidance.\n` +
          `• In an emergency, call 911 or go to the nearest ER.\n\n` +
          `Consider logging this question and the doctor's answer in your health notes.`
        );
      } else {
        setAiResult(data.answer);
      }
    } catch {
      setAiResult('Unable to reach Health AI right now. Please try again shortly.');
    }
    setAiLoading(false);
  };

  const shareAiToChat = () => {
    if (!aiResult) return;
    const msg = `🩺 *Health AI Response*\n\n${aiResult}\n\n⚠️ For informational use only — consult a healthcare provider for medical decisions.`;
    useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
    setAiShared(true);
  };

  const openFilterSheet = () => {
    // Seed draft from current applied filters
    setDraftMed({ search: medSearch, members: medMemberFilter, categories: medCatFilter,
      status: medStatusFilter, ongoing: medOngoingOnly, frequencies: medFreqFilter,
      refillSoon: medRefillSoon, escalationOnly: medEscalationOnly });
    setDraftVax({ search: vaxSearch, members: vaxMemberFilter,
      status: vaxStatusFilter, dueSoonDays: vaxDueSoonDays });
    setShowFilterSheet(true);
  };

  const applyFilters = () => {
    setMedSearch(draftMed.search);
    setMedMemberFilter(draftMed.members);
    setMedCatFilter(draftMed.categories);
    setMedStatusFilter(draftMed.status);
    setMedOngoingOnly(draftMed.ongoing);
    setMedFreqFilter(draftMed.frequencies);
    setMedRefillSoon(draftMed.refillSoon);
    setMedEscalationOnly(draftMed.escalationOnly);
    setVaxSearch(draftVax.search);
    setVaxMemberFilter(draftVax.members);
    setVaxStatusFilter(draftVax.status);
    setVaxDueSoonDays(draftVax.dueSoonDays);
    setShowFilterSheet(false);
  };

  const resetFilters = () => {
    if (healthTab === 'meds') {
      setDraftMed({ search: '', members: [], categories: [], status: 'active',
        ongoing: true, frequencies: [], refillSoon: false, escalationOnly: false });
    } else {
      setDraftVax({ search: '', members: [], status: 'all', dueSoonDays: 30 });
    }
  };

  const memberName  = (id: string) => members.find(m => m.id === id)?.name ?? id;
  const memberColor = (id: string) => {
    const m = members.find(mb => mb.id === id);
    return m?.role === 'parent' ? BRAND.purple : m?.role === 'senior' ? BRAND.blue : BRAND.emerald;
  };

  // ── Active filter count for badge ────────────────────────────────────────────
  const medActiveFilterCount = useMemo(() => {
    let n = 0;
    if (medStatusFilter !== 'active') n++;
    if (medMemberFilter.length) n++;
    if (medCatFilter.length) n++;
    if (medFreqFilter.length) n++;
    if (!medOngoingOnly) n++;
    if (medRefillSoon) n++;
    if (medEscalationOnly) n++;
    if (medSearch) n++;
    return n;
  }, [medStatusFilter, medMemberFilter, medCatFilter, medFreqFilter,
      medOngoingOnly, medRefillSoon, medEscalationOnly, medSearch]);

  const vaxActiveFilterCount = useMemo(() => {
    let n = 0;
    if (vaxStatusFilter !== 'all') n++;
    if (vaxMemberFilter.length) n++;
    if (vaxSearch) n++;
    return n;
  }, [vaxStatusFilter, vaxMemberFilter, vaxSearch]);

  // Filtered meds
  const filteredMeds = useMemo(() => {
    const todayStr = today();
    const now = new Date();
    return meds.filter(med => {
      if (medMemberFilter.length && !medMemberFilter.includes(med.member_id)) return false;
      if (medCatFilter.length && !medCatFilter.includes(med.category)) return false;
      if (medFreqFilter.length && !medFreqFilter.includes(med.frequency)) return false;
      if (medOngoingOnly && !med.is_ongoing) return false;
      if (medEscalationOnly && !med.escalation_enabled) return false;
      if (medRefillSoon) {
        if (!med.refill_date) return false;
        const diff = new Date(med.refill_date).getTime() - now.getTime();
        if (diff < 0 || diff > 7 * 24 * 3600_000) return false;
      }
      if (medSearch && !med.name.toLowerCase().includes(medSearch.toLowerCase())) return false;
      if (medStatusFilter === 'active')  return med.is_ongoing;
      if (medStatusFilter === 'taken')   return med.taken_date === todayStr;
      if (medStatusFilter === 'pending') return med.taken_date !== todayStr && !isOverdue(med);
      if (medStatusFilter === 'overdue') return isOverdue(med);
      return true;
    });
  }, [meds, medMemberFilter, medCatFilter, medFreqFilter, medOngoingOnly,
      medEscalationOnly, medRefillSoon, medSearch, medStatusFilter]);

  // Filtered vaxes
  const filteredVaxes = useMemo(() => {
    const now = new Date();
    return vaxes.filter(vax => {
      if (vaxMemberFilter.length && !vaxMemberFilter.includes(vax.member_id)) return false;
      if (vaxSearch && !vax.title.toLowerCase().includes(vaxSearch.toLowerCase())) return false;
      if (vaxStatusFilter === 'done')    return vax.done;
      if (vaxStatusFilter === 'pending') return !vax.done;
      if (vaxStatusFilter === 'due_soon') {
        if (!vax.next_due_date) return false;
        const due = new Date(vax.next_due_date);
        return !vax.done && (due.getTime() - now.getTime()) < vaxDueSoonDays * 24 * 3600_000;
      }
      return true;
    });
  }, [vaxes, vaxMemberFilter, vaxSearch, vaxStatusFilter, vaxDueSoonDays]);

  if (loading) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={Pill} iconColor={BRAND.purple} title="Health Tracker" colors={colors} />
      <ActivityIndicator color={BRAND.purple} style={{ marginVertical: 24 }} />
    </SCard>
  );

  return (
    <>
      {/* ── AI Health Assistant ──────────────────────── */}
      <SCard colors={colors} isDark={isDark}>
        <CardHeader Icon={Stethoscope} iconColor={BRAND.teal} title="AI Health Assistant"
          badge="Informational" badgeColor={BRAND.amber} colors={colors} />

        <View style={[h.disclaimer, { backgroundColor: BRAND.amber + '12', borderColor: BRAND.amber + '40' }]}>
          <AlertCircle size={12} color={BRAND.amber} />
          <Text style={{ fontSize: 11, color: BRAND.amber, fontWeight: '700', flex: 1 }}>
            General info only — not a substitute for professional medical advice.
          </Text>
        </View>

        {/* Quick prompts */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {QUICK_PROMPTS.map(p => (
              <TouchableOpacity key={p} onPress={() => askAI(p)}
                style={[h.qChip, { borderColor: BRAND.teal + '50', backgroundColor: BRAND.teal + '08' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.teal }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Input */}
        <View style={[h.aiInputRow, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F0FDFA' }]}>
          <TextInput
            value={aiQuery}
            onChangeText={setAiQuery}
            placeholder="Ask a health question…"
            placeholderTextColor={colors.textTertiary}
            style={[h.aiInput, { color: colors.textPrimary }]}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => askAI()}
          />
          <TouchableOpacity onPress={() => askAI()} disabled={aiLoading || !aiQuery.trim()}
            style={[h.aiSendBtn, { backgroundColor: BRAND.teal, opacity: aiQuery.trim() ? 1 : 0.4 }]}>
            {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* Inline result card */}
        {(aiLoading || aiResult) ? (
          <View style={[h.aiResult, {
            backgroundColor: isDark ? '#0F4C4C' : '#F0FDFA',
            borderColor: BRAND.teal + '50',
          }]}>
            {aiLoading
              ? <View style={{ alignItems: 'center', padding: 12 }}>
                  <ActivityIndicator color={BRAND.teal} />
                  <Text style={{ fontSize: 12, color: BRAND.teal, marginTop: 8, fontWeight: '700' }}>
                    Consulting Health AI…
                  </Text>
                </View>
              : <>
                  {/* Close button */}
                  <TouchableOpacity
                    onPress={() => { setAiResult(''); setAiShared(false); setAiQuery(''); }}
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 1,
                      width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }}>
                    <X size={13} color={colors.textSecondary} />
                  </TouchableOpacity>

                  <Text style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 21, paddingRight: 24 }}>
                    {aiResult}
                  </Text>
                  <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                    {aiShared
                      ? <View style={[h.sharedBtn, { backgroundColor: BRAND.emerald }]}>
                          <Check size={13} color="#fff" />
                          <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>Posted to Family Chat</Text>
                        </View>
                      : <TouchableOpacity onPress={shareAiToChat}
                          style={[h.sharedBtn, { backgroundColor: BRAND.purple }]}>
                          <MessageSquare size={13} color="#fff" />
                          <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>Share with Family</Text>
                        </TouchableOpacity>}
                  </View>
                </>}
          </View>
        ) : null}
      </SCard>

      {/* ── Medications + Immunizations (unified) ───── */}
      <SCard colors={colors} isDark={isDark}>
        {/* ── Card header row ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CardHeader
            Icon={healthTab === 'meds' ? Pill : Syringe}
            iconColor={healthTab === 'meds' ? BRAND.purple : BRAND.teal}
            title="Health Records"
            colors={colors}
          />
          <TouchableOpacity onPress={load} style={{ padding: 4 }}>
            <RefreshCw size={13} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ── Inner tab switcher ── */}
        <View style={[hf.innerTabRow, { backgroundColor: isDark ? colors.card : '#F5F3FF', borderColor: colors.border }]}>
          {([
            { id: 'meds', label: 'Medications',   Icon: Pill,    color: BRAND.purple, count: meds.length },
            { id: 'vax',  label: 'Immunizations', Icon: Syringe, color: BRAND.teal,   count: vaxes.length },
          ] as const).map(t => (
            <TouchableOpacity key={t.id} onPress={() => setHealthTab(t.id)}
              style={[hf.innerTab, { backgroundColor: healthTab === t.id ? t.color : 'transparent', borderRadius: 10 }]}>
              <t.Icon size={13} color={healthTab === t.id ? '#fff' : colors.textSecondary} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: healthTab === t.id ? '#fff' : colors.textSecondary }}>
                {t.label}
              </Text>
              <View style={[hf.tabBadge, { backgroundColor: healthTab === t.id ? 'rgba(255,255,255,0.3)' : colors.border }]}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: healthTab === t.id ? '#fff' : colors.textTertiary }}>
                  {t.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Search bar + filter icon ── */}
        {(() => {
          const activeCount = healthTab === 'meds' ? medActiveFilterCount : vaxActiveFilterCount;
          const accentColor = healthTab === 'meds' ? BRAND.purple : BRAND.teal;
          const placeholder = healthTab === 'meds' ? 'Search medications…' : 'Search vaccines…';
          const currentSearch = healthTab === 'meds' ? medSearch : vaxSearch;
          const setSearch = healthTab === 'meds'
            ? (v: string) => setMedSearch(v)
            : (v: string) => setVaxSearch(v);
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <View style={[hf.searchRow, { flex: 1, borderColor: colors.border,
                backgroundColor: isDark ? colors.card : (healthTab === 'meds' ? '#F5F3FF' : '#F0FDFA') }]}>
                <TextInput
                  value={currentSearch} onChangeText={setSearch}
                  placeholder={placeholder} placeholderTextColor={colors.textTertiary}
                  style={[hf.searchInput, { color: colors.textPrimary }]}
                />
                {currentSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <X size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Filter icon button with active-count badge */}
              <TouchableOpacity onPress={openFilterSheet}
                style={[hf.filterIconBtn, {
                  borderColor: activeCount ? accentColor : colors.border,
                  backgroundColor: activeCount ? accentColor + '15' : 'transparent',
                }]}>
                <SlidersHorizontal size={17} color={activeCount ? accentColor : colors.textSecondary} />
                {activeCount > 0 && (
                  <View style={[hf.filterBadge, { backgroundColor: accentColor }]}>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff' }}>{activeCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── Active-filter pill summary (compact, dismissable) ── */}
        {healthTab === 'meds' && medActiveFilterCount > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {medStatusFilter !== 'active' && (
                <View style={[hf.activePill, { borderColor: BRAND.purple + '60', backgroundColor: BRAND.purple + '12' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.purple, textTransform: 'capitalize' }}>{medStatusFilter}</Text>
                </View>
              )}
              {medMemberFilter.map(id => (
                <View key={id} style={[hf.activePill, { borderColor: BRAND.blue + '60', backgroundColor: BRAND.blue + '12' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.blue }}>{memberName(id)}</Text>
                </View>
              ))}
              {medCatFilter.map(cat => (
                <View key={cat} style={[hf.activePill, { borderColor: (CAT_COLORS[cat] ?? BRAND.purple) + '60', backgroundColor: (CAT_COLORS[cat] ?? BRAND.purple) + '12' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: CAT_COLORS[cat] ?? BRAND.purple, textTransform: 'capitalize' }}>{cat}</Text>
                </View>
              ))}
              {medRefillSoon && (
                <View style={[hf.activePill, { borderColor: BRAND.amber + '60', backgroundColor: BRAND.amber + '12' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber }}>Refill Soon</Text>
                </View>
              )}
              {medEscalationOnly && (
                <View style={[hf.activePill, { borderColor: BRAND.rose + '60', backgroundColor: BRAND.rose + '12' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.rose }}>Escalation</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => {
                setMedSearch(''); setMedMemberFilter([]); setMedCatFilter([]);
                setMedStatusFilter('active'); setMedOngoingOnly(true);
                setMedFreqFilter([]); setMedRefillSoon(false); setMedEscalationOnly(false);
              }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.rose }}>Clear all</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {healthTab === 'vax' && vaxActiveFilterCount > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {vaxStatusFilter !== 'all' && (
                <View style={[hf.activePill, { borderColor: BRAND.teal + '60', backgroundColor: BRAND.teal + '12' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.teal, textTransform: 'capitalize' }}>
                    {vaxStatusFilter === 'due_soon' ? `Due ≤${vaxDueSoonDays}d` : vaxStatusFilter}
                  </Text>
                </View>
              )}
              {vaxMemberFilter.map(id => (
                <View key={id} style={[hf.activePill, { borderColor: BRAND.blue + '60', backgroundColor: BRAND.blue + '12' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.blue }}>{memberName(id)}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => {
                setVaxSearch(''); setVaxMemberFilter([]); setVaxStatusFilter('pending'); setVaxDueSoonDays(30);
              }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.rose }}>Clear all</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── Result count line ── */}
        <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '700', marginTop: 10 }}>
          {healthTab === 'meds'
            ? `${filteredMeds.length} of ${meds.length} medications`
            : `${filteredVaxes.length} of ${vaxes.length} immunizations`}
        </Text>

        {/* Med list */}
        {healthTab === 'meds' && (filteredMeds.length === 0
          ? <EmptyState Icon={Pill} label={meds.length === 0 ? 'No medications yet' : 'No results — adjust filters'} colors={colors} />
          : filteredMeds.map(med => {
            const isTakenToday = med.taken_date === today();
            const overdue     = isOverdue(med);
            const expanded    = expandedId === med.id;
            const catColor    = CAT_COLORS[med.category] ?? BRAND.purple;
            const mc          = memberColor(med.member_id);

            return (
              <View key={med.id} style={[h.medCard, {
                backgroundColor: isDark ? colors.card + 'CC' : '#F5F3FF80',
                borderColor: isTakenToday ? BRAND.emerald + '60' : colors.border,
                opacity: med.is_active === false ? 0.55 : 1,
              }]}>
                <TouchableOpacity onPress={() => setExpandedId(expanded ? null : med.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={[h.pillIcon, { backgroundColor: catColor + '20' }]}>
                      <Pill size={16} color={catColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                        {med.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                        {med.dosage} {med.dosage_unit} · {FREQ_LABELS[med.frequency] ?? med.frequency}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <MemberAvatar name={memberName(med.member_id)} color={mc} size={20} />
                        <Text style={{ fontSize: 11, color: colors.textTertiary }}>{memberName(med.member_id)}</Text>
                        <StatusPill
                          label={med.category}
                          color={catColor}
                        />
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      {expanded ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
                      {isTakenToday && <StatusPill label="Taken" color={BRAND.emerald} Icon={Check} />}
                      {!isTakenToday && overdue && <StatusPill label="Overdue" color={BRAND.rose} Icon={AlertCircle} />}
                      {!med.is_active && <StatusPill label="Inactive" color={colors.textTertiary} />}
                    </View>
                  </View>
                </TouchableOpacity>

                {expanded && (
                  <View style={{ marginTop: 12, gap: 6, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border }}>
                    {med.prescribing_doctor && (
                      <View style={h.detailRow}>
                        <User size={12} color={colors.textTertiary} />
                        <Text style={[h.detailText, { color: colors.textSecondary }]}>Dr. {med.prescribing_doctor}</Text>
                      </View>
                    )}
                    {med.pharmacy && (
                      <View style={h.detailRow}>
                        <AlertCircle size={12} color={colors.textTertiary} />
                        <Text style={[h.detailText, { color: colors.textSecondary }]}>{med.pharmacy}</Text>
                      </View>
                    )}
                    {med.refill_date && (
                      <View style={h.detailRow}>
                        <Calendar size={12} color={colors.textTertiary} />
                        <Text style={[h.detailText, { color: colors.textSecondary }]}>Refill: {med.refill_date}</Text>
                      </View>
                    )}
                    {med.pills_remaining != null && (
                      <View style={h.detailRow}>
                        <Pill size={12} color={colors.textTertiary} />
                        <Text style={[h.detailText, { color: colors.textSecondary }]}>{med.pills_remaining} pills remaining</Text>
                      </View>
                    )}
                    {med.instructions && (
                      <Text style={{ fontSize: 11, color: colors.textTertiary, fontStyle: 'italic' }}>
                        {med.instructions}
                      </Text>
                    )}

                    {/* Audit trail */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {med.assigned_by && (
                        <Text style={h.auditText}>
                          Added by {memberName(med.assigned_by)}
                        </Text>
                      )}
                      {med.modified_by && (
                        <Text style={h.auditText}>
                          · Last updated by {memberName(med.modified_by)}
                          {med.updated_at ? ` on ${new Date(med.updated_at).toLocaleDateString()}` : ''}
                        </Text>
                      )}
                    </View>

                    {/* Action buttons */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity onPress={() => markTaken(med)}
                        style={[h.actionBtn, {
                          borderColor: isTakenToday ? BRAND.emerald + '60' : BRAND.purple + '60',
                          backgroundColor: isTakenToday ? BRAND.emerald + '15' : BRAND.purple + '10',
                          flex: 1,
                        }]}>
                        <Check size={14} color={isTakenToday ? BRAND.emerald : BRAND.purple} />
                        <Text style={{ fontSize: 12, fontWeight: '800',
                          color: isTakenToday ? BRAND.emerald : BRAND.purple }}>
                          {isTakenToday ? 'Taken Today' : 'Mark Taken'}
                        </Text>
                      </TouchableOpacity>
                      {/* Active / Inactive toggle */}
                      <TouchableOpacity onPress={() => toggleMedActive(med)}
                        style={[h.actionBtn, {
                          borderColor: med.is_active ? BRAND.amber + '60' : BRAND.emerald + '60',
                          backgroundColor: med.is_active ? BRAND.amber + '10' : BRAND.emerald + '10',
                        }]}>
                        <Text style={{ fontSize: 11, fontWeight: '800',
                          color: med.is_active ? BRAND.amber : BRAND.emerald }}>
                          {med.is_active ? 'Deactivate' : 'Reactivate'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteMed(med.id)}
                        style={[h.actionBtn, { borderColor: BRAND.rose + '50', backgroundColor: BRAND.rose + '10' }]}>
                        <Trash2 size={14} color={BRAND.rose} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}

        {healthTab === 'meds' && <AddBtn label="Add Medication" onPress={() => setShowMedModal(true)} color={BRAND.purple} />}

        {healthTab === 'vax' && (filteredVaxes.length === 0
          ? <EmptyState Icon={Syringe} label={vaxes.length === 0 ? 'No vaccine records yet' : 'No results — adjust filters'} colors={colors} />
          : filteredVaxes.map(vax => {
            const mc = memberColor(vax.member_id);
            return (
              <View key={vax.id} style={[h.medCard, {
                backgroundColor: isDark ? colors.card + 'CC' : '#F0FDFA80',
                borderColor: vax.done ? BRAND.teal + '60' : colors.border,
              }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={[h.pillIcon, { backgroundColor: BRAND.teal + '20' }]}>
                    <Syringe size={16} color={BRAND.teal} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary }}>
                      {vax.title}
                    </Text>
                    {vax.vaccine_type && (
                      <Text style={{ fontSize: 11, color: BRAND.teal, fontWeight: '700', marginTop: 2 }}>
                        {vax.vaccine_type.toUpperCase()}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      <MemberAvatar name={memberName(vax.member_id)} color={mc} size={20} />
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>{memberName(vax.member_id)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <View style={h.detailRow}>
                        <Calendar size={11} color={colors.textTertiary} />
                        <Text style={[h.detailText, { color: colors.textTertiary }]}>{vax.date}</Text>
                      </View>
                      {vax.next_due_date && (
                        <View style={h.detailRow}>
                          <Clock size={11} color={BRAND.amber} />
                          <Text style={[h.detailText, { color: BRAND.amber }]}>Next: {vax.next_due_date}</Text>
                        </View>
                      )}
                      {vax.series_total > 1 && (
                        <StatusPill label={`Dose ${vax.series_current}/${vax.series_total}`} color={BRAND.blue} />
                      )}
                    </View>
                    {vax.administered_by && (
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
                        {vax.administered_by}{vax.location ? ` · ${vax.location}` : ''}
                      </Text>
                    )}
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <TouchableOpacity onPress={() => toggleVax(vax)}
                      style={[h.pillIcon, {
                        backgroundColor: vax.done ? BRAND.teal + '20' : colors.card,
                        borderWidth: 1.5,
                        borderColor: vax.done ? BRAND.teal + '60' : colors.border,
                      }]}>
                      <Check size={14} color={vax.done ? BRAND.teal : colors.textTertiary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteVax(vax.id)}>
                      <Trash2 size={14} color={BRAND.rose + 'AA'} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}

        {healthTab === 'vax' && <AddBtn label="Log Vaccine" onPress={() => setShowVaxModal(true)} color={BRAND.teal} />}
      </SCard>

      {/* Modals */}
      <AddMedModal visible={showMedModal} onClose={() => setShowMedModal(false)}
        onSave={addMed} members={members} colors={colors} isDark={isDark} />
      <AddVaxModal visible={showVaxModal} onClose={() => setShowVaxModal(false)}
        onSave={addVax} members={members} colors={colors} isDark={isDark} />

      {/* ── Filter Bottom Sheet ─────────────────────── */}
      <Modal visible={showFilterSheet} animationType="slide" transparent onRequestClose={() => setShowFilterSheet(false)}>
        <TouchableOpacity style={hf.sheetOverlay} activeOpacity={1} onPress={() => setShowFilterSheet(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <View style={[hf.sheet, {
            backgroundColor: isDark ? colors.background : '#FAFAFA',
            borderColor: colors.border,
          }]}>
            {/* Handle */}
            <View style={hf.sheetHandle} />

            {/* Header */}
            <View style={hf.sheetHeader}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>
                {healthTab === 'meds' ? 'Medication Filters' : 'Vaccine Filters'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={resetFilters}
                  style={[hf.sheetHeaderBtn, { borderColor: BRAND.rose + '50', backgroundColor: BRAND.rose + '10' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.rose }}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={applyFilters}
                  style={[hf.sheetHeaderBtn, {
                    backgroundColor: healthTab === 'meds' ? BRAND.purple : BRAND.teal,
                    borderColor: 'transparent',
                  }]}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
              {healthTab === 'meds' ? (
                <>
                  {/* Search */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Search</Text>
                    <View style={[hf.searchRow, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F5F3FF' }]}>
                      <TextInput value={draftMed.search} onChangeText={v => setDraftMed(d => ({ ...d, search: v }))}
                        placeholder="Medication name…" placeholderTextColor={colors.textTertiary}
                        style={[hf.searchInput, { color: colors.textPrimary }]} />
                      {draftMed.search.length > 0 && (
                        <TouchableOpacity onPress={() => setDraftMed(d => ({ ...d, search: '' }))}>
                          <X size={14} color={colors.textTertiary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Status */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Status</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {([
                        { id: 'active',  label: 'Active',   color: BRAND.purple },
                        { id: 'taken',   label: 'Taken Today', color: BRAND.emerald },
                        { id: 'pending', label: 'Pending',  color: BRAND.amber },
                        { id: 'overdue', label: 'Overdue',  color: BRAND.rose },
                        { id: 'all',     label: 'All',      color: BRAND.blue },
                      ] as const).map(opt => {
                        const sel = draftMed.status === opt.id;
                        return (
                          <TouchableOpacity key={opt.id}
                            onPress={() => setDraftMed(d => ({ ...d, status: opt.id }))}
                            style={[hf.fsPill, { backgroundColor: sel ? opt.color : 'transparent', borderColor: sel ? opt.color : colors.border }]}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Members */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>
                      Members {draftMed.members.length > 0 ? `(${draftMed.members.length} selected)` : '(all)'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {members.map(m => {
                        const mc = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? BRAND.blue : BRAND.emerald;
                        const sel = draftMed.members.includes(m.id);
                        return (
                          <TouchableOpacity key={m.id}
                            onPress={() => setDraftMed(d => ({
                              ...d,
                              members: sel ? d.members.filter(x => x !== m.id) : [...d.members, m.id],
                            }))}
                            style={[hf.fsMemberChip, { backgroundColor: sel ? mc + '20' : 'transparent', borderColor: sel ? mc : colors.border }]}>
                            <MemberAvatar name={m.name} color={sel ? mc : colors.textTertiary} size={28} />
                            <View>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? mc : colors.textPrimary }}>
                                {m.name.split(' ')[0]}
                              </Text>
                              <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'capitalize' }}>{m.role}</Text>
                            </View>
                            {sel && <Check size={13} color={mc} style={{ marginLeft: 'auto' as any }} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Category */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Category</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {Object.entries(CAT_COLORS).map(([cat, color]) => {
                        const sel = draftMed.categories.includes(cat);
                        return (
                          <TouchableOpacity key={cat}
                            onPress={() => setDraftMed(d => ({
                              ...d,
                              categories: sel ? d.categories.filter(x => x !== cat) : [...d.categories, cat],
                            }))}
                            style={[hf.fsPill, { backgroundColor: sel ? color : 'transparent', borderColor: sel ? color : colors.border }]}>
                            <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'capitalize',
                              color: sel ? '#fff' : colors.textSecondary }}>{cat}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Frequency */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Frequency</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {Object.entries(FREQ_LABELS).map(([k, v]) => {
                        const sel = draftMed.frequencies.includes(k);
                        return (
                          <TouchableOpacity key={k}
                            onPress={() => setDraftMed(d => ({
                              ...d,
                              frequencies: sel ? d.frequencies.filter(x => x !== k) : [...d.frequencies, k],
                            }))}
                            style={[hf.fsPill, { backgroundColor: sel ? BRAND.teal : 'transparent', borderColor: sel ? BRAND.teal : colors.border }]}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>{v}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Toggles */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Options</Text>
                    {[
                      { key: 'ongoing',       label: 'Active / Ongoing only',          desc: 'Hide discontinued medications' },
                      { key: 'refillSoon',    label: 'Refill due within 7 days',       desc: 'Show only meds needing refill soon' },
                      { key: 'escalationOnly', label: 'Escalation alert enabled',      desc: 'Only meds with missed-dose alerts' },
                    ].map(opt => {
                      const val = draftMed[opt.key as keyof typeof draftMed] as boolean;
                      return (
                        <TouchableOpacity key={opt.key}
                          onPress={() => setDraftMed(d => ({ ...d, [opt.key]: !val }))}
                          style={[hf.fsToggleRow, { borderColor: val ? BRAND.purple + '40' : colors.border,
                            backgroundColor: val ? BRAND.purple + '08' : 'transparent' }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>{opt.label}</Text>
                            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{opt.desc}</Text>
                          </View>
                          <View style={[hf.toggle, { backgroundColor: val ? BRAND.purple : colors.border }]}>
                            <View style={[hf.toggleThumb, { transform: [{ translateX: val ? 18 : 2 }] }]} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <>
                  {/* Vax Search */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Search</Text>
                    <View style={[hf.searchRow, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F0FDFA' }]}>
                      <TextInput value={draftVax.search} onChangeText={v => setDraftVax(d => ({ ...d, search: v }))}
                        placeholder="Vaccine name…" placeholderTextColor={colors.textTertiary}
                        style={[hf.searchInput, { color: colors.textPrimary }]} />
                    </View>
                  </View>

                  {/* Vax Status */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Status</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {([
                        { id: 'pending',  label: 'Pending',  color: BRAND.amber },
                        { id: 'done',     label: 'Done',     color: BRAND.emerald },
                        { id: 'due_soon', label: 'Due Soon', color: BRAND.rose },
                        { id: 'all',      label: 'All',      color: BRAND.teal },
                      ] as const).map(opt => {
                        const sel = draftVax.status === opt.id;
                        return (
                          <TouchableOpacity key={opt.id}
                            onPress={() => setDraftVax(d => ({ ...d, status: opt.id }))}
                            style={[hf.fsPill, { backgroundColor: sel ? opt.color : 'transparent', borderColor: sel ? opt.color : colors.border }]}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {draftVax.status === 'due_soon' && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700', marginBottom: 6 }}>
                          Due within: {draftVax.dueSoonDays} days
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {[7, 14, 30, 60, 90].map(d => {
                            const sel = draftVax.dueSoonDays === d;
                            return (
                              <TouchableOpacity key={d} onPress={() => setDraftVax(v => ({ ...v, dueSoonDays: d }))}
                                style={[hf.fsPill, { backgroundColor: sel ? BRAND.teal : 'transparent', borderColor: sel ? BRAND.teal : colors.border }]}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>{d}d</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Vax Members */}
                  <View style={hf.fsSection}>
                    <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>
                      Members {draftVax.members.length > 0 ? `(${draftVax.members.length} selected)` : '(all)'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {members.map(m => {
                        const mc = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? BRAND.blue : BRAND.emerald;
                        const sel = draftVax.members.includes(m.id);
                        return (
                          <TouchableOpacity key={m.id}
                            onPress={() => setDraftVax(d => ({
                              ...d,
                              members: sel ? d.members.filter(x => x !== m.id) : [...d.members, m.id],
                            }))}
                            style={[hf.fsMemberChip, { backgroundColor: sel ? mc + '20' : 'transparent', borderColor: sel ? mc : colors.border }]}>
                            <MemberAvatar name={m.name} color={sel ? mc : colors.textTertiary} size={28} />
                            <View>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? mc : colors.textPrimary }}>
                                {m.name.split(' ')[0]}
                              </Text>
                              <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'capitalize' }}>{m.role}</Text>
                            </View>
                            {sel && <Check size={13} color={mc} style={{ marginLeft: 'auto' as any }} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              {/* ── Export Section (inside filter sheet) ───── */}
              <View style={[hf.fsSection, { borderTopWidth: 1, borderColor: colors.border, paddingTop: 20 }]}>
                <Text style={[hf.fsSectionTitle, { color: colors.textSecondary }]}>Export Health Records</Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 12 }}>
                  Generate a summary for the current filter selection and share it.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowFilterSheet(false);
                      // Build text report for current filtered data
                      const targetMeds = healthTab === 'meds' ? filteredMeds : meds;
                      const targetVaxes = healthTab === 'vax' ? filteredVaxes : vaxes;
                      const selectedMemberIds = healthTab === 'meds'
                        ? (draftMed.members.length ? draftMed.members : members.map(m => m.id))
                        : (draftVax.members.length ? draftVax.members : members.map(m => m.id));

                      const selectedMembers = members.filter(m => selectedMemberIds.includes(m.id));

                      let report = `📋 FAMILY HEALTH RECORDS\nGenerated: ${new Date().toLocaleDateString()}\n`;
                      report += `Members: ${selectedMembers.map(m => m.name).join(', ')}\n\n`;

                      if (healthTab !== 'vax') {
                        report += `━━━ MEDICATIONS (${targetMeds.length}) ━━━\n\n`;
                        selectedMemberIds.forEach(mid => {
                          const mName = memberName(mid);
                          const mMeds = targetMeds.filter(m => m.member_id === mid);
                          if (!mMeds.length) return;
                          report += `👤 ${mName}\n`;
                          mMeds.forEach(m => {
                            report += `  • ${m.name} — ${m.dosage} ${m.dosage_unit}, ${FREQ_LABELS[m.frequency] ?? m.frequency}\n`;
                            if (m.prescribing_doctor) report += `    Dr. ${m.prescribing_doctor}\n`;
                            if (m.refill_date) report += `    Refill: ${m.refill_date}\n`;
                            if (m.instructions) report += `    Note: ${m.instructions}\n`;
                          });
                          report += '\n';
                        });
                      }

                      if (healthTab !== 'meds') {
                        report += `━━━ IMMUNIZATIONS (${targetVaxes.length}) ━━━\n\n`;
                        selectedMemberIds.forEach(mid => {
                          const mName = memberName(mid);
                          const mVax = targetVaxes.filter(v => v.member_id === mid);
                          if (!mVax.length) return;
                          report += `👤 ${mName}\n`;
                          mVax.forEach(v => {
                            const status = v.done ? '✓' : '○';
                            report += `  ${status} ${v.title}${v.vaccine_type ? ` (${v.vaccine_type})` : ''} — ${v.date}\n`;
                            if (v.next_due_date) report += `    Next due: ${v.next_due_date}\n`;
                            if (v.series_total > 1) report += `    Dose ${v.series_current}/${v.series_total}\n`;
                            if (v.administered_by) report += `    By: ${v.administered_by}\n`;
                          });
                          report += '\n';
                        });
                      }

                      report += '⚠️ This report is for personal reference only. Always consult a healthcare provider.';
                      useChatStore.getState().sendMessage('all', activeMember?.id ?? '', `📤 *Health Records Export*\n\n\`\`\`\n${report}\n\`\`\``);
                    }}
                    style={[hf.exportBtn, { borderColor: BRAND.purple + '60', backgroundColor: BRAND.purple + '10', flex: 1 }]}>
                    <MessageSquare size={15} color={BRAND.purple} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.purple }}>Share to Chat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      // Build plain text and use Share API
                      const { Share } = await import('react-native');
                      const selectedMemberIds = healthTab === 'meds'
                        ? (draftMed.members.length ? draftMed.members : members.map(m => m.id))
                        : (draftVax.members.length ? draftVax.members : members.map(m => m.id));
                      const selectedMembers = members.filter(m => selectedMemberIds.includes(m.id));
                      let report = `FAMILY HEALTH RECORDS\nGenerated: ${new Date().toLocaleDateString()}\nMembers: ${selectedMembers.map(m => m.name).join(', ')}\n\n`;
                      const targetMeds = filteredMeds.filter(m => selectedMemberIds.includes(m.member_id));
                      const targetVaxes = filteredVaxes.filter(v => selectedMemberIds.includes(v.member_id));
                      if (targetMeds.length) {
                        report += `MEDICATIONS (${targetMeds.length})\n`;
                        targetMeds.forEach(m => { report += `- ${m.name}: ${m.dosage} ${m.dosage_unit}, ${FREQ_LABELS[m.frequency] ?? m.frequency}\n`; });
                        report += '\n';
                      }
                      if (targetVaxes.length) {
                        report += `IMMUNIZATIONS (${targetVaxes.length})\n`;
                        targetVaxes.forEach(v => { report += `- ${v.done ? '✓' : '○'} ${v.title} (${v.date})${v.next_due_date ? ` | Next: ${v.next_due_date}` : ''}\n`; });
                      }
                      report += '\n⚠️ For personal reference only.';
                      Share.share({ message: report, title: 'Family Health Records' });
                      setShowFilterSheet(false);
                    }}
                    style={[hf.exportBtn, { borderColor: BRAND.teal + '60', backgroundColor: BRAND.teal + '10', flex: 1 }]}>
                    <Share2 size={15} color={BRAND.teal} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.teal }}>Export / Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const hf = StyleSheet.create({
  innerTabRow: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, marginTop: 12, gap: 4 },
  innerTab:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                 gap: 6, paddingVertical: 9 },
  tabBadge:    { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  searchRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5,
                 paddingHorizontal: 12, paddingVertical: 9, marginTop: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },
  filterChip:  { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },

  // Filter sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1,
                  maxHeight: '88%', overflow: 'hidden' },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1',
                  alignSelf: 'center', marginTop: 10 },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  sheetHeaderBtn: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },

  // Filter sheet sections
  fsSection:      { gap: 10 },
  fsSectionTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  fsPill:         { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },
  fsMemberChip:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5,
                    paddingHorizontal: 10, paddingVertical: 8 },
  fsToggleRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14,
                    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  toggle:         { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb:    { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },

  // Export button
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
               borderRadius: 14, borderWidth: 1.5, paddingVertical: 11 },

  // Active filter pill summary
  filterIconBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5,
                   alignItems: 'center', justifyContent: 'center' },
  filterBadge:   { position: 'absolute', top: -4, right: -4, width: 16, height: 16,
                   borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  activePill:    { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 4 },
});

const h = StyleSheet.create({
  medCard:    { borderRadius: 16, borderWidth: 1, padding: 12, marginTop: 10 },
  pillIcon:   { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontSize: 12 },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1,
                paddingHorizontal: 10, paddingVertical: 7 },
  auditText:  { fontSize: 10, color: '#94A3B8', fontStyle: 'italic' },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 10,
                borderWidth: 1, padding: 10, marginTop: 12 },
  qChip:      { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  aiInputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 16, borderWidth: 1.5,
                paddingHorizontal: 12, paddingVertical: 8, marginTop: 12, gap: 8 },
  aiInput:    { flex: 1, fontSize: 14, maxHeight: 80, lineHeight: 20 },
  aiSendBtn:  { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  aiResult:   { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14 },
  sharedBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20,
                paddingHorizontal: 16, paddingVertical: 9 },
});

const aStyles = StyleSheet.create({
  // Bottom-sheet layout (matches EventFormModal)
  backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:         { borderTopLeftRadius: 28, borderTopRightRadius: 28,
                   paddingHorizontal: 20, paddingTop: 6, paddingBottom: 0,
                   maxHeight: '92%' },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' },
  closeBtn:      { padding: 8, borderRadius: 20, backgroundColor: 'rgba(100,116,139,0.12)' },

  // Form atoms
  label:         { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  sectionLabel:  { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  inp:           { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10,
                   fontSize: 14, fontWeight: '600' },
  chipSmall:     { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },
  suggPill:      { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5,
                   paddingHorizontal: 12, paddingVertical: 6 },

  // Date button (matches EventFormModal f.dateBtn)
  dateBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
                   paddingHorizontal: 12, paddingVertical: 10 },

  // Date picker modal (nested floating picker)
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 },

  // Escalation box
  escBox:        { borderRadius: 14, borderWidth: 1.5, padding: 14 },

  // Footer
  saveRow:       { flexDirection: 'row', gap: 10, paddingHorizontal: 0,
                   paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn:     { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:       { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },

  // Validation error text
  errText:       { fontSize: 11, fontWeight: '700', color: '#F43F5E', marginTop: 4, marginLeft: 2 },

  // Kept for legacy (filter toggles in sheet use hf.toggle)
  memberChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5,
                   paddingHorizontal: 10, paddingVertical: 6 },
  toggle:        { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb:   { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                   shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
});

