import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Image, ScrollView,
} from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@/components/BottomSheet';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { supabase, uploadFeedbackScreenshot } from '@/lib/supabase';
import { containsProfanity } from '@/lib/profanityFilter';
import { showAlert } from '@/components/AppAlert';

function ha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const MAX_ATTACHMENTS = 4;

const ISSUE_TYPES = [
  { key: 'bug',     label: '🐛 Bug',            desc: 'Something is broken' },
  { key: 'ux',      label: '😕 Bad experience', desc: 'Confusing or frustrating' },
  { key: 'feature', label: '💡 Feature request', desc: 'Something you want added' },
  { key: 'other',   label: '💬 Other',           desc: 'Anything else' },
] as const;

type IssueType = typeof ISSUE_TYPES[number]['key'];
type Attachment = { uri: string; base64: string | null; mime: string };

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FeedbackSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const { width, height } = useWindowDimensions();

  const [issueType,    setIssueType]    = useState<IssueType>('bug');
  const [description,  setDescription]  = useState('');
  const [attachments,  setAttachments]  = useState<Attachment[]>([]);
  const [sending,      setSending]      = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setIssueType('bug'); setDescription(''); setAttachments([]);
      setSending(false); submittingRef.current = false;
    }
  }, [visible]);

  const appVersion = Constants.expoConfig?.version ?? (Constants.manifest as any)?.version ?? '—';
  const appName    = Constants.expoConfig?.name    ?? (Constants.manifest as any)?.name    ?? 'Family Cube';
  const osName     = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const osVersion  = Platform.Version?.toString() ?? '—';
  const deviceName = Device.modelName ?? Device.deviceName ?? '—';
  const screenSize = `${Math.round(width)}×${Math.round(height)}`;

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Please allow photo access to attach screenshots.');
      return;
    }
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) return;
    setUploading(true);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    setUploading(false);
    if (result.canceled || !result.assets?.length) return;
    const picked: Attachment[] = result.assets.map(a => ({
      uri:    a.uri,
      base64: a.base64 ?? null,
      mime:   a.mimeType ?? 'image/jpeg',
    }));
    setAttachments(prev => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
  };

  const removeAttachment = (idx: number) =>
    setAttachments(prev => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (submittingRef.current) return;
    if (!description.trim()) {
      showAlert('Required', 'Please describe the issue.');
      return;
    }
    if (containsProfanity(description)) {
      showAlert('Please keep it clean', 'Your report contains language we cannot accept. Please rephrase and try again.');
      return;
    }
    submittingRef.current = true;
    setSending(true);
    try {
      const paths = await Promise.all(
        attachments.map(a => uploadFeedbackScreenshot(a.uri, a.base64, a.mime)),
      );
      const { data: inserted, error } = await supabase.from('feedback_reports').insert({
        user_id:         user?.id ?? null,
        app_name:        appName,
        issue_type:      issueType,
        description:     description.trim(),
        screenshot_url:  paths[0] ?? null,
        screenshot_urls: paths,
        app_version:     appVersion,
        os_name:         osName,
        os_version:      osVersion,
        device_name:     deviceName,
        screen_size:     screenSize,
      }).select('id').single();
      if (error) throw error;

      supabase.functions.invoke('notify-admin-feedback', {
        body: {
          report_id:   inserted?.id,
          issue_type:  issueType,
          description: description.trim(),
          app_name:    appName,
        },
      }).catch(() => {});

      // Close the sheet first, then show the thank-you alert so it appears over the parent screen
      onClose();
      setTimeout(() => {
        showAlert('Thank you! 🐾', "Your report has been sent. We'll look into it and get back to you soon.");
      }, 300);
    } catch {
      setSending(false);
      submittingRef.current = false;
      showAlert('Error', 'Could not send your report. Please try again.');
    }
  };

  const inp = { backgroundColor: (colors as any).inputBg ?? colors.card, borderColor: colors.border };
  const canAddMore = attachments.length < MAX_ATTACHMENTS;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Report a bug or give feedback">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
      >

        {/* Issue type */}
        <View>
          <Text style={[s.label, { color: colors.textSecondary }]}>What is this about?</Text>
          <View style={s.typeRow}>
            {ISSUE_TYPES.map(t => {
              const active = issueType === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setIssueType(t.key)}
                  activeOpacity={0.7}
                  style={[
                    s.typeChip,
                    { borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? ha(colors.primary, 0.09) : 'transparent' },
                  ]}
                >
                  <Text style={[s.typeChipText, { color: active ? colors.primary : colors.textSecondary }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Description */}
        <View>
          <Text style={[s.label, { color: colors.textSecondary }]}>Describe the issue</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What happened? What did you expect, and what went wrong?"
            placeholderTextColor={(colors as any).placeholder ?? colors.textSecondary}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={[s.textarea, inp, { color: colors.textPrimary }]}
          />
        </View>

        {/* Attachments */}
        <View>
          <Text style={[s.label, { color: colors.textSecondary }]}>
            Screenshots (optional · {attachments.length}/{MAX_ATTACHMENTS})
          </Text>

          {/* Preview grid */}
          {attachments.length > 0 && (
            <View style={s.previewGrid}>
              {attachments.map((a, i) => (
                <View key={i} style={s.previewCell}>
                  <Image source={{ uri: a.uri }} style={s.previewImg} resizeMode="cover" />
                  <TouchableOpacity onPress={() => removeAttachment(i)} style={s.removeBtn}>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {canAddMore && (
                <TouchableOpacity
                  onPress={pickImages}
                  disabled={uploading}
                  style={[s.addMoreCell, { borderColor: colors.border, backgroundColor: inp.backgroundColor }]}
                >
                  {uploading
                    ? <ActivityIndicator size="small" color={colors.primaryText ?? colors.primary} />
                    : <Ionicons name="add" size={28} color={colors.textSecondary} />
                  }
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Empty state pick button */}
          {attachments.length === 0 && (
            <TouchableOpacity
              onPress={pickImages}
              disabled={uploading}
              activeOpacity={0.7}
              style={[s.uploadBtn, { borderColor: colors.border, backgroundColor: inp.backgroundColor }]}
            >
              {uploading
                ? <ActivityIndicator size="small" color={colors.primaryText ?? colors.primary} />
                : <Ionicons name="images-outline" size={22} color={colors.textSecondary} />
              }
              <Text style={[s.uploadText, { color: colors.textSecondary }]}>
                {uploading ? 'Loading…' : `Browse gallery (up to ${MAX_ATTACHMENTS})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Auto-filled device info */}
        <View style={[s.metaBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.metaTitle, { color: colors.textSecondary }]}>Automatically included</Text>
          <View style={s.metaGrid}>
            {[
              ['App',     `${appName} v${appVersion}`],
              ['OS',      `${osName} ${osVersion}`],
              ['Device',  deviceName],
              ['Screen',  screenSize],
            ].map(([lbl, val]) => (
              <View key={lbl} style={s.metaRow}>
                <Text style={[s.metaLabel, { color: colors.textSecondary }]}>{lbl}</Text>
                <Text style={[s.metaValue, { color: colors.textPrimary }]}>{val}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={submit}
          disabled={sending || !description.trim()}
          activeOpacity={0.8}
          style={[s.btn, { backgroundColor: colors.primary, opacity: (!description.trim() || sending) ? 0.5 : 1 }]}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnText}>Send report</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </BottomSheet>
  );
}

const CELL = 90;

const s = StyleSheet.create({
  label:        { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  typeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  typeChipText: { fontSize: 14, fontWeight: '600' },
  textarea:     { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20, minHeight: 110 },
  uploadBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth,
                  borderRadius: 12, borderStyle: 'dashed', padding: 16, justifyContent: 'center' },
  uploadText:   { fontSize: 14, fontWeight: '500' },
  previewGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewCell:  { width: CELL, height: CELL, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  previewImg:   { width: CELL, height: CELL },
  addMoreCell:  { width: CELL, height: CELL, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
                  borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  removeBtn:    { position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12 },
  metaBox:      { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12 },
  metaTitle:    { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  metaGrid:     { gap: 6 },
  metaRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel:    { fontSize: 14 },
  metaValue:    { fontSize: 14, fontWeight: '600' },
  btn:          { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:      { fontSize: 15, fontWeight: '700', color: '#fff' },
});
