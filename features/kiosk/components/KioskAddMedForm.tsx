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
 * Reuses one real, already-proven-safe-inside-kiosk phone component:
 * MemberPicker (features/calendar/components/eventForm/MemberPicker.tsx,
 * already mounted by KioskQuestEditor.tsx) for the assignee row.
 *
 * Date/time pickers use KioskDateTimePicker (kiosk-only), NOT the shared
 * PickerOverlay every mobile form uses [live-reported: "forms dates are
 * using the date pickets like date time pickers inline not the bottom
 * sheet date / time pickers"] — PickerOverlay's centered floating-card
 * Modal read as a small popup/bottom-sheet rather than being embedded in
 * the form. PickerOverlay is shared by ~9 real screens app-wide and the
 * user was explicit ("i dont want to modify anything in the mobile app"),
 * so this is a separate kiosk-only component instead of changing that
 * shared one. See KioskDateTimePicker.tsx's own header for the real iOS/
 * Android platform split (inline calendar vs. native dialog) driving its
 * design — a true inline calendar view only exists on iOS.
 *
 * The real save function (KioskHealthTab.tsx's addMed) is unchanged — this
 * file only replaces AddMedModal's UI shell, not KioskHealthTab's own
 * insert/side-effect logic (family-notifier push, upsert_med_suggestion,
 * per-dose-time recurring calendar events), which already matches
 * HealthTab.tsx's real addMed verbatim.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Switch, Platform } from 'react-native';
import { Pill, Calendar, Phone } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { fmtTime } from '@/lib/dates';
import MemberPicker from '@/features/calendar/components/eventForm/MemberPicker';
import { KioskDateTimePicker, openAndroidPicker } from './KioskDateTimePicker';
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
  const { k, isDark: kioskDark } = useKioskColors();
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
  // Real "no past dates" floor — today at local midnight, so today itself
  // still selectable, only strictly-past days are blocked.
  const todayMidnight = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

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
        <Pressable
          onPress={() => {
            if (Platform.OS === 'android') {
              openAndroidPicker({ mode: 'date', value: new Date(form.start_date + 'T00:00:00'), minimumDate: todayMidnight, onChange: d => set('start_date', fmtDate(d)) });
            } else {
              setShowStartPicker(p => !p); setShowEndPicker(false);
            }
          }}
          style={[input, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
        >
          <Calendar size={14} color={k.textMuted} />
          <Text style={{ color: k.text, fontSize: KIOSK_TYPO.body }}>{fmtDateDisplay(new Date(form.start_date + 'T00:00:00'))}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (Platform.OS === 'android') {
              openAndroidPicker({ mode: 'date', value: form.end_date ? new Date(form.end_date + 'T00:00:00') : new Date(form.start_date + 'T00:00:00'), minimumDate: new Date(form.start_date + 'T00:00:00'), onChange: d => set('end_date', fmtDate(d)) });
            } else {
              setShowEndPicker(p => !p); setShowStartPicker(false);
            }
          }}
          style={[input, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
        >
          <Calendar size={14} color={form.end_date ? k.textMuted : k.textFaint} />
          <Text style={{ color: form.end_date ? k.text : k.textFaint, fontSize: KIOSK_TYPO.body }}>
            {form.end_date ? fmtDateDisplay(new Date(form.end_date + 'T00:00:00')) : 'Ongoing'}
          </Text>
        </Pressable>
      </View>
      {/* "Intelligent checks" [live-reported: "we should not show the past
          dates for the reminders start and end dates < starts date - we
          must have all sort of intellegent checks validations"] — real
          new validation beyond what AddMedModal.tsx itself enforces
          (confirmed by reading it: mobile has NO minimumDate anywhere on
          this form at all), added here since it's a genuine, low-risk
          improvement in a kiosk-only file. Start date can't be in the
          past; end date can't be before whatever start date is currently
          set — both enforced at the picker level (minimumDate, so the
          invalid dates are literally not selectable) rather than only
          after the fact. */}
      {form.end_date && form.end_date < form.start_date && (
        <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.danger, fontWeight: '700', marginBottom: KIOSK_SPACE.xs }}>
          End date can't be before the start date.
        </Text>
      )}
      {/* iOS-only inline calendars, right below the two date buttons —
          Android already opened its own native dialog above and never
          gets here (KioskDateTimePicker itself returns null on Android). */}
      <KioskDateTimePicker
        mode="date" visible={showStartPicker} k={k} isDark={kioskDark}
        value={new Date(form.start_date + 'T00:00:00')}
        minimumDate={todayMidnight}
        onChange={d => {
          set('start_date', fmtDate(d));
          // Push the end date forward too if it would now be before the
          // new start date, rather than silently leaving an invalid range.
          if (form.end_date && form.end_date < fmtDate(d)) set('end_date', fmtDate(d));
        }}
        onDone={() => setShowStartPicker(false)}
      />
      <KioskDateTimePicker
        mode="date" visible={showEndPicker} k={k} isDark={kioskDark}
        value={form.end_date ? new Date(form.end_date + 'T00:00:00') : new Date(form.start_date + 'T00:00:00')}
        minimumDate={new Date(form.start_date + 'T00:00:00')}
        onChange={d => set('end_date', fmtDate(d))}
        onDone={() => setShowEndPicker(false)}
      />
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs, flexWrap: 'wrap', marginTop: (showStartPicker || showEndPicker) && Platform.OS === 'ios' ? KIOSK_SPACE.sm : 0, marginBottom: KIOSK_SPACE.md }}>
        {form.reminder_times.map((time, idx) => (
          <KioskPill key={idx}
            label={form.reminder_times.length > 1 ? `Dose ${idx + 1} · ${fmtTime(time)}` : `Reminder · ${fmtTime(time)}`}
            selected={showTimePickerIdx === idx}
            onPress={() => {
              if (Platform.OS === 'android') {
                const [h, m] = time.split(':').map(Number);
                const d = new Date(); d.setHours(h || 8, m || 0, 0, 0);
                openAndroidPicker({ mode: 'time', value: d, onChange: nd => setReminderTime(idx, `${String(nd.getHours()).padStart(2, '0')}:${String(nd.getMinutes()).padStart(2, '0')}`) });
              } else {
                setShowTimePickerIdx(prev => prev === idx ? null : idx);
              }
            }} accent={catColor} k={k} />
        ))}
      </View>
      {Platform.OS === 'ios' && showTimePickerIdx !== null && (
        <KioskDateTimePicker
          mode="time" k={k} isDark={kioskDark}
          value={(() => {
            const [h, m] = form.reminder_times[showTimePickerIdx].split(':').map(Number);
            const d = new Date(); d.setHours(h || 8, m || 0, 0, 0); return d;
          })()}
          onChange={d => setReminderTime(showTimePickerIdx, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}
          onDone={() => setShowTimePickerIdx(null)}
        />
      )}

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
          <Pressable
            onPress={() => {
              if (Platform.OS === 'android') {
                openAndroidPicker({ mode: 'date', value: refillDate ?? new Date(), minimumDate: todayMidnight, onChange: setRefillDate });
              } else {
                setShowRefillPicker(p => !p);
              }
            }}
            style={[input, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
          >
            <Calendar size={14} color={refillDate ? k.textMuted : k.textFaint} />
            <Text style={{ color: refillDate ? k.text : k.textFaint, fontSize: KIOSK_TYPO.body }}>
              {refillDate ? fmtDateDisplay(refillDate) : 'Pick date'}
            </Text>
          </Pressable>
          {Platform.OS === 'ios' && (
            <KioskDateTimePicker mode="date" visible={showRefillPicker} k={k} isDark={kioskDark}
              value={refillDate ?? new Date()} minimumDate={todayMidnight} onChange={setRefillDate} onDone={() => setShowRefillPicker(false)} />
          )}
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

    </KioskFormDrawer>
  );
}
