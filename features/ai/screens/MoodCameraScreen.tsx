import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Animated, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { Ionicons } from '@expo/vector-icons';
import { supabase as _supabase, uploadMoodPhoto } from '@/lib/supabase';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { usePaywall, useContextTier } from '@/lib/hooks/usePaywall';
import { LIMITS } from '@/lib/subscription';
import PetHeaderChip from '@/components/PetHeaderChip';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { useActiveLostAlert } from '@/lib/hooks/useActiveLostAlert';
import { FeatureUnavailable } from '@/components/FeatureGate';
import { getPermissions } from '@/lib/permissions';
import { useTheme } from '@/lib/ThemeContext';
import { todayLocal } from '@/lib/dates';
import { differenceInYears, parseISO } from 'date-fns';
import { MOOD_COLOR , TYPO } from '@/constants/theme';
import { ScanOverlay } from '@/features/ai/components/ScanOverlay';
import { MoodResultCard } from '@/features/ai/components/MoodResultCard';
import { MoodPhotoFrame } from '@/features/ai/components/MoodPhotoFrame';
import { makeStyles } from '@/features/ai/components/moodCameraStyles';
import { MoodLabel, MoodResult, MOOD_GRADIENT, TOTAL_GIMMICK_MS, mockAnalyze, callGemini } from '@/features/ai/components/moodCameraUtils';
import { useAuthStore } from '@/store/authStore';
import { scheduleImmediateNotification } from '@/shared/services/notifications.service';

