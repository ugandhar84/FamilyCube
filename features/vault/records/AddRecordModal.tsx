import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StyleSheet, Platform, KeyboardAvoidingView, Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker    from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Lock, Shield, FileText, Camera, Image, FolderOpen } from 'lucide-react-native';
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

// Wraps ImagePicker result as a DocumentPickerAsset-compatible shape
function imageAssetToDoc(asset: ImagePicker.ImagePickerAsset): DocumentPicker.DocumentPickerAsset {
  const name = asset.fileName ?? `photo_${Date.now()}.jpg`;
  return {
    uri:      asset.uri,
    name,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size:     asset.fileSize ?? null,
  } as DocumentPicker.DocumentPickerAsset;
}

export default function AddRecordModal({
  visible, onClose, onSave, colors, isDark, members, activeMemberId,
}: Props) {
  const insets = useSafeAreaInsets();

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

  // ── File picker options ───────────────────────────────────────────────────────
  const pickFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) setFile(result.assets[0]);
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Please allow camera access in Settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) setFile(imageAssetToDoc(result.assets[0]));
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo library access needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) setFile(imageAssetToDoc(result.assets[0]));
  };

  const handleSave = async () => {
    setTried(true);
    if (errors.title || errors.member) return;
    setSaving(true);
    await onSave(selMember, form, file);
    setSaving(false);
    onClose();
  };

  const cardBg = colors.card;
  const inp = [s.inp, { backgroundColor: isDark ? colors.surface : '#F8FAFC', borderColor: colors.border, color: colors.textPrimary }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.backdrop}>
          {/* Tap-to-dismiss area */}
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

          <View style={[s.sheet, { backgroundColor: cardBg }]}>
            {/* Handle */}
            <View style={[s.handle, { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10 }]} />

            {/* Header */}
            <View style={s.headerRow}>
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
            <View style={[s.vaultBadge, { backgroundColor: BRAND.teal + '12' }]}>
              <Shield size={12} color={BRAND.teal} />
              <Text style={{ fontSize: 11, color: BRAND.teal, fontWeight: '700', flex: 1 }}>
                Encrypted · protected by your family vault · never shared externally
              </Text>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 14 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">

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
                          style={[s.chip, { backgroundColor: sel ? c + '25' : 'transparent', borderColor: sel ? c : colors.border }]}>
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
                          backgroundColor: sel ? t.color + '20' : 'transparent',
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

              {/* File — 3 source options */}
              <View>
                <Text style={[s.label, { color: colors.textSecondary }]}>
                  Attach File <Text style={{ fontWeight: '400' }}>— enables AI analysis</Text>
                </Text>

                {file ? (
                  // Chosen file row
                  <View style={[s.fileRow, { backgroundColor: BRAND.teal + '10', borderColor: BRAND.teal + '50' }]}>
                    <FileText size={15} color={BRAND.teal} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.teal, flex: 1 }} numberOfLines={1}>
                      {file.name}
                    </Text>
                    {file.size != null && (
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtSize(file.size)}</Text>
                    )}
                    <TouchableOpacity onPress={() => setFile(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <X size={14} color={BRAND.teal} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  // Source picker buttons
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={pickFromCamera} style={[s.srcBtn, { borderColor: colors.border, flex: 1 }]}>
                      <Camera size={18} color={colors.textSecondary} />
                      <Text style={[s.srcLabel, { color: colors.textSecondary }]}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={pickFromLibrary} style={[s.srcBtn, { borderColor: colors.border, flex: 1 }]}>
                      <Image size={18} color={colors.textSecondary} />
                      <Text style={[s.srcLabel, { color: colors.textSecondary }]}>Photos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={pickFromFiles} style={[s.srcBtn, { borderColor: colors.border, flex: 1 }]}>
                      <FolderOpen size={18} color={colors.textSecondary} />
                      <Text style={[s.srcLabel, { color: colors.textSecondary }]}>Files</Text>
                    </TouchableOpacity>
                  </View>
                )}

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
                  style={[inp, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]} multiline />
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={[s.footer, { borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, maxHeight: '92%' },
  handle:     { width: 40, height: 4, borderRadius: 2 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 20, paddingVertical: 10 },
  closeBtn:   { padding: 8, borderRadius: 20, backgroundColor: 'rgba(100,116,139,0.12)' },
  vaultBadge: { marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center',
                gap: 7, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  label:      { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  inp:        { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10,
                fontSize: 14, fontWeight: '600' },
  chip:       { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5 },
  fileRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
                paddingHorizontal: 13, paddingVertical: 11 },
  srcBtn:     { alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5,
                paddingVertical: 14, borderStyle: 'dashed' },
  srcLabel:   { fontSize: 11, fontWeight: '800' },
  footer:     { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14,
                borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn:  { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:    { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  err:        { fontSize: 11, fontWeight: '700', color: '#F43F5E', marginTop: 4, marginLeft: 2 },
});
