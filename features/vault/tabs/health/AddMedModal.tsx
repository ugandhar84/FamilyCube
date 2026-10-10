import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, Switch, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check, Calendar, Minus, Plus } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import FullPageOverlay from '@/components/FullPageOverlay';
import {
  MedForm, BLANK_MED, MED_SUGGESTIONS, getCatColors, FREQ_LABELS,
  fmtDate, fmtDateDisplay, formatDoseTime, aStyles, doseCountForFrequency,
} from './types';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';

// Figma flat tokens — same values established across every other converted
// module this session (HomeownerNotesScreen/SchoolScreen/HealthRecordsScreen).
// Two distinct blues per the exact Figma export: BLUE (#345DE3) is the real
// primary/action color (buttons, selected states); LINK_BLUE (#294FC7) is
// reserved for link-style text only (back-links, Cancel label).
const PAGE_BG   = '#F5F7FB';
const TITLE_CLR = '#172337';
const BODY_CLR  = '#657185';
const BLUE      = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER    = '#DFE5EF';
const CARD_BG   = '#FFFFFF';

// Same LOCAL-midnight parse as AddVaxModal's own copy — a plain
// `new Date(str)` on a YYYY-MM-DD string parses as UTC midnight, which can
// silently land on the previous day in a negative-UTC-offset timezone.
function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}

// ── Field row — label + value inside a section group card. No outer card
// of its own — fields are grouped together in SectionCard below.
function FieldRow({ label, children, isDark, colors, errColor, noBorder }: {
  label: string; children: React.ReactNode; isDark: boolean; colors: any;
  errColor?: string; noBorder?: boolean;
}) {
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  return (
    <View style={{ gap: 4, paddingVertical: 12,
      borderBottomWidth: noBorder ? 0 : 1,
      borderBottomColor: errColor ?? (isDark ? colors.border : BORDER) }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: errColor ?? bodyC, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

// ── SectionCard — radius-22 shadow card matching BringInPrescription /
// HealthFigmaList / HealthRecordsScreen. Groups related FieldRows.
function SectionCard({ children, isDark, colors }: { children: React.ReactNode; isDark: boolean; colors: any }) {
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const style = isDark
    ? { backgroundColor: cardBg, borderRadius: 22, borderWidth: 1, borderColor: border, padding: 16, gap: 0 }
    : { backgroundColor: cardBg, borderRadius: 22, padding: 16, gap: 0,
        shadowColor: '#102347', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 3 };
  return <View style={style}>{children}</View>;
}

function SectionHeading({ children, accent, isDark, colors }: { children: React.ReactNode; accent?: string; isDark: boolean; colors: any }) {
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
      {accent && <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: accent }} />}
      <Text style={{ fontSize: 16, fontWeight: '800', color: accent ?? titleC }}>{children}</Text>
    </View>
  );
}

