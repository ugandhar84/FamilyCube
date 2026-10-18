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
import { hideAiNames } from '@/lib/hideAiNames';
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
import { useUIStore } from '@/store/uiStore';
import { router } from 'expo-router';
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
import LinkCalendarScreen, { type SchoolCalendarLink } from './flyerScanner/LinkCalendarScreen';
import { parseIcs, normalizeCalendarUrl, type IcsEvent } from '@/lib/icsParse';
import {
  CapturedImage, ExtractedEvent, ExtractedPeriod, FlyerResult, Step,
  dateToStr,
} from './flyerScanner/types';

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Open on the "link a calendar" page instead of the photo capture page. */
  startOnLink?: boolean;
}

export default function FlyerScannerModal({ visible, onClose, startOnLink }: Props) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const { addEvent } = useEventStore();
  const { schedules, addSchedule, updateSchedule, addHoliday } = useSchoolStore();
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
  // Kids and teens: a school calendar applies to everyone at the same school district.
  const kids     = members.filter(m => m.role === 'kid' || m.role === 'teen');

  // ── State ──
  const [step, setStep]               = useState<Step>(startOnLink ? 'link' : 'capture');
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
      // Keep whoever was chosen on the first page; default to the only kid when there is just one.
      setSelKids(prev => prev.length ? prev : (kids.length === 1 ? [kids[0].id] : []));
      if (result.type === 'timetable') {
        setTTKid(kids.length === 1 ? kids[0].id : '');
        setEditablePeriods(result.timetable.periods);
        const firstTerm = result.timetable.periods.find(p => p.term)?.term ?? null;
        setSelectedTerm(firstTerm);
        setStep('timetable');
      } else if (result.type === 'calendar') {
        // Same school district for the whole family by default: pre-select every kid and every event; both can be changed.
        setSelKids(prev => prev.length ? prev : kids.map(k => k.id));
        setSelEvts(new Set(result.calendar.events.map((_, i) => i)));
        setStep('multi');
      } else {
        setStep('review');
      }
    } catch (e: any) {
      console.error('[flyer] catch:', e?.message ?? e);
      setError(hideAiNames(e.message) ?? 'Something went wrong');
      setStep('capture');
    }
  };

  const processImages = () => {
    if (!consentChecked || consented) { processImagesNow(); return; }
    pendingScanAction.current = processImagesNow;
    setShowConsent(true);
  };

  // One save at a time: a ref (not state) so a fast second tap is refused before React re-renders.
  const busyRef = useRef(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);

  // The reader often writes "00:00" for a line with no time; midnight is never a real start here, so treat it as no time.
  const realTime = (t?: string | null) => (t && !/^0{1,2}:00(:00)?$/.test(t.trim()) ? t : undefined);

  // ── Save single event ──
  const handleConfirmEvent = async () => {
    if (!event || busyRef.current) return;
    if (selectedKids.length === 0) { Alert.alert('Choose at least one kid for this event'); return; }
    if (blockIfPaywalled()) return;
    busyRef.current = true;
    setSaveProgress({ done: 0, total: 1 });
    // Same fire-and-forget bug as handleConfirmMulti below — await each
    // addEvent call and only claim success for the ones that actually
    // persisted (addEvent returns '' on failure, a real row id on success).
    let succeeded = 0;
    // One shared entry for all chosen kids (the calendar shows every name) instead of a copy per kid.
    {
      const id = await addEvent({
        title:    event.title,
        date:     event.date ?? dateToStr(new Date()),
        time:     realTime(event.time),
        endTime:  realTime(event.end_time),
        allDay:   !realTime(event.time) && !realTime(event.end_time) ? true : undefined,
        category: event.category,
        location: event.location ?? undefined,
        notes:    [event.description, event.notes, event.recurrence_desc].filter(Boolean).join(' · ') || undefined,
        memberId: selectedKids[0],
        memberIds: selectedKids.length > 1 ? selectedKids : undefined,
        type:     'event',
        color:    BRAND.teal,
        approvalPending: false,
      });
      if (id) succeeded++;
      setSaveProgress({ done: succeeded, total: 1 });
    }
    if (succeeded === 0) {
      busyRef.current = false; setSaveProgress(null);
      Alert.alert("Couldn't add event", 'Check your connection and try again.');
      return;
    }
    const kidNames = selectedKids.map(id => members.find(m => m.id === id)?.name.split(' ')[0]).join(', ');
    showToast(`✓ "${event.title}" added for ${kidNames}`);
    setTimeout(() => { busyRef.current = false; setSaveProgress(null); resetAndClose(); }, 1200);
  };

  // Days off on a flyer come as one line per day; a break is one range. Merge same-title days that are back to back
  // (a weekend in between does not break a range) into "from – to".
  const isDayOff = (ev: { title: string; category?: string | null }) =>
    ev.category === 'Holiday' || /\b(holiday|break|no school|in-?service|staff (professional|development)|teacher work ?day|school closed)\b/i.test(ev.title);
  const holidayRanges = (events: { title: string; date?: string | null; category?: string | null }[]) => {
    const dayNum = (d: string) => Math.round(new Date(d + 'T12:00:00').getTime() / 86400000);
    const byTitle = new Map<string, string[]>();
    for (const ev of events) {
      if (!ev.date || !isDayOff(ev)) continue;
      byTitle.set(ev.title, [...(byTitle.get(ev.title) ?? []), ev.date]);
    }
    const out: { reason: string; startDate: string; endDate: string }[] = [];
    byTitle.forEach((dates, reason) => {
      const sorted = [...new Set(dates)].sort();
      let start = sorted[0], prev = sorted[0];
      for (const d of sorted.slice(1)) {
        const gap = dayNum(d) - dayNum(prev);
        const weekendBridge = gap <= 3 && new Date(prev + 'T12:00:00').getDay() === 5;
        if (gap > 1 && !weekendBridge) { out.push({ reason, startDate: start, endDate: prev }); start = d; }
        prev = d;
      }
      out.push({ reason, startDate: start, endDate: prev });
    });
    return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  };

  // ── Save multi calendar events ──
  const [importingMulti, setImportingMulti] = useState(false);
  const handleConfirmMulti = async () => {
    if (!multiCal) return;
    if (selectedKids.length === 0) { Alert.alert('Choose at least one kid'); return; }
    const toAdd = multiCal.events.filter((_, i) => selectedEvents.has(i));
    if (toAdd.length === 0) { Alert.alert('Select at least one event to import'); return; }
    if (blockIfPaywalled()) return;
    if (importingMulti || busyRef.current) return;
    busyRef.current = true;
    setImportingMulti(true);
    setSaveProgress({ done: 0, total: toAdd.length });
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
    // ONE calendar entry per flyer line, shared by every chosen kid (not a copy per kid): the calendar then shows all their
    // names, and the database's duplicate guard no longer drops the second kid's copy.
    const rows = toAdd.map(ev => ({
      title:    ev.title,
      date:     ev.date ?? dateToStr(new Date()),
      time:     realTime(ev.time),
      endTime:  realTime(ev.end_time),
      // No start or end time on the flyer means a whole-day entry.
      allDay:   !realTime(ev.time) && !realTime(ev.end_time) ? true : undefined,
      category: ev.category,
      location: ev.location ?? undefined,
      notes:    ev.notes ?? undefined,
      memberId: selectedKids[0],
      memberIds: selectedKids.length > 1 ? selectedKids : undefined,
      type:     'event' as const,
      color:    BRAND.teal,
      approvalPending: false,
    }));
    // One request for the whole calendar instead of one per event.
    const res = await useEventStore.getState().addEventsBulk(rows as any, done => setSaveProgress({ done, total: toAdd.length }));
    succeeded = res.saved;
    failed = res.failed;
    // Breaks go to each kid's Holidays page as one from–to range per break (and pause that kid's class periods).
    if (succeeded > 0) {
      const ranges = holidayRanges(toAdd);
      for (const kidId of selectedKids) {
        const kid = members.find(m => m.id === kidId);
        if (!kid || ranges.length === 0) continue;
        if (!useSchoolStore.getState().schedules.find(sc => sc.memberId === kidId)) {
          addSchedule({ memberId: kidId, memberName: kid.name, semester: 'Fall' as any, year: new Date().getFullYear(),
            school: multiCal.school ?? undefined, lunchPeriod: 'B' as any, dayType: 'Regular' as any, periods: [] });
        }
        const have = useSchoolStore.getState().schedules.find(sc => sc.memberId === kidId)?.holidays ?? [];
        for (const r of ranges) {
          if (have.some(h => h.reason === r.reason && h.startDate === r.startDate && h.endDate === r.endDate)) continue;
          try { await addHoliday(kidId, r); } catch { /* the calendar rows already saved; the range is a bonus */ }
        }
      }
    }
    // Remember the link (for the chosen children) so it can be synced again later.
    if (succeeded > 0 && pendingLink.current && familyId) {
      const pl = pendingLink.current;
      try {
        if (pl.id) await supabase.from('school_calendar_links').update({ member_ids: selectedKids, last_synced_at: new Date().toISOString(), last_error: null }).eq('id', pl.id);
        else await supabase.from('school_calendar_links').insert({ family_id: familyId, name: pl.name, url: pl.url, member_ids: selectedKids, created_by: activeMemberId, last_synced_at: new Date().toISOString() });
      } catch { /* the dates are in; the link just is not remembered */ }
      pendingLink.current = null;
    }
    setImportingMulti(false);
    busyRef.current = false;
    setSaveProgress(null);
    const kidNames = selectedKids.map(id => members.find(m => m.id === id)?.name.split(' ')[0]).join(', ');
    if (failed === 0) {
      showToast(`✓ ${succeeded} event${succeeded !== 1 ? 's' : ''} imported for ${kidNames}`);
      // Land on the Schedule, on the first imported day, so the new school days and holidays are right there.
      const firstDate = toAdd.map(e => e.date).filter(Boolean).sort()[0];
      setTimeout(() => {
        resetAndClose();
        if (firstDate) useEventStore.getState().selectDate(firstDate as string);
        useUIStore.getState().setRequestedTasksSegment('schedule');
        router.push('/(tabs)/schedule' as any);
      }, 1200);
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

  // ── Linked calendars (.ics / webcal) and public holidays ──
  const [links, setLinks] = useState<SchoolCalendarLink[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');
  // The link being previewed: saved after a successful import so it can be synced again later.
  const pendingLink = useRef<{ id?: string; name: string; url: string } | null>(null);
  const familyId = activeMember?.familyId;

  const loadLinks = useCallback(async () => {
    if (!familyId) return;
    const { data } = await supabase.from('school_calendar_links').select('*').eq('family_id', familyId).order('created_at');
    setLinks((data ?? []) as SchoolCalendarLink[]);
  }, [familyId]);
  useEffect(() => { if (visible) loadLinks(); }, [visible, loadLinks]);
  useEffect(() => { if (visible && startOnLink) setStep('link'); }, [visible, startOnLink]);

  // Reads a calendar address. Only http(s) is fetched, with a time and size limit.
  const fetchCalendar = async (rawUrl: string): Promise<IcsEvent[]> => {
    const url = normalizeCalendarUrl(rawUrl);
    if (!url) throw new Error('That does not look like a calendar link. It should start with webcal:// or https://');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'text/calendar, text/plain, */*' } });
      if (!res.ok) throw new Error(`The calendar site answered with an error (${res.status}). Check the link and try again.`);
      const text = await res.text();
      if (text.length > 4_000_000) throw new Error('That calendar is too large to import.');
      if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link did not return a calendar. Look for a link ending in .ics or starting with webcal://');
      const start = dateToStr(new Date(Date.now() - 7 * 86_400_000));
      const end = dateToStr(new Date(Date.now() + 400 * 86_400_000));
      return parseIcs(text, start, end);
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('The calendar took too long to load. Try again in a moment.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

  // One line per day, like a flyer: a multi-day break becomes a run of same-title days that holidayRanges merges back into a range.
  const toExtracted = (evs: IcsEvent[], category?: string): ExtractedEvent[] => {
    const out: ExtractedEvent[] = [];
    for (const ev of evs) {
      const days = Math.min(31, Math.round((new Date(ev.endDate + 'T12:00:00').getTime() - new Date(ev.startDate + 'T12:00:00').getTime()) / 86_400_000));
      for (let i = 0; i <= days; i++) {
        const d = new Date(ev.startDate + 'T12:00:00'); d.setDate(d.getDate() + i);
        out.push({
          title: ev.title, category: category ?? (isDayOff({ title: ev.title }) ? 'Holiday' : 'School'),
          date: dateToStr(d), time: i === 0 ? ev.startTime : null, end_time: i === days ? ev.endTime : null,
          location: ev.location, organizer: null, description: ev.description, rsvp_deadline: null, cost: null,
          notes: ev.description, recurring: false, recurrence_desc: null,
        });
      }
    }
    return out;
  };

  // Leave out what is already on the calendar (same title and day). If an entry is there for only some of the chosen children,
  // add the missing children to it instead of creating a second copy.
  const dropExisting = async (events: ExtractedEvent[], kidIds: string[]): Promise<ExtractedEvent[]> => {
    if (!familyId || events.length === 0) return events;
    const dates = events.map(e => e.date!).sort();
    const { data } = await supabase.from('calendar_events').select('id, title, date, member_id, member_ids')
      .eq('family_id', familyId).is('deleted_at', null).gte('date', dates[0]).lte('date', dates[dates.length - 1]);
    const existing = new Map<string, any>();
    for (const r of data ?? []) existing.set(`${String(r.title).trim().toLowerCase()}|${r.date}`, r);
    const fresh: ExtractedEvent[] = [];
    for (const e of events) {
      const hit = existing.get(`${e.title.trim().toLowerCase()}|${e.date}`);
      if (!hit) { fresh.push(e); continue; }
      const have: string[] = hit.member_ids?.length ? hit.member_ids : hit.member_id ? [hit.member_id] : [];
      const missing = kidIds.filter(k => !have.includes(k));
      if (kidIds.length > 0 && have.length > 0 && missing.length > 0) {
        try { await useEventStore.getState().updateEvent(hit.id, { memberIds: [...have, ...missing] } as any); } catch { /* best effort */ }
      }
    }
    return fresh;
  };

  const startReview = (events: ExtractedEvent[], schoolName: string | null, kidIds: string[]) => {
    setFlyerResult({ type: 'calendar', calendar: { school: schoolName, events } });
    const chosen = kidIds.length ? kidIds : kids.map(k => k.id);
    setSelKids(chosen);
    // A district calendar mixes every campus. Start with everything ticked EXCEPT entries that name a specific campus (for example
    // "Richland High School Homecoming") unless that campus is one of the chosen children's schools; the parent can still tick them.
    const campus = /\b(high school|middle school|elementary|intermediate|junior high|academy)\b|\b[A-Z][a-z]+ (HS|MS|ES)\b/;
    const mySchools = chosen
      .map(id => useSchoolStore.getState().schedules.find(sc => sc.memberId === id)?.school ?? '')
      .join(' ').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !['school', 'middle', 'high', 'elementary'].includes(w));
    const keep = (title: string) => !campus.test(title) || mySchools.some(w => title.toLowerCase().includes(w));
    setSelEvts(new Set(events.map((e, i) => (keep(e.title) ? i : -1)).filter(i => i >= 0)));
    setStep('multi');
  };

  const handleLinkPreview = async (rawUrl: string, name: string) => {
    if (linkBusy) return;
    setLinkBusy(true); setLinkError('');
    try {
      const events = toExtracted(await fetchCalendar(rawUrl));
      if (events.length === 0) { setLinkError('That calendar has no upcoming dates.'); return; }
      const fresh = await dropExisting(events, selectedKids);
      if (fresh.length === 0) { setLinkError('Everything in that calendar is already on your family calendar.'); return; }
      pendingLink.current = { name: name || 'School calendar', url: rawUrl };
      startReview(fresh, name || null, []);
    } catch (e: any) {
      setLinkError(e?.message ?? 'Could not read that calendar.');
    } finally {
      setLinkBusy(false);
    }
  };

  const handleSyncLink = async (link: SchoolCalendarLink) => {
    if (linkBusy) return;
    setLinkBusy(true); setLinkError('');
    try {
      const events = toExtracted(await fetchCalendar(link.url));
      const fresh = await dropExisting(events, link.member_ids);
      await supabase.from('school_calendar_links').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', link.id);
      loadLinks();
      if (fresh.length === 0) { showToast(`✓ ${link.name} is up to date`); return; }
      pendingLink.current = { id: link.id, name: link.name, url: link.url };
      startReview(fresh, link.name, link.member_ids);
    } catch (e: any) {
      const msg = e?.message ?? 'Could not read that calendar.';
      setLinkError(msg);
      await supabase.from('school_calendar_links').update({ last_error: msg }).eq('id', link.id);
      loadLinks();
    } finally {
      setLinkBusy(false);
    }
  };

  const handleRemoveLink = (link: SchoolCalendarLink) => {
    Alert.alert(`Remove ${link.name}?`, 'Dates already added stay on the calendar. It just stops being linked.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await supabase.from('school_calendar_links').delete().eq('id', link.id); loadLinks(); } },
    ]);
  };

  // Public holidays go on the family calendar for everyone (no child needed).
  const handlePublicHolidays = async (feed: { key: string; label: string; url: string }) => {
    if (linkBusy) return;
    setLinkBusy(true); setLinkError('');
    try {
      const events = toExtracted(await fetchCalendar(feed.url), 'Holiday');
      const fresh = await dropExisting(events, []);
      if (fresh.length === 0) { showToast(`✓ ${feed.label} holidays are already on the calendar`); return; }
      if (blockIfPaywalled()) return;
      const go = await new Promise<boolean>(resolve => Alert.alert(`Add ${fresh.length} ${feed.label} holidays?`, 'They are added to the family calendar for the next year.', [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Add', onPress: () => resolve(true) },
      ]));
      if (!go) return;
      const rows = fresh.map(ev => ({ title: ev.title, date: ev.date!, allDay: true, category: 'Holiday', type: 'event' as const, color: BRAND.amber, approvalPending: false }));
      const res = await useEventStore.getState().addEventsBulk(rows as any);
      showToast(res.failed === 0 ? `✓ ${res.saved} ${feed.label} holidays added` : `Added ${res.saved}; ${res.failed} could not be added`, res.failed === 0);
    } catch (e: any) {
      setLinkError(e?.message ?? 'Could not read that calendar.');
    } finally {
      setLinkBusy(false);
    }
  };

  const resetAndClose = () => {
    pendingLink.current = null;
    setStep(startOnLink ? 'link' : 'capture'); setImages([]); setFlyerResult(null);
    setSelKids([]); setSelEvts(new Set()); setTTKid('');
    setError('');
    onClose();
  };

  const rescan = () => { setStep(pendingLink.current || startOnLink ? 'link' : 'capture'); setFlyerResult(null); };

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
          kids={kids} allNames={allNames}
          selectedKids={selectedKids} setSelKids={setSelKids}
        />
      )}

      {step === 'link' && (
        <LinkCalendarScreen
          colors={colors} isDark={isDark}
          links={links} kids={kids}
          busy={linkBusy} errorMsg={linkError}
          onPreview={handleLinkPreview} onSync={handleSyncLink} onRemove={handleRemoveLink} onHolidays={handlePublicHolidays}
          onClose={resetAndClose}
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
          saveProgress={saveProgress}
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
          saveProgress={saveProgress}
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
