import { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Keyboard, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check, Calendar } from 'lucide-react-native';
import { BRAND } from '../shared';
import {
  VaxForm, BLANK_VAX, VAX_TYPES, VAX_SUGGESTIONS,
  fmtDate, fmtDateDisplay, aStyles,
} from './types';

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
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Log Vaccine</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                  Immunization record · {form.vaccine_type || 'all types'}
                </Text>
              </View>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 8, gap: 18 }}>

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

              {/* Notes */}
              <View>
                <Text style={[aStyles.label, { color: colors.textSecondary }]}>Notes / Lot Number</Text>
                <TextInput value={form.notes} onChangeText={v => set('notes', v)}
                  placeholder="Reactions, lot number, clinic notes…"
                  placeholderTextColor={colors.textTertiary}
                  style={[inp, { height: 68, textAlignVertical: 'top' }]} multiline />
              </View>
            </ScrollView>

            {/* Fixed footer */}
            <View style={[aStyles.saveRow, { borderColor: colors.border }]}>
              <TouchableOpacity onPress={handleClose} style={[aStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave}
                style={[aStyles.saveBtn, { backgroundColor: BRAND.teal }]} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color={colors.textInverse} />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textInverse }}>Save Vaccine</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
