import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Image as ImageIcon, FileText, Trash2, File, Download, Search, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import FullPageOverlay from '@/components/FullPageOverlay';
import { useHomeownerDocumentsStore, type HomeownerDocument, type HomeownerDocType } from '@/store/homeownerDocumentsStore';
import { useFamilyStore } from '@/store/familyStore';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { showToast } from '@/components/AppToast';

const CANVAS = '#FFFFFF';
const TITLE_CLR = '#172337';
const BODY_CLR = '#657185';
const BLUE = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER = '#E8EBF0';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F5F7FB';
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const DOC_TYPES: HomeownerDocType[] = ['insurance', 'deed', 'manual', 'warranty', 'other'];
const DOC_TYPE_LABEL: Record<HomeownerDocType, string> = {
  insurance: 'Insurance', deed: 'Deed / ownership', manual: 'Manual', warranty: 'Warranty', other: 'Other',
};

function fmtDisplay(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PendingFile = { uri: string; name: string; mimeType: string; size?: number };

export function HouseDocumentsSheet({ visible, colors, isDark, onClose, zIndex = 60 }: {
  visible: boolean; colors: any; isDark: boolean; onClose: () => void; zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = (activeMember as any)?.familyId ?? (members[0] as any)?.familyId ?? '';
  const { documents, isLoading, loadDocuments, addDocument, deleteDocument } = useHomeownerDocumentsStore();

  const [pending, setPending] = useState<PendingFile | null>(null);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<HomeownerDocType>('other');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  if (visible && !loaded && familyId) {
    setLoaded(true);
    loadDocuments(familyId);
  }

  const reset = () => { setPending(null); setDocName(''); setDocType('other'); };
  const close = () => { reset(); onClose(); };

  const defaultNameFor = (fileName: string) => {
    const base = fileName.replace(/\.[^/.]+$/, '');
    return base.length > 2 ? base : `Document · ${fmtDisplay(new Date().toISOString())}`;
  };

  // Picker-reported size (esp. camera captures) isn't always populated, so
  // this re-checks the real file size on disk before accepting it — the
  // 5 MB cap has to hold regardless of what the picker claims. Returns
  // null if the file is over the limit (caller bails), the resolved size
  // otherwise.
  const resolveSizeOrReject = async (uri: string, reportedSize?: number): Promise<number | undefined | null> => {
    let size = reportedSize;
    if (size == null) {
      const FS = await import('expo-file-system/legacy');
      const info = await FS.getInfoAsync(uri);
      size = (info as any).size as number | undefined;
    }
    if (size != null && size > MAX_FILE_BYTES) {
      showAlert('File too large', 'House documents are limited to 5 MB each. Please choose a smaller file.');
      return null;
    }
    return size;
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { showAlert('Camera access needed', 'Please allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const size = await resolveSizeOrReject(asset.uri, asset.fileSize);
    if (size === null) return;
    const name = asset.fileName ?? `photo_${Date.now()}.jpg`;
    setPending({ uri: asset.uri, name, mimeType: asset.mimeType ?? 'image/jpeg', size });
    setDocName(defaultNameFor(name));
  };

  const pickLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Photo library access needed', 'Please allow photo library access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const size = await resolveSizeOrReject(asset.uri, asset.fileSize);
    if (size === null) return;
    const name = asset.fileName ?? `photo_${Date.now()}.jpg`;
    setPending({ uri: asset.uri, name, mimeType: asset.mimeType ?? 'image/jpeg', size });
    setDocName(defaultNameFor(name));
  };

  const pickFile = async () => {
    const result = await DocPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.size != null && asset.size > MAX_FILE_BYTES) {
      showAlert('File too large', 'House documents are limited to 5 MB each. Please choose a smaller file.');
      return;
    }
    setPending({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', size: asset.size ?? undefined });
    setDocName(defaultNameFor(asset.name));
  };

  const save = async () => {
    if (!pending || !docName.trim() || !activeMemberId) return;
    setSaving(true);
    try {
      const ext = pending.name.split('.').pop() ?? 'bin';
      const path = `${familyId}/${Date.now()}.${ext}`;
      const FS = await import('expo-file-system/legacy');
      const b64str = await FS.readAsStringAsync(pending.uri, { encoding: 'base64' as any });
      const binary = atob(b64str);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const { data: up, error: upErr } = await supabase.storage
        .from('homeowner-documents')
        .upload(path, bytes, { contentType: pending.mimeType, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error } = await addDocument({
        familyId, name: docName.trim(), docType, filePath: up.path, fileName: pending.name,
        fileSize: pending.size, mimeType: pending.mimeType, uploadedBy: activeMemberId,
      });
      if (error) throw new Error(error);
      showToast('Document saved');
      reset();
    } catch (err: any) {
      showAlert('Could not save document', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (doc: HomeownerDocument) => {
    showAlert('Remove document', `Remove "${doc.name}"? This permanently deletes the file.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await deleteDocument(doc.id);
        if (error) showAlert('Could not remove', error);
        else showToast('Document removed');
      }},
    ] as any);
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (doc: HomeownerDocument) => {
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from('homeowner-documents')
        .createSignedUrl(doc.filePath, 120);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not create download link');
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) throw new Error('Downloaded file is empty — please retry');
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      const cleaned = doc.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
      const uri = (FileSystem.cacheDirectory ?? '') + `FC_${cleaned || 'document.bin'}`;
      await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) throw new Error('Sharing is not available on this device');
      await Sharing.shareAsync(uri, { mimeType: doc.mimeType ?? 'application/octet-stream', dialogTitle: doc.name });
    } catch (err: any) {
      showAlert('Download failed', err?.message ?? 'Could not download the file. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const isImage = (mime?: string) => !!mime && mime.startsWith('image/');

  const filteredDocuments = search.trim()
    ? documents.filter(d => {
        const q = search.toLowerCase();
        return d.name.toLowerCase().includes(q) ||
          d.fileName.toLowerCase().includes(q) ||
          DOC_TYPE_LABEL[d.docType].toLowerCase().includes(q);
      })
    : documents;

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Home care</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
            House documents
          </Text>
          <Text style={{ fontSize: 14, color: bodyC, marginTop: 6, lineHeight: 20 }}>
            Insurance, deeds, manuals and warranty cards — kept as raw files, no AI review.
          </Text>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 14 }}>

            {!pending ? (
              <>
                {/* Upload options */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={pickCamera}
                    style={{ flex: 1, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: border,
                      borderRadius: 14, backgroundColor: cardBg, paddingVertical: 16 }}>
                    <Camera size={22} color={BLUE} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: titleC }}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={pickLibrary}
                    style={{ flex: 1, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: border,
                      borderRadius: 14, backgroundColor: cardBg, paddingVertical: 16 }}>
                    <ImageIcon size={22} color={BLUE} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: titleC }}>Photos</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={pickFile}
                    style={{ flex: 1, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: border,
                      borderRadius: 14, backgroundColor: cardBg, paddingVertical: 16 }}>
                    <FileText size={22} color={BLUE} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: titleC }}>PDF / File</Text>
                  </TouchableOpacity>
                </View>

                {/* Document list */}
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC, marginTop: 8 }}>
                  Saved documents
                </Text>

                {documents.length > 0 && (
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: border,
                    backgroundColor: cardBg, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Search size={14} color={bodyC} />
                      <TextInput
                        value={search} onChangeText={setSearch}
                        placeholder="Search documents"
                        placeholderTextColor={isDark ? colors.textTertiary : '#B0B8C8'}
                        style={{ flex: 1, fontSize: 15, color: titleC, padding: 0 }}
                      />
                      {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                          <X size={14} color={bodyC} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {isLoading && documents.length === 0 ? (
                  <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} />
                ) : documents.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                    <File size={28} color={bodyC} />
                    <Text style={{ fontSize: 13, color: bodyC, textAlign: 'center' }}>
                      No house documents yet — upload one above.
                    </Text>
                  </View>
                ) : filteredDocuments.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                    <Search size={24} color={bodyC} />
                    <Text style={{ fontSize: 13, color: bodyC, textAlign: 'center' }}>
                      No documents match "{search}"
                    </Text>
                  </View>
                ) : (
                  <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14,
                    backgroundColor: cardBg, overflow: 'hidden' }}>
                    {filteredDocuments.map((doc, i) => {
                      const uploader = members.find(m => m.id === doc.uploadedBy);
                      return (
                        <View key={doc.id}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                            paddingHorizontal: 14, paddingVertical: 12,
                            borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                          <View style={{ width: 36, height: 36, borderRadius: 10,
                            backgroundColor: isDark ? colors.surface : SURFACE,
                            alignItems: 'center', justifyContent: 'center' }}>
                            {isImage(doc.mimeType)
                              ? <ImageIcon size={16} color={BLUE} />
                              : <FileText size={16} color={BLUE} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }} numberOfLines={1}>
                              {doc.name}
                            </Text>
                            <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }} numberOfLines={1}>
                              {DOC_TYPE_LABEL[doc.docType]} · {doc.fileName}
                            </Text>
                            <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>
                              {fmtDisplay(doc.createdAt)}{uploader ? ` · ${uploader.name.split(' ')[0]}` : ''}{doc.fileSize ? ` · ${fmtSize(doc.fileSize)}` : ''}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                            <TouchableOpacity onPress={() => download(doc)} disabled={downloadingId === doc.id} hitSlop={8}>
                              {downloadingId === doc.id
                                ? <ActivityIndicator size="small" color={BLUE} />
                                : <Download size={16} color={BLUE} />}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => remove(doc)} hitSlop={8}>
                              <Trash2 size={16} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Naming step */}
                <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 16,
                    backgroundColor: isDark ? colors.surface : SURFACE,
                    alignItems: 'center', justifyContent: 'center' }}>
                    {isImage(pending.mimeType) ? <ImageIcon size={26} color={BLUE} /> : <FileText size={26} color={BLUE} />}
                  </View>
                  <Text style={{ fontSize: 13, color: bodyC, textAlign: 'center' }} numberOfLines={1}>
                    {pending.name}{pending.size ? ` · ${fmtSize(pending.size)}` : ''}
                  </Text>
                </View>

                <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                  paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Name this document</Text>
                  <TextInput value={docName} onChangeText={setDocName}
                    placeholder="e.g. Homeowners insurance policy"
                    placeholderTextColor="#C0C7D4"
                    autoFocus
                    style={{ fontSize: 15, color: titleC, padding: 0 }} />
                </View>

                <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                  paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 12, color: bodyC, marginBottom: 8 }}>Document type</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {DOC_TYPES.map(t => {
                      const active = docType === t;
                      return (
                        <TouchableOpacity key={t} onPress={() => setDocType(t)}
                          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: active ? BLUE : border,
                            backgroundColor: active ? (isDark ? colors.surface : '#EEF3FB') : cardBg }}>
                          <Text style={{ fontSize: 13, fontWeight: '700',
                            color: active ? BLUE : bodyC }}>{DOC_TYPE_LABEL[t]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <TouchableOpacity onPress={save} disabled={saving || !docName.trim()}
                  style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: docName.trim() ? BLUE : (isDark ? colors.surface : SURFACE) }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: docName.trim() ? '#FFFFFF' : bodyC }}>
                    {saving ? 'Saving…' : 'Save document'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={reset}
                  style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: bodyC }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </FullPageOverlay>
  );
}
