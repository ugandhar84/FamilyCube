import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check, Calendar } from 'lucide-react-native';
import FullPageOverlay from '@/components/FullPageOverlay';
import {
  VaxForm, BLANK_VAX, VAX_TYPES, VAX_SUGGESTIONS,
  fmtDate, fmtDateDisplay, aStyles,
} from './types';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';
import { GEMINI } from '@/constants/geminiRhythm';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception) — same shared module
// AddMedModal.tsx uses, so both forms render with identical canvas/card/
// button colors [live-requested: "use the same rythm of button colors in
// all the forms"].
const PAGE_BG   = GEMINI.canvas;
const TITLE_CLR = GEMINI.titleColor;
const BODY_CLR  = GEMINI.bodyColor;
const BLUE      = GEMINI.blue;
const LINK_BLUE = GEMINI.linkBlue;
const BORDER    = GEMINI.border;
const CARD_BG   = GEMINI.cardBg;

// A YYYY-MM-DD string (as VaxForm.date/next_due_date store it) parsed as
// LOCAL midnight, matching fmtDate/lib/dates.ts's own convention — a plain
// `new Date(str)` parses YYYY-MM-DD as UTC midnight, which can silently
// land on the previous day in a negative-UTC-offset timezone.
function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}

// ── Field row — label + value inside a section group card. Same shared
// pattern as AddMedModal.tsx's own FieldRow/SectionCard (not reused via
// import since both are local, file-scoped styling helpers there too).
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