// Keep old Field for backwards compat on any field that still uses it standalone
function Field({ label, children, isDark, colors, errColor }: {
  label: string; children: React.ReactNode; isDark: boolean; colors: any; errColor?: string;
}) {
  return (
    <View style={{
      backgroundColor: isDark ? colors.card : CARD_BG,
      borderWidth: 1, borderColor: errColor ?? (isDark ? colors.border : BORDER),
      borderRadius: 14, padding: 14, gap: 4,
    }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? colors.textSecondary : BODY_CLR }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export default function AddMedModal({ visible, onClose, onSave, members, colors, isDark, editing, lockedMemberId }: {
  visible: boolean; onClose: () => void;
  // memberId + form as before for a new record; medId passed through
  // unchanged so the caller's onSave can tell a create from an update
  // apart (undefined = create).
  onSave: (memberId: string, form: MedForm, medId?: string) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
  // Seeds the form from an existing saved medication instead of BLANK_MED
  // — same edit-in-place pattern as AddVaxModal's own `editing` prop.
  editing?: { medId?: string; memberId: string; form: MedForm; refillDate?: string | null };
  // When opened from the person-picker landing page (HealthPeoplePage.tsx
  // → HealthRecordsScreen's initialMemberId), the member is already known
  // — showing the avatar-picker row again is redundant [live-requested:
  // "we dont need the selector pill as we are going to that person card
  // from landing page"]. Pre-selects this member and replaces the picker
  // with a plain read-only "For <Name>" line. Ignored while editing an
  // existing record (editing.memberId already determines who it's for).
  lockedMemberId?: string;
}) {
  const [form, setForm]               = useState<MedForm>(BLANK_MED);
  const [selectedMember, setSelectedMember] = useState(lockedMemberId ?? members[0]?.id ?? '');
  // Was a plain `saving` state with no synchronous check at all before
  // proceeding — a fast double-tap on Save could fire onSave twice,
  // creating a duplicate medication record [live-requested app-wide:
  // "We should avoid double tab submit for all the app wide"].
  const { submitting: saving, guard } = useSubmitGuard();
  const [showRefillPicker, setShowRefillPicker] = useState(false);
  const [refillDate, setRefillDate]   = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker]     = useState(false);
  // Which reminder_times INDEX is currently showing its picker — null when
  // none is open. Was a plain boolean when there was only ever one
  // reminder time; now needs to track which of potentially several
  // (twice_daily = 2) dose times the user tapped.
  const [showTimePickerIdx, setShowTimePickerIdx] = useState<number | null>(null);
  const [globalSuggestions, setGlobalSuggestions] = useState<{ name: string; hint: string; category: string }[]>([]);
  const [touched, setTouched]         = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Load global suggestions once when the page opens
  useEffect(() => {
    if (!visible) return;
    supabase.from('global_med_suggestions')
      .select('name, hint, category')
      .order('use_count', { ascending: false })
      .limit(100)
      .then(({ data }) => { if (data) setGlobalSuggestions(data as any); });
  }, [visible]);

  // Seed from `editing` every time the page opens with one, instead of
  // BLANK_MED — mirrors BLANK_MED's own field set exactly so nothing is
  // silently dropped switching between add and edit.
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setForm(editing.form);
      setSelectedMember(editing.memberId);
      setRefillDate(editing.refillDate ? parseLocalDateStr(editing.refillDate) : null);
    } else {
      setForm(BLANK_MED);
      setSelectedMember(lockedMemberId ?? members[0]?.id ?? '');
      setRefillDate(null);
    }
  }, [visible, editing, lockedMemberId]);

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

  // Derived validation errors.
  const medErrors = useMemo(() => ({
    name:   !form.name.trim()   ? 'Medication name is required' : '',
    dosage: !form.dosage.trim() ? 'Dosage amount is required'   : '',
    member: !selectedMember     ? 'Select a family member'      : '',
  }), [form.name, form.dosage, selectedMember]);

  const showErr = (k: keyof typeof medErrors) =>
    !!(medErrors[k] && (touched[k] || submitAttempted));

  const reset = () => {
    setForm(BLANK_MED); setRefillDate(null);
    setShowRefillPicker(false);
    setShowStartPicker(false); setShowEndPicker(false); setShowTimePickerIdx(null);
    setTouched({}); setSubmitAttempted(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = guard(async () => {
    setSubmitAttempted(true);
    if (medErrors.name || medErrors.dosage || medErrors.member) {
      setTouched(t => ({ ...t, name: true, dosage: true, member: true }));
      return;
    }
    await onSave(selectedMember, { ...form, refill_date: refillDate ? fmtDate(refillDate) : '' }, editing?.medId);
    reset();
    onClose();
  });

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
    return merged.filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q).slice(0, 6);
  }, [form.category, form.name, globalSuggestions]);

  const inp = [
    aStyles.inp,
    { paddingHorizontal: 0, paddingVertical: 0, borderWidth: 0,
      fontSize: 16, fontWeight: '600' as const, color: isDark ? colors.textPrimary : TITLE_CLR },
  ];

  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const linkC  = isDark ? BLUE : LINK_BLUE;
  const pageBg = isDark ? colors.background : PAGE_BG;
  const cardBg = isDark ? colors.card : CARD_BG;
  const border = isDark ? colors.border : BORDER;
  const privacyBg = colors.tealLight;

  const activeMember = members.find(m => m.id === selectedMember);

  // Full single-page Figma form — was a 4-step wizard (category→name→
  // member, then dosage/frequency/schedule, then prescriber/supply, then
  // escalation), now one continuous scroll matching the exact mockup
  // structure ("Medication details" → "Name matches" → "Dosage & routine"
  // → "Dates & source" → privacy footer → Save/Cancel), per: "pickup this
  // add medications and build exactly same + if any additional are there
  // in existing add them too in this page". Every field from the old
  // wizard is still here — pharmacy/instructions/escalation/ring-like-a-
  // call didn't appear in the mockup's screenshot crop but are real
  // existing features, kept and folded into the closest matching section
  // rather than dropped.
  return (
    <FullPageOverlay visible={visible} onDismiss={handleClose} zIndex={60}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: pageBg }}>
        <View style={{ flex: 1 }}>
          {/* ── Header — pinned, matches the mockup exactly: eyebrow row,
              back-link, title, "<member> · private record draft" pill,
              disclaimer line. ── */}
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: bodyC, textTransform: 'uppercase' }}>
                Family Cube
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: linkC }}>
                {activeMember?.name ?? 'Member'} · Record owner
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: linkC }}>‹ Health records</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 4, lineHeight: 36 }}>
              {editing ? 'Edit medication' : 'Add medication'}
            </Text>
          </View>

          <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 24, paddingTop: 12, paddingBottom: 8, gap: 14 }}>

            {/* Draft pill + disclaimer */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ backgroundColor: colors.primaryLight, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.primary : BLUE }}>
                  {activeMember?.name ?? 'Member'} · private record draft
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC, marginTop: -6, lineHeight: 18 }}>
              Enter only what you've confirmed with a clinician or prescription label — this form does not offer treatment advice.
            </Text>

            {/* ── Medication details ── */}
            <SectionHeading isDark={isDark} colors={colors} accent={colors.pink}>Medication details</SectionHeading>

            <SectionCard isDark={isDark} colors={colors}>
              {/* Member / record owner */}
              {lockedMemberId && !editing ? (
                <FieldRow label="Record owner" isDark={isDark} colors={colors}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? colors.textPrimary : TITLE_CLR }}>
                    {members.find(m => m.id === lockedMemberId)?.name ?? 'Member'}
                  </Text>
                </FieldRow>
              ) : (
                <FieldRow label="Who is this for?" isDark={isDark} colors={colors} errColor={showErr('member') ? colors.danger : undefined}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: 'row', gap: 14, paddingTop: 8 }}>
                    {members.map(m => {
                      const sel = selectedMember === m.id;
                      const mc = m.role === 'parent' ? colors.teal : m.role === 'senior' ? colors.pink : colors.amber;
                      return (
                        <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 4 }}
                          onPress={() => { setSelectedMember(m.id); touch('member'); }}>
                          <View style={{
                            width: 44, height: 44, borderRadius: 22,
                            backgroundColor: sel ? mc + '20' : (isDark ? colors.surface : PAGE_BG),
                            borderWidth: sel ? 2.5 : 0, borderColor: mc,
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Text style={{ fontSize: 17, fontWeight: '900', color: sel ? mc : colors.textSecondary }}>
                              {m.name.charAt(0).toUpperCase()}
                            </Text>
                            {sel && (
                              <View style={{ position: 'absolute', bottom: -2, right: -2,
                                width: 15, height: 15, borderRadius: 8,
                                backgroundColor: mc, alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={8} color="#FFF" />
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: sel ? mc : colors.textTertiary }} numberOfLines={1}>
                            {m.name.split(' ')[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {showErr('member') && (
                    <Text style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>{medErrors.member}</Text>
                  )}
                </FieldRow>
              )}

              {/* Category */}
              <FieldRow label="Category" isDark={isDark} colors={colors}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {Object.entries(catColors).map(([cat, color]) => {
                      const active = form.category === cat;
                      return (
                        <TouchableOpacity key={cat} onPress={() => { set('category', cat); set('name', ''); }}
                          style={{
                            borderRadius: 100, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6,
                            backgroundColor: active ? color + '18' : 'transparent',
                            borderColor: active ? color : border,
                          }}>
                          <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', textTransform: 'capitalize',
                            color: active ? color : bodyC }}>{cat}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </FieldRow>

              {/* Medication name */}
              <FieldRow label="Medication name *" isDark={isDark} colors={colors}
                errColor={showErr('name') ? colors.danger : undefined} noBorder>
                <TextInput value={form.name} onChangeText={v => set('name', v)}
                  onBlur={() => touch('name')}
                  placeholder={MED_SUGGESTIONS[form.category]?.[0]?.name ?? 'e.g. Aspirin'}
                  placeholderTextColor={colors.textTertiary}
                  style={inp} />
                {showErr('name') && (
                  <Text style={{ fontSize: 11, color: colors.danger, marginTop: 2 }}>{medErrors.name}</Text>
                )}
              </FieldRow>
            </SectionCard>

            {/* ── Name matches — real autocomplete (global_med_suggestions +
                built-in MED_SUGGESTIONS, filtered by category + typed text),
                restyled as radio rows per the mockup. Only shown once
                there's something to suggest, never fabricated. ── */}
            {suggestions.length > 0 && (
              <View style={{ backgroundColor: colors.primaryLight, borderRadius: 22, padding: 16, gap: 10 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: titleC }}>Name matches</Text>
                {suggestions.map((s, i) => {
                  const sel = form.name.trim().toLowerCase() === s.name.toLowerCase();
                  return (
                    <TouchableOpacity key={i} onPress={() => set('name', s.name)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                        backgroundColor: sel ? (isDark ? colors.card : '#FFFFFF') : (isDark ? colors.card + 'AA' : '#FFFFFF'),
                        borderRadius: 14, padding: 12 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.8,
                        borderColor: sel ? BLUE : bodyC, alignItems: 'center', justifyContent: 'center' }}>
                        {sel && <Check size={12} color={BLUE} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: titleC }}>{s.name}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC, marginTop: 1 }}>
                          {s.hint} · {i === 0 ? 'matches your typed name' : 'another name match'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18 }}>
                  Names narrow with category. Autocomplete identifies names; it does not recommend a medicine or dose.
                </Text>
              </View>
            )}

            {/* ── Dosage & routine ── */}
            <SectionHeading isDark={isDark} colors={colors} accent={colors.teal}>Dosage & routine</SectionHeading>

            <SectionCard isDark={isDark} colors={colors}>
              <FieldRow label="Dosage / unit" isDark={isDark} colors={colors} errColor={showErr('dosage') ? colors.danger : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 }}>
                  <TextInput value={form.dosage} onChangeText={v => set('dosage', v)}
                    onBlur={() => touch('dosage')}
                    placeholder="10" keyboardType="decimal-pad"
                    placeholderTextColor={colors.textTertiary}
                    style={[inp, { flex: 0, minWidth: 60 }]} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {['mg', 'ml', 'tablet', 'capsule', 'drop', 'puff', 'micrograms'].map(unit => (
                        <TouchableOpacity key={unit} onPress={() => set('dosage_unit', unit)}
                          style={{ borderRadius: 100, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 5,
                            borderColor: form.dosage_unit === unit ? catColor : border,
                            backgroundColor: form.dosage_unit === unit ? catColor + '15' : 'transparent' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700',
                            color: form.dosage_unit === unit ? catColor : bodyC }}>{unit}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                {showErr('dosage') && (
                  <Text style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>{medErrors.dosage}</Text>
                )}
              </FieldRow>

              <FieldRow label="Frequency" isDark={isDark} colors={colors}>
                {/* Base frequency type */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {[
                    { k: 'daily',     v: 'Daily' },
                    { k: 'weekly',    v: 'Weekly' },
                    { k: 'biweekly',  v: 'Every 2 wks' },
                    { k: 'monthly',   v: 'Monthly' },
                    { k: 'as_needed', v: 'As Needed' },
                  ].map(({ k, v }) => {
                    const isDaily = ['daily','twice_daily','three_daily','four_daily'].includes(form.frequency);
                    const sel = k === 'daily' ? isDaily : form.frequency === k;
                    return (
                      <TouchableOpacity key={k} onPress={() => setFrequency(k)}
                        style={{ borderRadius: 100, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6,
                          borderColor: sel ? catColor : border,
                          backgroundColor: sel ? catColor + '15' : 'transparent' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? catColor : bodyC }}>{v}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* Times-per-day stepper — shown when base is "Daily" */}
                {['daily','twice_daily','three_daily','four_daily'].includes(form.frequency) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: border,
                    paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }}>Times per day</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <TouchableOpacity
                        disabled={doseCountForFrequency(form.frequency) <= 1}
                        onPress={() => {
                          const cur = doseCountForFrequency(form.frequency);
                          const next = Math.max(1, cur - 1);
                          setFrequency(next === 1 ? 'daily' : next === 2 ? 'twice_daily' : next === 3 ? 'three_daily' : 'four_daily');
                        }}
                        style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: catColor + '18',
                          alignItems: 'center', justifyContent: 'center',
                          opacity: doseCountForFrequency(form.frequency) <= 1 ? 0.4 : 1 }}>
                        <Minus size={15} color={catColor} />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: titleC, minWidth: 20, textAlign: 'center' }}>
                        {doseCountForFrequency(form.frequency)}
                      </Text>
                      <TouchableOpacity
                        disabled={doseCountForFrequency(form.frequency) >= 4}
                        onPress={() => {
                          const cur = doseCountForFrequency(form.frequency);
                          const next = Math.min(4, cur + 1);
                          setFrequency(next === 1 ? 'daily' : next === 2 ? 'twice_daily' : next === 3 ? 'three_daily' : 'four_daily');
                        }}
                        style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: catColor + '18',
                          alignItems: 'center', justifyContent: 'center',
                          opacity: doseCountForFrequency(form.frequency) >= 4 ? 0.4 : 1 }}>
                        <Plus size={15} color={catColor} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {/* Weekday picker — only for weekly / biweekly */}
                {(form.frequency === 'weekly' || form.frequency === 'biweekly') && (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: bodyC }}>Which day(s)</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, idx) => {
                        const sel = form.frequency_days.includes(idx);
                        return (
                          <TouchableOpacity key={day}
                            onPress={() => setForm(f => ({
                              ...f,
                              frequency_days: sel
                                ? f.frequency_days.filter(d => d !== idx)
                                : [...f.frequency_days, idx].sort(),
                            }))}
                            style={{ borderRadius: 100, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5,
                              borderColor: sel ? catColor : border,
                              backgroundColor: sel ? catColor + '18' : 'transparent' }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? catColor : bodyC }}>{day}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </FieldRow>

              {/* Time — one button per dose (twice_daily = 2), 12h display */}
              <FieldRow label={form.reminder_times.length > 1 ? 'Dose times' : 'Reminder time'} isDark={isDark} colors={colors} noBorder>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  {form.reminder_times.map((time, idx) => (
                    <TouchableOpacity key={idx} onPress={() => setShowTimePickerIdx(idx)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1,
                        borderColor: showTimePickerIdx === idx ? catColor : border,
                        backgroundColor: showTimePickerIdx === idx ? catColor + '10' : 'transparent',
                        paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Calendar size={13} color={showTimePickerIdx === idx ? catColor : colors.textTertiary} />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: showTimePickerIdx === idx ? catColor : titleC }}>
                        {form.reminder_times.length > 1 ? `Dose ${idx + 1} · ${formatDoseTime(time)}` : formatDoseTime(time)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
            </SectionCard>
            {showTimePickerIdx !== null && (
              <Modal transparent animationType="fade" visible onRequestClose={() => setShowTimePickerIdx(null)}>
                <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowTimePickerIdx(null)}>
                  <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: cardBg }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: titleC }}>
                        {form.reminder_times.length > 1 ? `Dose ${showTimePickerIdx + 1} Time` : 'Reminder Time'}
                      </Text>
                      <TouchableOpacity onPress={() => setShowTimePickerIdx(null)}>
                        <Text style={{ color: BLUE, fontWeight: '900', fontSize: 15 }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={(() => { const [h, m] = form.reminder_times[showTimePickerIdx].split(':').map(Number); const d = new Date(); d.setHours(h || 8, m || 0, 0, 0); return d; })()}
                      mode="time" display="spinner"
                      onChange={(_, d) => { if (d) setReminderTime(showTimePickerIdx, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); }}
                      textColor={titleC} style={{ height: 180, width: '100%' }}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}

            {/* Ring-like-a-call toggle — kept between Dosage & Dates, same section boundary */}
            <TouchableOpacity onPress={() => setForm(f => ({ ...f, alert_call: !f.alert_call }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1,
                borderColor: form.alert_call ? catColor : border,
                backgroundColor: form.alert_call ? catColor + '10' : (isDark ? colors.card : CARD_BG), padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: form.alert_call ? catColor : titleC }}>Ring like a call</Text>
                <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>A loud ringing alert instead of a normal notification</Text>
              </View>
              <Switch value={form.alert_call} onValueChange={v => setForm(f => ({ ...f, alert_call: v }))}
                trackColor={{ false: border, true: catColor + '80' }}
                thumbColor={form.alert_call ? catColor : colors.textTertiary} />
            </TouchableOpacity>

            {/* ── Dates & source ── */}
            <SectionHeading isDark={isDark} colors={colors} accent={colors.amber}>Dates & source</SectionHeading>

            <SectionCard isDark={isDark} colors={colors}>
              <FieldRow label="Start date" isDark={isDark} colors={colors}>
              <TouchableOpacity onPress={() => setShowStartPicker(p => !p)}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: titleC, paddingTop: 4 }}>
                  {fmtDateDisplay(new Date(form.start_date + 'T00:00:00'))}
                </Text>
              </TouchableOpacity>
            </FieldRow>
            {showStartPicker && (
              <Modal transparent animationType="fade" visible onRequestClose={() => setShowStartPicker(false)}>
                <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowStartPicker(false)}>
                  <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: cardBg }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: titleC }}>Start Date</Text>
                      <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                        <Text style={{ color: BLUE, fontWeight: '900', fontSize: 15 }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={new Date(form.start_date + 'T00:00:00')} mode="date" display="spinner"
                      onChange={(_, d) => { if (d) set('start_date', fmtDate(d)); }}
                      textColor={titleC} style={{ height: 180, width: '100%' }}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}

              <FieldRow label="End date · optional" isDark={isDark} colors={colors}>
                <TouchableOpacity onPress={() => setShowEndPicker(p => !p)}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: form.end_date ? titleC : colors.textTertiary, paddingTop: 4 }}>
                    {form.end_date ? fmtDateDisplay(new Date(form.end_date + 'T00:00:00')) : 'No end date'}
                  </Text>
                </TouchableOpacity>
              </FieldRow>
            {showEndPicker && (
              <Modal transparent animationType="fade" visible onRequestClose={() => setShowEndPicker(false)}>
                <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowEndPicker(false)}>
                  <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: cardBg }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: titleC }}>End Date</Text>
                      <View style={{ flexDirection: 'row', gap: 16 }}>
                        {!!form.end_date && (
                          <TouchableOpacity onPress={() => { set('end_date', ''); setShowEndPicker(false); }}>
                            <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 15 }}>Clear</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                          <Text style={{ color: BLUE, fontWeight: '900', fontSize: 15 }}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <DateTimePicker
                      value={form.end_date ? new Date(form.end_date + 'T00:00:00') : new Date(form.start_date + 'T00:00:00')}
                      mode="date" display="spinner"
                      onChange={(_, d) => { if (d) set('end_date', fmtDate(d)); }}
                      textColor={titleC} style={{ height: 180, width: '100%' }}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}

              <FieldRow label="Refill date" isDark={isDark} colors={colors}>
                <TouchableOpacity onPress={() => setShowRefillPicker(p => !p)}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: refillDate ? titleC : colors.textTertiary, paddingTop: 4 }}>
                    {refillDate ? fmtDateDisplay(refillDate) : 'No refill date'}
                  </Text>
                </TouchableOpacity>
              </FieldRow>
            {showRefillPicker && (
              <Modal transparent animationType="fade" visible onRequestClose={() => setShowRefillPicker(false)}>
                <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowRefillPicker(false)}>
                  <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: cardBg }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: titleC }}>Refill Date</Text>
                      <TouchableOpacity onPress={() => setShowRefillPicker(false)}>
                        <Text style={{ color: BLUE, fontWeight: '900', fontSize: 15 }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={refillDate ?? new Date()} mode="date" display="spinner"
                      onChange={(_, d) => { if (d) setRefillDate(d); }}
                      textColor={titleC} style={{ height: 180, width: '100%' }}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}

              <FieldRow label="Doctor" isDark={isDark} colors={colors}>
                <TextInput value={form.prescribing_doctor} onChangeText={v => set('prescribing_doctor', v)}
                  placeholder="Dr. Smith" placeholderTextColor={colors.textTertiary} style={inp} />
              </FieldRow>

              <FieldRow label="Pharmacy" isDark={isDark} colors={colors}>
                <TextInput value={form.pharmacy} onChangeText={v => set('pharmacy', v)}
                  placeholder="CVS / Walgreens" placeholderTextColor={colors.textTertiary} style={inp} />
              </FieldRow>

              <FieldRow label="Pills left" isDark={isDark} colors={colors}>
                <TextInput value={form.pills_remaining} onChangeText={v => set('pills_remaining', v)}
                  placeholder="30" keyboardType="numeric"
                  placeholderTextColor={colors.textTertiary} style={inp} />
              </FieldRow>

              <FieldRow label="Source / verification" isDark={isDark} colors={colors}>
                <TextInput value={form.source_note} onChangeText={v => set('source_note', v)}
                  placeholder="e.g. Prescription label, pharmacist, clinician note"
                  placeholderTextColor={colors.textTertiary} style={inp} />
              </FieldRow>

              <FieldRow label="Special instructions" isDark={isDark} colors={colors} noBorder>
                <TextInput value={form.instructions} onChangeText={v => set('instructions', v)}
                  placeholder="Take with food, avoid grapefruit…"
                  placeholderTextColor={colors.textTertiary}
                  style={[inp, { minHeight: 44, textAlignVertical: 'top' }]} multiline />
              </FieldRow>
            </SectionCard>

            {/* ── Missed-dose alert ── */}
            <SectionHeading isDark={isDark} colors={colors} accent={colors.danger}>Missed-dose alert</SectionHeading>
            <View style={{ backgroundColor: form.escalation_enabled ? colors.amberLight : (isDark ? colors.card : CARD_BG),
              borderRadius: 22, borderWidth: isDark ? 1 : 0, borderColor: form.escalation_enabled ? colors.amber : border,
              shadowColor: '#102347', shadowOpacity: isDark || form.escalation_enabled ? 0 : 0.05,
              shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 2,
              padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>Alert if not taken</Text>
                  <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>
                    Notifies assigner when dose is missed (for seniors & kids)
                  </Text>
                </View>
                <Switch
                  value={form.escalation_enabled}
                  onValueChange={v => setForm(f => ({ ...f, escalation_enabled: v }))}
                  trackColor={{ false: border, true: colors.amber + '80' }}
                  thumbColor={form.escalation_enabled ? colors.amber : colors.textTertiary}
                />
              </View>
              {form.escalation_enabled && (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[30, 60, 90, 120].map(m => (
                    <TouchableOpacity key={m} onPress={() => set('escalation_after_min', String(m))}
                      style={{ borderRadius: 100, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5,
                        borderColor: form.escalation_after_min === String(m) ? colors.amber : border,
                        backgroundColor: form.escalation_after_min === String(m) ? colors.amber + '20' : 'transparent' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700',
                        color: form.escalation_after_min === String(m) ? colors.amber : bodyC }}>
                        {m} min
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* ── Privacy footer ── */}
            <View style={{ backgroundColor: privacyBg, borderRadius: 22, padding: 16, gap: 4, marginTop: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.teal, textTransform: 'uppercase' }}>
                Private · {activeMember?.name ?? 'Member'}'s health
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? colors.textPrimary : '#1D3B2E' }}>
                Shared with your family
              </Text>
              <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : '#3E5A4D' }}>
                Kids, teens and seniors only ever see their own medications and vaccines.
              </Text>
            </View>

            {/* ── Actions — scroll with the rest of the page content, not a
                sticky/pinned footer [live-requested: "no more sticky
                footer buttons"]. ── */}
            <View style={{ gap: 10, marginTop: 4, paddingBottom: insets.bottom + 8 }}>
              <TouchableOpacity onPress={handleSave}
                style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: BLUE }}
                disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                      {editing ? 'Save medication changes' : 'Save medication'}
                    </Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: linkC }}>
                  Cancel · back to medications
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </FullPageOverlay>
  );
}
