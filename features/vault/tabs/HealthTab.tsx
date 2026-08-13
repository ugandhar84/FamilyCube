import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, Animated, Easing, Switch,
  Image,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Pill, Syringe, Trash2, Check, Clock, ChevronDown, ChevronUp,
  User, Calendar, AlertCircle, X, RefreshCw, Stethoscope, Send,
  MessageSquare, SlidersHorizontal, Share2, FileText, Download, ScanLine,
} from 'lucide-react-native';
import Svg, { Path, Circle, Rect, Polyline, Line } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { usePrescriptionScanner, ParsedMedication, ParsedVaccine } from '../usePrescriptionScanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function HealthTab({ colors, isDark, kidView = false }: { colors: any; isDark: boolean; kidView?: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const insets = useSafeAreaInsets();

  const [meds, setMeds]     = useState<Medication[]>([]);
  const [vaxes, setVaxes]   = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // AI banner open state
  const [aiOpen, setAiOpen] = useState(false);

  // Prescription scanner
  const {
    scanning, scanResult, showReview, scanError,
    pendingImages, maxPhotos,
    pickImage, scan, pickAndScan,
    removeImage, clearPending, clearScan, setScanResult,
  } = usePrescriptionScanner();
  const [reviewMed, setReviewMed] = useState<ParsedMedication | null>(null);
  const [reviewVax, setReviewVax] = useState<ParsedVaccine | null>(null);
  const [reviewDocType, setReviewDocType] = useState<'medication' | 'vaccine'>('medication');
  const [reviewMemberId, setReviewMemberId] = useState('');
  const [rxSaving, setRxSaving] = useState(false);

  // Scan bottom sheet state
  const [showScanSheet, setShowScanSheet] = useState(false);
  const [scanMode, setScanMode] = useState<'rx' | 'vaccine'>('rx');
  const [scanPage, setScanPage] = useState<1 | 2>(1);

  // Redact step — draw black boxes over sensitive text before sending to AI
  type RedactBox = { x: number; y: number; w: number; h: number };
  // per-image boxes: redactBoxesByImage[i] = boxes for pendingImages[i]
  const [redactBoxesByImage, setRedactBoxesByImage] = useState<RedactBox[][]>([]);
  const [activeRedactIdx, setActiveRedactIdx]       = useState(0);
  const [currentBox, setCurrentBox]                 = useState<RedactBox | null>(null);
  const currentBoxRef                               = useRef<RedactBox | null>(null);
  const dragStart                                   = useRef<{ x: number; y: number } | null>(null);
  const viewShotRef                                 = useRef<ViewShot>(null);

  // boxes for the currently-viewed image
  const activeBoxes = redactBoxesByImage[activeRedactIdx] ?? [];
  // Keep a ref so the stable gesture closure always reads the current index
  const activeRedactIdxRef = useRef(activeRedactIdx);
  useEffect(() => { activeRedactIdxRef.current = activeRedactIdx; }, [activeRedactIdx]);

  // Stable gesture — never recreated so RNGH doesn't leave stale native state
  const redactGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((e) => {
        dragStart.current = { x: e.x, y: e.y };
        const box: RedactBox = { x: e.x, y: e.y, w: 0, h: 0 };
        currentBoxRef.current = box;
        setCurrentBox(box);
      })
      .onUpdate((e) => {
        if (!dragStart.current) return;
        const dx = e.x - dragStart.current.x;
        const dy = e.y - dragStart.current.y;
        const box: RedactBox = {
          x: dx < 0 ? e.x : dragStart.current.x,
          y: dy < 0 ? e.y : dragStart.current.y,
          w: Math.abs(dx),
          h: Math.abs(dy),
        };
        currentBoxRef.current = box;
        setCurrentBox(box);
      })
      .onEnd(() => {
        const box = currentBoxRef.current;
        if (box && box.w > 8 && box.h > 8) {
          // Read index from ref — avoids stale closure without recreating the gesture
          setRedactBoxesByImage(prev => {
            const idx  = activeRedactIdxRef.current;
            const copy = [...prev];
            copy[idx]  = [...(copy[idx] ?? []), box];
            return copy;
          });
        }
        currentBoxRef.current = null;
        dragStart.current     = null;
        setCurrentBox(null);
      }),
  // empty deps — gesture is created once and never replaced
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Animation refs
  const scanBeamY  = useRef(new Animated.Value(0)).current;   // scanning beam
  const pulseScale = useRef(new Animated.Value(1)).current;    // pulsing circle
  const spinAnim   = useRef(new Animated.Value(0)).current;    // spinning ring
  const dotOpacity = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  // Start scanning beam animation
  const startBeam = useCallback(() => {
    scanBeamY.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanBeamY, { toValue: 1, duration: 1600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(scanBeamY, { toValue: 0, duration: 1600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [scanBeamY]);

  // Start pulse + spin + dots when AI is processing
  const startProcessing = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1800, useNativeDriver: true, easing: Easing.linear })
    ).start();
    dotOpacity.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, { toValue: 1,   duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          Animated.delay((dotOpacity.length - i - 1) * 200),
        ])
      ).start();
    });
  }, [pulseScale, spinAnim, dotOpacity]);

  const stopAnimations = useCallback(() => {
    scanBeamY.stopAnimation();
    pulseScale.stopAnimation();
    spinAnim.stopAnimation();
    dotOpacity.forEach(d => d.stopAnimation());
    pulseScale.setValue(1);
  }, []);

  useEffect(() => {
    if (scanning) { startBeam(); startProcessing(); }
    else           { stopAnimations(); }
  }, [scanning]);

  // Advance to page 2 when result arrives
  useEffect(() => {
    if (!scanResult) return;
    const dt = scanResult.doc_type === 'vaccine' ? 'vaccine' : 'medication';
    setReviewDocType(dt);
    if (scanResult.medication) setReviewMed({ ...scanResult.medication });
    if (scanResult.vaccine)    setReviewVax({ ...scanResult.vaccine });
    setReviewMemberId(activeMember?.id ?? '');
    setScanPage(2);
  }, [scanResult]);

  const openScanSheet = (mode: 'rx' | 'vaccine') => {
    setScanMode(mode);
    setScanPage(1);
    setShowScanSheet(true);
  };

  const closeScanSheet = () => {
    setShowScanSheet(false);
    clearScan();
    setScanPage(1);
    setRedactBoxesByImage([]);
    setCurrentBox(null);
    setActiveRedactIdx(0);
  };

  // Reset redact boxes when image count changes (new image added)
  useEffect(() => {
    setRedactBoxesByImage(prev => {
      if (pendingImages.length === prev.length) return prev;
      // pad/trim to match new count
      const copy = pendingImages.map((_, i) => prev[i] ?? []);
      return copy;
    });
    if (pendingImages.length > 0) setActiveRedactIdx(pendingImages.length - 1);
  }, [pendingImages.length]);

  const load = useCallback(async () => {
    if (familyId === 'family-1') return; // real family not resolved yet
    setLoading(true);
    setLoadError(null);
    // Kids only see their own assigned medications and vaccines
    const medsQ = kidView && activeMember?.id
      ? supabase.from('family_medications').select('*').eq('family_id', familyId).eq('member_id', activeMember.id)
      : supabase.from('family_medications').select('*').eq('family_id', familyId);
    const vaxQ = kidView && activeMember?.id
      ? supabase.from('family_vaccines').select('*').eq('family_id', familyId).eq('member_id', activeMember.id)
      : supabase.from('family_vaccines').select('*').eq('family_id', familyId);
    const [medsRes, vaxRes] = await Promise.all([
      medsQ.order('created_at', { ascending: false }),
      vaxQ.order('date', { ascending: false }),
    ]);
    if (medsRes.error || vaxRes.error) {
      setLoadError('Could not load health records. Tap refresh to try again.');
    } else {
      if (medsRes.data) setMeds(medsRes.data as Medication[]);
      if (vaxRes.data)  setVaxes(vaxRes.data as Vaccine[]);
    }
    setLoading(false);
  }, [familyId, kidView, activeMember?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime: keep medications and vaccines in sync across devices
  useEffect(() => {
    if (familyId === 'family-1') return;
    const channel = supabase
      .channel(`health-${familyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'family_medications',
        filter: `family_id=eq.${familyId}`,
      }, () => { load(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'family_vaccines',
        filter: `family_id=eq.${familyId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId, load]);

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

  const saveScannedMed = async () => {
    if (!reviewMed || !reviewMemberId) return;
    setRxSaving(true);
    try {
      const { data } = await supabase.from('family_medications').insert({
        family_id: familyId,
        member_id: reviewMemberId,
        assigned_by: activeMember?.id ?? null,
        name: reviewMed.name.trim() || 'Unknown medication',
        dosage: reviewMed.dosage.trim(),
        dosage_unit: 'mg',
        frequency: reviewMed.frequency || 'As directed',
        frequency_times: ['08:00'],
        category: 'other',
        prescribing_doctor: reviewMed.prescriber || null,
        pharmacy: reviewMed.pharmacy || null,
        instructions: reviewMed.instructions || null,
        is_ongoing: !reviewMed.duration || reviewMed.duration.toLowerCase().includes('ongoing'),
        is_active: true,
        escalation_enabled: false,
        escalation_after_min: 60,
      }).select().single();
      if (data) setMeds(prev => [data as Medication, ...prev]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save medication.');
      throw e;
    } finally {
      setRxSaving(false);
    }
  };

  const saveScannedVax = async () => {
    if (!reviewVax || !reviewMemberId) return;
    setRxSaving(true);
    try {
      const { data } = await supabase.from('family_vaccines').insert({
        family_id: familyId,
        member_id: reviewMemberId,
        title: reviewVax.vaccine_name.trim() || 'Unknown vaccine',
        vaccine_type: reviewVax.manufacturer || null,
        date: reviewVax.administered_date ?? today(),
        next_due_date: reviewVax.next_due_date ?? null,
        series_current: reviewVax.dose_number ?? 1,
        series_total: reviewVax.total_doses ?? 1,
        administered_by: reviewVax.administered_by || null,
        location: reviewVax.site || null,
        notes: reviewVax.lot_number ? `Lot: ${reviewVax.lot_number}` : null,
        done: true,
      }).select().single();
      if (data) setVaxes(prev => [data as Vaccine, ...prev]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save vaccine record.');
      throw e;
    } finally {
      setRxSaving(false);
    }
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

  if (loadError) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={Pill} iconColor={BRAND.rose} title="Health Tracker" colors={colors} />
      <View style={{ backgroundColor: BRAND.rose + '15', borderRadius: 12, padding: 14, marginTop: 12, gap: 10 }}>
        <Text style={{ color: BRAND.rose, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{loadError}</Text>
        <TouchableOpacity
          onPress={load}
          style={{ alignSelf: 'center', backgroundColor: BRAND.rose, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SCard>
  );

  return (
    <>
      {/* ── AI Health Assistant — Quest-style dark collapsible banner ── */}
      <View style={{
        backgroundColor: '#0D1424',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#1E2A42',
        overflow: 'hidden',
      }}>
        {/* Header row — always visible */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setAiOpen(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
        >
          <View style={{
            width: 32, height: 32, borderRadius: 10,
            backgroundColor: 'rgba(124,58,237,0.25)',
            borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Stethoscope size={16} color="#C4B5FD" />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#C4B5FD' }}>CubeAI Health Assistant</Text>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981' }} />
              {(aiLoading || scanning) && <ActivityIndicator size="small" color="#A78BFA" style={{ marginLeft: 2 }} />}
            </View>
            <Text style={{ fontSize: 11, color: 'rgba(196,181,253,0.65)', marginTop: 1 }}>
              Ask · Scan Rx · Log Vaccine
            </Text>
          </View>

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(255,255,255,0.09)',
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#A78BFA' }}>
              {aiOpen ? 'Collapse' : 'Tools'}
            </Text>
            {aiOpen ? <ChevronUp size={12} color="#A78BFA" /> : <ChevronDown size={12} color="#A78BFA" />}
          </View>
        </TouchableOpacity>

        {/* Expanded body */}
        {aiOpen && (
          <View style={{ borderTopWidth: 1, borderTopColor: '#1E2A42', padding: 14, gap: 12 }}>

            {/* ── Tool buttons row (like Quest) ── */}
            {!kidView && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* Scan Medication Rx */}
                <TouchableOpacity
                  disabled={scanning}
                  onPress={() => openScanSheet('rx')}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    paddingVertical: 10, borderRadius: 14,
                    backgroundColor: scanning ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.15)',
                    borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)',
                  }}>
                  {scanning
                    ? <ActivityIndicator size="small" color="#C4B5FD" />
                    : <ScanLine size={13} color="#C4B5FD" />}
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#C4B5FD' }}>Scan Rx</Text>
                </TouchableOpacity>

                {/* Scan Vaccine */}
                <TouchableOpacity
                  disabled={scanning}
                  onPress={() => openScanSheet('vaccine')}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    paddingVertical: 10, borderRadius: 14,
                    backgroundColor: 'rgba(20,184,166,0.12)',
                    borderWidth: 1, borderColor: 'rgba(20,184,166,0.35)',
                  }}>
                  <Syringe size={13} color="#5EEAD4" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#5EEAD4' }}>Scan Vaccine</Text>
                </TouchableOpacity>

                {/* Ask AI */}
                <TouchableOpacity
                  onPress={() => { setAiQuery(''); }}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    paddingVertical: 10, borderRadius: 14,
                    backgroundColor: 'rgba(245,158,11,0.12)',
                    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
                  }}>
                  <MessageSquare size={13} color="#FCD34D" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FCD34D' }}>Ask AI</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Quick prompts */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {QUICK_PROMPTS.map(p => (
                  <TouchableOpacity key={p} onPress={() => askAI(p)}
                    style={{
                      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                      backgroundColor: 'rgba(124,58,237,0.18)',
                      borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
                    }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#C4B5FD' }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Input row */}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-end', gap: 8,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 14, borderWidth: 1, borderColor: '#2A3555',
              paddingHorizontal: 12, paddingVertical: 8,
            }}>
              <TextInput
                value={aiQuery}
                onChangeText={setAiQuery}
                placeholder="Ask a health question…"
                placeholderTextColor="rgba(196,181,253,0.4)"
                style={[h.aiInput, { color: '#E2D9FD', flex: 1 }]}
                multiline
                returnKeyType="send"
                onSubmitEditing={() => askAI()}
              />
              <TouchableOpacity onPress={() => askAI()} disabled={aiLoading || !aiQuery.trim()}
                style={[h.aiSendBtn, { backgroundColor: BRAND.purple, opacity: aiQuery.trim() ? 1 : 0.35 }]}>
                {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" />}
              </TouchableOpacity>
            </View>

            {/* Result */}
            {(aiLoading || aiResult) ? (
              <View style={{
                borderRadius: 14, borderWidth: 1,
                borderColor: 'rgba(124,58,237,0.35)',
                backgroundColor: 'rgba(124,58,237,0.12)',
                padding: 14,
              }}>
                {aiLoading
                  ? <View style={{ alignItems: 'center', paddingVertical: 8, gap: 8 }}>
                      <ActivityIndicator color="#A78BFA" />
                      <Text style={{ fontSize: 12, color: '#A78BFA', fontWeight: '700' }}>Consulting Health AI…</Text>
                    </View>
                  : <>
                      <TouchableOpacity
                        onPress={() => { setAiResult(''); setAiShared(false); setAiQuery(''); }}
                        style={{
                          position: 'absolute', top: 10, right: 10, zIndex: 1,
                          width: 24, height: 24, borderRadius: 12,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: 'rgba(255,255,255,0.1)',
                        }}>
                        <X size={13} color="#A78BFA" />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 13, color: '#E2D9FD', lineHeight: 21, paddingRight: 24 }}>{aiResult}</Text>
                      <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                        {aiShared
                          ? <View style={[h.sharedBtn, { backgroundColor: BRAND.emerald }]}>
                              <Check size={13} color="#fff" />
                              <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>Posted to Family Chat</Text>
                            </View>
                          : <TouchableOpacity onPress={shareAiToChat} style={[h.sharedBtn, { backgroundColor: BRAND.purple }]}>
                              <MessageSquare size={13} color="#fff" />
                              <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>Share with Family</Text>
                            </TouchableOpacity>}
                      </View>
                    </>}
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* ── Medications + Immunizations (unified) ───── */}
      <SCard colors={colors} isDark={isDark}>
        {/* ── Card header row ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <CardHeader
              Icon={healthTab === 'meds' ? Pill : Syringe}
              iconColor={healthTab === 'meds' ? BRAND.purple : BRAND.teal}
              title="Health Records"
              colors={colors}
            />
          </View>
          <TouchableOpacity onPress={load} style={{ padding: 8 }}>
            <RefreshCw size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ── Inner tab switcher — hidden for kids (Medications only) ── */}
        {!kidView && (
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
        )}

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
                backgroundColor: isDark ? colors.card : (healthTab === 'meds' ? '#F5F3FF' : '#F0FDFA80') }]}>
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
                      {/* Kids can mark taken; parents/seniors get all controls */}
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
                      {!kidView && (
                        <>
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
                        </>
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}

        {healthTab === 'meds' && !kidView && <AddBtn label="Add Medication" onPress={() => setShowMedModal(true)} color={BRAND.purple} />}

        {!kidView && healthTab === 'vax' && (filteredVaxes.length === 0
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

        {!kidView && healthTab === 'vax' && <AddBtn label="Log Vaccine" onPress={() => setShowVaxModal(true)} color={BRAND.teal} />}
      </SCard>

      {/* Modals */}
      <AddMedModal visible={showMedModal} onClose={() => setShowMedModal(false)}
        onSave={addMed} members={members} colors={colors} isDark={isDark} />
      <AddVaxModal visible={showVaxModal} onClose={() => setShowVaxModal(false)}
        onSave={addVax} members={members} colors={colors} isDark={isDark} />

      {/* ── Scan Rx / Vaccine — 2-page bottom sheet (full-screen during redact) ── */}
      <Modal visible={showScanSheet} animationType="slide" transparent onRequestClose={closeScanSheet}>
        {/* ── REDACT MODE: full-screen layout ── */}
        {pendingImages.length > 0 && !scanning && (() => {
          const img    = pendingImages[activeRedactIdx];
          const accent = scanMode === 'vaccine' ? BRAND.teal : BRAND.purple;
          return (
            <View style={{ flex: 1, backgroundColor: '#000' }}>
              {/* Header */}
              <View style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111' }}>
                <TouchableOpacity onPress={clearPending} style={{ padding: 6 }}>
                  <X size={22} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>
                    {`Cover Sensitive Info${pendingImages.length > 1 ? `  ·  Page ${activeRedactIdx + 1}/${pendingImages.length}` : ''}`}
                  </Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                    Drag to black out names, DOB or any detail
                  </Text>
                </View>
                {activeBoxes.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setRedactBoxesByImage(prev => {
                        const idx = activeRedactIdxRef.current;
                        const copy = [...prev];
                        copy[idx] = (copy[idx] ?? []).slice(0, -1);
                        return copy;
                      })}
                    style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>{'↩ Undo'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Page thumbnails strip */}
              {pendingImages.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#111' }}>
                  {pendingImages.map((im, idx) => (
                    <TouchableOpacity key={idx} onPress={() => setActiveRedactIdx(idx)}
                      style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: idx === activeRedactIdx ? accent : 'rgba(255,255,255,0.2)' }}>
                      <Image source={{ uri: `data:${im.mimeType};base64,${im.base64}` }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                  {pendingImages.length < maxPhotos && (
                    <TouchableOpacity onPress={() => pickImage('camera')}
                      style={{ width: 52, height: 52, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', lineHeight: 24 }}>+</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Image */}
              <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.88 }} style={{ flex: 1 }}>
                <Image source={{ uri: `data:${img.mimeType};base64,${img.base64}` }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                {activeBoxes.map((box, i) => (
                  <View key={i} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, backgroundColor: '#000' }} />
                ))}
                {currentBox && (
                  <View style={{ position: 'absolute', left: currentBox.x, top: currentBox.y, width: currentBox.w, height: currentBox.h, backgroundColor: '#000', opacity: 0.7 }} />
                )}
                <GestureDetector gesture={redactGesture}>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                </GestureDetector>
              </ViewShot>

              {/* Bottom bar */}
              <View style={{ paddingTop: 12, paddingBottom: insets.bottom + 14, paddingHorizontal: 16, gap: 10, backgroundColor: '#111' }}>
                {/* ── Scan error banner ── */}
                {scanError && (
                  <View style={{ backgroundColor: BRAND.rose + '22', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BRAND.rose + '55', gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <AlertCircle size={16} color={BRAND.rose} style={{ marginTop: 1 }} />
                      <Text style={{ fontSize: 13, color: '#ffb3b3', fontWeight: '700', flex: 1, lineHeight: 18 }}>{scanError}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => { clearPending(); }}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Start Over</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => pickImage('camera')}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: BRAND.rose + '33', borderWidth: 1, borderColor: BRAND.rose + '66' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#ffb3b3' }}>Replace photo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {!scanError && pendingImages.length < maxPhotos && pendingImages.length === 1 && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => pickImage('camera')}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>+ Add page (camera)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => pickImage('library')}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>+ Add page (library)</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!scanError && (
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                    {activeBoxes.length === 0 ? 'Drag on image to cover sensitive text' : `${activeBoxes.length} area${activeBoxes.length > 1 ? 's' : ''} covered`}
                  </Text>
                )}
                {!scanError && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={clearPending}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 2, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: accent }}
                    onPress={async () => {
                      const toBase64 = async (uri: string) => {
                        const r = await fetch(uri); const b = await r.arrayBuffer(); const u = new Uint8Array(b);
                        let s = ''; for (let i = 0; i < u.byteLength; i++) s += String.fromCharCode(u[i]); return btoa(s);
                      };
                      try {
                        const capturedUri = await viewShotRef.current?.capture?.();
                        const capturedB64 = capturedUri ? await toBase64(capturedUri) : null;
                        const finalImages = pendingImages.map((im, idx) =>
                          (idx === activeRedactIdx && capturedB64) ? { base64: capturedB64, mimeType: 'image/jpeg' } : im
                        );
                        await scan(finalImages);
                      } catch {
                        await scan(pendingImages);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>
                      {`Scan ${pendingImages.length > 1 ? `${pendingImages.length} Pages` : 'Now'} →`}
                    </Text>
                  </TouchableOpacity>
                </View>
                )}
              </View>
            </View>
          );
        })()}

        {/* ── NORMAL MODE: bottom sheet ── */}
        {(pendingImages.length === 0 || scanning) && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeScanSheet} />
            <View style={{
              backgroundColor: isDark ? '#13131F' : '#F8F8FC',
              borderTopLeftRadius: 28, borderTopRightRadius: 28,
              maxHeight: '92%',
              paddingBottom: insets.bottom || 16,
            }}>
              {/* ── Progress bar (2 steps) ── */}
              <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
                {[1, 2].map(s => (
                  <View key={s} style={{
                    flex: 1, height: 3, borderRadius: 2,
                    backgroundColor: scanPage >= s
                      ? (scanMode === 'vaccine' ? BRAND.teal : BRAND.purple)
                      : (isDark ? '#333' : '#E5E7EB'),
                  }} />
                ))}
              </View>

              {/* ── Handle + header ── */}
              <View style={{ alignItems: 'center', paddingTop: 6 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#444' : '#DDD' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {/* Back on page 2 only when not scanning */}
                  {scanPage === 2 && !scanning && !rxSaving && (
                    <TouchableOpacity onPress={() => { setScanPage(1); clearScan(); }}
                      style={{ marginRight: 4, padding: 4 }}>
                      <Svg width={20} height={20} viewBox="0 0 24 24">
                        <Path d="M19 12H5M12 19l-7-7 7-7" stroke={isDark ? '#aaa' : '#555'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </Svg>
                    </TouchableOpacity>
                  )}
                  <View style={{
                    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: scanMode === 'vaccine' ? BRAND.teal + '20' : BRAND.purple + '20',
                  }}>
                    {scanMode === 'vaccine'
                      ? <Syringe size={16} color={BRAND.teal} />
                      : <ScanLine size={16} color={BRAND.purple} />}
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: isDark ? '#fff' : '#111' }}>
                      {scanMode === 'vaccine' ? 'Scan Vaccine Record' : 'Scan Prescription'}
                    </Text>
                    <Text style={{ fontSize: 11, color: isDark ? '#888' : '#999', marginTop: 1 }}>
                      Step {scanPage} of 2 · {scanPage === 1 ? 'Choose source' : 'Review & assign'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={closeScanSheet} style={{ padding: 4 }}>
                  <X size={22} color={isDark ? '#aaa' : '#666'} />
                </TouchableOpacity>
              </View>

              {/* ══════════════════════════════════════════════════════════
                  PAGE 1 — Source picker + animated scan area
              ══════════════════════════════════════════════════════════ */}
              {scanPage === 1 && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
                  {/* Animated scan preview box */}
                  <View style={{
                    height: 160, borderRadius: 20, overflow: 'hidden',
                    backgroundColor: isDark ? '#0D1424' : '#F0F4FF',
                    borderWidth: 1.5, borderColor: scanMode === 'vaccine' ? BRAND.teal + '40' : BRAND.purple + '40',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {scanning ? (
                      <>
                        {/* Corner brackets */}
                        {[
                          { top: 10, left: 10, rotate: '0deg' },
                          { top: 10, right: 10, rotate: '90deg' },
                          { bottom: 10, right: 10, rotate: '180deg' },
                          { bottom: 10, left: 10, rotate: '270deg' },
                        ].map((pos, i) => (
                          <View key={i} style={{ position: 'absolute', ...pos as any, width: 24, height: 24 }}>
                            <Svg width={24} height={24} viewBox="0 0 24 24" style={{ transform: [{ rotate: pos.rotate }] }}>
                              <Path d="M2 8V2h6" stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={2.5} strokeLinecap="round" fill="none" />
                            </Svg>
                          </View>
                        ))}
                        {/* Scanning beam */}
                        <Animated.View style={{
                          position: 'absolute', left: 12, right: 12, height: 2, borderRadius: 1,
                          backgroundColor: scanMode === 'vaccine' ? BRAND.teal : BRAND.purple,
                          opacity: 0.85,
                          transform: [{
                            translateY: scanBeamY.interpolate({ inputRange: [0, 1], outputRange: [-68, 68] }),
                          }],
                        }} />
                        {/* Pulsing icon */}
                        <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
                          <View style={{
                            width: 56, height: 56, borderRadius: 28,
                            backgroundColor: (scanMode === 'vaccine' ? BRAND.teal : BRAND.purple) + '25',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {scanMode === 'vaccine'
                              ? <Syringe size={24} color={BRAND.teal} />
                              : <ScanLine size={24} color={BRAND.purple} />}
                          </View>
                        </Animated.View>
                        {/* Dot loader */}
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                          {dotOpacity.map((op, i) => (
                            <Animated.View key={i} style={{
                              width: 7, height: 7, borderRadius: 4,
                              backgroundColor: scanMode === 'vaccine' ? BRAND.teal : BRAND.purple,
                              opacity: op,
                            }} />
                          ))}
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#aaa' : '#666', marginTop: 10 }}>
                          AI is reading your document…
                        </Text>
                      </>
                    ) : (
                      <View style={{ alignItems: 'center', gap: 8 }}>
                        <Svg width={48} height={48} viewBox="0 0 24 24">
                          <Rect x={3} y={2} width={14} height={18} rx={2} stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={1.5} fill="none" />
                          <Path d="M7 7h6M7 10h6M7 13h4" stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={1.5} strokeLinecap="round" fill="none" />
                          <Path d="M17 8l4 4-4 4" stroke={isDark ? '#555' : '#ccc'} strokeWidth={1.5} strokeLinecap="round" fill="none" />
                        </Svg>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#666' : '#aaa' }}>
                          Choose how to add your document
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Error banner */}
                  {scanError && (
                    <View style={{
                      flexDirection: 'row', gap: 8, alignItems: 'flex-start',
                      backgroundColor: BRAND.rose + '12', borderRadius: 12, padding: 12,
                      borderWidth: 1, borderColor: BRAND.rose + '40',
                    }}>
                      <AlertCircle size={14} color={BRAND.rose} style={{ marginTop: 1 }} />
                      <Text style={{ fontSize: 12, color: BRAND.rose, flex: 1, fontWeight: '600' }}>{scanError}</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {/* Camera */}
                    <TouchableOpacity
                      disabled={scanning}
                      onPress={() => pickImage('camera')}
                      style={{
                        flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18,
                        backgroundColor: isDark ? '#1E1E2E' : '#fff',
                        borderWidth: 1.5, borderColor: isDark ? '#333' : '#E5E7EB',
                        gap: 10, opacity: scanning ? 0.5 : 1,
                        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
                      }}>
                      <Svg width={36} height={36} viewBox="0 0 24 24">
                        <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
                        <Circle cx={12} cy={13} r={4} stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={1.5} fill="none" />
                      </Svg>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#ddd' : '#333' }}>Camera</Text>
                    </TouchableOpacity>

                    {/* Photo Library */}
                    <TouchableOpacity
                      disabled={scanning}
                      onPress={() => pickImage('library')}
                      style={{
                        flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18,
                        backgroundColor: isDark ? '#1E1E2E' : '#fff',
                        borderWidth: 1.5, borderColor: isDark ? '#333' : '#E5E7EB',
                        gap: 10, opacity: scanning ? 0.5 : 1,
                        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
                      }}>
                      <Svg width={36} height={36} viewBox="0 0 24 24">
                        <Rect x={3} y={3} width={18} height={18} rx={2} stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={1.5} fill="none" />
                        <Circle cx={8.5} cy={8.5} r={1.5} fill={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} />
                        <Path d="M21 15l-5-5L5 21" stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </Svg>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#ddd' : '#333' }}>Photo Library</Text>
                    </TouchableOpacity>

                    {/* PDF */}
                    <TouchableOpacity
                      disabled={scanning}
                      onPress={() => pickAndScan('document')}
                      style={{
                        flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18,
                        backgroundColor: isDark ? '#1E1E2E' : '#fff',
                        borderWidth: 1.5, borderColor: isDark ? '#333' : '#E5E7EB',
                        gap: 10, opacity: scanning ? 0.5 : 1,
                        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
                      }}>
                      <Svg width={36} height={36} viewBox="0 0 24 24">
                        <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
                        <Polyline points="14 2 14 8 20 8" stroke={scanMode === 'vaccine' ? BRAND.teal : BRAND.purple} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
                        <Text style={{ fontSize: 7, fontWeight: '900', color: scanMode === 'vaccine' ? BRAND.teal : BRAND.purple }}>{/* PDF label below icon */}</Text>
                      </Svg>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#ddd' : '#333' }}>PDF</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#666' : '#aaa', marginTop: -6 }}>max 3 pages</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ══════════════════════════════════════════════════════════
                  PAGE 2 — Member assignment + review fields
              ══════════════════════════════════════════════════════════ */}
              {scanPage === 2 && (
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>

                  {/* ── Who is this for? ── */}
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#888' : '#888', letterSpacing: 0.5, marginBottom: 10 }}>
                      WHO IS THIS FOR?
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {members.map(m => {
                        const sel = reviewMemberId === m.id;
                        const accent = scanMode === 'vaccine' ? BRAND.teal : BRAND.purple;
                        return (
                          <TouchableOpacity key={m.id} onPress={() => setReviewMemberId(m.id)}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 8,
                              paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
                              backgroundColor: sel ? accent : (isDark ? '#1E1E2E' : '#F3F4F6'),
                              borderWidth: 2, borderColor: sel ? accent : 'transparent',
                            }}>
                            <View style={{
                              width: 28, height: 28, borderRadius: 14,
                              backgroundColor: sel ? 'rgba(255,255,255,0.25)' : (isDark ? '#333' : '#E5E7EB'),
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Text style={{ fontSize: 13, fontWeight: '900', color: sel ? '#fff' : (isDark ? '#ccc' : '#555') }}>
                                {m.name.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : (isDark ? '#ccc' : '#333') }}>
                              {m.name}
                            </Text>
                            {sel && (
                              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                <Svg width={10} height={10} viewBox="0 0 24 24">
                                  <Path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                </Svg>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* ── Doc type toggle (if both) ── */}
                  {scanResult?.doc_type === 'both' && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['medication', 'vaccine'] as const).map(t => (
                        <TouchableOpacity key={t} onPress={() => setReviewDocType(t)}
                          style={{
                            flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
                            backgroundColor: reviewDocType === t
                              ? (t === 'vaccine' ? BRAND.teal : BRAND.purple)
                              : (isDark ? '#1E1E2E' : '#F3F4F6'),
                          }}>
                          <Text style={{ fontWeight: '800', fontSize: 12, textTransform: 'uppercase',
                            color: reviewDocType === t ? '#fff' : (isDark ? '#888' : '#666') }}>
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* ── Divider ── */}
                  <View style={{ height: 1, backgroundColor: isDark ? '#222' : '#EBEBEB' }} />

                  {/* ── Medication fields ── */}
                  {reviewDocType === 'medication' && reviewMed && (
                    <View style={{ gap: 12 }}>
                      {([
                        ['Medication name *', 'name'],
                        ['Dosage', 'dosage'],
                        ['Frequency', 'frequency'],
                        ['Duration', 'duration'],
                        ['Instructions', 'instructions'],
                        ['Prescribing doctor', 'prescriber'],
                        ['Pharmacy', 'pharmacy'],
                        ['Notes', 'notes'],
                      ] as [string, keyof ParsedMedication][]).map(([label, field]) => (
                        <View key={field}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#666' : '#999', marginBottom: 4, letterSpacing: 0.4 }}>
                            {label.toUpperCase()}
                          </Text>
                          <TextInput
                            value={String(reviewMed[field] ?? '')}
                            onChangeText={v => setReviewMed(prev => prev ? { ...prev, [field]: v } : prev)}
                            placeholder={`—`}
                            placeholderTextColor={isDark ? '#444' : '#ccc'}
                            style={{
                              borderWidth: 1.5,
                              borderColor: field === 'name' && !reviewMed.name
                                ? BRAND.rose + '80'
                                : (isDark ? '#2A2A3E' : '#E5E7EB'),
                              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
                              color: isDark ? '#fff' : '#111',
                              backgroundColor: isDark ? '#1A1A2E' : '#fff',
                              fontSize: 14, fontWeight: '500',
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  )}

                  {/* ── Vaccine fields ── */}
                  {reviewDocType === 'vaccine' && reviewVax && (
                    <View style={{ gap: 12 }}>
                      {([
                        ['Vaccine name *', 'vaccine_name'],
                        ['Manufacturer', 'manufacturer'],
                        ['Lot number', 'lot_number'],
                        ['Date administered (YYYY-MM-DD)', 'administered_date'],
                        ['Next due date (YYYY-MM-DD)', 'next_due_date'],
                        ['Dose #', 'dose_number'],
                        ['Total doses', 'total_doses'],
                        ['Administered by', 'administered_by'],
                        ['Site (e.g. Left arm)', 'site'],
                      ] as [string, keyof ParsedVaccine][]).map(([label, field]) => (
                        <View key={field}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#666' : '#999', marginBottom: 4, letterSpacing: 0.4 }}>
                            {label.toUpperCase()}
                          </Text>
                          <TextInput
                            value={reviewVax[field] != null ? String(reviewVax[field]) : ''}
                            onChangeText={v => setReviewVax(prev => prev ? { ...prev, [field]: v || null } : prev)}
                            placeholder="—"
                            placeholderTextColor={isDark ? '#444' : '#ccc'}
                            keyboardType={['dose_number', 'total_doses'].includes(field as string) ? 'numeric' : 'default'}
                            style={{
                              borderWidth: 1.5,
                              borderColor: field === 'vaccine_name' && !reviewVax.vaccine_name
                                ? BRAND.rose + '80'
                                : (isDark ? '#2A2A3E' : '#E5E7EB'),
                              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
                              color: isDark ? '#fff' : '#111',
                              backgroundColor: isDark ? '#1A1A2E' : '#fff',
                              fontSize: 14, fontWeight: '500',
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  )}

                  {/* ── Save / Discard ── */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity onPress={closeScanSheet}
                      style={{
                        flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center',
                        backgroundColor: isDark ? '#1E1E2E' : '#F3F4F6',
                        borderWidth: 1, borderColor: isDark ? '#333' : '#E5E7EB',
                      }}>
                      <Text style={{ fontWeight: '800', fontSize: 14, color: isDark ? '#aaa' : '#666' }}>Discard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={rxSaving || !reviewMemberId}
                      onPress={async () => {
                        try {
                          if (reviewDocType === 'medication') await saveScannedMed();
                          else await saveScannedVax();
                          closeScanSheet();
                        } catch { /* error already shown via Alert */ }
                      }}
                      style={{
                        flex: 2, paddingVertical: 15, borderRadius: 16, alignItems: 'center',
                        backgroundColor: !reviewMemberId || rxSaving
                          ? (isDark ? '#333' : '#E5E7EB')
                          : (reviewDocType === 'vaccine' ? BRAND.teal : BRAND.purple),
                      }}>
                      {rxSaving
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={{
                            fontWeight: '900', fontSize: 14,
                            color: !reviewMemberId ? (isDark ? '#666' : '#aaa') : '#fff',
                          }}>
                            Save {reviewDocType === 'vaccine' ? 'Vaccine' : 'Medication'}
                          </Text>}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
        )}

      </Modal>

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

