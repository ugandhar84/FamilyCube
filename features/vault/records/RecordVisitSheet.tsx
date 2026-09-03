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
 * Past 45 minutes, shows a persistent but dismissible inline warning
 * instead of auto-stopping.
 */
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ActivityIndicator, Animated, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioRecorder, useAudioRecorderState, AudioModule, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { Mic, Square, X, Pause } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { BRAND } from '../tabs/shared';
import { MedRecord, AiAnalysis, AppointmentAnalysis } from './types';
import { encryptAnalysis } from './recordsCrypto';
import AiReviewSheet from './AiReviewSheet';

const WARNING_AT_SECS = 45 * 60;

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

interface Props {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  memberId: string;      // the patient — event's memberId
  memberName: string;
  actorId: string;       // whoever is recording, for uploaded_by/medical_records write
  eventTitle: string;
  eventDate: string;
}

export default function RecordVisitSheet({ visible, onClose, familyId, memberId, memberName, actorId, eventTitle, eventDate }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  // Polled every 100ms for a smooth live waveform — see useAudioRecorderState's
  // own doc; metering is only ever populated while actually recording.
  const recorderState = useAudioRecorderState(recorder, 100);

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<MedRecord | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<AiAnalysis | AppointmentAnalysis | null>(null);
  const [notMedical, setNotMedical] = useState<string | null>(null);

  // durationMillis already excludes paused time on its own — no manual
  // elapsed-tracking timer needed, unlike ChatScreen.tsx's own
  // Date.now()-diff approach (which predates pause/resume existing here).
  const elapsed = recorderState.durationMillis / 1000;
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
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert('Microphone permission required', 'Enable microphone access in Settings to record this visit.'); return; }
    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
    setPaused(false);
  };

  // record()/pause() double as resume/pause on the SAME file — no new
  // prepareToRecordAsync() call needed, and recorder.currentTime already
  // excludes paused time on its own, so elapsed display naturally pauses
  // too without any extra bookkeeping here.
  const togglePause = () => {
    if (paused) { recorder.record(); setPaused(false); }
    else { recorder.pause(); setPaused(true); }
  };

  const stopAndProcess = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    const dur = recorder.currentTime;
    setRecording(false);
    setPaused(false);
    if (!uri || dur < 1) { showToast("Recording was too short — try again", 'error'); return; }

    setUploading(true);
    try {
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
        .upload(fileName, bytes.buffer, { contentType: 'audio/mp4', upsert: false });
      if (upErr || !up) throw new Error(upErr?.message ?? 'Upload failed');

      const { data: rec, error: insErr } = await supabase.from('medical_records').insert({
        family_id: familyId, member_id: memberId, uploaded_by: actorId,
        title: `${eventTitle} — ${eventDate}`, tag: 'visit_recording',
        record_date: eventDate,
        file_path: up.path, file_name: fileName.split('/').pop(), file_size: bytes.byteLength,
        ai_analyzed: false, ai_tags: [],
      }).select().single();
      if (insErr || !rec) throw new Error(insErr?.message ?? 'Could not save the record');

      setUploading(false);
      setAnalyzing(true);
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('analyze-appointment-recording', {
        body: { record_id: rec.id, member_name: memberName },
      });
      setAnalyzing(false);
      if (fnErr) throw new Error(fnErr.message);
      if (fnData?.error) throw new Error(fnData.error);
      if (fnData?.not_medical) {
        setNotMedical(fnData.message ?? 'This does not appear to be a medical appointment.');
        setPendingRecord(rec as MedRecord);
        return;
      }
      const analysis: AiAnalysis | AppointmentAnalysis = fnData?.analysis;
      if (!analysis?.summary) throw new Error('Invalid AI response');
      setPendingRecord(rec as MedRecord);
      setPendingAnalysis(analysis);
    } catch (e: any) {
      setUploading(false);
      setAnalyzing(false);
      showToast(e?.message ?? "Couldn't process the recording", 'error');
    }
  };

  const approve = async () => {
    if (!pendingRecord || !pendingAnalysis) return;
    setApproving(true);
    try {
      const encryptedBlob = await encryptAnalysis(familyId, pendingAnalysis, actorId);
      const { error } = await supabase.from('medical_records').update({
        ai_summary: pendingAnalysis.summary,
        ai_tags: pendingAnalysis.tags ?? [],
        ai_analysis_json: encryptedBlob,
        ai_analyzed: true,
      }).eq('id', pendingRecord.id);
      if (error) throw new Error(error.message);
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
          reset();
          onClose();
        } },
      ]);
      return;
    }
    reset();
    onClose();
  };

  if (pendingAnalysis && pendingRecord) {
    return (
      <AiReviewSheet
        rec={pendingRecord}
        analysis={pendingAnalysis}
        approving={approving}
        onApprove={approve}
        onDismiss={handleClose}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' }}>
        <View style={{
          backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingBottom: insets.bottom + 20, paddingTop: 12, paddingHorizontal: 20,
        }}>
          <View style={{ alignItems: 'center', paddingBottom: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>Record Visit</Text>
            <TouchableOpacity onPress={handleClose} disabled={uploading || analyzing}
              style={{ padding: 8, borderRadius: 20, backgroundColor: colors.surface }}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {notMedical ? (
            <View style={{ gap: 16, alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>{notMedical}</Text>
              <TouchableOpacity onPress={handleClose} style={{ borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Close</Text>
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
          ) : recording ? (
            // Live-suggested UX reference: visit context up top ("Visit
            // with Dr. X, date"), a status line, a REAL reactive waveform
            // (not a decorative pulse), then controls — mirrored here with
            // this app's own visual language rather than copied verbatim.
            <View style={{ gap: 18, alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}>
                  {eventTitle}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary }}>{eventDate}</Text>
              </View>

              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                {paused ? 'Paused — tap resume to continue' : "You're all set. Focus on your visit."}
              </Text>

              <LiveWaveform metering={recorderState.metering ?? -50} color={paused ? colors.textTertiary : colors.primary} />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {!paused && (
                  <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', opacity: dotBlinkAnim }} />
                )}
                <Text style={{ fontSize: 12, fontWeight: '800', color: paused ? colors.textTertiary : '#EF4444', letterSpacing: 0.5 }}>
                  {paused ? 'PAUSED' : 'RECORDING'}
                </Text>
              </View>
              <Text style={{ fontSize: 32, fontWeight: '900', color: colors.textPrimary, fontVariant: ['tabular-nums'], marginTop: -8 }}>
                {formatElapsed(elapsed)}
              </Text>

              {elapsed >= WARNING_AT_SECS && (
                <Text style={{ fontSize: 12, color: BRAND.amber, textAlign: 'center', paddingHorizontal: 12 }}>
                  Long recording — uploading may take a moment once you stop.
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
                <TouchableOpacity onPress={stopAndProcess}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: isDark ? '#fff' : '#111', paddingVertical: 14 }}>
                  <Square size={14} color={isDark ? '#111' : '#fff'} fill={isDark ? '#111' : '#fff'} />
                  <Text style={{ color: isDark ? '#111' : '#fff', fontWeight: '800', fontSize: 14 }}>Stop</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ gap: 20, alignItems: 'center', paddingVertical: 20 }}>
              <View style={{ alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}>{eventTitle}</Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary }}>{eventDate}</Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 }}>
                Record this appointment to get an AI summary with discussion topics and next steps, saved
                to {memberName}'s Records.
              </Text>
              <TouchableOpacity onPress={startRecording}
                style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
                <Mic size={34} color="#fff" />
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>Tap to start recording</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
