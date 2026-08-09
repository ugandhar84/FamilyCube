import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { filterText } from '@/lib/contentFilter';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Keyboard, Animated, Easing, Modal, Pressable, AppState,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { scheduleImmediateNotification } from '@/shared/services/notifications.service';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { usePaywall, useContextTier } from '@/lib/hooks/usePaywall';
import { supabase } from '@/lib/supabase';
import { LIMITS, showUpgradeAlert } from '@/lib/subscription';
import { UltimateGate, FeatureUnavailable } from '@/components/FeatureGate';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { ScanningOverlay } from '@/features/ai/components/ScanningOverlay';
import { ScanResultCard } from '@/features/ai/components/ScanResultCard';
import { PastScansSection } from '@/features/ai/components/PastScansSection';
import { PhotoPickerSheet } from '@/features/ai/components/PhotoPickerSheet';
import { makeStyles } from '@/features/ai/components/symptomScanStyles';
import { ScanResult, PastScan } from '@/features/ai/components/symptomScanUtils';
import { TYPO } from '@/constants/theme';

export default function SymptomScanScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
  const pet = activePet();
  const symptomScanEnabled = useFeatureFlag('ai_symptom_scan_enabled', true);
  const { gate, consume } = usePaywall();
  const tier = useContextTier(pet?.id);

  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [photoUri, setPhotoUri]   = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [symptoms, setSymptoms]   = useState('');
  const [scanning, setScanning]   = useState(false);
  const [result, setResult]       = useState<ScanResult | null>(null);
  const [usedToday, setUsedToday] = useState(0);

  const scanningRef       = useRef(false);
  const leftDuringScanRef = useRef(false);

  useFocusEffect(useCallback(() => {
    return () => { if (scanningRef.current) leftDuringScanRef.current = true; };
  }, []));

  useEffect(() => { scanningRef.current = scanning; }, [scanning]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' && scanningRef.current) leftDuringScanRef.current = true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!result || !leftDuringScanRef.current) return;
    leftDuringScanRef.current = false;
    const urgency = (result as any).urgency ?? '';
    scheduleImmediateNotification({
      title: `${pet?.name ?? 'Pet'}'s symptom scan is ready 🩺`,
      body: urgency
        ? `${urgency.charAt(0).toUpperCase() + urgency.slice(1)} — tap to view the full analysis.`
        : 'Tap to view the full analysis.',
      data: { screen: 'symptom-scan' },
      notifType: 'symptom_scan_ready',
    });
  }, [result]);

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const dotsAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!scanning) return;
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim,  { toValue: 1.18, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim,  { toValue: 1,    duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const rotate = Animated.loop(Animated.timing(rotateAnim, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
    const dots   = Animated.loop(Animated.timing(dotsAnim,   { toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: false }));
    pulse.start(); rotate.start(); dots.start();
    return () => { pulse.stop(); rotate.stop(); dots.stop(); rotateAnim.setValue(0); pulseAnim.setValue(1); };
  }, [scanning]);

  const [pastScans, setPastScans]       = useState<PastScan[]>([]);
  const [expandedScan, setExpandedScan] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri]   = useState<string | null>(null);
  const [dateFilter, setDateFilter]     = useState<'all' | '7d' | '30d'>('all');

  useEffect(() => {
    if (user?.id) useSubscriptionStore.getState().refreshUsage(user.id, 'symptomScansPerDay').then(setUsedToday).catch(() => {});
  }, [user?.id]);

  const dailyLimit = LIMITS[tier].symptomScansPerDay;

  useEffect(() => {
    if (!user?.id || !pet?.id) return;
    supabase
      .from('symptom_scan_results')
      .select('id, urgency, symptoms_text, created_at, result, photo_url')
      .eq('user_id', user.id)
      .eq('pet_id', pet.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setPastScans((data ?? []) as PastScan[]));
  }, [user?.id, pet?.id]);

  const filteredScans = useMemo(() => {
    if (dateFilter === 'all') return pastScans;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (dateFilter === '7d' ? 7 : 30));
    return pastScans.filter(s => new Date(s.created_at) >= cutoff);
  }, [pastScans, dateFilter]);

  const deleteScan = (id: string) => {
    showAlert('Delete scan?', 'This will permanently remove this scan record.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setPastScans(prev => prev.filter(s => s.id !== id));
        await supabase.from('symptom_scan_results').delete().eq('id', id);
      }},
    ]);
  };

  const pickPhoto = async (useCamera: boolean) => {
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { setShowPhotoPicker(false); showAlert('Camera needed', 'Allow camera access in Settings.'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { setShowPhotoPicker(false); showAlert('Photos needed', 'Allow photo access in Settings.'); return; }
    }
    let pickerResult: ImagePicker.ImagePickerResult;
    try {
      await showPickerLoading(useCamera ? 'Waiting for camera…' : 'Opening Gallery…');
      pickerResult = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: false, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: false, allowsEditing: true });
      hidePickerLoading();
    } catch (e: any) {
      hidePickerLoading();
      setShowPhotoPicker(false);
      showAlert('Error', e?.message ?? 'Could not open photo picker.');
      return;
    }
    setShowPhotoPicker(false);
    if (!pickerResult.canceled && pickerResult.assets[0]) setPhotoUri(pickerResult.assets[0].uri);
  };

  const runScan = async () => {
    if (!symptoms.trim()) { showAlert('Describe symptoms', 'Please describe what you are seeing before scanning.'); return; }
    const allowed = await gate('symptomScansPerDay', { title: 'Scan limit reached', message: `You've used ${usedToday}/${dailyLimit} symptom scans today. Upgrade for more.` });
    if (!allowed) return;

    Keyboard.dismiss();
    setScanning(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Please sign in again.');

      let image_base64: string | null = null;
      let mime_type = 'image/jpeg';
      if (photoUri) {
        image_base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: 'base64' });
        mime_type = photoUri.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const res = await fetch(`${supabaseUrl}/functions/v1/symptom-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          image_base64: image_base64 ?? '', mime_type, symptoms: symptoms.trim(),
          pet_id: pet?.id, pet_name: pet?.name,
          pet_species: (pet as any)?.species, pet_breed: (pet as any)?.breed,
          pet_age_years: (pet as any)?.birthday
            ? Math.floor((Date.now() - new Date((pet as any).birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 402 && (errData.code === 'ultimate_required' || errData.code === 'pro_required')) {
          showUpgradeAlert({ requiredTier: 'ultimate', message: 'Upgrade to Ultimate to use Symptom Scan.' });
          setScanning(false);
          return;
        }
        if (res.status === 422 && errData.error === 'content_moderated') {
          showAlert('Message not sent', errData.message ?? 'Please rephrase and try again.');
          setScanning(false);
          return;
        }
        throw new Error(`Server error ${res.status}. Please try again.`);
      }
      const data = await res.json();
      if (data.error === 'no_pet_detected') {
        showAlert('No pet found', data.message ?? 'Please retake with your pet clearly visible.');
        return;
      }
      if (data.error) throw new Error(data.error);

      const { _scan_id, ...rest } = data;
      const scanResult = rest as ScanResult;
      setResult(scanResult);
      await consume('symptomScansPerDay');
      setUsedToday(d => d + 1);

      const newEntry: PastScan = {
        id: _scan_id ?? Date.now().toString(),
        urgency: scanResult.urgency,
        symptoms_text: symptoms.trim(),
        created_at: new Date().toISOString(),
        result: scanResult,
      };
      setPastScans(prev => [newEntry, ...prev].slice(0, 10));
    } catch (e: any) {
      showAlert('Scan failed', e?.message ?? 'Please try again.');
    } finally {
      setScanning(false);
    }
  };

  if (!symptomScanEnabled) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <FeatureUnavailable label="Symptom Scan" />
      </SafeAreaView>
    );
  }

  if (tier !== 'ultimate') {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <UltimateGate
          icon="medical-outline"
          featureName="Instant AI Symptom Scanner"
          tagline={`Is it an emergency or just grass? Photo-scan ${pet?.name ?? 'your pet'}'s rashes, eyes, or digestion issues for immediate triage guidance.`}
          petName={pet?.name}
          ctaLabel={`Unlock AI Scanner for ${pet?.name ?? 'your pet'}`}
          perks={[
            'AI-powered urgency triage (emergency to normal)',
            'Photo analysis — show what you see',
            'Possible causes & home care advice',
            'Know when to visit the vet immediately',
          ]}
          currentTier={tier}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled">

      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Symptom Scan</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>
            AI-powered health check · {usedToday}/{dailyLimit} scans today
          </Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>

        <TouchableOpacity onPress={() => setShowPhotoPicker(true)} activeOpacity={0.8}
          style={[s.photoBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} cachePolicy="memory-disk" style={s.photoPreview} contentFit="cover" />
          ) : (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Ionicons name="camera-outline" size={36} color={colors.textTertiary} />
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>Add photo (optional)</Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
                A photo helps the AI give a better assessment
              </Text>
            </View>
          )}
          {photoUri && (
            <TouchableOpacity onPress={() => setPhotoUri(null)}
              style={[s.photoRemove, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <View>
          <Text style={[s.label, { color: colors.textSecondary }]}>DESCRIBE THE SYMPTOMS *</Text>
          <TextInput
            style={[s.textArea, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder={`e.g. "${pet?.name ?? 'My pet'} has been limping on the front left leg since this morning, not putting weight on it"`}
            placeholderTextColor={colors.textTertiary}
            value={symptoms}
            onChangeText={t => setSymptoms(filterText(t))}
            multiline numberOfLines={4} maxLength={600} textAlignVertical="top"
          />
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 4, textAlign: 'right' }}>
            {symptoms.length}/600
          </Text>
        </View>

        <TouchableOpacity onPress={runScan} disabled={scanning || !symptoms.trim()} activeOpacity={0.8}>
          <LinearGradient colors={[`${colors.primary}DD`, colors.primary]} style={[s.scanBtn, { opacity: !symptoms.trim() ? 0.5 : 1 }]}>
            <Ionicons name="scan-outline" size={20} color="#fff" />
            <Text style={s.scanBtnText}>Analyze Symptoms</Text>
          </LinearGradient>
        </TouchableOpacity>

        {scanning && (
          <ScanningOverlay
            petName={pet?.name ?? 'your pet'}
            pulseAnim={pulseAnim}
            rotateAnim={rotateAnim}
            dotsAnim={dotsAnim}
            colors={colors}
          />
        )}

        {result && <ScanResultCard result={result} colors={colors} isDark={isDark} />}

        {pastScans.length > 0 && (
          <PastScansSection
            filteredScans={filteredScans}
            totalCount={pastScans.length}
            dateFilter={dateFilter}
            onDateFilter={setDateFilter}
            expandedScan={expandedScan}
            onToggleExpand={id => setExpandedScan(expandedScan === id ? null : id)}
            onDelete={deleteScan}
            onLightbox={setLightboxUri}
            colors={colors}
            isDark={isDark}
          />
        )}

        <Modal visible={!!lightboxUri} transparent animationType="none" onRequestClose={() => setLightboxUri(null)}>
          <Pressable style={s.lightboxBg} onPress={() => setLightboxUri(null)}>
            {lightboxUri && <Image source={{ uri: lightboxUri }} cachePolicy="memory-disk" style={s.lightboxImg} contentFit="contain" />}
            <TouchableOpacity onPress={() => setLightboxUri(null)} style={s.lightboxClose}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </Pressable>
        </Modal>

      </View>
    </ScrollView>

    <PhotoPickerSheet
      visible={showPhotoPicker}
      onClose={() => setShowPhotoPicker(false)}
      onPickPhoto={pickPhoto}
      colors={colors}
    />
    </>
  );
}
