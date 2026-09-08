/**
 * KioskAddMedForm — kiosk-native replacement for AddMedModal.tsx's own
 * phone-styled bottom sheet [live-reported: "add model or edit models like
 * a add groceries model type.." — matching KioskGroceryItemSheet.tsx's own
 * shell/pattern instead of the phone's stepper wizard, "all should match
 * mobile forms and corelogic"].
 *
 * Every real field AddMedModal.tsx has is here (category, name+suggestions,
 * assigned member, dosage+unit, frequency, per-dose reminder times, start/
 * end date, ring-like-a-call toggle, doctor/pharmacy, refill date, pills
 * remaining, instructions, missed-dose escalation) — none dropped, none
 * invented. The ONE deliberate structural difference: this is one scrolling
 * KioskFormDrawer, not AddMedModal's 4-step wizard (StepProgressBar/
 * StepTransition) — every other kiosk form in this codebase
 * (KioskGroceryItemSheet, KioskQuestEditor, KioskEventEditor) is a single
 * scroll, and a kiosk's own screen is large enough that a phone-width
 * step-by-step flow isn't needed the way it is on a phone's narrow sheet.
 *
 * Reuses two real, already-proven-safe-inside-kiosk phone components rather
 * than re-inventing them: MemberPicker (features/calendar/components/
 * eventForm/MemberPicker.tsx, already mounted by KioskQuestEditor.tsx) for
 * the assignee row, and PickerOverlay (features/calendar/components/
 * eventForm/PickerOverlay.tsx, already mounted by KioskEventEditor.tsx) for
 * every date/time picker — both are the same real components the phone's
 * own event/quest forms use, avoiding the native-DateTimePicker-inside-a-
 * second-Modal stacking problem KioskFormDrawer's own header comment warns
 * about.
 *
 * The real save function (KioskHealthTab.tsx's addMed) is unchanged — this
 * file only replaces AddMedModal's UI shell, not KioskHealthTab's own
 * insert/side-effect logic (family-notifier push, upsert_med_suggestion,
 * per-dose-time recurring calendar events), which already matches
 * HealthTab.tsx's real addMed verbatim.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Switch } from 'react-native';
import { Pill, Calendar, Phone } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import MemberPicker from '@/features/calendar/components/eventForm/MemberPicker';
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';
import {
  MedForm, BLANK_MED, MED_SUGGESTIONS, getCatColors, FREQ_LABELS,
  fmtDate, fmtDateDisplay, doseCountForFrequency,
} from '@/features/vault/tabs/health/types';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_TYPO } from '../kioskTheme';

export function KioskAddMedForm({ visible, onClose, onSave, members, colors, isDark }: {
  visible: boolean;
  onClose: () => void;
  onSave: (memberId: string, form: MedForm) => Promise<void>;
  members: any[];
  colors: any;
  isDark: boolean;
}) {
  const { k } = useKioskColors();
  const [form, setForm] = useState<MedForm>(BLANK_MED);
  const [selectedMember, setSelectedMember] = useState(members[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [refillDate, setRefillDate] = useState<Date | null>(null);
  const [showRefillPicker, setShowRefillPicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showTimePickerIdx, setShowTimePickerIdx] = useState<number | null>(null);
  const [globalSuggestions, setGlobalSuggestions] = useState<{ name: string; hint: string; category: string }[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Same global-suggestions load AddMedModal.tsx does on open.
  useEffect(() => {
    if (!visible) return;
    supabase.from('global_med_suggestions')
      .select('name, hint, category')
      .order('use_count', { ascending: false })
      .limit(100)
      .then(({ data }) => { if (data) setGlobalSuggestions(data as any); });
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setForm(BLANK_MED); setRefillDate(null); setSubmitAttempted(false);
      setSelectedMember(members[0]?.id ?? '');
    }
  }, [visible]);

  const set = (key: keyof MedForm, v: string) => setForm(f => ({ ...f, [key]: v }));
  const setReminderTime = (idx: number, time: string) =>
    setForm(f => ({ ...f, reminder_times: f.reminder_times.map((t, i) => i === idx ? time : t) }));
  // Same grow/shrink-without-discarding logic AddMedModal.tsx's own
  // setFrequency uses — switching TO twice_daily keeps dose 1's existing
  // time and adds a sensible +12h default for dose 2, switching away keeps
  // only dose 1's time.
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

  const medErrors = useMemo(() => ({
    name: !form.name.trim() ? 'Medication name is required' : '',
    dosage: !form.dosage.trim() ? 'Dosage amount is required' : '',
    member: !selectedMember ? 'Select a family member' : '',
  }), [form.name, form.dosage, selectedMember]);
  const canSubmit = !medErrors.name && !medErrors.dosage && !medErrors.member;

  const catColors = getCatColors(colors);
  const catColor = catColors[form.category] ?? k.danger;

  const suggestions = useMemo(() => {
    const builtIn = MED_SUGGESTIONS[form.category] ?? [];
    const global = globalSuggestions
      .filter(s => s.category === form.category)
      .map(s => ({ name: s.name, hint: s.hint ?? s.category }));
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

  const input = kioskInputStyle(k);

  const handleSave = async () => {
    setSubmitAttempted(true);
    if (!canSubmit) return;
    setSaving(true);
    await onSave(selectedMember, { ...form, refill_date: refillDate ? fmtDate(refillDate) : '' });
    setSaving(false);
    onClose();
  };

  return (
    <KioskFormDrawer
      visible={visible} title="Add Medication" subtitle="Same real form as the phone app"
      accent={catColor} Icon={Pill} k={k} onClose={onClose}
      variant="drawer"
      submitLabel="Save Medication" onSubmit={handleSave}
      canSubmit={canSubmit} submitting={saving}
      error={submitAttempted && !canSubmit ? (medErrors.name || medErrors.member || medErrors.dosage) : null}
    >
      {/* ── Category ── */}
      <KioskFieldLabel k={k}>CATEGORY</KioskFieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: KIOSK_SPACE.md }}>
        <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs }}>
          {Object.entries(catColors).map(([cat, color]) => (
            <KioskPill key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}
              selected={form.category === cat}
              onPress={() => { set('category', cat); set('name', ''); }}
              accent={color as string} k={k} />
          ))}
        </View>
      </ScrollView>

      {/* ── Name + suggestions ── */}
      <KioskFieldLabel k={k}>MEDICATION NAME</KioskFieldLabel>
      <TextInput
        value={form.name} onChangeText={v => set('name', v)}
        placeholder={MED_SUGGESTIONS[form.category]?.[0]?.name ?? 'e.g. Aspirin'}
        placeholderTextColor={k.textFaint}
        style={[input, { marginBottom: KIOSK_SPACE.xs, borderColor: submitAttempted && medErrors.name ? k.danger : input.borderColor }]}
      />
      {suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: KIOSK_SPACE.md }}>
          <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs }}>
            {suggestions.map((s, i) => (
              <KioskPill key={i} label={s.name} selected={form.name === s.name}
                onPress={() => set('name', s.name)} accent={catColor} k={k} />
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Assigned to ── */}
      <MemberPicker
        label="ASSIGNED TO"
        selectedIds={selectedMember ? [selectedMember] : []}
        members={members}
        onToggle={id => setSelectedMember(id)}
        colors={colors} isDark={isDark} siblings={members.map((m: any) => m.name)}
      />

      {/* ── Dosage + unit ── */}
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.md }}>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>DOSAGE</KioskFieldLabel>
          <TextInput value={form.dosage} onChangeText={v => set('dosage', v)}
            placeholder="10" keyboardType="decimal-pad" placeholderTextColor={k.textFaint}
            style={[input, { borderColor: submitAttempted && medErrors.dosage ? k.danger : input.borderColor }]} />
        </View>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>UNIT</KioskFieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['mg', 'ml', 'tablet', 'capsule', 'drop', 'puff'].map(unit => (
                <KioskPill key={unit} label={unit} selected={form.dosage_unit === unit}
                  onPress={() => set('dosage_unit', unit)} accent={catColor} k={k} />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* ── Frequency ── */}
      <KioskFieldLabel k={k}>FREQUENCY</KioskFieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md }}>
        {Object.entries(FREQ_LABELS).map(([key, label]) => (
          <KioskPill key={key} label={label} selected={form.frequency === key}
            onPress={() => setFrequency(key)} accent={catColor} k={k} />
        ))}
      </View>

      {/* ── Reminder schedule ── */}
      <KioskFieldLabel k={k}>REMINDER SCHEDULE</KioskFieldLabel>
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.sm }}>
        <Pressable onPress={() => setShowStartPicker(true)} style={[input, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <Calendar size={14} color={k.textMuted} />
          <Text style={{ color: k.text, fontSize: KIOSK_TYPO.body }}>{fmtDateDisplay(new Date(form.start_date + 'T00:00:00'))}</Text>
        </Pressable>
        <Pressable onPress={() => setShowEndPicker(true)} style={[input, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <Calendar size={14} color={form.end_date ? k.textMuted : k.textFaint} />
          <Text style={{ color: form.end_date ? k.text : k.textFaint, fontSize: KIOSK_TYPO.body }}>
            {form.end_date ? fmtDateDisplay(new Date(form.end_date + 'T00:00:00')) : 'Ongoing'}
          </Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs, flexWrap: 'wrap', marginBottom: KIOSK_SPACE.md }}>
        {form.reminder_times.map((time, idx) => (
          <KioskPill key={idx}
            label={form.reminder_times.length > 1 ? `Dose ${idx + 1} · ${time}` : `Reminder · ${time}`}
            selected={showTimePickerIdx === idx}
            onPress={() => setShowTimePickerIdx(idx)} accent={catColor} k={k} />
        ))}
      </View>

      {/* Ring-like-a-call toggle */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md,
        borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5, padding: KIOSK_SPACE.sm,
        borderColor: form.alert_call ? catColor : k.cardBorder,
        backgroundColor: form.alert_call ? catColor + '10' : 'transparent',
      }}>
        <Phone size={16} color={form.alert_call ? catColor : k.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '800', color: form.alert_call ? catColor : k.text }}>Ring like a call</Text>
          <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.textFaint }}>A loud ringing alert instead of a normal notification</Text>
        </View>
        <Switch value={form.alert_call} onValueChange={v => setForm(f => ({ ...f, alert_call: v }))}
          trackColor={{ false: k.cardBorder, true: catColor + '80' }} thumbColor={form.alert_call ? catColor : k.textFaint} />
      </View>

      {/* ── Prescriber & pharmacy ── */}
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm }}>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>DOCTOR</KioskFieldLabel>
          <TextInput value={form.prescribing_doctor} onChangeText={v => set('prescribing_doctor', v)}
            placeholder="Dr. Smith" placeholderTextColor={k.textFaint} style={input} />
        </View>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>PHARMACY</KioskFieldLabel>
          <TextInput value={form.pharmacy} onChangeText={v => set('pharmacy', v)}
            placeholder="CVS / Walgreens" placeholderTextColor={k.textFaint} style={input} />
        </View>
      </View>

      {/* ── Refill & supply ── */}
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.md }}>
        <View style={{ flex: 1.5 }}>
          <KioskFieldLabel k={k}>REFILL DATE</KioskFieldLabel>
          <Pressable onPress={() => setShowRefillPicker(true)} style={[input, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <Calendar size={14} color={refillDate ? k.textMuted : k.textFaint} />
            <Text style={{ color: refillDate ? k.text : k.textFaint, fontSize: KIOSK_TYPO.body }}>
              {refillDate ? fmtDateDisplay(refillDate) : 'Pick date'}
            </Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>PILLS LEFT</KioskFieldLabel>
          <TextInput value={form.pills_remaining} onChangeText={v => set('pills_remaining', v)}
            placeholder="30" keyboardType="numeric" placeholderTextColor={k.textFaint} style={input} />
        </View>
      </View>

      {/* ── Instructions ── */}
      <KioskFieldLabel k={k}>SPECIAL INSTRUCTIONS</KioskFieldLabel>
      <TextInput value={form.instructions} onChangeText={v => set('instructions', v)}
        placeholder="Take with food, avoid grapefruit…" placeholderTextColor={k.textFaint} multiline
        style={[input, { height: 72, textAlignVertical: 'top', marginBottom: KIOSK_SPACE.md }]} />

      {/* ── Missed-dose alert ── */}
      <View style={{
        borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5, padding: KIOSK_SPACE.sm,
        borderColor: form.escalation_enabled ? k.gold : k.cardBorder,
        backgroundColor: form.escalation_enabled ? k.goldSoft : 'transparent',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '800', color: k.text }}>Alert if not taken</Text>
            <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.textFaint }}>Notifies assigner when dose is missed</Text>
          </View>
          <Switch value={form.escalation_enabled} onValueChange={v => setForm(f => ({ ...f, escalation_enabled: v }))}
            trackColor={{ false: k.cardBorder, true: k.gold + '80' }} thumbColor={form.escalation_enabled ? k.gold : k.textFaint} />
        </View>
        {form.escalation_enabled && (
          <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs, marginTop: KIOSK_SPACE.sm, flexWrap: 'wrap' }}>
            {[30, 60, 90, 120].map(m => (
              <KioskPill key={m} label={`${m} min`} selected={form.escalation_after_min === String(m)}
                onPress={() => set('escalation_after_min', String(m))} accent={k.gold} k={k} />
            ))}
          </View>
        )}
      </View>

      {/* ── Date/time pickers, shared real component ── */}
      <PickerOverlay
        showDate={showStartPicker} showTime={false}
        value={new Date(form.start_date + 'T00:00:00')}
        onChangeDate={d => set('start_date', fmtDate(d))}
        onChangeTime={() => {}}
        onDone={() => setShowStartPicker(false)}
        accentColor={catColor} colors={colors} dateLabel="📅 Start Date"
      />
      <PickerOverlay
        showDate={showEndPicker} showTime={false}
        value={form.end_date ? new Date(form.end_date + 'T00:00:00') : new Date(form.start_date + 'T00:00:00')}
        onChangeDate={d => set('end_date', fmtDate(d))}
        onChangeTime={() => {}}
        onDone={() => setShowEndPicker(false)}
        accentColor={catColor} colors={colors} dateLabel="📅 End Date"
      />
      <PickerOverlay
        showDate={false} showTime={showTimePickerIdx !== null}
        value={(() => {
          if (showTimePickerIdx === null) return new Date();
          const [h, m] = form.reminder_times[showTimePickerIdx].split(':').map(Number);
          const d = new Date(); d.setHours(h || 8, m || 0, 0, 0); return d;
        })()}
        onChangeDate={() => {}}
        onChangeTime={d => {
          if (showTimePickerIdx !== null) setReminderTime(showTimePickerIdx, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        }}
        onDone={() => setShowTimePickerIdx(null)}
        accentColor={catColor} colors={colors} timeLabel="🕐 Reminder Time"
      />
      <PickerOverlay
        showDate={showRefillPicker} showTime={false}
        value={refillDate ?? new Date()}
        onChangeDate={setRefillDate}
        onChangeTime={() => {}}
        onDone={() => setShowRefillPicker(false)}
        accentColor={catColor} colors={colors} dateLabel="📅 Refill Date"
      />
    </KioskFormDrawer>
  );
}
