import { showAlert } from '@/components/AppAlert';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '@/lib/ThemeContext';
import { getInsurance, saveInsurance, deleteInsurance, parseInsuranceDocument, type PetInsurance } from '@/lib/db';
import { supabase, uploadInsuranceDoc } from '@/lib/supabase';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { usePaywall } from '@/lib/hooks/usePaywall';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { format, parseISO } from 'date-fns';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import BottomSheet from '@/components/BottomSheet';
import ViewShot from 'react-native-view-shot';
import { WalletCard } from '@/features/health/components/WalletCard';
import { makeStyles, type EditState } from '@/features/health/components/insuranceStyles';
import { PolicyViewSheet } from '@/features/health/components/PolicyViewSheet';
import { InsuranceFormSheet } from '@/features/health/components/InsuranceFormSheet';

const BLANK: EditState = {
  provider: '', policy_number: '', coverage_type: '',
  start_date: '', end_date: '', premium_amount: null, notes: '',
};

export default function InsuranceScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { activePetId, activePet, petRoles } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, activePet: s.activePet, petRoles: s.petRoles })));
  const { gate, consume } = usePaywall();
  const pet = activePet();
  const accent = pet?.accent_color ?? colors.primary;
  const perms = getPermissions(activePetId ? petRoles[activePetId] : 'owner');

  const [policies, setPolicies] = useState<PetInsurance[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState<EditState>(BLANK);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pickerField, setPickerField] = useState<'start_date' | 'end_date' | null>(null);
  const [pickerDate, setPickerDate]   = useState(new Date());
  const [parsingDoc, setParsingDoc]   = useState(false);
  const [sharingId, setSharingId]     = useState<string | null>(null);
  const cardRefs = useRef<Record<string, InstanceType<typeof ViewShot> | null>>({});

  const s = useMemo(() => makeStyles(colors, isDark, accent), [colors, isDark, accent]);

  useFocusEffect(useCallback(() => {
    if (activePetId) load();
  }, [activePetId]));

  useEffect(() => {
    if (!activePetId) return;
    const ch = supabase.channel(`insurance-rt-${activePetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pet_insurance', filter: `pet_id=eq.${activePetId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activePetId]);

  const load = async () => {
    if (!activePetId) return;
    setLoading(true);
    try {
      const data = await getInsurance(activePetId);
      setPolicies(data);
    } catch (e: any) {
      console.warn('[insurance]', e.message);
    }
    setLoading(false);
  };

  const openDatePicker = (field: 'start_date' | 'end_date') => {
    const val = editing[field];
    setPickerDate(val ? parseISO(val) : new Date());
    setPickerField(field);
  };

  const openAdd = () => { setEditing(BLANK); setIsViewMode(false); setShowModal(true); };
  const openEdit = (p: PetInsurance) => {
    setEditing({
      ...p,
      policy_number: p.policy_number ?? '', coverage_type: p.coverage_type ?? '',
      start_date: p.start_date ?? '', end_date: p.end_date ?? '', notes: p.notes ?? '',
    });
    setIsViewMode(true);
    setTimeout(() => setShowModal(true), 0);
  };

  const parseAndFill = async (uri: string, mime: string) => {
    const allowed = await gate('healthRecordsPerMonth', {
      title: 'Scan limit reached',
      message: "You've used your 3 free AI document scans this month. Upgrade to Pro for unlimited.",
    });
    if (!allowed) return;
    setParsingDoc(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      await consume('healthRecordsPerMonth');
      const parsed = await parseInsuranceDocument(b64, mime);
      setEditing(p => ({
        ...p,
        provider: p.provider?.trim() ? p.provider : (parsed.provider ?? p.provider),
        policy_number: p.policy_number?.trim() ? p.policy_number : (parsed.policy_number ?? p.policy_number),
        coverage_type: p.coverage_type?.trim() ? p.coverage_type : (parsed.coverage_type ?? p.coverage_type),
        start_date: p.start_date?.trim() ? p.start_date : (parsed.start_date ?? p.start_date),
        end_date: p.end_date?.trim() ? p.end_date : (parsed.end_date ?? p.end_date),
        premium_amount: p.premium_amount ?? parsed.premium_amount ?? p.premium_amount,
        deductible: p.deductible ?? parsed.deductible ?? p.deductible,
        reimbursement_percent: p.reimbursement_percent ?? parsed.reimbursement_percent ?? p.reimbursement_percent,
        annual_limit: p.annual_limit ?? parsed.annual_limit ?? p.annual_limit,
        claims_phone: p.claims_phone?.trim() ? p.claims_phone : (parsed.claims_phone ?? p.claims_phone),
        notes: p.notes?.trim() ? p.notes : (parsed.summary ?? p.notes),
      }));
    } catch (e: any) {
      console.warn('[insurance] AI parse failed:', e.message);
    }
    setParsingDoc(false);
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { showAlert('Camera access needed', 'Allow camera access in Settings.'); return; }
    await showPickerLoading('Waiting for camera…');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, quality: 0.6, allowsEditing: true });
    hidePickerLoading();
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    setEditing(p => ({ ...p, fileUri: a.uri, fileMime: 'image/jpeg', fileName: undefined, file_url: undefined }));
    parseAndFill(a.uri, 'image/jpeg');
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Photo access needed', 'Allow photo access in Settings.'); return; }
    await showPickerLoading();
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.6, allowsEditing: true });
    hidePickerLoading();
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    const mime = a.mimeType ?? 'image/jpeg';
    setEditing(p => ({ ...p, fileUri: a.uri, fileMime: mime, fileName: undefined, file_url: undefined }));
    parseAndFill(a.uri, mime);
  };

  const pickPDF = async () => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    } catch (e: any) {
      showAlert('Could not open files', e?.message); return;
    }
    if (result.canceled || !(result as any).assets?.length) return;
    const a = (result as any).assets[0];
    const mime = a.mimeType ?? 'application/pdf';
    setEditing(p => ({ ...p, fileUri: a.uri, fileMime: mime, fileName: a.name, file_url: undefined }));
    parseAndFill(a.uri, mime);
  };

  const toDate = (v?: string | null) => { const d = new Date((v ?? '').trim()); return v?.trim() && !isNaN(d.getTime()) ? v.trim() : null; };

  const save = async () => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('save insurance policies')); return; }
    if (!editing.provider?.trim() || !activePetId) { showAlert('Required', 'Please enter the insurance provider.'); return; }
    if (editing.premium_amount != null && (isNaN(editing.premium_amount) || editing.premium_amount < 0)) {
      showAlert('Invalid premium', 'Monthly premium must be a positive number.'); return;
    }
    if (editing.deductible != null && (isNaN(editing.deductible) || editing.deductible < 0)) {
      showAlert('Invalid deductible', 'Deductible must be 0 or greater.'); return;
    }
    if (editing.reimbursement_percent != null && (isNaN(editing.reimbursement_percent) || editing.reimbursement_percent < 0 || editing.reimbursement_percent > 100)) {
      showAlert('Invalid reimbursement', 'Reimbursement must be between 0% and 100%.'); return;
    }
    if (editing.annual_limit != null && (isNaN(editing.annual_limit) || editing.annual_limit <= 0)) {
      showAlert('Invalid annual limit', 'Annual limit must be greater than 0.'); return;
    }
    const claimsDigits = (editing.claims_phone ?? '').trim().replace(/\D/g, '');
    if (claimsDigits.length > 0 && (claimsDigits.length < 7 || claimsDigits.length > 15)) {
      showAlert('Invalid phone', 'Claims phone must be 7–15 digits.'); return;
    }
    if (editing.start_date && editing.end_date && new Date(editing.end_date) < new Date(editing.start_date)) {
      showAlert('Invalid dates', 'End/renewal date must be on or after the start date.'); return;
    }
    setSaving(true);
    let fileUrl = editing.file_url ?? null;
    if (editing.fileUri) {
      setUploadingFile(true);
      try {
        fileUrl = await uploadInsuranceDoc(activePetId, editing.fileUri, editing.fileMime ?? 'image/jpeg');
      } catch (e: any) {
        setUploadingFile(false); setSaving(false);
        showAlert('Upload failed', e.message ?? 'Could not upload the document.'); return;
      }
      setUploadingFile(false);
    }
    const payload = {
      provider: editing.provider.trim(),
      policy_number: editing.policy_number?.trim() || null,
      coverage_type: editing.coverage_type?.trim() || null,
      start_date: toDate(editing.start_date),
      end_date: toDate(editing.end_date),
      premium_amount: editing.premium_amount ?? null,
      deductible: editing.deductible ?? null,
      reimbursement_percent: editing.reimbursement_percent ?? null,
      annual_limit: editing.annual_limit ?? null,
      claims_phone: editing.claims_phone?.trim() || null,
      file_url: fileUrl,
      notes: editing.notes?.trim() || null,
    };
    try {
      await saveInsurance(activePetId, payload, editing.id);
      setShowModal(false);
      load();
    } catch (err: any) {
      showAlert('Error', err.message);
    }
    setSaving(false);
  };

  const remove = (id: string) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('delete insurance policies')); return; }
    showAlert('Delete policy?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteInsurance(id); load(); }
        catch { showAlert('Error', 'Could not delete this policy.'); }
      }},
    ]);
  };

  const displayFileUri = editing.fileUri ?? editing.file_url;

  const shareCard = async (id: string) => {
    const ref = cardRefs.current[id];
    if (!ref) return;
    setSharingId(id);
    try {
      const uri = await (ref as any).capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share insurance card', UTI: 'public.png' });
    } catch (e: any) {
      console.warn('[insurance] share failed:', e.message);
      showAlert('Could not share', 'Try again in a moment.');
    }
    setSharingId(null);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={s.title}>Insurance</Text>
          <PetHeaderChip pet={pet as any} meta={`${policies.length} on file`} />
        </View>
      </View>

      {loading ? (
        <PawBondLoader size={56} />
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 96 }} onScroll={e => setShowScrollTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}>
          {policies.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={{ fontSize: 52 }}>🛡️</Text>
              <Text style={s.emptyTitle}>No insurance on file</Text>
              <Text style={s.emptySub}>Add {pet?.name ?? 'your baby'}'s policy to keep coverage details and the document in one place.</Text>
              {perms.canLogHealth && (
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: accent }]} onPress={openAdd}>
                  <Text style={s.emptyBtnText}>Add insurance</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            policies.map((p) => (
              <WalletCard
                key={p.id}
                policy={p}
                pet={pet}
                accent={accent}
                colors={colors}
                cardRef={(ref) => { cardRefs.current[p.id] = ref; }}
                sharing={sharingId === p.id}
                onShare={() => shareCard(p.id)}
                onEdit={() => openEdit(p)}
                onDelete={() => remove(p.id)}
              />
            ))
          )}
        </ScrollView>
      )}

      <BottomSheet
        visible={showModal}
        onClose={() => { setShowModal(false); setIsViewMode(true); }}
        title={isViewMode && editing.id ? 'Policy details' : editing.id ? 'Edit policy' : 'Add insurance'}
        titleIcon={<Ionicons name="shield-checkmark-outline" size={16} color={accent} />}
        accent={accent}>
        {isViewMode && editing.id ? (
          <PolicyViewSheet
            editing={editing}
            s={s}
            accent={accent}
            colors={colors}
            canLogHealth={perms.canLogHealth}
            onClose={() => setShowModal(false)}
            onDelete={() => { setShowModal(false); remove(editing.id!); }}
            onEdit={() => setIsViewMode(false)}
          />
        ) : (
          <InsuranceFormSheet
            editing={editing}
            setEditing={setEditing}
            s={s}
            accent={accent}
            colors={colors}
            pickerField={pickerField}
            pickerDate={pickerDate}
            parsingDoc={parsingDoc}
            displayFileUri={displayFileUri}
            openDatePicker={openDatePicker}
            setPickerField={setPickerField}
            pickPhoto={pickPhoto}
            pickFromGallery={pickFromGallery}
            pickPDF={pickPDF}
            onDelete={() => { setShowModal(false); remove(editing.id!); }}
            onBack={() => editing.id ? setIsViewMode(true) : setShowModal(false)}
            onSave={save}
            saving={saving}
            uploadingFile={uploadingFile}
          />
        )}
      </BottomSheet>

      {perms.canLogHealth && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: accent, bottom: insets.bottom + 16 }]}
          onPress={() => showScrollTop ? scrollRef.current?.scrollTo({ y: 0, animated: true }) : openAdd()}
          activeOpacity={0.85}>
          {showScrollTop
            ? <Ionicons name="chevron-up" size={26} color="#fff" />
            : <Ionicons name="add" size={28} color="#fff" />}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