export default function AddVaxModal({ visible, onClose, onSave, members, colors, isDark, editing, lockedMemberId }: {
  visible: boolean; onClose: () => void;
  onSave: (memberId: string, form: VaxForm, vaxId?: string) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
  editing?: { vaxId?: string; memberId: string; form: VaxForm };
  lockedMemberId?: string;
}) {
  const [form, setForm]               = useState<VaxForm>(BLANK_VAX);
  const [selectedMember, setSelectedMember] = useState(lockedMemberId ?? members[0]?.id ?? '');
  // Was a plain `saving` state with no synchronous check — a fast
  // double-tap on Save could fire onSave twice, duplicating a vaccine
  // record [live-requested app-wide: "We should avoid double tab submit
  // for all the app wide"].
  const { submitting: saving, guard } = useSubmitGuard();
  const [adminDate, setAdminDate]     = useState<Date>(new Date());
  const [nextDate, setNextDate]       = useState<Date | null>(null);
  const [showAdminPick, setShowAdminPick]   = useState(false);
  const [showNextPick, setShowNextPick]     = useState(false);

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
    setShowAdminPick(false); setShowNextPick(false);
    setVaxTouched({}); setVaxSubmitAttempted(false);
  };

  // Seed from `editing` every time the page opens with one, instead of
  // BLANK_VAX — mirrors BLANK_VAX's own field set exactly so nothing is
  // silently dropped switching between add and edit.
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setForm(editing.form);
      setSelectedMember(editing.memberId);
      setAdminDate(editing.form.date ? parseLocalDateStr(editing.form.date) : new Date());
      setNextDate(editing.form.next_due_date ? parseLocalDateStr(editing.form.next_due_date) : null);
    } else {
      setForm(BLANK_VAX);
      setSelectedMember(lockedMemberId ?? members[0]?.id ?? '');
      setAdminDate(new Date());
      setNextDate(null);
    }
  }, [visible, editing, lockedMemberId]);

  const handleClose = () => { reset(); onClose(); };

  const handleSave = guard(async () => {
    setVaxSubmitAttempted(true);
    if (vaxErrors.title || vaxErrors.member) {
      setVaxTouched(t => ({ ...t, title: true, member: true }));
      return;
    }
    await onSave(selectedMember, {
      ...form,
      date: fmtDate(adminDate),
      next_due_date: nextDate ? fmtDate(nextDate) : '',
    }, editing?.vaxId);
    reset();
    onClose();
  });

  const suggestions = useMemo(() => {
    if (!form.title.trim()) return VAX_SUGGESTIONS.slice(0, 6);
    return VAX_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(form.title.toLowerCase())).slice(0, 6);
  }, [form.title]);

  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC  = isDark ? colors.textSecondary : BODY_CLR;
  const linkC  = isDark ? BLUE : LINK_BLUE;
  const pageBg = isDark ? colors.background : PAGE_BG;
  const cardBg = isDark ? colors.card : CARD_BG;
  const border = isDark ? colors.border : BORDER;
  const privacyBg = colors.tealLight;

  const activeMember = members.find(m => m.id === selectedMember);

  const inp = [
    aStyles.inp,
    { paddingHorizontal: 0, paddingVertical: 0, borderWidth: 0,
      fontSize: 16, fontWeight: '600' as const, color: titleC },
  ];

  // Full single-page Figma form — was a 3-step wizard (basics → dates →
  // notes), now one continuous scroll matching AddMedModal.tsx's exact
  // page structure and button rhythm (same BLUE save button, same linkC
  // Cancel link) [live-requested: "we ned the flatren like medication" /
  // "use the same rythm of button colors in all the forms"]. Every field
  // from the old wizard is kept, just regrouped into section cards.
  return (
    <FullPageOverlay visible={visible} onDismiss={handleClose} zIndex={60}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: pageBg }}>
        <View style={{ flex: 1 }}>
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
              {editing ? 'Edit vaccine' : 'Log vaccine'}
            </Text>
          </View>

          <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 24, paddingTop: 12, paddingBottom: 8, gap: 14 }}>

            <View style={{ flexDirection: 'row' }}>
              <View style={{ backgroundColor: colors.primaryLight, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.primary : BLUE }}>
                  {activeMember?.name ?? 'Member'} · private record draft
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC, marginTop: -6, lineHeight: 18 }}>
              Enter only what you've confirmed with a provider or vaccination record — this form does not offer medical advice.
            </Text>

            {/* ── Vaccine details ── */}
            <SectionHeading isDark={isDark} colors={colors} accent={colors.pink}>Vaccine details</SectionHeading>

            <SectionCard isDark={isDark} colors={colors}>
              {lockedMemberId && !editing ? (
                <FieldRow label="Record owner" isDark={isDark} colors={colors}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: titleC }}>
                    {members.find(m => m.id === lockedMemberId)?.name ?? 'Member'}
                  </Text>
                </FieldRow>
              ) : (
                <FieldRow label="Who is this for?" isDark={isDark} colors={colors} errColor={showVaxErr('member') ? colors.danger : undefined}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: 'row', gap: 14, paddingTop: 8 }}>
                    {members.map(m => {
                      const sel = selectedMember === m.id;
                      const mc = m.role === 'parent' ? colors.teal : m.role === 'senior' ? colors.pink : colors.amber;
                      return (
                        <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 4 }}
                          onPress={() => { setSelectedMember(m.id); touchVax('member'); }}>
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
                  {showVaxErr('member') && (
                    <Text style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>{vaxErrors.member}</Text>
                  )}
                </FieldRow>
              )}

              {/* Vaccine type */}
              <FieldRow label="Vaccine type" isDark={isDark} colors={colors}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {VAX_TYPES.map(t => {
                      const sel = form.vaccine_type === t;
                      return (
                        <TouchableOpacity key={t} onPress={() => set('vaccine_type', sel ? '' : t)}
                          style={{
                            borderRadius: 100, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6,
                            backgroundColor: sel ? colors.teal + '18' : 'transparent',
                            borderColor: sel ? colors.teal : border,
                          }}>
                          <Text style={{ fontSize: 13, fontWeight: sel ? '700' : '500', textTransform: 'capitalize',
                            color: sel ? colors.teal : bodyC }}>{t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </FieldRow>

              {/* Vaccine name */}
              <FieldRow label="Vaccine name *" isDark={isDark} colors={colors}
                errColor={showVaxErr('title') ? colors.danger : undefined} noBorder>
                <TextInput value={form.title} onChangeText={v => set('title', v)}
                  onBlur={() => touchVax('title')}
                  placeholder="e.g. Flu Shot 2026" placeholderTextColor={colors.textTertiary}
                  style={inp} />
                {showVaxErr('title') && (
                  <Text style={{ fontSize: 11, color: colors.danger, marginTop: 2 }}>{vaxErrors.title}</Text>
                )}
              </FieldRow>
            </SectionCard>

            {/* ── Name matches — same radio-row autocomplete pattern as
                AddMedModal's "Name matches" block. ── */}
            {suggestions.length > 0 && (
              <View style={{ backgroundColor: colors.primaryLight, borderRadius: 22, padding: 16, gap: 10 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: titleC }}>Name matches</Text>
                {suggestions.map((s, i) => {
                  const sel = form.title.trim().toLowerCase() === s.name.toLowerCase();
                  return (
                    <TouchableOpacity key={i} onPress={() => set('title', s.name)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                        backgroundColor: isDark ? colors.card + 'AA' : '#FFFFFF',
                        borderRadius: 14, padding: 12 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.8,
                        borderColor: sel ? BLUE : bodyC, alignItems: 'center', justifyContent: 'center' }}>
                        {sel && <Check size={12} color={BLUE} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: titleC }}>{s.name}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC, marginTop: 1 }}>{s.hint}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Dates & series ── */}
            <SectionHeading isDark={isDark} colors={colors} accent={colors.teal}>Dates & series</SectionHeading>

            <SectionCard isDark={isDark} colors={colors}>
              <FieldRow label="Date administered *" isDark={isDark} colors={colors}>
                <TouchableOpacity onPress={() => { setShowAdminPick(p => !p); setShowNextPick(false); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                    <Calendar size={14} color={showAdminPick ? colors.teal : colors.textTertiary} />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: showAdminPick ? colors.teal : titleC }}>
                      {fmtDateDisplay(adminDate)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </FieldRow>
              {showAdminPick && (
                <Modal transparent animationType="fade" visible onRequestClose={() => setShowAdminPick(false)}>
                  <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowAdminPick(false)}>
                    <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: cardBg }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: titleC }}>Date Administered</Text>
                        <TouchableOpacity onPress={() => setShowAdminPick(false)}>
                          <Text style={{ color: BLUE, fontWeight: '900', fontSize: 15 }}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={adminDate} mode="date" display="spinner"
                        onChange={(_, d) => { if (d) setAdminDate(d); }}
                        textColor={titleC} style={{ height: 180, width: '100%' }}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </Modal>
              )}

              <FieldRow label="Next due · optional" isDark={isDark} colors={colors}>
                <TouchableOpacity onPress={() => { setShowNextPick(p => !p); setShowAdminPick(false); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                    <Calendar size={14} color={nextDate ? colors.amber : colors.textTertiary} />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: nextDate ? (showNextPick ? colors.amber : titleC) : colors.textTertiary }}>
                      {nextDate ? fmtDateDisplay(nextDate) : 'No next due date'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </FieldRow>
              {showNextPick && (
                <Modal transparent animationType="fade" visible onRequestClose={() => setShowNextPick(false)}>
                  <TouchableOpacity style={aStyles.pickerOverlay} activeOpacity={1} onPress={() => setShowNextPick(false)}>
                    <TouchableOpacity activeOpacity={1} style={[aStyles.pickerCard, { backgroundColor: cardBg }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: titleC }}>Next Due Date</Text>
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                          {!!nextDate && (
                            <TouchableOpacity onPress={() => { setNextDate(null); setShowNextPick(false); }}>
                              <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 15 }}>Clear</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => setShowNextPick(false)}>
                            <Text style={{ color: BLUE, fontWeight: '900', fontSize: 15 }}>Done</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <DateTimePicker
                        value={nextDate ?? new Date()} mode="date" display="spinner"
                        onChange={(_, d) => { if (d) setNextDate(d); }}
                        textColor={titleC} style={{ height: 180, width: '100%' }}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </Modal>
              )}

              <FieldRow label="Current dose #" isDark={isDark} colors={colors}>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                  {['1', '2', '3', '4'].map(n => (
                    <TouchableOpacity key={n} onPress={() => set('series_current', n)}
                      style={[aStyles.chipSmall, {
                        flex: 1, alignItems: 'center',
                        borderColor: form.series_current === n ? colors.teal : border,
                        backgroundColor: form.series_current === n ? colors.teal + '15' : 'transparent',
                      }]}>
                      <Text style={{ fontSize: 13, fontWeight: '800',
                        color: form.series_current === n ? colors.teal : bodyC }}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>

              <FieldRow label="Total doses" isDark={isDark} colors={colors} noBorder>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                  {['1', '2', '3', '4'].map(n => (
                    <TouchableOpacity key={n} onPress={() => set('series_total', n)}
                      style={[aStyles.chipSmall, {
                        flex: 1, alignItems: 'center',
                        borderColor: form.series_total === n ? colors.info : border,
                        backgroundColor: form.series_total === n ? colors.info + '15' : 'transparent',
                      }]}>
                      <Text style={{ fontSize: 13, fontWeight: '800',
                        color: form.series_total === n ? colors.info : bodyC }}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
            </SectionCard>

            {/* ── Provider & notes ── */}
            <SectionHeading isDark={isDark} colors={colors} accent={colors.amber}>Provider & notes</SectionHeading>

            <SectionCard isDark={isDark} colors={colors}>
              <FieldRow label="Administered by" isDark={isDark} colors={colors}>
                <TextInput value={form.administered_by} onChangeText={v => set('administered_by', v)}
                  placeholder="Dr. Name / CVS" placeholderTextColor={colors.textTertiary} style={inp} />
              </FieldRow>

              <FieldRow label="Location" isDark={isDark} colors={colors}>
                <TextInput value={form.location} onChangeText={v => set('location', v)}
                  placeholder="Clinic / School" placeholderTextColor={colors.textTertiary} style={inp} />
              </FieldRow>

              <FieldRow label="Notes / lot number" isDark={isDark} colors={colors} noBorder>
                <TextInput value={form.notes} onChangeText={v => set('notes', v)}
                  placeholder="Reactions, lot number, clinic notes…"
                  placeholderTextColor={colors.textTertiary}
                  style={[inp, { minHeight: 44, textAlignVertical: 'top' }]} multiline />
              </FieldRow>
            </SectionCard>

            {/* ── Privacy footer — same copy/token pattern as AddMedModal ── */}
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

            {/* ── Actions — scroll with the rest of the page, same BLUE CTA
                + linkC Cancel rhythm as AddMedModal's own footer. ── */}
            <View style={{ gap: 10, marginTop: 4, paddingBottom: insets.bottom + 8 }}>
              <TouchableOpacity onPress={handleSave}
                style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: BLUE }}
                disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                      {editing ? 'Save vaccine changes' : 'Save vaccine'}
                    </Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: linkC }}>
                  Cancel · back to vaccines
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </FullPageOverlay>
  );
}
