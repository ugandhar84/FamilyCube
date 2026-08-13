import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { X, Upload, Lock, Shield } from 'lucide-react-native';
import { BRAND } from '../tabs/shared';
import { RecordForm, TAGS, BLANK_FORM, memberColor, fmtSize } from './types';

interface Props {
  visible:        boolean;
  onClose:        () => void;
  onSave:         (memberId: string, form: RecordForm, file: DocumentPicker.DocumentPickerAsset | null) => Promise<void>;
  colors:         any;
  isDark:         boolean;
  members:        any[];
  activeMemberId: string | null;
}

export default function AddRecordModal({
  visible, onClose, onSave, colors, isDark, members, activeMemberId,
}: Props) {
  const [form,      setForm]      = useState<RecordForm>(BLANK_FORM);
  const [selMember, setSelMember] = useState(activeMemberId ?? members[0]?.id ?? '');
  const [file,      setFile]      = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [tried,     setTried]     = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(BLANK_FORM); setFile(null); setSaving(false); setTried(false);
      setSelMember(activeMemberId ?? members[0]?.id ?? '');
    }
  }, [visible, activeMemberId, members]);

  const errors = useMemo(() => ({
    title:  !form.title.trim() ? 'Document title is required' : '',
    member: !selMember         ? 'Select a family member'     : '',
  }), [form.title, selMember]);

  const showErr = (k: keyof typeof errors) => !!(errors[k] && tried);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) setFile(result.assets[0]);
  };

  const handleSave = async () => {
    setTried(true);
    if (errors.title || errors.member) return;
    setSaving(true);
    await onSave(selMember, form, file);
    setSaving(false);
    onClose();
  };

  const cardBg = isDark ? colors.card : '#FFFFFF';
  const bg     = isDark ? colors.background : '#F8F5FF';
  const inp    = [s.inp, { backgroundColor: cardBg, borderColor: colors.border, color: colors.textPrimary }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.backdrop, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={[s.sheet, { backgroundColor: bg }]}>

            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={[s.handle, { backgroundColor: colors.border }]} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Lock size={15} color={BRAND.teal} />
                <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>
                  Upload Medical Record
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Vault notice */}
            <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center',
              gap: 7, backgroundColor: BRAND.teal + '12', borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 8 }}>
              <Shield size={12} color={BRAND.teal} />
              <Text style={{ fontSize: 11, color: BRAND.teal, fontWeight: '700', flex: 1 }}>
                Encrypted · protected by your family vault · never shared externally
              </Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}
              showsVerticalScrollIndicator={false}>

              {/* Member picker */}
              <View>
                <Text style={[s.label, { color: colors.textSecondary }]}>For *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {members.map((m, i) => {
                      const sel = selMember === m.id;
                      const c   = memberColor(i);
                      return (
                        <TouchableOpacity key={m.id} onPress={() => setSelMember(m.id)}
                          style={[s.chip, {
                            backgroundColor: sel ? c + '25' : cardBg,
                            borderColor: sel ? c : colors.border,
                          }]}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: sel ? c : colors.textSecondary }}>
                            {m.name.split(' ')[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                {showErr('member') && <Text style={s.err}>{errors.member}</Text>}
              </View>

              {/* Title */}
              <View>
                <Text style={[s.label, { color: colors.textSecondary }]}>Document Title *</Text>
                <TextInput value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))}
                  placeholder="e.g. Annual Blood Panel, Discharge Summary"
                  placeholderTextColor={colors.textTertiary} style={inp} />
                {showErr('title') && <Text style={s.err}>{errors.title}</Text>}
              </View>

              {/* Category */}
              <View>
                <Text style={[s.label, { color: colors.textSecondary }]}>Category</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {TAGS.map(t => {
                    const sel   = form.tag === t.id;
                    const TIcon = t.Icon;
                    return (
                      <TouchableOpacity key={t.id} onPress={() => setForm(f => ({ ...f, tag: t.id }))}
                        style={[s.chip, {
                          backgroundColor: sel ? t.color + '20' : cardBg,
                          borderColor: sel ? t.color : colors.border,
                          flexDirection: 'row', alignItems: 'center', gap: 5,
                        }]}>
                        <TIcon size={12} color={sel ? t.color : colors.textTertiary} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: sel ? t.color : colors.textSecondary }}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Date */}
              <View>
                <Text style={[s.label, { color: colors.textSecondary }]}>Record Date</Text>
                <TextInput value={form.record_date}
                  onChangeText={v => setForm(f => ({ ...f, record_date: v }))}
                  placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} style={inp} />
              </View>

              {/* File */}
              <View>
                <Text style={[s.label, { color: colors.textSecondary }]}>
                  Attach File — enables AI analysis
                </Text>
                <TouchableOpacity onPress={pickFile}
                  style={[s.fileBtn, { backgroundColor: cardBg, borderColor: file ? BRAND.teal : colors.border }]}>
                  <Upload size={16} color={file ? BRAND.teal : colors.textTertiary} />
                  <Text style={{ fontSize: 13, fontWeight: '700',
                    color: file ? BRAND.teal : colors.textTertiary, flex: 1 }} numberOfLines={1}>
                    {file ? file.name : 'Tap to pick PDF or image…'}
                  </Text>
                  {file && <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtSize(file.size ?? null)}</Text>}
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
                  <Lock size={10} color={colors.textTertiary} />
                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                    Encrypted at rest · accessible only within your vault
                  </Text>
                </View>
              </View>

              {/* Notes */}
              <View>
                <Text style={[s.label, { color: colors.textSecondary }]}>Notes (optional)</Text>
                <TextInput value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                  placeholder="Any context about this document…"
                  placeholderTextColor={colors.textTertiary}
                  style={[inp, { height: 72, textAlignVertical: 'top' }]} multiline />
              </View>
            </ScrollView>

            <View style={[s.footer, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F8F5FF' }]}>
              <TouchableOpacity onPress={onClose} style={[s.cancelBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={[s.saveBtn, { backgroundColor: BRAND.teal, opacity: saving ? 0.65 : 1 }]}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save to Vault</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:  { flex: 1, justifyContent: 'flex-end' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 8, maxHeight: '92%' },
  handle:    { width: 40, height: 4, borderRadius: 2 },
  closeBtn:  { padding: 8, borderRadius: 20, backgroundColor: 'rgba(100,116,139,0.12)' },
  label:     { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  inp:       { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, fontWeight: '600' },
  chip:      { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },
  fileBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
               paddingHorizontal: 13, paddingVertical: 11, borderStyle: 'dashed' },
  footer:    { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:   { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  err:       { fontSize: 11, fontWeight: '700', color: '#F43F5E', marginTop: 4, marginLeft: 2 },
});
