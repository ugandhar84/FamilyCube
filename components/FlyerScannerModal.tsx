/**
 * FlyerScannerModal — full-page flyer-to-schedule flow (owner component)
 *
 * Step 1: CAPTURE
 *   Up to 3 photos (camera or gallery) OR pick a PDF (rendered as image)
 *   Thumbnail strip shows what's queued; tap to remove
 *
 * Step 2: PROCESSING
 *   Images sent to parse-flyer edge function (Gemini Vision)
 *   Spinner while waiting
 *
 * Step 3: REVIEW + CONFIRM
 *   Extracted event card with all editable fields
 *   Kid-picker chips — choose which kid(s) this goes to
 *   "Add to Schedule" saves an event per selected kid via useEventStore
 *   Parent can tap any field to edit before confirming
 *
 * Converted from AppBottomSheet (a bottom-sheet shell) to full-page
 * screens per the project's hard "no bottom sheets" rule — every step is
 * now its own full-page screen component under components/flyerScanner/,
 * rendered through FullPageOverlay (never Modal/pageSheet/bottom-drawer),
 * matching features/vault/records/BringInDocumentScreen.tsx +
 * ReviewFindingsScreen.tsx's full-page capture-entry / AI-review pattern.
 * This file remains the single owner of all state + handlers (capture,
 * parse-flyer call, save-to-store handlers) — only the shell changed, not
 * the capture/AI-parse/save logic, which is preserved exactly as it was.
 *
 * Public prop interface ({ visible, onClose }) is unchanged so none of the
 * 3 real call sites (KioskOverviewTab.tsx, HubScreen.tsx,
 * SchoolHomeScreen.tsx) need any edits.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Animated, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
// SDK 54's default expo-file-system export dropped readAsStringAsync as a
// hard runtime error, not just a deprecation warning — /legacy is the
// documented migration path.
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/compressImage';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';
import { useSchoolStore } from '@/store/schoolStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import FullPageOverlay from '@/components/FullPageOverlay';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import AiConsentSheet, { useAiConsent } from '@/components/AiConsentGate';
import { View, Text } from 'react-native';
import { TYPO } from '@/constants/theme';

import CaptureScreen from './flyerScanner/CaptureScreen';
import ProcessingScreen from './flyerScanner/ProcessingScreen';
import ReviewEventScreen from './flyerScanner/ReviewEventScreen';
import ReviewTimetableScreen from './flyerScanner/ReviewTimetableScreen';
import ReviewMultiScreen from './flyerScanner/ReviewMultiScreen';
import {
  CapturedImage, ExtractedEvent, ExtractedPeriod, FlyerResult, Step,
  dateToStr,
} from './flyerScanner/types';

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FlyerScannerModal({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const { addEvent } = useEventStore();
  const { schedules, addSchedule, updateSchedule } = useSchoolStore();
  const { tier, isTrial } = useSubscriptionStore();
  const activeMember = members.find(m => m.id === activeMemberId);
  const { checked: consentChecked, consented, showSheet: showConsent, setShowSheet: setShowConsent, markConsented } = useAiConsent(activeMemberId ?? undefined);
  const pendingScanAction = useRef<(() => void) | null>(null);

  // This flow is a full-page overlay (see FullPageOverlay below), so it
  // must hide the real tab bar while open and restore it on close/unmount
  // — matching the pattern used across the vault's other full-page flows
  // (HomeownerNotesScreen.tsx et al). hideTabBar/showTabBar are both
  // idempotent (tabBarVisibility.ts guards on its own _visible flag), so
  // this is safe to own here independently of whichever host screen
  // (KioskOverviewTab/HubScreen/SchoolHomeScreen) rendered us — no
  // double-hide/double-show risk even if a host screen has its own
  // separate full-bleed tracking for other overlays.
  useEffect(() => {
    if (visible) hideTabBar();
    else showTabBar();
    return () => { showTabBar(); };
  }, [visible]);

  // calendar_events' own INSERT RLS policy (family_can_create_content)
  // blocks writes once a family's 15-day trial ends without an active
  // subscription — live-reported: scanning a flyer with 39 events showed
  // "Couldn't import events... check your connection" (the new, honest
  // error from awaiting addEvent — see handleConfirmMulti's own comment)
  // when the REAL cause was an expired trial, not connectivity. Checking
  // this up front and showing the paywall directly avoids a doomed
  // multi-insert attempt and gives the actual reason instead of a
  // misleading connection-error message. Mirrors the same tier/isTrial
  // gate ProfileSettingsScreen.tsx and ParentView.tsx already use.
  const canCreateContent = tier !== 'free' || isTrial;
  const blockIfPaywalled = (): boolean => {
    if (canCreateContent) return false;
    usePaywallSheetStore.getState().show({
      headline: 'Your trial has ended',
      body: 'Upgrade to keep adding events, chores, and more for your family.',
    });
    return true;
  };

  const allNames = members.map(m => m.name);
  const kids     = members.filter(m => m.role === 'kid');

  // ── State ──
  const [step, setStep]               = useState<Step>('capture');
  const [images, setImages]           = useState<CapturedImage[]>([]);
  const [errorMsg, setError]          = useState('');
  const [flyerResult, setFlyerResult] = useState<FlyerResult | null>(null);
  const [selectedKids, setSelKids]    = useState<string[]>([]);
  // multi-event: which events are selected for import
  const [selectedEvents, setSelEvts]  = useState<Set<number>>(new Set());
  // timetable: which kid to assign schedule to
  const [timetableKidId, setTTKid]   = useState('');
  // timetable: editable copy of extracted periods
  const [editablePeriods, setEditablePeriods] = useState<ExtractedPeriod[]>([]);
  const [selectedTerm, setSelectedTerm]       = useState<string | null>(null);

  // Convenience accessors
  const event    = flyerResult?.type === 'event'     ? flyerResult.event     : null;
  const timetable= flyerResult?.type === 'timetable' ? flyerResult.timetable : null;
  const multiCal = flyerResult?.type === 'calendar'  ? flyerResult.calendar  : null;

  // ── Toast ──
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState({ text: '', success: true });
  const showToast = useCallback((text: string, success = true) => {
    setToastMsg({ text, success });
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [toastOpacity]);

  // ── Image helpers ──
  const addImage = useCallback((img: CapturedImage) => {
    setImages(prev => prev.length < 3 ? [...prev, img] : prev);
  }, []);

  const removeImage = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, base64: false });
    if (!result.canceled && result.assets[0]) {
      const { uri, base64 } = await compressImage(result.assets[0].uri);
      addImage({ uri, base64, mimeType: 'image/jpeg' });
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Photo library permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
      allowsMultipleSelection: true,
      selectionLimit: 3 - images.length,
    });
    if (!result.canceled) {
      for (const a of result.assets) {
        const { uri, base64 } = await compressImage(a.uri);
        addImage({ uri, base64, mimeType: 'image/jpeg' });
      }
    }
  };

  const pickPDF = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled) return;
    // We can't render PDF to image client-side in RN easily.
    // Send the PDF as base64 with mimeType application/pdf — Gemini handles it natively.
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' as any });
      addImage({ uri: asset.uri, base64: b64, mimeType: 'application/pdf' });
    } catch {
      Alert.alert('Could not read PDF');
    }
  };

  // ── AI call ──
  const processImagesNow = async () => {
    if (!images.length) { Alert.alert('Add at least one photo or PDF'); return; }
    setStep('processing');
    setError('');
    try {
      console.log('[flyer] sending', images.length, 'image(s), mimeTypes:', images.map(i => i.mimeType));
      console.log('[flyer] base64 sizes (chars):', images.map(i => i.base64.length));

      // Use raw fetch so we can read the body even on non-2xx
      const fnUrl = process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/parse-flyer';
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const rawRes = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
        body: JSON.stringify({ images: images.map(img => ({ data: img.base64, mimeType: img.mimeType })) }),
      });
      const rawText = await rawRes.text();
      console.log(`[flyer] HTTP ${rawRes.status} body: ${rawText.slice(0, 500)}`);
      const data = JSON.parse(rawText);
      if (!rawRes.ok || !data?.ok) {
        throw new Error(data?.error ?? `HTTP ${rawRes.status}`);
      }
      console.log('[flyer] result type:', data.type);
      const result = data as FlyerResult;
      setFlyerResult(result);
      setSelKids(kids.length === 1 ? [kids[0].id] : []);
      if (result.type === 'timetable') {
        setTTKid(kids.length === 1 ? kids[0].id : '');
        setEditablePeriods(result.timetable.periods);
        const firstTerm = result.timetable.periods.find(p => p.term)?.term ?? null;
        setSelectedTerm(firstTerm);
        setStep('timetable');
      } else if (result.type === 'calendar') {
        // Pre-select all events
        setSelEvts(new Set(result.calendar.events.map((_, i) => i)));
        setStep('multi');
      } else {
        setStep('review');
      }
    } catch (e: any) {
      console.error('[flyer] catch:', e?.message ?? e);
      setError(e.message ?? 'Something went wrong');
      setStep('capture');
    }
  };

  const processImages = () => {
    if (!consentChecked || consented) { processImagesNow(); return; }
    pendingScanAction.current = processImagesNow;
    setShowConsent(true);
  };

  // ── Save single event ──
  const handleConfirmEvent = async () => {
    if (!event) return;
    if (selectedKids.length === 0) { Alert.alert('Choose at least one kid for this event'); return; }
    if (blockIfPaywalled()) return;
    // Same fire-and-forget bug as handleConfirmMulti below — await each
    // addEvent call and only claim success for the ones that actually
    // persisted (addEvent returns '' on failure, a real row id on success).
    let succeeded = 0;
    for (const kidId of selectedKids) {
      const id = await addEvent({
        title:    event.title,
        date:     event.date ?? dateToStr(new Date()),
        time:     event.time ?? undefined,
        endTime:  event.end_time ?? undefined,
        category: event.category,
        location: event.location ?? undefined,
        notes:    [event.description, event.notes, event.recurrence_desc].filter(Boolean).join(' · ') || undefined,
        memberId: kidId,
        type:     'event',
        color:    BRAND.teal,
        approvalPending: false,
      });
      if (id) succeeded++;
    }
    if (succeeded === 0) {
      Alert.alert("Couldn't add event", 'Check your connection and try again.');
      return;
    }
    const kidNames = selectedKids.map(id => members.find(m => m.id === id)?.name.split(' ')[0]).join(', ');
    showToast(`✓ "${event.title}" added for ${kidNames}`);
    setTimeout(resetAndClose, 2600);
  };

  // ── Save multi calendar events ──
  const [importingMulti, setImportingMulti] = useState(false);
  const handleConfirmMulti = async () => {
    if (!multiCal) return;
    if (selectedKids.length === 0) { Alert.alert('Choose at least one kid'); return; }
    const toAdd = multiCal.events.filter((_, i) => selectedEvents.has(i));
    if (toAdd.length === 0) { Alert.alert('Select at least one event to import'); return; }
    if (blockIfPaywalled()) return;
    if (importingMulti) return;
    setImportingMulti(true);
    // Was fire-and-forget: addEvent is async and can fail per-call (its own
    // error path already shows a toast), but this loop never awaited any of
    // the resulting promises before showing a hardcoded success toast and
    // closing the modal — live-reported: 38 flyer-scanned events "imported"
    // successfully per the toast, but zero of them ever landed in
    // calendar_events (confirmed via direct DB query). Awaiting each call
    // and counting real successes/failures is what actually tells the user
    // (and this code) what happened.
    let succeeded = 0;
    let failed = 0;
    for (const ev of toAdd) {
      for (const kidId of selectedKids) {
        const id = await addEvent({
          title:    ev.title,
          date:     ev.date ?? dateToStr(new Date()),
          time:     ev.time ?? undefined,
          endTime:  ev.end_time ?? undefined,
          category: ev.category,
          location: ev.location ?? undefined,
          notes:    ev.notes ?? undefined,
          memberId: kidId,
          type:     'event',
          color:    BRAND.teal,
          approvalPending: false,
        });
        if (id) succeeded++; else failed++;
      }
    }
    setImportingMulti(false);
    const kidNames = selectedKids.map(id => members.find(m => m.id === id)?.name.split(' ')[0]).join(', ');
    if (failed === 0) {
      showToast(`✓ ${succeeded} event${succeeded !== 1 ? 's' : ''} imported for ${kidNames}`);
      setTimeout(resetAndClose, 2600);
    } else if (succeeded === 0) {
      Alert.alert("Couldn't import events", 'None of the events could be saved — check your connection and try again.');
    } else {
      Alert.alert('Some events failed', `${succeeded} of ${succeeded + failed} events were imported for ${kidNames}. ${failed} failed — check your connection and try again.`);
      setTimeout(resetAndClose, 2600);
    }
  };

  // ── Save timetable ──
  const handleConfirmTimetable = () => {
    if (!timetable) return;
    if (!timetableKidId) { Alert.alert('Choose a kid for this schedule'); return; }
    const kid = kids.find(k => k.id === timetableKidId);
    if (!kid) return;
    const periods = editablePeriods.map((p, i) => ({
      id:        'p' + Date.now() + i,
      period:    i + 1,
      subject:   p.subject,
      room:      p.room ?? '',
      teacher:   p.teacher ?? undefined,
      startTime: p.startTime ?? '08:00',
      endTime:   p.endTime ?? '08:50',
      isLunch:   p.isLunch ?? false,
      days:      p.days.length ? p.days : ['mon','tue','wed','thu','fri'],
      term:      p.term ?? undefined,
    }));
    const existing = schedules.find(s => s.memberId === timetableKidId);
    const schedule = {
      memberId:    timetableKidId,
      memberName:  kid.name,
      semester:    'Fall' as any,
      year:        new Date().getFullYear(),
      gradeYear:   timetable.grade ?? undefined,
      school:      timetable.school ?? undefined,
      lunchPeriod: 'B' as any,
      dayType:     'Regular' as any,
      periods,
    };
    if (existing) updateSchedule(timetableKidId, schedule);
    else           addSchedule(schedule);
    showToast(`✓ ${kid.name.split(' ')[0]}'s timetable saved`);
    setTimeout(resetAndClose, 2600);
  };

  const resetAndClose = () => {
    setStep('capture'); setImages([]); setFlyerResult(null);
    setSelKids([]); setSelEvts(new Set()); setTTKid('');
    setError('');
    onClose();
  };

  const rescan = () => { setStep('capture'); setFlyerResult(null); };

  // ── Event field updater ──
  const updateEvent = (field: keyof ExtractedEvent, value: any) =>
    setFlyerResult(prev => prev?.type === 'event' ? { ...prev, event: { ...prev.event, [field]: value } } : prev);

  return (
    <FullPageOverlay visible={visible} onDismiss={resetAndClose} zIndex={70}>
      <AiConsentSheet
        visible={showConsent}
        memberId={activeMemberId ?? ''}
        familyId={activeMember?.familyId}
        colors={colors}
        isDark={isDark}
        onAgree={() => {
          setShowConsent(false);
          markConsented();
          pendingScanAction.current?.();
          pendingScanAction.current = null;
        }}
        onDecline={() => { setShowConsent(false); pendingScanAction.current = null; }}
      />

      {step === 'capture' && (
        <CaptureScreen
          colors={colors} isDark={isDark}
          images={images} removeImage={removeImage}
          onPickCamera={pickFromCamera}
          onPickGallery={pickFromGallery}
          onPickPDF={pickPDF}
          onAnalyse={processImages}
          onClose={resetAndClose}
          errorMsg={errorMsg}
        />
      )}

      {step === 'processing' && (
        <ProcessingScreen colors={colors} isDark={isDark} />
      )}

      {step === 'review' && event && (
        <ReviewEventScreen
          colors={colors} isDark={isDark}
          event={event} updateEvent={updateEvent}
          kids={kids} allNames={allNames}
          selectedKids={selectedKids} setSelKids={setSelKids}
          onConfirm={handleConfirmEvent}
          onRescan={rescan}
          onClose={resetAndClose}
        />
      )}

      {step === 'timetable' && timetable && (
        <ReviewTimetableScreen
          colors={colors} isDark={isDark}
          timetable={timetable}
          editablePeriods={editablePeriods} setEditablePeriods={setEditablePeriods}
          selectedTerm={selectedTerm} setSelectedTerm={setSelectedTerm}
          kids={kids} allNames={allNames}
          timetableKidId={timetableKidId} setTTKid={setTTKid}
          onConfirm={handleConfirmTimetable}
          onRescan={rescan}
          onClose={resetAndClose}
        />
      )}

      {step === 'multi' && multiCal && (
        <ReviewMultiScreen
          colors={colors} isDark={isDark}
          multiCal={multiCal}
          selectedEvents={selectedEvents} setSelEvts={setSelEvts}
          kids={kids} allNames={allNames}
          selectedKids={selectedKids} setSelKids={setSelKids}
          onConfirm={handleConfirmMulti}
          onRescan={rescan}
          onClose={resetAndClose}
        />
      )}

      {/* ── TOAST ── */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 24, left: 0, right: 0, zIndex: 99, opacity: toastOpacity }}>
        <View style={withAndroidShadowFix({ marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: toastMsg.success ? '#059669' : '#EF4444',
          flexDirection: 'row', alignItems: 'center', gap: 8,
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 })}>
          <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>{toastMsg.text}</Text>
        </View>
      </Animated.View>
    </FullPageOverlay>
  );
}
