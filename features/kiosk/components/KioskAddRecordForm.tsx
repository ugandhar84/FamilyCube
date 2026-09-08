/**
 * KioskAddRecordForm — kiosk-native replacement for AddRecordModal.tsx's
 * own phone-styled bottom sheet, matching KioskAddMedForm.tsx's own
 * KioskFormDrawer pattern exactly [live-reported: "add records also make
 * that right side model similar to add med right"].
 *
 * Every real field kept: member picker, document title, category (TAGS),
 * record date, file attach (Camera/Photos/Files with the SAME real
 * redaction step for camera/library photos), notes.
 *
 * Reuses PhotoRedactModal (components/PhotoRedactModal.tsx) directly,
 * unmodified — unlike ScanReviewSheet.tsx's redact step (which was tangled
 * into one 818-line component with no reuse seam), PhotoRedactModal is
 * ALREADY a standalone, prop-driven component that owns its own Modal (see
 * its own file), the same way MemberPicker/PickerOverlay already are — so
 * this mounts it directly rather than needing any extraction.
 *
 * The real save function (KioskHealthTab.tsx's addRecord, including its
 * own try/catch guard against the freeze bug found earlier this session)
 * is unchanged — this only replaces AddRecordModal's UI shell.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { FileText as FileTextIcon, Camera, Image as ImageIcon, FolderOpen, X, Shield, Lock, Calendar as CalendarIcon } from 'lucide-react-native';
import PhotoRedactModal, { RedactableImage } from '@/components/PhotoRedactModal';
import { RecordForm, TAGS, BLANK_FORM, fmtSize } from '@/features/vault/records/types';
import { fmtDate, fmtDateDisplay } from '@/features/vault/tabs/health/types';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';
import { KioskDateTimePicker, openAndroidPicker } from './KioskDateTimePicker';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_TYPO, KIOSK_HIT } from '../kioskTheme';

function imageAssetToDoc(asset: ImagePicker.ImagePickerAsset): DocumentPicker.DocumentPickerAsset {
  const name = asset.fileName ?? `photo_${Date.now()}.jpg`;
  return {
    uri: asset.uri, name,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize ?? null,
  } as DocumentPicker.DocumentPickerAsset;
}

export function KioskAddRecordForm({ visible, onClose, onSave, colors, isDark, members, activeMemberId }: {
  visible: boolean;
  onClose: () => void;
  onSave: (memberId: string, form: RecordForm, file: DocumentPicker.DocumentPickerAsset | null) => Promise<void>;
  colors: any;
  isDark: boolean;
  members: any[];
  activeMemberId: string | null;
}) {
  const { k } = useKioskColors();
  const [form, setForm] = useState<RecordForm>(BLANK_FORM);
  const [selMember, setSelMember] = useState(activeMemberId ?? members[0]?.id ?? '');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ asset: ImagePicker.ImagePickerAsset; redactImg: RedactableImage } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(BLANK_FORM); setFile(null); setSaving(false); setSubmitAttempted(false);
      setSelMember(activeMemberId ?? members[0]?.id ?? '');
    }
  }, [visible, activeMemberId, members]);

  const errors = useMemo(() => ({
    title: !form.title.trim() ? 'Document title is required' : '',
    member: !selMember ? 'Select a family member' : '',
  }), [form.title, selMember]);
  const canSubmit = !errors.title && !errors.member;

  const pickFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (!result.canceled && result.assets[0]) setFile(result.assets[0]);
  };

  const openRedactFor = async (asset: ImagePicker.ImagePickerAsset) => {
    const base64 = asset.base64 ?? await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' as any });
    setPendingPhoto({ asset, redactImg: { base64, mimeType: asset.mimeType ?? 'image/jpeg' } });
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera access needed', 'Please allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false, base64: true });
    if (!result.canceled && result.assets[0]) await openRedactFor(result.assets[0]);
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Photo library access needed', 'Please allow photo library access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false, base64: true });
    if (!result.canceled && result.assets[0]) await openRedactFor(result.assets[0]);
  };

  const handleRedactConfirm = async (finalImages: RedactableImage[]) => {
    if (!pendingPhoto) return;
    const finalImg = finalImages[0];
    const name = pendingPhoto.asset.fileName ?? `photo_${Date.now()}.jpg`;
    const destUri = `${FileSystem.cacheDirectory}${Date.now()}_${name}`;
    await FileSystem.writeAsStringAsync(destUri, finalImg.base64, { encoding: 'base64' as any });
    const info = await FileSystem.getInfoAsync(destUri);
    setFile({ uri: destUri, name, mimeType: finalImg.mimeType, size: (info as any).size ?? null } as DocumentPicker.DocumentPickerAsset);
    setPendingPhoto(null);
  };

  const handleSave = async () => {
    setSubmitAttempted(true);
    if (!canSubmit) return;
    setSaving(true);
    await onSave(selMember, form, file);
    setSaving(false);
    onClose();
  };

  const input = kioskInputStyle(k);

  return (
    <>
      <KioskFormDrawer
        visible={visible} title="Upload Medical Record" subtitle="Same real form as the phone app"
        accent={k.blue} Icon={FileTextIcon} k={k} onClose={onClose}
        variant="drawer"
        submitLabel="Save to Vault" onSubmit={handleSave}
        canSubmit={canSubmit} submitting={saving}
        error={submitAttempted && !canSubmit ? (errors.title || errors.member) : null}
      >
        {/* Vault notice */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
          borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs,
          backgroundColor: k.blueSoft, marginBottom: KIOSK_SPACE.md,
        }}>
          <Shield size={13} color={k.blue} />
          <Text style={{ fontSize: KIOSK_TYPO.micro, color: k.blue, fontWeight: '700', flex: 1 }}>
            Encrypted · protected by your family vault · never shared externally
          </Text>
        </View>

        {/* Member picker */}
        <KioskFieldLabel k={k}>FOR</KioskFieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: KIOSK_SPACE.md }}>
          <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs }}>
            {members.map((m: any) => (
              <KioskPill key={m.id} label={m.name.split(' ')[0]} selected={selMember === m.id}
                onPress={() => setSelMember(m.id)} accent={k.blue} k={k} />
            ))}
          </View>
        </ScrollView>

        {/* Title */}
        <KioskFieldLabel k={k}>DOCUMENT TITLE</KioskFieldLabel>
        <TextInput value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))}
          placeholder="e.g. Annual Blood Panel, Discharge Summary" placeholderTextColor={k.textFaint}
          style={[input, { marginBottom: KIOSK_SPACE.md, borderColor: submitAttempted && errors.title ? k.danger : input.borderColor }]} />

        {/* Category */}
        <KioskFieldLabel k={k}>CATEGORY</KioskFieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md }}>
          {TAGS.map(t => (
            <KioskPill key={t.id} label={t.label} selected={form.tag === t.id}
              onPress={() => setForm(f => ({ ...f, tag: t.id }))} accent={t.color} k={k} />
          ))}
        </View>

        {/* Record date — real picker instead of a typed YYYY-MM-DD field
            [live-reported: "all forms we must have this calender date
            wherever applicable"]. No minimumDate here: a medical record's
            own date is very often in the past (an old lab result being
            scanned in today), unlike a medication's own forward-looking
            start/end schedule. */}
        <KioskFieldLabel k={k}>RECORD DATE</KioskFieldLabel>
        <Pressable
          onPress={() => {
            const current = form.record_date ? new Date(form.record_date + 'T00:00:00') : new Date();
            if (Platform.OS === 'android') openAndroidPicker({ mode: 'date', value: current, onChange: d => setForm(f => ({ ...f, record_date: fmtDate(d) })) });
            else setShowDatePicker(p => !p);
          }}
          style={[input, { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }]}
        >
          <CalendarIcon size={14} color={k.textMuted} />
          <Text style={{ color: k.text, fontSize: KIOSK_TYPO.body }}>
            {form.record_date ? fmtDateDisplay(new Date(form.record_date + 'T00:00:00')) : 'Pick date'}
          </Text>
        </Pressable>
        {Platform.OS === 'ios' && (
          <KioskDateTimePicker mode="date" visible={showDatePicker} k={k} isDark={isDark}
            value={form.record_date ? new Date(form.record_date + 'T00:00:00') : new Date()}
            onChange={d => setForm(f => ({ ...f, record_date: fmtDate(d) }))}
            onDone={() => setShowDatePicker(false)}
          />
        )}
        <View style={{ marginBottom: KIOSK_SPACE.md }} />

        {/* File attach */}
        <KioskFieldLabel k={k}>ATTACH FILE — ENABLES AI ANALYSIS</KioskFieldLabel>
        {file ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
            borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm,
            backgroundColor: k.blueSoft, borderColor: k.blueEdge, marginBottom: 4,
          }}>
            <FileTextIcon size={15} color={k.blue} />
            <Text style={{ fontSize: KIOSK_TYPO.label, fontWeight: '700', color: k.blue, flex: 1 }} numberOfLines={1}>{file.name}</Text>
            {file.size != null && <Text style={{ fontSize: KIOSK_TYPO.micro, color: k.textFaint }}>{fmtSize(file.size)}</Text>}
            <Pressable onPress={() => setFile(null)} hitSlop={8}>
              <X size={14} color={k.blue} />
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs, marginBottom: 4 }}>
            {[
              { label: 'Camera', Icon: Camera, onPress: pickFromCamera },
              { label: 'Photos', Icon: ImageIcon, onPress: pickFromLibrary },
              { label: 'Files', Icon: FolderOpen, onPress: pickFromFiles },
            ].map(btn => (
              <Pressable key={btn.label} onPress={btn.onPress}
                style={{
                  flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
                  minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, borderStyle: 'dashed',
                  borderColor: k.cardBorder,
                }}>
                <btn.Icon size={18} color={k.textMuted} />
                <Text style={{ fontSize: KIOSK_TYPO.micro, fontWeight: '800', color: k.textMuted }}>{btn.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: KIOSK_SPACE.md }}>
          <Lock size={11} color={k.textFaint} />
          <Text style={{ fontSize: KIOSK_TYPO.micro, color: k.textFaint }}>Encrypted at rest · accessible only within your vault</Text>
        </View>

        {/* Notes */}
        <KioskFieldLabel k={k}>NOTES (OPTIONAL)</KioskFieldLabel>
        <TextInput value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))}
          placeholder="Any context about this document…" placeholderTextColor={k.textFaint} multiline
          style={[input, { height: 72, textAlignVertical: 'top' }]} />
      </KioskFormDrawer>

      {/* Real, standalone, already-reusable component — no extraction
          needed, unlike ScanReviewSheet.tsx's own tangled redact step. */}
      <PhotoRedactModal
        visible={!!pendingPhoto}
        images={pendingPhoto ? [pendingPhoto.redactImg] : []}
        accentColor={k.blue}
        title="Cover Sensitive Info"
        subtitle="Drag to black out names, DOB or any detail before AI analysis"
        confirmLabel="Use This Photo →"
        onDiscard={() => setPendingPhoto(null)}
        onConfirm={handleRedactConfirm}
      />
    </>
  );
}
