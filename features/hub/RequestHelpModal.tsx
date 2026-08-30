/**
 * RequestHelpModal
 * 100% port of gemini-code RequestHelpModal.tsx to React Native.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { RequestType, RequestUrgency } from '@/store/kidRequestStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

// ─── Icons ───────────────────────────────────────────────────────────────────

function XIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M6,6 L18,18 M18,6 L6,18" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function HelpCircle({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M9,9 C9,6.2 15,6.2 15,9 C15,11 13,11.5 12,13" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={17} r={1} fill={color} />
    </Svg>
  );
}

function SendIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M22,2 L11,13 M22,2 L15,22 L11,13 L2,9 Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// ─── Category / Urgency maps ──────────────────────────────────────────────────

type Category = 'Homework' | 'Ride / Pickup' | 'Chore Assist' | 'Emotional / Advice' | 'General';
type Urgency  = 'High' | 'Medium' | 'Low';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'Homework',          label: '📚 Homework / Tutoring' },
  { value: 'Ride / Pickup',     label: '🚗 Ride / Pickup' },
  { value: 'Chore Assist',      label: '🧹 Chore Assist' },
  { value: 'Emotional / Advice',label: '💖 Advice / Support' },
  { value: 'General',           label: '⚡ General Request' },
];

const URGENCIES: { value: Urgency; label: string }[] = [
  { value: 'High',   label: '🔴 High (Needed ASAP)' },
  { value: 'Medium', label: '🟡 Medium (Today)' },
  { value: 'Low',    label: '🟢 Low (Sometime soon)' },
];

const CAT_TO_TYPE: Record<Category, RequestType> = {
  'Homework':           'tutor',
  'Ride / Pickup':      'ride',
  'Chore Assist':       'delegation',
  'Emotional / Advice': 'cheer',
  'General':            'question',
};

const URG_TO_STORE: Record<Urgency, RequestUrgency> = {
  'High':   'urgent',
  'Medium': 'soon',
  'Low':    'normal',
};

// ─── Compact Select ───────────────────────────────────────────────────────────

function SelectField<T extends string>({
  label, options, value, onChange, colors,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  colors: any;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <View style={{ flex: 1 }}>
      <Text style={[sf.label, { color: colors.textSecondary }]}>{label}</Text>
      <TouchableOpacity
        style={[sf.trigger, { borderColor: colors.border, backgroundColor: colors.surface }]}
        onPress={() => setOpen(o => !o)}
      >
        <Text style={[sf.triggerText, { color: colors.textPrimary }]} numberOfLines={1}>
          {selected?.label ?? '—'}
        </Text>
        <Text style={{ color: colors.textTertiary }}>▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={[sf.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {options.map(o => (
            <TouchableOpacity
              key={o.value}
              style={[sf.option, o.value === value && { backgroundColor: BRAND.purple + '18' }]}
              onPress={() => { onChange(o.value); setOpen(false); }}
            >
              <Text style={[sf.optionText, { color: o.value === value ? BRAND.purple : colors.textPrimary }]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const sf = StyleSheet.create({
  label:       { fontSize: TYPO.caption, fontWeight: '700', marginBottom: 4 },
  trigger:     { borderWidth: 1.5, borderRadius: 14, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  triggerText: { fontSize: TYPO.body, fontWeight: '600', flex: 1, marginRight: 4 },
  // Was overflow:'hidden' + elevation:10 with no iOS shadow properties at
  // all — on Android, overflow:'hidden' clips the elevation shadow right at
  // the rounded corners (looks flat-edged instead of floating), and on iOS
  // there was no shadow whatsoever (looks pasted onto the page, no depth
  // cue). Dropped overflow:'hidden' (nothing inside needs clipping — it's
  // just text rows) and added a real, modest iOS shadow to match a sane
  // elevation for a small inline dropdown.
  dropdown:    { borderWidth: 1, borderRadius: 12, marginTop: 4, position: 'absolute', top: 58, left: 0, right: 0, zIndex: 999,
                 elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8 },
  option:      { padding: 12 },
  optionText:  { fontSize: TYPO.body, fontWeight: '600' },
});

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible:     boolean;
  onClose:     () => void;
  activeMemberId: string;
}

export default function RequestHelpModal({ visible, onClose, activeMemberId }: Props) {
  const { colors } = useTheme();
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(70, 40);
  const members    = useFamilyStore(s => s.members);
  const sendRequest = useKidRequestStore(s => s.sendRequest);

  const activeMember = members.find(m => m.id === activeMemberId);
  const isAdult  = activeMember?.role === 'parent' || activeMember?.role === 'senior';
  const isSenior = activeMember?.role === 'senior';

  const kids   = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const adults = members.filter(m => m.role === 'parent' || m.role === 'senior');

  const [selectedKidId, setSelectedKidId] = useState(kids[0]?.id ?? '');
  const [title,         setTitle]         = useState('');
  const [category,      setCategory]      = useState<Category>('Homework');
  const [urgency,       setUrgency]       = useState<Urgency>('High');
  const [preferredHelper, setPreferredHelper] = useState('');   // '' = any
  const [rewardCoins,   setRewardCoins]   = useState(20);
  const [submitting,    setSubmitting]    = useState(false);

  const reset = () => {
    setTitle(''); setCategory('Homework'); setUrgency('High');
    setPreferredHelper(''); setRewardCoins(20); setSelectedKidId(kids[0]?.id ?? '');
  };

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 800));

    const requesterId = isAdult ? selectedKidId : activeMemberId;
    const reqType = CAT_TO_TYPE[category];
    const reqUrgency = URG_TO_STORE[urgency];

    let detail = title.trim();
    if (isAdult && activeMember) {
      detail = `[Logged by ${activeMember.name}] ${detail}`;
    }

    const assignedHelper = preferredHelper && preferredHelper !== 'any'
      ? preferredHelper
      : undefined;

    sendRequest({
      type:          reqType,
      fromMemberId:  requesterId,
      detail,
      urgency:       reqUrgency,
      assignedHelper,
      rewardCoins:   category === 'Homework' ? rewardCoins : 15,
      // Seniors can't self-approve Ride or Chore tasks — those need parent review
      status:        (isAdult && assignedHelper && !(isSenior && ['Ride', 'ChoreAssist'].includes(category))) ? 'approved' : 'pending',
    } as any);

    setSubmitting(false);
    reset();
    onClose();
  };

  const helperOptions = [
    { id: 'any',      name: '👥 Any Available Adult' },
    ...adults.map(a => ({ id: a.id,       name: `🎓 ${a.id === activeMemberId ? "I'll help" : a.name}` })),
    { id: 'ai-tutor', name: '🤖 AI Family Tutor' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          <View style={[m.sheet, { backgroundColor: colors.card }]}>
            {/* Header */}
            <View style={[m.header, { borderBottomColor: colors.border }]}>
              <View style={[m.iconWrap, { backgroundColor: BRAND.purple + '20' }]}>
                <HelpCircle color={BRAND.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[m.title, { color: colors.textPrimary }]}>
                  {isAdult ? 'Dispatch Help Request for Child' : 'Ask Family for Help'}
                </Text>
                <Text style={[m.subtitle, { color: colors.textSecondary }]}>
                  {isAdult
                    ? 'Assign homework tutoring, ride, or chore support for a child'
                    : 'Request parent, sibling, or grandparent assistance'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={m.closeBtn}>
                <XIcon color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: keyboardAwareMaxHeight ?? 480 }} contentContainerStyle={m.body} keyboardShouldPersistTaps="handled">
              {/* Child selector — adults only */}
              {isAdult && kids.length > 0 && (
                <View style={m.field}>
                  <Text style={[m.label, { color: colors.textSecondary }]}>Which Child Needs Help?</Text>
                  <View style={[m.pickerRow, { gap: 12 }]}>
                    {kids.map(k => {
                      const sel = selectedKidId === k.id;
                      return (
                        <TouchableOpacity key={k.id} style={{ alignItems: 'center' }} onPress={() => setSelectedKidId(k.id)}>
                          <View style={{ position: 'relative' }}>
                            <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} siblings={kids.map(x => x.name)} size={40} ringColor={sel ? BRAND.purple : colors.border} ringWidth={sel ? 2.5 : 1} bgColor={sel ? BRAND.purple + '20' : undefined} />
                            {sel && (
                              <View style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.card }}>
                                <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Description textarea */}
              <View style={m.field}>
                <Text style={[m.label, { color: colors.textSecondary }]}>
                  {isAdult ? 'Support Topic / Task Details:' : 'What do you need help with?'}
                </Text>
                <TextInput
                  style={[m.textarea, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder={isAdult
                    ? 'e.g. Needs help with 5th grade math fractions homework before 8 PM...'
                    : 'e.g. Need help solving math problem before quiz...'}
                  placeholderTextColor={colors.textTertiary}
                  value={title}
                  onChangeText={setTitle}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Category + Urgency row */}
              <View style={[m.field, { flexDirection: 'row', gap: 10, zIndex: 100 }]}>
                <SelectField
                  label="Category:"
                  options={CATEGORIES}
                  value={category}
                  onChange={setCategory}
                  colors={colors}
                />
                <SelectField
                  label="Urgency Level:"
                  options={URGENCIES}
                  value={urgency}
                  onChange={setUrgency}
                  colors={colors}
                />
              </View>

              {/* Preferred helper */}
              <View style={[m.field, { zIndex: 50 }]}>
                <SelectField
                  label={isAdult ? 'Assign Helper / Tutor:' : 'Preferred Adult / Tutor (Optional):'}
                  options={helperOptions.map(h => ({ value: h.id, label: h.name }))}
                  value={preferredHelper || 'any'}
                  onChange={v => setPreferredHelper(v === 'any' ? '' : v)}
                  colors={colors}
                />
              </View>

              {/* Coin bounty — Homework only */}
              {category === 'Homework' && (
                <View style={[m.field, { backgroundColor: BRAND.purple + '12', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BRAND.purple + '30' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: BRAND.purple }}>Co-Learning Coin Bounty:</Text>
                    <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: BRAND.amber }}>+{rewardCoins} 🪙</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {[10, 20, 30, 50].map(amt => (
                      <TouchableOpacity
                        key={amt}
                        style={[m.coinBtn, rewardCoins === amt && { backgroundColor: BRAND.amber, borderColor: BRAND.amber }]}
                        onPress={() => setRewardCoins(amt)}
                      >
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: rewardCoins === amt ? '#fff' : colors.textSecondary }}>
                          +{amt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={{ fontSize: TYPO.label, color: BRAND.purple, marginTop: 6 }}>
                    Child & helper both earn bonus coins upon completion!
                  </Text>
                </View>
              )}

            </ScrollView>

            {/* Sticky footer — was inside the ScrollView, could scroll out
                of view on a long form or end up below the keyboard. */}
            <View style={{ padding: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity
                style={[m.submitBtn, { backgroundColor: BRAND.purple, opacity: submitting ? 0.6 : 1 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={m.submitText}>Syncing with Supabase...</Text>
                  </>
                ) : (
                  <>
                    <SendIcon color="#fff" />
                    <Text style={m.submitText}>
                      {isAdult ? 'Dispatch Help Request for Child' : 'Submit Help Request to Family Dispatch'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  sheet:    { borderRadius: 24, overflow: 'hidden' },
  header:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: TYPO.heading, fontWeight: '900' },
  subtitle: { fontSize: TYPO.caption, marginTop: 2 },
  closeBtn: { padding: 4 },
  body:     { padding: 16, gap: 14, paddingBottom: 24 },
  field:    {},
  label:    { fontSize: TYPO.caption, fontWeight: '700', marginBottom: 5 },
  pickerRow:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kidPill:  { borderWidth: 1.5, borderColor: '#DDD', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  textarea: { borderWidth: 1.5, borderRadius: 16, padding: 13, fontSize: TYPO.body, minHeight: 80, fontWeight: '500' },
  coinBtn:  { borderWidth: 1.5, borderColor: '#DDD', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  submitBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 15, marginTop: 4 },
  submitText:{ color: '#fff', fontSize: TYPO.body, fontWeight: '900' },
});