export default function MoodCameraScreen() {
  const { colors, isDark } = useTheme();
  const moodScanEnabled = useFeatureFlag('mood_scan_enabled', true);
  const { activePetId, addMoodLog, addMoodLogToStore, pets, petRoles } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, addMoodLog: s.addMoodLog, addMoodLogToStore: s.addMoodLogToStore, pets: s.pets, petRoles: s.petRoles })));
  const { user: authUser } = useAuthStore();
  const { gate, consume } = usePaywall();
  const tier = useContextTier(activePetId);
  const myRole = activePetId ? (petRoles[activePetId] ?? 'owner') : 'owner';
  const perms  = getPermissions(myRole);
  const pet    = pets.find(p => p.id === activePetId);
  const activeLostAlert = useActiveLostAlert(activePetId ?? null);
  const petAge = useMemo(() => {
    if (!pet || !(pet as any).birthday) return null;
    const ageYrs = differenceInYears(new Date(), parseISO((pet as any).birthday));
    return `${ageYrs} yr${ageYrs !== 1 ? 's' : ''}`;
  }, [pet]);

  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [todayScans,   setTodayScans]   = useState(0);
  const [aiUsedToday,  setAiUsedToday]  = useState(0);
  const [countLoaded,  setCountLoaded]  = useState(false);
  const [forceGimmick, setForceGimmick] = useState(false);

  const AI_QUOTA    = LIMITS[tier].realAiScansPerDay;
  const DAILY_LIMIT = LIMITS[tier].moodScansPerDay;

  useEffect(() => {
    if (!activePetId) return;
    const today = todayLocal();
    _supabase.from('daily_scan_counts').select('count, ai_attempts')
      .eq('pet_id', activePetId).eq('date', today).maybeSingle()
      .then(({ data }) => {
        setTodayScans(data?.count ?? 0);
        setAiUsedToday(data?.ai_attempts ?? 0);
        setCountLoaded(true);
      });
  }, [activePetId]);

  const shouldUseAI = (scansNow: number, aiNow: number): boolean => {
    if (forceGimmick) return false;
    // Pro and Ultimate always use real AI (within their quota)
    if (tier === 'pro' || tier === 'ultimate') {
      return aiNow < AI_QUOTA;
    }
    const remaining = DAILY_LIMIT - scansNow;
    const aiLeft    = AI_QUOTA - aiNow;
    if (aiLeft <= 0)         return false;
    if (aiLeft >= remaining) return true;
    return Math.random() < 0.5;
  };

  const incrementScanCount = async () => {
    if (!activePetId) return;
    await _supabase.rpc('increment_scan_count', { p_pet_id: activePetId, p_date: todayLocal() });
    setTodayScans(n => n + 1);
  };
  const recordAiAttempt = async () => {
    if (!activePetId) return;
    await _supabase.rpc('record_ai_attempt', { p_pet_id: activePetId, p_date: todayLocal() });
    setAiUsedToday(n => n + 1);
  };

  const [photo,        setPhoto]        = useState<string | null>(null);
  const [photoBase64,  setPhotoBase64]  = useState<string | null>(null);
  const [result,       setResult]       = useState<MoodResult | null>(null);
  const [scanning,     setScanning]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [pendingUrl,   setPendingUrl]   = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<MoodLabel | null>(null);

  // Track whether the user left the screen while a scan was running
  const isFocusedRef = useRef(true);
  const leftDuringScanRef = useRef(false);
  const scanningRef = useRef(false);
  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    return () => {
      isFocusedRef.current = false;
      if (scanningRef.current) leftDuringScanRef.current = true;
    };
  }, []));

  // Keep ref in sync so the blur handler can check scanning state synchronously
  useEffect(() => { scanningRef.current = scanning; }, [scanning]);

  // Also mark left-during-scan when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' && scanningRef.current) leftDuringScanRef.current = true;
    });
    return () => sub.remove();
  }, []);

  // Auto-navigate to Care notes after auto-save so user isn't stuck on empty screen
  useEffect(() => {
    if (!(result as any)?._logId) return;
    const t = setTimeout(() => {
      router.navigate({ pathname: '/(tabs)/care', params: { section: 'notes' } } as any);
    }, 1500);
    return () => clearTimeout(t);
  }, [(result as any)?._logId]);

  // When a result arrives and the user has navigated away, fire an immediate notification
  useEffect(() => {
    if (!result || !leftDuringScanRef.current) return;
    leftDuringScanRef.current = false;
    scheduleImmediateNotification({
      title: `${pet?.name ?? 'Pet'}'s mood scan is ready 🐾`,
      body: `${result.mood_label.charAt(0).toUpperCase() + result.mood_label.slice(1)} mood detected — tap to view the full analysis.`,
      data: { screen: 'mood-camera' },
      notifType: 'mood_scan_ready',
    });
  }, [result]);

  // Animated scanning progress messages
  const SCAN_MESSAGES = ['Reading body language…', 'Analysing expression…', 'Checking tail & ears…', 'Almost there…'];
  const [scanMsgIdx, setScanMsgIdx] = useState(0);
  const scanFadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!scanning) { setScanMsgIdx(0); return; }
    const cycle = () => {
      Animated.timing(scanFadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setScanMsgIdx(i => (i + 1) % SCAN_MESSAGES.length);
        Animated.timing(scanFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    };
    const id = setInterval(cycle, 1800);
    return () => clearInterval(id);
  }, [scanning]);

  const ac        = (pet as any)?.accent_color ?? colors.primary;
  const moodColor = result ? (MOOD_COLOR[result.mood_label] ?? ac) : ac;
  const moodGrad  = result ? (MOOD_GRADIENT[result.mood_label] ?? [ac, ac]) : [ac, `${ac}99`] as [string, string];

  const pickPhoto = async (fromCamera: boolean) => {
    try {
      const fn   = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showAlert('Permission needed', 'Please allow access in Settings.'); return; }
      const opts = { mediaTypes: ['images'] as any, quality: 0.7, base64: true, allowsEditing: true, aspect: [1, 1] as [number, number] };
      await showPickerLoading(fromCamera ? 'Waiting for camera…' : 'Opening Gallery…');
      const res = await fn(opts);
      hidePickerLoading();
      if (res.canceled || !res.assets[0]) return;
      setPhoto(res.assets[0].uri);
      setPhotoBase64(res.assets[0].base64 ?? null);
      setResult(null);
      setSelectedMood(null);
    } catch (e: any) {
      if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
        showAlert('Dev build required', 'Run: npx expo run:ios to use camera features.');
      } else {
        showAlert('Error', e?.message ?? 'Could not open camera.');
      }
    }
  };

  const analyze = async () => {
    if (!photo || !activePetId) return;
    const allowed = await gate('moodScansPerDay', {
      title: 'Daily limit reached',
      message: `You've used ${todayScans}/${DAILY_LIMIT} mood scans today. Upgrade for more.`,
    });
    if (!allowed) return;

    setScanning(true); setResult(null); setPendingUrl(null);
    try {
    const useAI = shouldUseAI(todayScans, aiUsedToday);

    if (useAI && photoBase64) {
      const t0 = Date.now();
      let geminiResult: MoodResult | null = null;
      let uploadedUrl: string | null = null;
      try {
        [geminiResult, uploadedUrl] = await Promise.all([
          callGemini(photoBase64, activePetId, pet as any),
          uploadMoodPhoto(activePetId, photo, photoBase64, 'image/jpeg').catch(() => null),
        ]);
      } catch (err: any) {
        if (err?.code === 'SPECIES_MISMATCH') {
          setScanning(false);
          const found = (err as any).species_found;
          const petSpecies = (pet as any)?.species ?? 'pet';
          const detail = found
            ? `We detected a ${found} in this photo, but this profile is for a ${petSpecies}.`
            : `This photo doesn't match the expected species (${petSpecies}).`;
          showAlert('Wrong pet in photo 🐾', detail,
            [{ text: 'Retake', onPress: () => setPhoto(null) }, { text: 'Cancel', style: 'cancel' }]);
          return;
        }
        if (err?.code === 'NO_PET') {
          setScanning(false);
          setForceGimmick(true);
          showAlert('Try a clearer photo 📷', 'Make sure your pet\'s face is clearly visible.',
            [{ text: 'Retake', onPress: () => setPhoto(null) }, { text: 'Cancel', style: 'cancel' }]);
          return;
        }
        geminiResult = null;
      }
      const elapsed = Date.now() - t0;
      if (elapsed < TOTAL_GIMMICK_MS) await new Promise(r => setTimeout(r, TOTAL_GIMMICK_MS - elapsed));

      if (geminiResult?.source === 'gemini') {
        await recordAiAttempt();
        const { data: { user } } = await _supabase.auth.getUser();
        if (user) {
          const { data: log, error: insertErr } = await _supabase.from('mood_logs').insert({
            pet_id: activePetId, scanned_by: user.id,
            mood_label: geminiResult.mood_label, mood_score: geminiResult.mood_score,
            happy_pct: geminiResult.happy_pct, playful_pct: geminiResult.playful_pct,
            tired_pct: geminiResult.tired_pct, anxious_pct: geminiResult.anxious_pct,
            photo_url: uploadedUrl ?? null,
            notes: geminiResult.notes ?? null,
            situation: geminiResult.situation ?? null,
            advice: geminiResult.advice?.length ? geminiResult.advice : null,
            date: todayLocal(),
          }).select('id,pet_id,mood_label,mood_score,notes,photo_url,date,created_at').single();
          if (insertErr || !log) throw new Error(insertErr?.message ?? 'Mood log save failed');
          addMoodLogToStore(log as any);
          await incrementScanCount();
          await consume('moodScansPerDay');
          setForceGimmick(false);
          setPendingUrl(uploadedUrl);
          setResult({ ...geminiResult, _logId: log?.id ?? null } as any);
          setScanning(false);
          // If the user left or backgrounded the app while AI was running, push now
          if (leftDuringScanRef.current) {
            leftDuringScanRef.current = false;
            const label = geminiResult.mood_label;
            scheduleImmediateNotification({
              title: `${pet?.name ?? 'Pet'}'s mood scan is ready 🐾`,
              body: `${label.charAt(0).toUpperCase() + label.slice(1)} mood detected — tap to view the full analysis.`,
              data: { screen: 'mood-camera' },
              notifType: 'mood_scan_ready',
            });
          }
          return;
        }
      }
      setPendingUrl(uploadedUrl);
      setResult(mockAnalyze());
    } else {
      const [uploadedUrl] = await Promise.all([
        photo ? uploadMoodPhoto(activePetId, photo, photoBase64, 'image/jpeg').catch(() => null) : Promise.resolve(null),
        new Promise(r => setTimeout(r, TOTAL_GIMMICK_MS)),
      ]);
      setForceGimmick(false);
      setPendingUrl(uploadedUrl);
      setResult(mockAnalyze());
    }
    } catch (e: any) {
      showAlert('Analysis failed', e?.message ?? 'Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const save = async (moodOverride?: MoodLabel) => {
    if (!result || !activePetId) return;
    // Already saved by the AI path — just navigate
    if ((result as any)._logId) {
      router.navigate({ pathname: '/(tabs)/care', params: { section: 'notes' } } as any);
      return;
    }
    setSaving(true);
    try {
      // Use cached auth user — avoids a network roundtrip just to get the user id
      const userId = authUser?.id ?? (await _supabase.auth.getUser()).data.user?.id;
      if (!userId) { setSaving(false); return; }

      // If the photo upload failed during analysis (slow connection), retry it now
      let photoUrl = pendingUrl;
      if (!photoUrl && photo && photoBase64) {
        photoUrl = await uploadMoodPhoto(activePetId, photo, photoBase64, 'image/jpeg').catch(() => null);
        if (photoUrl) setPendingUrl(photoUrl);
      }

      const mood_label = moodOverride ?? result.mood_label;
      await addMoodLog({
        pet_id: activePetId, scanned_by: userId,
        mood_label: mood_label as any, mood_score: result.mood_score,
        happy_pct: result.happy_pct, playful_pct: result.playful_pct,
        tired_pct: result.tired_pct, anxious_pct: result.anxious_pct,
        photo_url: photoUrl ?? null, notes: result.notes ?? null,
        situation: (result as any).situation ?? null, advice: (result as any).advice ?? null,
        date: todayLocal(),
      });
      // Fire scan-count increment in the background — don't block navigation
      incrementScanCount().catch(() => {});
      // Navigate immediately after the log is saved
      router.navigate({ pathname: '/(tabs)/care', params: { section: 'notes' } } as any);
    } catch (e: any) {
      showAlert('Save failed', e?.message ?? 'Please try again.');
      setSaving(false);
    }
  };

  const isLimited = todayScans >= DAILY_LIMIT;

  if (!moodScanEnabled) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <FeatureUnavailable
            label="Go deeper than a basic scan."
            proGate
            message={`Get instant AI-powered behavioral breakdowns and custom wellness advice tailored exactly to ${pet?.name ?? 'your pet'}'s current mood.`}
            petName={pet?.name}
            ctaLabel="Unlock AI Insights"
          />
        </SafeAreaView>
      </View>
    );
  }

  if (activeLostAlert) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }} edges={['top']}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔴</Text>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 8 }}>
            {pet?.name ?? 'Your pet'} is lost
          </Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
            Mood scans are paused until {pet?.name ?? 'they'} are found. Go to SOS to manage the alert.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View>
              <Text style={[s.title, { color: colors.textPrimary }]}>AI Mood Scan</Text>
              {pet && <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: ac, marginTop: 1 }} numberOfLines={1}>{(pet as any).emoji ?? '🐾'}  {pet.name}{petAge ? `  ·  ${petAge}` : ''}</Text>}
            </View>
            {pet && <PetHeaderChip pet={pet as any} variant="badge" />}
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          <MoodPhotoFrame
            photo={photo}
            scanning={scanning}
            result={result}
            ac={ac}
            isDark={isDark}
            colors={colors}
            onRetake={() => setPhoto(null)}
            scanOverlay={<ScanOverlay ac={ac} />}
          />

          {!result && (
            <View style={s.srcRow}>
              <TouchableOpacity
                style={[s.srcBtn, { backgroundColor: ac }]}
                onPress={() => pickPhoto(true)} disabled={scanning}>
                <Ionicons name="camera-outline" size={18} color="#fff" />
                <Text style={[s.srcBtnTxt, { color: '#fff' }]}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.srcBtn, { backgroundColor: isDark ? colors.card : `${ac}14`, borderWidth: 1, borderColor: `${ac}30` }]}
                onPress={() => pickPhoto(false)} disabled={scanning}>
                <Ionicons name="images-outline" size={18} color={ac} />
                <Text style={[s.srcBtnTxt, { color: ac }]}>Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {!result && (
            <View style={s.quotaRow}>
              {countLoaded ? (
                <View style={[s.quotaPill, {
                  backgroundColor: isLimited ? `${colors.danger}18` : isDark ? colors.surface : `${ac}10`,
                  borderColor: isLimited ? `${colors.danger}35` : `${ac}28`,
                }]}>
                  <Ionicons name={isLimited ? 'ban-outline' : 'sparkles-outline'} size={13} color={isLimited ? colors.danger : ac} />
                  <Text style={[s.quotaTxt, { color: isLimited ? colors.danger : colors.textSecondary }]}>
                    {isLimited
                      ? `Daily limit reached (${DAILY_LIMIT}/${DAILY_LIMIT})`
                      : `${todayScans} of ${DAILY_LIMIT} scans used today`}
                  </Text>
                  <View style={[s.tierChip, { backgroundColor: `${ac}22` }]}>
                    <Text style={[s.tierChipTxt, { color: ac }]}>
                      {tier === 'ultimate' ? 'Ultimate' : tier === 'pro' ? 'Pro' : 'Free'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={[s.quotaPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                  <Text style={[s.quotaTxt, { color: colors.textSecondary }]}>Loading scan quota…</Text>
                </View>
              )}
            </View>
          )}

          {photo && !result && (
            !perms.canScan ? (
              <View style={[s.ctaBanner, { backgroundColor: colors.card }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
                <Text style={[s.ctaBannerTxt, { color: colors.textSecondary }]}>Viewers can't scan — ask the owner</Text>
              </View>
            ) : isLimited ? (
              <View style={[s.ctaBanner, { backgroundColor: colors.card }]}>
                <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
                <Text style={[s.ctaBannerTxt, { color: colors.textSecondary }]}>Daily limit reached — come back tomorrow</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.analyzeBtn, { backgroundColor: ac, opacity: (scanning || !countLoaded) ? 0.6 : 1 }]}
                onPress={analyze} disabled={scanning || !countLoaded}>
                {scanning ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <Animated.View style={{ opacity: scanFadeAnim }}>
                      <Text style={s.analyzeTxt}>{SCAN_MESSAGES[scanMsgIdx]}</Text>
                    </Animated.View>
                  </>
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={20} color="#fff" />
                    <View>
                      <Text style={s.analyzeTxt}>Analyze Mood</Text>
                      <Text style={s.analyzeSub}>{todayScans}/{DAILY_LIMIT} scans used today</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            )
          )}

          {result && (
            <MoodResultCard
              result={result}
              moodColor={moodColor}
              moodGrad={moodGrad}
              colors={colors}
              isDark={isDark}
              ac={ac}
              selectedMood={selectedMood}
              setSelectedMood={setSelectedMood}
              saving={saving}
              onSave={save}
              onRetake={() => { setResult(null); setSelectedMood(null); setPhoto(null); }}
            />
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
