/**
 * RecordVisitSheet — records a medical appointment's audio, uploads it,
 * runs analyze-appointment-recording, and hands off to AiReviewSheet for
 * approval — same review/approve/dismiss shape RecordsTab.tsx's own
 * analyze-medical-record flow uses, but self-contained here since this
 * sheet is triggered from the calendar event detail sheet
 * (hubComponents.tsx's EventDetailSheet), not from inside RecordsTab.
 *
 * Reuses expo-audio exactly as ChatScreen.tsx's voice-note recording does
 * (useAudioRecorder/AudioModule/RecordingPresets.HIGH_QUALITY,
 * prepareToRecordAsync/record/stop) and its proven-working chunked-base64
 * upload pattern (FileSystem.readAsStringAsync from 'expo-file-system/legacy'
 * — fetch(uri).blob() silently returns a 0-byte blob for local file:// paths
 * on Android) — but with NO short hard cap (chat's MAX_RECORD_SECS=10 is
 * voice-note-specific), since a real appointment can run 20-60+ minutes.
 * Recordings stop by themselves at 30 minutes (a warning shows from 25) and keep running in the background.
 * instead of auto-stopping.
 */
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, Animated, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FullPageOverlay from '@/components/FullPageOverlay';
import { PageHeading } from '@/components/PageHeading';
import { GEMINI } from '@/constants/geminiRhythm';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useUIStore } from '@/store/uiStore';
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, useAudioPlayerStatus, AudioModule, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { Mic, Square, X, Pause, Play, Info } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { fmtDate, fmtTime } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { BRAND } from '../tabs/shared';
import { MedRecord, AiAnalysis, AppointmentAnalysis } from './types';
import { encryptAnalysis } from './recordsCrypto';
import AiReviewSheet from './AiReviewSheet';
import AiConsentSheet, { useAiConsent } from '@/components/AiConsentGate';

const MAX_SECS = 30 * 60;          // a recording stops by itself at 30 minutes
const WARNING_AT_SECS = 25 * 60;   // and warns five minutes before

function formatElapsed(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = Math.floor(totalSecs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Live waveform driven by the recorder's real metering level (dB, roughly
// -160 silence to 0 loud) rather than a decorative fake pulse — live-
// suggested UX reference showed a real reactive waveform, not a static
// blinking dot. Each bar keeps a short trailing history so the whole row
// animates as sound comes in, similar to a voice-memo app's live meter.
const BAR_COUNT = 24;
function LiveWaveform({ metering, color }: { metering: number; color: string }) {
  const heights = useRef<number[]>(Array(BAR_COUNT).fill(4));
  const [, forceRender] = useState(0);

  useEffect(() => {
    // metering is in dB, roughly -160 (silence) to 0 (loud) — normalize to
    // a 4-28px bar height with a floor so silence still shows a faint bar.
    const normalized = Math.max(0, Math.min(1, (metering + 50) / 50));
    const next = Math.round(4 + normalized * 24);
    heights.current = [...heights.current.slice(1), next];
    forceRender(n => n + 1);
  }, [metering]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 32 }}>
      {heights.current.map((h, i) => (
        <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: color, opacity: 0.4 + (i / BAR_COUNT) * 0.6 }} />
      ))}
    </View>
  );
}

// Removes an audio object, retrying a couple of times. Resolves true only when the file is really gone.
async function removeAudio(path: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.storage.from('medical-audio').remove([path]);
    if (!error) return true;
    await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
  }
  return false;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  memberId: string;      // the patient — event's memberId
  memberName: string;
  actorId: string;       // whoever is recording, for uploaded_by/medical_records write
  eventTitle: string;
  eventDate: string;
  eventTime?: string;
  doctorName?: string;
  location?: string;     // clinic/hospital name or address, if the event has one
}

