/**
 * KioskAddVaxForm — kiosk-native replacement for AddVaxModal.tsx's own
 * phone-styled bottom sheet, same rationale as KioskAddMedForm.tsx's own
 * header comment: one scrolling KioskFormDrawer instead of AddVaxModal's
 * 3-step wizard, every real field kept (name+suggestions, vaccine type,
 * member, admin/next-due dates, dose series current/total, administered
 * by/location, notes), real save logic (KioskHealthTab.tsx's addVax,
 * already verified to match HealthTab.tsx's own addVax with no missing
 * side effects) unchanged.
 *
 * Date pickers use KioskDateTimePicker (kiosk-only), not the shared
 * PickerOverlay — see KioskAddMedForm.tsx's own header for the full
 * rationale (PickerOverlay is shared by ~9 real mobile screens, and the
 * user was explicit about not touching any mobile file).
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { Syringe, Calendar } from 'lucide-react-native';
import MemberPicker from '@/features/calendar/components/eventForm/MemberPicker';
import { KioskDateTimePicker, openAndroidPicker } from './KioskDateTimePicker';
import { VaxForm, BLANK_VAX, VAX_TYPES, VAX_SUGGESTIONS, fmtDate, fmtDateDisplay } from '@/features/vault/tabs/health/types';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_TYPO } from '../kioskTheme';

export function KioskAddVaxForm({ visible, onClose, onSave, members, colors, isDark }: {
  visible: boolean;
  onClose: () => void;
  onSave: (memberId: string, form: VaxForm) => Promise<void>;
  members: any[];
  colors: any;
  isDark: boolean;
}) {
  const { k } = useKioskColors();
  const [form, setForm] = useState<VaxForm>(BLANK_VAX);
  const [selectedMember, setSelectedMember] = useState(members[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [adminDate, setAdminDate] = useState<Date>(new Date());
  const [nextDate, setNextDate] = useState<Date | null>(null);
  const [showAdminPick, setShowAdminPick] = useState(false);
  const [showNextPick, setShowNextPick] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(BLANK_VAX); setAdminDate(new Date()); setNextDate(null);
      setSubmitAttempted(false); setSelectedMember(members[0]?.id ?? '');
    }
  }, [visible]);

  const set = (key: keyof VaxForm, v: string) => setForm(f => ({ ...f, [key]: v }));

  const vaxErrors = useMemo(() => ({
    title: !form.title.trim() ? 'Vaccine name is required' : '',
    member: !selectedMember ? 'Select a family member' : '',
  }), [form.title, selectedMember]);
  const canSubmit = !vaxErrors.title && !vaxErrors.member;

  const suggestions = useMemo(() => {
    if (!form.title.trim()) return VAX_SUGGESTIONS.slice(0, 6);
    return VAX_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(form.title.toLowerCase())).slice(0, 6);
  }, [form.title]);

  const input = kioskInputStyle(k);

  const handleSave = async () => {
    setSubmitAttempted(true);
    if (!canSubmit) return;
    setSaving(true);
    await onSave(selectedMember, {
      ...form,
      date: fmtDate(adminDate),
      next_due_date: nextDate ? fmtDate(nextDate) : '',
    });
    setSaving(false);
    onClose();
  };

  return (
    <KioskFormDrawer
      visible={visible} title="Log Vaccine" subtitle="Same real form as the phone app"
      accent={k.sage} Icon={Syringe} k={k} onClose={onClose}
      variant="drawer"
      submitLabel="Save Vaccine" onSubmit={handleSave}
      canSubmit={canSubmit} submitting={saving}
      error={submitAttempted && !canSubmit ? (vaxErrors.title || vaxErrors.member) : null}
    >
      {/* ── Name + suggestions ── */}
      <KioskFieldLabel k={k}>VACCINE NAME</KioskFieldLabel>
      <TextInput
        value={form.title} onChangeText={v => set('title', v)}
        placeholder="e.g. Flu Shot 2025" placeholderTextColor={k.textFaint}
        style={[input, { marginBottom: KIOSK_SPACE.xs, borderColor: submitAttempted && vaxErrors.title ? k.danger : input.borderColor }]}
      />
      {suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: KIOSK_SPACE.md }}>
          <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs }}>
            {suggestions.map((s, i) => (
              <KioskPill key={i} label={s.name} selected={form.title === s.name}
                onPress={() => set('title', s.name)} accent={k.sage} k={k} />
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Vaccine type ── */}
      <KioskFieldLabel k={k}>VACCINE TYPE</KioskFieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: KIOSK_SPACE.md }}>
        <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs }}>
          {VAX_TYPES.map(t => (
            <KioskPill key={t} label={t.toUpperCase()} selected={form.vaccine_type === t}
              onPress={() => set('vaccine_type', form.vaccine_type === t ? '' : t)} accent={k.sage} k={k} />
          ))}
        </View>
      </ScrollView>

      {/* ── For member ── */}
      <MemberPicker
        label="FOR MEMBER"
        selectedIds={selectedMember ? [selectedMember] : []}
        members={members}
        onToggle={id => setSelectedMember(id)}
        colors={colors} isDark={isDark} siblings={members.map((m: any) => m.name)}
      />

      {/* ── Dates ── */}
      <KioskFieldLabel k={k}>ADMINISTRATION DATES</KioskFieldLabel>
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KIOSK_TYPO.micro, color: k.textFaint, marginBottom: 4 }}>Date Administered</Text>
          <Pressable
            onPress={() => {
              if (Platform.OS === 'android') openAndroidPicker({ mode: 'date', value: adminDate, onChange: setAdminDate });
              else setShowAdminPick(p => !p);
            }}
            style={[input, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
          >
            <Calendar size={14} color={k.textMuted} />
            <Text style={{ color: k.text, fontSize: KIOSK_TYPO.body }}>{fmtDateDisplay(adminDate)}</Text>
          </Pressable>
          {Platform.OS === 'ios' && (
            <KioskDateTimePicker mode="date" visible={showAdminPick} k={k} value={adminDate} onChange={setAdminDate} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KIOSK_TYPO.micro, color: k.textFaint, marginBottom: 4 }}>Next Due (optional)</Text>
          <Pressable
            onPress={() => {
              if (Platform.OS === 'android') openAndroidPicker({ mode: 'date', value: nextDate ?? new Date(), onChange: setNextDate });
              else setShowNextPick(p => !p);
            }}
            style={[input, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
          >
            <Calendar size={14} color={nextDate ? k.gold : k.textFaint} />
            <Text style={{ color: nextDate ? k.text : k.textFaint, fontSize: KIOSK_TYPO.body }}>
              {nextDate ? fmtDateDisplay(nextDate) : 'Pick date'}
            </Text>
          </Pressable>
          {Platform.OS === 'ios' && (
            <KioskDateTimePicker mode="date" visible={showNextPick} k={k} value={nextDate ?? new Date()} onChange={setNextDate} />
          )}
        </View>
      </View>

      {/* ── Dose series ── */}
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md }}>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>CURRENT DOSE #</KioskFieldLabel>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {['1', '2', '3', '4'].map(n => (
              <KioskPill key={n} label={n} selected={form.series_current === n}
                onPress={() => set('series_current', n)} accent={k.sage} k={k} />
            ))}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>TOTAL DOSES</KioskFieldLabel>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {['1', '2', '3', '4'].map(n => (
              <KioskPill key={n} label={n} selected={form.series_total === n}
                onPress={() => set('series_total', n)} accent={k.blue} k={k} />
            ))}
          </View>
        </View>
      </View>

      {/* ── Provider & location ── */}
      <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm }}>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>ADMINISTERED BY</KioskFieldLabel>
          <TextInput value={form.administered_by} onChangeText={v => set('administered_by', v)}
            placeholder="Dr. Name / CVS" placeholderTextColor={k.textFaint} style={input} />
        </View>
        <View style={{ flex: 1 }}>
          <KioskFieldLabel k={k}>LOCATION</KioskFieldLabel>
          <TextInput value={form.location} onChangeText={v => set('location', v)}
            placeholder="Clinic / School" placeholderTextColor={k.textFaint} style={input} />
        </View>
      </View>

      {/* ── Notes ── */}
      <KioskFieldLabel k={k}>NOTES / LOT NUMBER</KioskFieldLabel>
      <TextInput value={form.notes} onChangeText={v => set('notes', v)}
        placeholder="Reactions, lot number, clinic notes…" placeholderTextColor={k.textFaint} multiline
        style={[input, { height: 68, textAlignVertical: 'top' }]} />

    </KioskFormDrawer>
  );
}
