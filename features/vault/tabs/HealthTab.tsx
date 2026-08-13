import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  Pill, Syringe, Trash2, Check, Clock, ChevronDown, ChevronUp,
  User, Calendar, AlertCircle, X, RefreshCw, Stethoscope, Send, MessageSquare,
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
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  taken_date: string | null;
  escalation_enabled: boolean;
  escalation_after_min: number;
  escalation_to: string[];
  notes: string | null;
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

function AddMedModal({ visible, onClose, onSave, members, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSave: (memberId: string, form: MedForm) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
}) {
  const [form, setForm] = useState<MedForm>(BLANK_MED);
  const [selectedMember, setSelectedMember] = useState(members[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const set = (k: keyof MedForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.dosage.trim()) return;
    setSaving(true);
    await onSave(selectedMember, form);
    setSaving(false);
    setForm(BLANK_MED);
    onClose();
  };

  const inp = [
    aStyles.inp,
    { backgroundColor: isDark ? colors.card : '#F5F3FF', borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[aStyles.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
          {/* Header */}
          <View style={aStyles.modalHeader}>
            <Text style={[aStyles.modalTitle, { color: colors.textPrimary }]}>Add Medication</Text>
            <TouchableOpacity onPress={onClose} style={aStyles.closeBtn}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}
            showsVerticalScrollIndicator={false}>

            {/* Member selector */}
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>For Member</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                  {members.map(m => (
                    <TouchableOpacity key={m.id} onPress={() => setSelectedMember(m.id)}
                      style={[aStyles.memberChip, {
                        borderColor: selectedMember === m.id ? BRAND.purple : colors.border,
                        backgroundColor: selectedMember === m.id ? BRAND.purple + '15' : 'transparent',
                      }]}>
                      <MemberAvatar name={m.name} color={selectedMember === m.id ? BRAND.purple : colors.textSecondary} size={28} />
                      <Text style={{ fontSize: 12, fontWeight: '700',
                        color: selectedMember === m.id ? BRAND.purple : colors.textSecondary }}>
                        {m.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Name */}
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Medication Name *</Text>
              <TextInput value={form.name} onChangeText={v => set('name', v)}
                placeholder="e.g. Lisinopril" placeholderTextColor={colors.textTertiary}
                style={inp} />
            </View>

            {/* Dosage row */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Dosage *</Text>
                <TextInput value={form.dosage} onChangeText={v => set('dosage', v)}
                  placeholder="e.g. 10mg" placeholderTextColor={colors.textTertiary}
                  style={inp} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Unit</Text>
                {(['tablet', 'capsule', 'ml', 'mg', 'drop', 'puff'] as const).map((u, i, arr) =>
                  i === 0 ? (
                    <ScrollView key={u} horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'nowrap' }}>
                        {arr.map(unit => (
                          <TouchableOpacity key={unit} onPress={() => set('dosage_unit', unit)}
                            style={[aStyles.chipSmall, {
                              borderColor: form.dosage_unit === unit ? BRAND.purple : colors.border,
                              backgroundColor: form.dosage_unit === unit ? BRAND.purple + '15' : 'transparent',
                            }]}>
                            <Text style={{ fontSize: 11, fontWeight: '700',
                              color: form.dosage_unit === unit ? BRAND.purple : colors.textSecondary }}>
                              {unit}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  ) : null
                )}
              </View>
            </View>

            {/* Frequency */}
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Frequency</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(FREQ_LABELS).map(([k, v]) => (
                  <TouchableOpacity key={k} onPress={() => set('frequency', k)}
                    style={[aStyles.chipSmall, {
                      borderColor: form.frequency === k ? BRAND.teal : colors.border,
                      backgroundColor: form.frequency === k ? BRAND.teal + '15' : 'transparent',
                    }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: form.frequency === k ? BRAND.teal : colors.textSecondary }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Category */}
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.keys(CAT_COLORS).map(cat => (
                  <TouchableOpacity key={cat} onPress={() => set('category', cat)}
                    style={[aStyles.chipSmall, {
                      borderColor: form.category === cat ? CAT_COLORS[cat] : colors.border,
                      backgroundColor: form.category === cat ? CAT_COLORS[cat] + '15' : 'transparent',
                    }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'capitalize',
                      color: form.category === cat ? CAT_COLORS[cat] : colors.textSecondary }}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Doctor & Pharmacy */}
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Prescribing Doctor</Text>
              <TextInput value={form.prescribing_doctor} onChangeText={v => set('prescribing_doctor', v)}
                placeholder="Dr. Smith" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Pharmacy</Text>
              <TextInput value={form.pharmacy} onChangeText={v => set('pharmacy', v)}
                placeholder="CVS, Walgreens, …" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>

            {/* Refill & Count */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Refill Date</Text>
                <TextInput value={form.refill_date} onChangeText={v => set('refill_date', v)}
                  placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} style={inp} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Pills Remaining</Text>
                <TextInput value={form.pills_remaining} onChangeText={v => set('pills_remaining', v)}
                  placeholder="e.g. 30" keyboardType="numeric" placeholderTextColor={colors.textTertiary} style={inp} />
              </View>
            </View>

            {/* Instructions */}
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Special Instructions</Text>
              <TextInput value={form.instructions} onChangeText={v => set('instructions', v)}
                placeholder="Take with food, avoid alcohol…" placeholderTextColor={colors.textTertiary}
                style={[inp, { height: 72 }]} multiline textAlignVertical="top" />
            </View>

            {/* Escalation */}
            <View style={[aStyles.escBox, {
              borderColor: form.escalation_enabled ? BRAND.amber + '60' : colors.border,
              backgroundColor: form.escalation_enabled ? BRAND.amber + '08' : 'transparent',
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                    Alert if not taken
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                    Notifies parents/assigners when missed (grandparents, kids)
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setForm(f => ({ ...f, escalation_enabled: !f.escalation_enabled }))}
                  style={[aStyles.toggle, {
                    backgroundColor: form.escalation_enabled ? BRAND.amber : colors.border,
                  }]}>
                  <View style={[aStyles.toggleThumb, {
                    transform: [{ translateX: form.escalation_enabled ? 18 : 2 }],
                  }]} />
                </TouchableOpacity>
              </View>

              {form.escalation_enabled && (
                <View style={{ marginTop: 10 }}>
                  <Text style={[aStyles.label, { color: colors.textSecondary }]}>Alert after (minutes)</Text>
                  <TextInput value={form.escalation_after_min}
                    onChangeText={v => set('escalation_after_min', v)}
                    keyboardType="numeric" placeholder="60"
                    placeholderTextColor={colors.textTertiary}
                    style={[inp, { backgroundColor: isDark ? colors.card : '#FFFBEB', borderColor: BRAND.amber + '50' }]} />
                </View>
              )}
            </View>
          </ScrollView>

          <View style={[aStyles.saveRow, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={[aStyles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave}
              style={[aStyles.saveBtn, { backgroundColor: BRAND.purple }]} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save Medication</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add-Vaccine Modal ─────────────────────────────────────────────────────────

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
  const [form, setForm] = useState<VaxForm>(BLANK_VAX);
  const [selectedMember, setSelectedMember] = useState(members[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const set = (k: keyof VaxForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim() || !form.date.trim()) return;
    setSaving(true);
    await onSave(selectedMember, form);
    setSaving(false);
    setForm(BLANK_VAX);
    onClose();
  };

  const inp = [
    aStyles.inp,
    { backgroundColor: isDark ? colors.card : '#F5F3FF', borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[aStyles.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
          <View style={aStyles.modalHeader}>
            <Text style={[aStyles.modalTitle, { color: colors.textPrimary }]}>Log Vaccine</Text>
            <TouchableOpacity onPress={onClose} style={aStyles.closeBtn}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}
            showsVerticalScrollIndicator={false}>

            {/* Member */}
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>For Member</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                  {members.map(m => (
                    <TouchableOpacity key={m.id} onPress={() => setSelectedMember(m.id)}
                      style={[aStyles.memberChip, {
                        borderColor: selectedMember === m.id ? BRAND.teal : colors.border,
                        backgroundColor: selectedMember === m.id ? BRAND.teal + '15' : 'transparent',
                      }]}>
                      <MemberAvatar name={m.name} color={selectedMember === m.id ? BRAND.teal : colors.textSecondary} size={28} />
                      <Text style={{ fontSize: 12, fontWeight: '700',
                        color: selectedMember === m.id ? BRAND.teal : colors.textSecondary }}>
                        {m.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Vaccine Name *</Text>
              <TextInput value={form.title} onChangeText={v => set('title', v)}
                placeholder="e.g. Flu Shot 2025" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>

            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Vaccine Type</Text>
              <TextInput value={form.vaccine_type} onChangeText={v => set('vaccine_type', v)}
                placeholder="flu, covid, tdap, mmr…" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Date Administered *</Text>
                <TextInput value={form.date} onChangeText={v => set('date', v)}
                  placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} style={inp} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Next Due Date</Text>
                <TextInput value={form.next_due_date} onChangeText={v => set('next_due_date', v)}
                  placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} style={inp} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Dose # (current)</Text>
                <TextInput value={form.series_current} onChangeText={v => set('series_current', v)}
                  keyboardType="numeric" placeholder="1" placeholderTextColor={colors.textTertiary} style={inp} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Total Doses</Text>
                <TextInput value={form.series_total} onChangeText={v => set('series_total', v)}
                  keyboardType="numeric" placeholder="2" placeholderTextColor={colors.textTertiary} style={inp} />
              </View>
            </View>

            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Administered By</Text>
              <TextInput value={form.administered_by} onChangeText={v => set('administered_by', v)}
                placeholder="Dr. Name / CVS Pharmacy" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Location</Text>
              <TextInput value={form.location} onChangeText={v => set('location', v)}
                placeholder="Clinic, School, Pharmacy…" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
            <View>
              <Text style={[aStyles.label, { color: colors.textSecondary }]}>Notes</Text>
              <TextInput value={form.notes} onChangeText={v => set('notes', v)}
                placeholder="Any reactions, lot number…" placeholderTextColor={colors.textTertiary}
                style={[inp, { height: 68 }]} multiline textAlignVertical="top" />
            </View>
          </ScrollView>

          <View style={[aStyles.saveRow, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={[aStyles.cancelBtn, { borderColor: colors.border }]}>
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

  // Filters — medications
  const [medSearch, setMedSearch]         = useState('');
  const [medMemberFilter, setMedMemberFilter] = useState('all');
  const [medCatFilter, setMedCatFilter]   = useState('all');
  const [medStatusFilter, setMedStatusFilter] = useState<'all' | 'taken' | 'pending' | 'overdue'>('all');

  // Filters — vaccines
  const [vaxSearch, setVaxSearch]         = useState('');
  const [vaxMemberFilter, setVaxMemberFilter] = useState('all');
  const [vaxStatusFilter, setVaxStatusFilter] = useState<'all' | 'done' | 'pending' | 'due_soon'>('all');

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

  // Mark medication taken today
  const markTaken = async (med: Medication) => {
    const todayStr = today();
    const alreadyTaken = med.taken_date === todayStr;
    const newDate = alreadyTaken ? null : todayStr;
    const { error } = await supabase.from('family_medications')
      .update({ taken_date: newDate, updated_at: new Date().toISOString() })
      .eq('id', med.id);
    if (!error) {
      setMeds(prev => prev.map(m => m.id === med.id ? { ...m, taken_date: newDate } : m));
    }
  };

  // Toggle vaccine done
  const toggleVax = async (vax: Vaccine) => {
    const { error } = await supabase.from('family_vaccines')
      .update({ done: !vax.done, updated_at: new Date().toISOString() })
      .eq('id', vax.id);
    if (!error) {
      setVaxes(prev => prev.map(v => v.id === vax.id ? { ...v, done: !v.done } : v));
    }
  };

  const deleteMed = async (id: string) => {
    await supabase.from('family_medications').delete().eq('id', id);
    setMeds(prev => prev.filter(m => m.id !== id));
  };

  const deleteVax = async (id: string) => {
    await supabase.from('family_vaccines').delete().eq('id', id);
    setVaxes(prev => prev.filter(v => v.id !== id));
  };

  const addMed = async (memberId: string, form: MedForm) => {
    const { data } = await supabase.from('family_medications').insert({
      family_id: familyId,
      member_id: memberId,
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
      escalation_enabled: form.escalation_enabled,
      escalation_after_min: parseInt(form.escalation_after_min) || 60,
    }).select().single();
    if (data) setMeds(prev => [data as Medication, ...prev]);
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

  const memberName  = (id: string) => members.find(m => m.id === id)?.name ?? id;
  const memberColor = (id: string) => {
    const m = members.find(mb => mb.id === id);
    return m?.role === 'parent' ? BRAND.purple : m?.role === 'senior' ? BRAND.blue : BRAND.emerald;
  };

  // Filtered meds
  const filteredMeds = useMemo(() => {
    const todayStr = today();
    return meds.filter(med => {
      if (medMemberFilter !== 'all' && med.member_id !== medMemberFilter) return false;
      if (medCatFilter !== 'all' && med.category !== medCatFilter) return false;
      if (medSearch && !med.name.toLowerCase().includes(medSearch.toLowerCase())) return false;
      if (medStatusFilter === 'taken') return med.taken_date === todayStr;
      if (medStatusFilter === 'pending') return med.taken_date !== todayStr && !isOverdue(med);
      if (medStatusFilter === 'overdue') return isOverdue(med);
      return true;
    });
  }, [meds, medMemberFilter, medCatFilter, medSearch, medStatusFilter]);

  // Filtered vaxes
  const filteredVaxes = useMemo(() => {
    const now = new Date();
    return vaxes.filter(vax => {
      if (vaxMemberFilter !== 'all' && vax.member_id !== vaxMemberFilter) return false;
      if (vaxSearch && !vax.title.toLowerCase().includes(vaxSearch.toLowerCase())) return false;
      if (vaxStatusFilter === 'done') return vax.done;
      if (vaxStatusFilter === 'pending') return !vax.done;
      if (vaxStatusFilter === 'due_soon') {
        if (!vax.next_due_date) return false;
        const due = new Date(vax.next_due_date);
        return !vax.done && (due.getTime() - now.getTime()) < 30 * 24 * 3600_000; // within 30 days
      }
      return true;
    });
  }, [vaxes, vaxMemberFilter, vaxSearch, vaxStatusFilter]);

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
                  <Text style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 21 }}>
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
        {/* Card header + refresh */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardHeader
            Icon={healthTab === 'meds' ? Pill : Syringe}
            iconColor={healthTab === 'meds' ? BRAND.purple : BRAND.teal}
            title="Health Records"
            badge={healthTab === 'meds' ? `${filteredMeds.length}/${meds.length}` : `${filteredVaxes.length}/${vaxes.length}`}
            badgeColor={healthTab === 'meds' ? BRAND.purple : BRAND.teal}
            colors={colors}
          />
          <TouchableOpacity onPress={load}><RefreshCw size={14} color={colors.textTertiary} /></TouchableOpacity>
        </View>

        {/* Inner tab switcher */}
        <View style={[hf.innerTabRow, { backgroundColor: isDark ? colors.card : '#F5F3FF', borderColor: colors.border }]}>
          {([{ id: 'meds', label: 'Medications', Icon: Pill, color: BRAND.purple },
             { id: 'vax',  label: 'Immunizations', Icon: Syringe, color: BRAND.teal }] as const).map(t => (
            <TouchableOpacity key={t.id} onPress={() => setHealthTab(t.id)}
              style={[hf.innerTab, {
                backgroundColor: healthTab === t.id ? t.color : 'transparent',
                borderRadius: 10,
              }]}>
              <t.Icon size={13} color={healthTab === t.id ? '#fff' : colors.textSecondary} />
              <Text style={{ fontSize: 12, fontWeight: '800',
                color: healthTab === t.id ? '#fff' : colors.textSecondary }}>{t.label}</Text>
              <View style={[hf.tabBadge, {
                backgroundColor: healthTab === t.id ? 'rgba(255,255,255,0.3)' : colors.border,
              }]}>
                <Text style={{ fontSize: 10, fontWeight: '900',
                  color: healthTab === t.id ? '#fff' : colors.textTertiary }}>
                  {t.id === 'meds' ? meds.length : vaxes.length}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── MEDICATIONS SUB-TAB ─────────────────────── */}
        {healthTab === 'meds' && (
          <>
            {/* Search + Filters */}
            <View style={[hf.searchRow, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F5F3FF' }]}>
              <TextInput
                value={medSearch} onChangeText={setMedSearch}
                placeholder="Search medications…" placeholderTextColor={colors.textTertiary}
                style={[hf.searchInput, { color: colors.textPrimary }]}
              />
            </View>

            {/* Member filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[{ id: 'all', label: 'All Members' }, ...members.map(m => ({ id: m.id, label: m.name.split(' ')[0] }))].map(opt => {
                  const sel = medMemberFilter === opt.id;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => setMedMemberFilter(opt.id)}
                      style={[hf.filterChip, {
                        backgroundColor: sel ? BRAND.purple : 'transparent',
                        borderColor: sel ? BRAND.purple : colors.border,
                      }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700',
                        color: sel ? '#fff' : colors.textSecondary }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Status + Category filters */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {(['all', 'taken', 'pending', 'overdue'] as const).map(st => (
                <TouchableOpacity key={st} onPress={() => setMedStatusFilter(st)}
                  style={[hf.filterChip, {
                    backgroundColor: medStatusFilter === st ?
                      (st === 'overdue' ? BRAND.rose : st === 'taken' ? BRAND.emerald : BRAND.purple) : 'transparent',
                    borderColor: medStatusFilter === st ?
                      (st === 'overdue' ? BRAND.rose : st === 'taken' ? BRAND.emerald : BRAND.purple) : colors.border,
                  }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'capitalize',
                    color: medStatusFilter === st ? '#fff' : colors.textSecondary }}>{st}</Text>
                </TouchableOpacity>
              ))}
              {(['all', ...Object.keys(CAT_COLORS)] as const).map(cat => (
                <TouchableOpacity key={cat} onPress={() => setMedCatFilter(cat)}
                  style={[hf.filterChip, {
                    backgroundColor: medCatFilter === cat ? (CAT_COLORS[cat] ?? BRAND.purple) : 'transparent',
                    borderColor: medCatFilter === cat ? (CAT_COLORS[cat] ?? BRAND.purple) : colors.border,
                  }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'capitalize',
                    color: medCatFilter === cat ? '#fff' : colors.textSecondary }}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

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

        {/* ─── VACCINES SUB-TAB ─────────────────────── */}
        {healthTab === 'vax' && (
          <>
            {/* Search */}
            <View style={[hf.searchRow, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F0FDFA' }]}>
              <TextInput
                value={vaxSearch} onChangeText={setVaxSearch}
                placeholder="Search vaccines…" placeholderTextColor={colors.textTertiary}
                style={[hf.searchInput, { color: colors.textPrimary }]}
              />
            </View>

            {/* Member filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[{ id: 'all', label: 'All Members' }, ...members.map(m => ({ id: m.id, label: m.name.split(' ')[0] }))].map(opt => {
                  const sel = vaxMemberFilter === opt.id;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => setVaxMemberFilter(opt.id)}
                      style={[hf.filterChip, {
                        backgroundColor: sel ? BRAND.teal : 'transparent',
                        borderColor: sel ? BRAND.teal : colors.border,
                      }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Status filter */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {([
                { id: 'all', label: 'All', color: BRAND.teal },
                { id: 'done', label: 'Done', color: BRAND.emerald },
                { id: 'pending', label: 'Pending', color: BRAND.amber },
                { id: 'due_soon', label: 'Due Soon', color: BRAND.rose },
              ] as const).map(opt => (
                <TouchableOpacity key={opt.id} onPress={() => setVaxStatusFilter(opt.id)}
                  style={[hf.filterChip, {
                    backgroundColor: vaxStatusFilter === opt.id ? opt.color : 'transparent',
                    borderColor: vaxStatusFilter === opt.id ? opt.color : colors.border,
                  }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: vaxStatusFilter === opt.id ? '#fff' : colors.textSecondary }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

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
});

const h = StyleSheet.create({
  medCard:    { borderRadius: 16, borderWidth: 1, padding: 12, marginTop: 10 },
  pillIcon:   { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontSize: 12 },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1,
                paddingHorizontal: 10, paddingVertical: 7 },
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
  modal:       { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
                 borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB' },
  modalTitle:  { fontSize: 18, fontWeight: '900' },
  closeBtn:    { padding: 6 },
  label:       { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  inp:         { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10,
                 fontSize: 14, fontWeight: '600' },
  memberChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5,
                 paddingHorizontal: 10, paddingVertical: 6 },
  chipSmall:   { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },
  saveRow:     { flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn:   { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:     { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  escBox:      { borderRadius: 14, borderWidth: 1.5, padding: 14 },
  toggle:      { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                 shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
});