export default function RecordVisitSheet({ visible, onClose, familyId, memberId, memberName, actorId, eventTitle, eventDate, eventTime, doctorName, location }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // Was the raw "2026-09-03" date string shown as-is, with no doctor/
  // hospital context even when the event actually had it — live-requested:
  // a readable date/time, plus doctor/hospital details when available.
  const eventDateLabel = fmtDate(eventDate) + (eventTime ? ` · ${fmtTime(eventTime)}` : '');
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  // Polled every 100ms for a smooth live waveform — see useAudioRecorderState's
  // own doc; metering is only ever populated while actually recording.
  const recorderState = useAudioRecorderState(recorder, 100);

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  // Live-requested: stopping shouldn't immediately upload+analyze — the
  // user wants a chance to review first and choose Submit, Continue
  // Recording, or Delete. This is a PAUSE (recorder.pause(), same
  // mechanism togglePause already uses), not a real recorder.stop() — the
  // actual stop() only happens once Submit or Delete is chosen, since
  // expo-audio's record()/pause() only resume-in-place on the SAME file
  // when the recorder was paused, not once genuinely stopped.
  const [reviewingStop, setReviewingStop] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Review before submitting: the person can listen back to the recording first. The local copy is kept until they
  // submit, delete or close; if it is gone (the sheet was reopened later) the stored, encrypted audio is fetched and
  // decrypted into the cache just for playback.
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [recordedSecs, setRecordedSecs] = useState(0);
  const [playUri, setPlayUri] = useState<string | null>(null);
  const [loadingPlayback, setLoadingPlayback] = useState(false);
  const player = useAudioPlayer(playUri ?? undefined);
  const playStatus = useAudioPlayerStatus(player);
  const dropLocalCopy = () => {
    if (localUri) FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    setLocalUri(null); setPlayUri(null);
  };
  const togglePlayback = async () => {
    try {
      if (playStatus.playing) { player.pause(); return; }
      await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!playUri) {
        let uri = localUri;
        if (!uri && pendingRecord?.file_path) {
          setLoadingPlayback(true);
          const { downloadBytesViaUrl } = await import('./recordsDownload');
          const buf = await downloadBytesViaUrl(pendingRecord.file_path, familyId, 'medical-audio');
          const bytes = new Uint8Array(buf);
          let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          uri = `${FileSystem.cacheDirectory}review_${Date.now()}.m4a`;
          await FileSystem.writeAsStringAsync(uri, btoa(bin), { encoding: 'base64' as any });
          setLocalUri(uri);
        }
        if (!uri) return;
        setPlayUri(uri);          // the player loads the source, then plays from the effect below
        setWantPlay(true);
        return;
      }
      if (playStatus.didJustFinish || (playStatus.duration && playStatus.currentTime >= playStatus.duration - 0.2)) player.seekTo(0);
      player.play();
    } catch (e: any) {
      showToast(e?.message ?? 'Could not play the recording', 'error');
    } finally { setLoadingPlayback(false); }
  };
  const [wantPlay, setWantPlay] = useState(false);

  // Reopening the same appointment must not look like the recording vanished: restore an unsubmitted recording into
  // the review step, and show when a summary has already been saved for this visit.
  const [savedVisit, setSavedVisit] = useState<MedRecord | null>(null);
  useEffect(() => {
    if (!visible || !familyId || !memberId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('medical_records').select('*')
        .eq('family_id', familyId).eq('member_id', memberId).eq('tag', 'visit_recording')
        .eq('title', `${eventTitle} — ${eventDate}`).order('created_at', { ascending: false }).limit(1);
      const rec = (data?.[0] ?? null) as MedRecord | null;
      if (cancelled || !rec) { if (!cancelled) setSavedVisit(null); return; }
      if (!rec.ai_analyzed && rec.file_path) {
        setPendingRecord(prev => prev ?? rec);
        setReviewingStop(true);
        setSavedVisit(null);
      } else if (rec.ai_analyzed) {
        setSavedVisit(rec);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, memberId, eventTitle, eventDate]);
  useEffect(() => {
    if (wantPlay && playUri && playStatus.isLoaded) { setWantPlay(false); player.play(); }
  }, [wantPlay, playUri, playStatus.isLoaded]);
  const [analyzing, setAnalyzing] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<MedRecord | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<AiAnalysis | AppointmentAnalysis | null>(null);
  const [notMedical, setNotMedical] = useState<string | null>(null);
  const { checked: aiConsentChecked, consented: aiConsented, showSheet: showAiConsent, setShowSheet: setShowAiConsent, markConsented: markAiConsented } = useAiConsent(actorId);

  // durationMillis already excludes paused time on its own — no manual
  // elapsed-tracking timer needed, unlike ChatScreen.tsx's own
  // Date.now()-diff approach (which predates pause/resume existing here).
  const elapsed = recorderState.durationMillis / 1000;
  // Belt-and-suspenders wall-clock fallback — live-reported: recorderState.
  // durationMillis alone still produced "too short" on every single
  // attempt on at least one real device, even after switching
  // submitForAnalysis to read it BEFORE calling stop() (the first,
  // confirmed-real bug this exact symptom had). Rather than trust a
  // single SDK-reported timing signal a second time, this now ALSO tracks
  // how long recording has actually been running via Date.now(), refs
  // (not state, so submitForAnalysis always reads the current value with
  // no closure/render-timing risk at all), and takes whichever of the two
  // says MORE elapsed
  // time — the true duration can only be undercounted by one signal being
  // wrong, never overcounted by both being wrong in the same direction, so
  // the max of the two is always the safer answer than either alone.
  const recordStartRef = useRef<number | null>(null);
  const pausedAccumRef = useRef(0); // total ms spent paused so far, subtracted out
  const pauseStartRef = useRef<number | null>(null);
  const wallClockElapsedSecs = () => {
    if (recordStartRef.current == null) return 0;
    const pausedSoFar = pausedAccumRef.current + (pauseStartRef.current != null ? Date.now() - pauseStartRef.current : 0);
    return Math.max(0, (Date.now() - recordStartRef.current - pausedSoFar) / 1000);
  };
  const dotBlinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!recording || paused) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(dotBlinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      Animated.timing(dotBlinkAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [recording, paused]);

  const startRecording = async () => {
    if (aiConsentChecked && !aiConsented) { setShowAiConsent(true); return; }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert('Microphone permission required', 'Enable microphone access in Settings to record this visit.'); return; }
    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordStartRef.current = Date.now();
    pausedAccumRef.current = 0;
    pauseStartRef.current = null;
    setRecording(true);
    setPaused(false);
  };

  // record()/pause() double as resume/pause on the SAME file — no new
  // prepareToRecordAsync() call needed, and recorder.currentTime already
  // excludes paused time on its own, so elapsed display naturally pauses
  // too without any extra bookkeeping here.
  const togglePause = () => {
    if (paused) {
      recorder.record();
      if (pauseStartRef.current != null) { pausedAccumRef.current += Date.now() - pauseStartRef.current; pauseStartRef.current = null; }
      setPaused(false);
    } else {
      recorder.pause();
      pauseStartRef.current = Date.now();
      setPaused(true);
    }
  };

  // Shared by the initial analysis (after recording stops) and the review
  // screen's "Re-analyze" action (same audio, re-run because the first
  // pass missed something or misheard part of the visit) — the audio at
  // `audioPath` is only actually discarded once the user taps Approve
  // (see approve()'s own comment), so re-running this before that point is
  // always safe.
  const runAnalysis = async (rec: MedRecord, audioPath: string, isReanalyze = false) => {
    (isReanalyze ? setReanalyzing : setAnalyzing)(true);
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('analyze-appointment-recording', {
        body: { record_id: rec.id, member_name: memberName, family_keys: await (await import('@/lib/fileCrypto')).familyKeysForAnalysis(familyId) },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (fnData?.error) throw new Error(fnData.error);
      if (fnData?.not_medical) {
        // Reject cleanly rather than leaving a record with no clinical
        // content sitting in the vault forever — the strict content gate
        // in analyze-appointment-recording's SYSTEM_PROMPT means this
        // path fires for genuinely non-medical audio, so nothing here is
        // worth keeping. Best-effort cleanup (not awaited-and-blocking on
        // failure) since the user is already looking at the rejection
        // message regardless of whether the delete itself succeeds.
        supabase.storage.from('medical-audio').remove([audioPath]).catch(() => {});
        supabase.from('medical_records').delete().eq('id', rec.id).then(() => {});
        setPendingAnalysis(null);
        setNotMedical(fnData.message ?? 'This recording does not appear to contain real medical or health content — only genuine clinical conversations are supported.');
        return;
      }
      const analysis: AiAnalysis | AppointmentAnalysis = fnData?.analysis;
      if (!analysis?.summary) throw new Error('Invalid AI response');
      setPendingAnalysis(analysis);
      // Live-requested: notify the person who recorded this to come review
      // it — only on the FIRST analysis, not a re-analyze re-run, since
      // the recorder is already looking at this exact sheet in that case
      // (they just tapped "Re-analyze" themselves) and a push would be
      // redundant. Non-blocking — a failed notification shouldn't stop
      // the review sheet from opening, same as RecordsTab.tsx's own
      // analyzeRecord() notification for the document-analysis flow.
      if (!isReanalyze) {
        supabase.functions.invoke('family-notifier', {
          body: {
            familyId, memberId: actorId, type: 'custom',
            payload: {
              title: '📋 Visit Summary Ready',
              body: `${eventTitle} — tap to review and approve the summary`,
              data: { screen: 'vault', tab: 'records', record_id: rec.id },
            },
          },
        }).catch(() => {});
      }
    } catch (e: any) {
      showToast(e?.message ?? "Couldn't process the recording", 'error');
    } finally {
      (isReanalyze ? setReanalyzing : setAnalyzing)(false);
    }
  };

  const handleReanalyze = () => {
    if (!pendingRecord?.file_path) return; // file_path is only cleared post-approval, when this button is no longer reachable anyway
    runAnalysis(pendingRecord, pendingRecord.file_path, true);
  };

  // Live-requested: Stop now finalizes AND uploads immediately, creating a
  // real (unanalyzed) medical_records row right away — not held only in
  // the recorder's temporary in-memory buffer until a separate Submit tap.
  // This is what makes an unsubmitted recording survive closing this sheet,
  // backgrounding/killing the app, or even the appointment ending hours
  // later: it already exists as a normal row (ai_analyzed:false,
  // tag:'visit_recording') the moment recording stops, so it shows up in
  // the Records tab with its own Submit/Delete actions (see RecordsTab.tsx/
  // RecordCard's tag-aware branch) exactly like any other not-yet-analyzed
  // record, reachable independently of this sheet ever being reopened.
  // "Continue Recording" was considered and deliberately dropped — once
  // Stop finalizes and uploads, there's no in-progress file left to resume;
  // recording more means starting a genuinely new recording afterward.
  const stopAndUpload = async () => {
    // Both captured BEFORE stop(), not after — recorder.currentTime read
    // AFTER await recorder.stop() resolves is unreliable (reads back
    // near-zero once the recorder has already torn down). Live-reported:
    // "too short" STILL fired on every single attempt on at least one real
    // device even after switching to recorderState.durationMillis alone
    // (elapsed) — rather than trust one SDK-reported timing signal a
    // second time with no way to verify it against anything, this also
    // takes a manual wall-clock reading (wallClockElapsedSecs, tracked via
    // refs from real record/pause/resume timestamps) and uses whichever
    // of the two reports MORE elapsed time. The true duration can only be
    // undercounted by one signal being wrong, never overcounted by both
    // being wrong in the same direction — so the max is always at least as
    // trustworthy as either alone, and strictly safer than picking one and
    // hoping.
    const dur = Math.max(elapsed, wallClockElapsedSecs());
    setRecordedSecs(dur);
    await recorder.stop();
    const uri = recorder.uri;
    setRecording(false);
    setPaused(false);
    recordStartRef.current = null;
    pauseStartRef.current = null;
    // Temporary diagnostic — kept until this is confirmed fixed on the
    // device that hit it, so if "too short" recurs there's a real signal
    // to look at instead of guessing a third time: which half of the check
    // failed (no uri at all vs. a real duration reading near-zero), and
    // what each of the two duration signals independently reported.
    console.log('[RecordVisitSheet] stopAndUpload', { uri, dur, elapsed, wallClock: wallClockElapsedSecs(), recorderCurrentTime: recorder.currentTime });
    if (!uri || dur < 1) {
      showToast(!uri ? "Couldn't save the recording — try again" : "Recording was too short — try again", 'error');
      return;
    }

    setUploading(true);
    try {
      // family_id here MUST match what auth resolves server-side
      // (current_user_family_id(), which reads members.family_id for the
      // row whose auth_user_id = auth.uid()) or medical_records_insert's
      // RLS policy rejects the row outright ("new row violates row-level
      // security policy") — live-reported. familyId is threaded down from
      // hubComponents.tsx's viewerMember?.familyId, which silently became
      // '' whenever viewerMember failed to resolve; failing loudly here
      // with a real error instead of attempting an insert doomed to a
      // opaque Postgres RLS rejection.
      if (!familyId) throw new Error("Couldn't identify your family — please close and reopen this sheet.");
      const fileName = `${familyId}/${memberId}/${Date.now()}.m4a`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      const CHUNK = 65536;
      for (let start = 0; start < binary.length; start += CHUNK) {
        const end = Math.min(start + CHUNK, binary.length);
        for (let i = start; i < end; i++) bytes[i] = binary.charCodeAt(i);
        if (end < binary.length) await new Promise(resolve => setTimeout(resolve, 0));
      }
      const { data: up, error: upErr } = await supabase.storage
        .from('medical-audio')
        .upload(fileName, (await (await import('@/lib/fileCrypto')).encryptFileBytes(familyId, bytes)), { contentType: 'application/octet-stream', upsert: false });
      if (upErr || !up) throw new Error(upErr?.message ?? 'Upload failed');
      // Keep the local copy for the review step; it is deleted on submit, delete or close.
      setLocalUri(uri);

      const { data: rec, error: insErr } = await supabase.from('medical_records').insert({
        family_id: familyId, member_id: memberId, uploaded_by: actorId,
        title: `${eventTitle} — ${eventDate}`, tag: 'visit_recording',
        record_date: eventDate,
        file_path: up.path, file_name: fileName.split('/').pop(), file_size: bytes.byteLength,
        ai_analyzed: false, ai_tags: [],
      }).select().single();
      if (insErr || !rec) {
        // Best-effort cleanup — an insert rejected by RLS (or any other
        // reason) shouldn't leave an orphaned blob in medical-audio with
        // no record ever pointing to it.
        supabase.storage.from('medical-audio').remove([up.path]).catch(() => {});
        throw new Error(insErr?.message ?? 'Could not save the record');
      }

      setUploading(false);
      setPendingRecord(rec as MedRecord);
      setReviewingStop(true);
    } catch (e: any) {
      setUploading(false);
      const noKey = /No family key|security code/i.test(e?.message ?? '');
      showToast(noKey ? 'This device needs the family security code before it can save a visit recording. Ask the family admin for it.' : (e?.message ?? "Couldn't process the recording"), noKey ? 'warning' : 'error');
    }
  };

  // Submit half of the review gate — the record already exists (uploaded
  // at Stop, see stopAndUpload above); this just kicks off the actual AI
  // analysis on it, same as RecordsTab.tsx's analyzeRecord does for a
  // record reached from the Records list instead of this sheet.
  const submitForAnalysis = async () => {
    if (!pendingRecord?.file_path) return;
    setReviewingStop(false);
    await runAnalysis(pendingRecord, pendingRecord.file_path);
  };

  // Delete half of the review gate — the record + its audio already exist
  // in Supabase at this point (uploaded at Stop), so this is a real delete
  // of a persisted row, not just discarding a local in-memory buffer.
  const deleteUnsubmitted = async () => {
    if (pendingRecord) {
      if (pendingRecord.file_path) await removeAudio(pendingRecord.file_path);
      await supabase.from('medical_records').delete().eq('id', pendingRecord.id);
    }
    dropLocalCopy();
    setReviewingStop(false);
    setPendingRecord(null);
    onClose();
  };

  const approve = async () => {
    if (!pendingRecord || !pendingAnalysis) return;
    setApproving(true);
    try {
      const encryptedBlob = await encryptAnalysis(familyId, pendingAnalysis);
      // Delete the raw audio first. If it cannot be removed, keep the reference so the nightly sweeper retries it
      // instead of leaving a file nothing points to.
      const audioGone = pendingRecord.file_path ? await removeAudio(pendingRecord.file_path) : true;
      const { error } = await supabase.from('medical_records').update({
        ai_summary: pendingAnalysis.summary,
        ai_tags: pendingAnalysis.tags ?? [],
        ai_analysis_json: encryptedBlob,
        ai_analyzed: true,
        // Live-requested: once the summary is reviewed and approved, the
        // raw audio has served its purpose — the encrypted summary is the
        // actual deliverable going forward, and there's no reason to keep
        // a privacy-sensitive, storage-heavy recording around indefinitely.
        // Clearing file_path also means the "Recording" playback UI in
        // Records (if any) correctly stops offering to play something
        // that no longer exists, rather than a dangling reference.
        ...(audioGone ? { file_path: null, file_name: null, file_size: null } : {}),
      }).eq('id', pendingRecord.id);
      if (error) throw new Error(error.message);
      // Best-effort — the DB update above (clearing file_path) is the
      // source of truth for "this record no longer has audio"; a failed
      // storage delete just leaves an orphaned blob in medical-audio, not
      // a broken/inconsistent record.
      showToast('Visit summary saved to Records');
      reset();
      onClose();
    } catch (e: any) {
      showToast(e?.message ?? "Couldn't save", 'error');
    } finally {
      setApproving(false);
    }
  };

  const reset = () => {
    try { player.pause(); } catch {}
    dropLocalCopy();
    setPendingRecord(null);
    setPendingAnalysis(null);
    setNotMedical(null);
  };

  const handleClose = () => {
    if (recording) {
      Alert.alert('Discard recording?', 'This will stop and discard the current recording.', [
        { text: 'Keep recording', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: async () => {
          try { await recorder.stop(); } catch {}
          setRecording(false);
          setPaused(false);
          setReviewingStop(false);
          reset();
          onClose();
        } },
      ]);
      return;
    }
    // The recording is already uploaded and saved at this point (see
    // stopAndUpload) — closing without submitting doesn't lose it, it's
    // just not analyzed yet. Say so, since silently closing after all that
    // "review before submitting" framing could otherwise read as the
    // recording having been discarded.
    if (reviewingStop) showToast('Saved to Records — submit for analysis anytime');
    reset();
    onClose();
  };

  // Hard stop at 30 minutes: finish and upload exactly as if the Stop button had been tapped.
  const autoStopped = useRef(false);
  useEffect(() => {
    if (!recording) { autoStopped.current = false; return; }
    if (elapsed >= MAX_SECS && !autoStopped.current) {
      autoStopped.current = true;
      showToast('30 minute limit reached. Saving your recording.');
      stopAndUpload();
    }
  }, [recording, elapsed]);

  const canvas = isDark ? colors.background : GEMINI.canvas;
  const cardStyle = { backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 24, padding: 20, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) } as const;

  if (pendingAnalysis && pendingRecord) {
    return (
      <AiReviewSheet
        rec={pendingRecord}
        analysis={pendingAnalysis}
        approving={approving}
        onApprove={approve}
        onDismiss={handleClose}
        onReanalyze={handleReanalyze}
        reanalyzing={reanalyzing}
      />
    );
  }

  if (!visible) return null;

  return (
    <FullPageOverlay visible onDismiss={handleClose} zIndex={70} backgroundColor={canvas}>
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <AiConsentSheet
        visible={showAiConsent}
        memberId={actorId}
        familyId={familyId}
        colors={colors}
        onAgree={() => { setShowAiConsent(false); markAiConsented(); startRecording(); }}
        onDecline={() => setShowAiConsent(false)}
      />
      <PageHeading
        eyebrow="FAMILY CUBE · HEALTH"
        title="Record Visit"
        accent="teal"
        topInset={insets.top}
        onTitlePress={uploading || analyzing ? undefined : handleClose}
        right={
          <TouchableOpacity onPress={handleClose} disabled={uploading || analyzing} accessibilityRole="button" accessibilityLabel="Close"
            style={{ padding: 10, borderRadius: 20, backgroundColor: isDark ? colors.surface : '#FFFFFF', ...(isDark ? null : GEMINI.cardShadow) }}>
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 40, gap: 24 }} showsVerticalScrollIndicator={false}>
        {/* The appointment this recording belongs to, shown in every state. */}
        <View style={[cardStyle, { gap: 4 }]}>
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: isDark ? colors.textTertiary : GEMINI.bodyColorLight }}>APPOINTMENT</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{eventTitle}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>{eventDateLabel}</Text>
          {!!(doctorName || location) && (
            <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>
              {[doctorName, location].filter(Boolean).join(' · ')}
            </Text>
          )}
          <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginTop: 2 }}>For {memberName}</Text>
        </View>

        <View style={cardStyle}>
          {notMedical ? (
            <View style={{ gap: 16, alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>{notMedical}</Text>
              <TouchableOpacity onPress={handleClose} style={{ borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24 }}>
                <Text style={{ color: colors.textInverse, fontWeight: '800' }}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : uploading || analyzing ? (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 30 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                {uploading ? 'Uploading recording…' : 'Summarizing your visit…'}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center' }}>
                {analyzing ? 'This can take up to a minute for longer recordings.' : ''}
              </Text>
            </View>
          ) : reviewingStop && pendingRecord ? (
            // Live-requested review gate — the recording is already
            // finalized AND uploaded at this point (see stopAndUpload),
            // so this is reviewing a real, persisted record, not an
            // in-memory buffer. Only Submit/Delete — "Continue Recording"
            // was considered and dropped once Stop started finalizing
            // immediately (there's no in-progress file left to resume;
            // recording more means a genuinely new recording afterward).
            // Also reachable independently from the Records tab if this
            // sheet is closed/reopened before submitting — see
            // RecordsTab.tsx/RecordCard's tag-aware branch for
            // tag:'visit_recording'.
            <View style={{ gap: 18, alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                Recording saved — review before submitting for analysis.
              </Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 12, lineHeight: 17 }}>
                The raw audio is deleted once you approve the summary (or after 7 days if you leave it).
              </Text>
              <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 14,
                backgroundColor: isDark ? colors.surface : GEMINI.surface }}>
                <TouchableOpacity onPress={togglePlayback} accessibilityRole="button" accessibilityLabel={playStatus.playing ? 'Pause recording' : 'Play recording'}
                  style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
                  {loadingPlayback ? <ActivityIndicator color={colors.textInverse} /> : playStatus.playing
                    ? <Pause size={22} color={colors.textInverse} /> : <Play size={22} color={colors.textInverse} fill={colors.textInverse} />}
                </TouchableOpacity>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Listen before you submit</Text>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${playStatus.duration ? Math.min(100, (playStatus.currentTime / playStatus.duration) * 100) : 0}%`, backgroundColor: colors.primary }} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, fontVariant: ['tabular-nums'] }}>
                    {formatElapsed(playStatus.currentTime || 0)} / {formatElapsed(playStatus.duration || recordedSecs)}
                  </Text>
                </View>
              </View>
              <View style={{ gap: 10, width: '100%', marginTop: 6 }}>
                <TouchableOpacity onPress={submitForAnalysis}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: colors.primary, paddingVertical: 14 }}>
                  <Text style={{ color: colors.textInverse, fontWeight: '800', fontSize: 14 }}>Submit for Analysis</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  Alert.alert('Delete this recording?', 'This cannot be undone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: deleteUnsubmitted },
                  ]);
                }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, borderWidth: 1.5, borderColor: colors.danger + '50', paddingVertical: 14 }}>
                  <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 14 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : recording ? (
            // Live-suggested UX reference: visit context up top ("Visit
            // with Dr. X, date"), a status line, a REAL reactive waveform
            // (not a decorative pulse), then controls — mirrored here with
            // this app's own visual language rather than copied verbatim.
            <View style={{ gap: 18, alignItems: 'center', paddingVertical: 12 }}>

              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                {paused ? 'Paused — tap resume to continue' : "You're all set. Focus on your visit."}
              </Text>

              <LiveWaveform metering={recorderState.metering ?? -50} color={paused ? colors.textTertiary : colors.primary} />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {!paused && (
                  <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, opacity: dotBlinkAnim }} />
                )}
                <Text style={{ fontSize: 12, fontWeight: '800', color: paused ? colors.textTertiary : colors.danger, letterSpacing: 0.5 }}>
                  {paused ? 'PAUSED' : 'RECORDING'}
                </Text>
              </View>
              <Text style={{ fontSize: 32, fontWeight: '900', color: colors.textPrimary, fontVariant: ['tabular-nums'], marginTop: -8 }}>
                {formatElapsed(elapsed)}
              </Text>

              <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 12, lineHeight: 17 }}>
                The audio is encrypted with your family code and stored privately until you approve the summary, then it is deleted. Only the encrypted summary is kept. Unsubmitted audio is deleted after 7 days. If you lose the family data recovery key, everything will be lost.
              </Text>

              {elapsed >= WARNING_AT_SECS && (
                <Text style={{ fontSize: 12, color: BRAND.amber, textAlign: 'center', paddingHorizontal: 12 }}>
                  Recording stops automatically at 30:00. Uploading may take a moment once it ends.
                </Text>
              )}

              <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 }}>
                <TouchableOpacity onPress={togglePause}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 14 }}>
                  {paused
                    ? <Mic size={16} color={colors.textPrimary} />
                    : <Pause size={16} color={colors.textPrimary} />}
                  <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 14 }}>{paused ? 'Resume' : 'Pause'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={stopAndUpload}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: colors.textPrimary, paddingVertical: 14 }}>
                  <Square size={14} color={colors.background} fill={colors.background} />
                  <Text style={{ color: colors.background, fontWeight: '800', fontSize: 14 }}>Stop</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ gap: 20, alignItems: 'center', paddingVertical: 20 }}>
              {!!savedVisit && (
                <View style={{ width: '100%', borderRadius: 16, padding: 14, gap: 4, backgroundColor: colors.tealLight }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.teal }}>This visit already has a saved summary</Text>
                  {!!savedVisit.ai_summary && <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }} numberOfLines={4}>{savedVisit.ai_summary}</Text>}
                  <Text style={{ fontSize: 12, color: colors.textTertiary }}>Open it any time from {memberName}'s Records. Recording again adds a second one.</Text>
                </View>
              )}
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 }}>
                Record this appointment to get an AI summary with discussion topics and next steps, saved
                to {memberName}'s Records.
              </Text>
              {/* Live-requested: recording a doctor/nurse conversation has
                  real consent implications many places require by law (and
                  is simply the respectful thing to do regardless) — this is
                  a reminder shown every time, not a one-time dismissible
                  notice, since the person being recorded changes with every
                  visit. */}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: BRAND.amber + '14',
                borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 4 }}>
                <Info size={16} color={BRAND.amber} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
                  Please let your doctor or nurse know you're recording this visit before you start.
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 12, lineHeight: 17 }}>
                The audio is encrypted with your family code and stored privately until you approve the summary, then it is deleted. Only the encrypted summary is kept. Unsubmitted audio is deleted after 7 days. If you lose the family data recovery key, everything will be lost.
              </Text>
              <TouchableOpacity onPress={startRecording}
                style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
                <Mic size={34} color={colors.textInverse} />
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>Tap to start recording</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
    </FullPageOverlay>
  );
}
