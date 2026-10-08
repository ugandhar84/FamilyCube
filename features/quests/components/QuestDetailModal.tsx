import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, TextInput, ActivityIndicator, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, X as XIcon, Maximize2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore, REJECTION_PRESETS } from '@/store/choreStore';
import { useQuestStore } from '@/store/choreAdapter';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { Quest } from '@/store/questStore';
import { parseDbTime, fmtDateShort } from '@/lib/dates';
import { fetchActivityLog, type ActivityLogRow } from '@/lib/activityLog';
import { EditQuestModal } from './EditQuestModal';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { supabase } from '@/lib/supabase';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';

// Live direction: "we should follow the heading styles similar to the
// hub" — TodayActionGrid.tsx's own section heading (thin 2px accent
// underline bar above a small uppercase label) instead of this screen's
// plain uppercase-text-only section labels. One shared component so every
// section on this page (Assigned to/Progress/Submitted proof/Earlier
// submission/Trail log) picks up the same treatment consistently.
function SectionLabel({ children, color, marginBottom = 10 }: {
  children: React.ReactNode; color: string; marginBottom?: number;
}) {
  return (
    <View style={{ alignSelf: 'flex-start', marginBottom }}>
      <View style={{ height: 2, borderRadius: 1, backgroundColor: color, marginBottom: 6, opacity: 0.6 }} />
      <Text style={{ color, fontSize: 10, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' }}>
        {children}
      </Text>
    </View>
  );
}

function fmt12hFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseDbTime(iso);
  // A malformed/unparseable DB timestamp (e.g. a server-side now()::text cast
  // with no timezone suffix) must never surface "Invalid Date" to the user —
  // silently drop the stamp rather than show broken text.
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmt12hTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const clean = hhmm.trim();

  // Live-confirmed real data (not hypothetical): at least one historical
  // write path stored dueTime as an already-12-hour display string
  // ("12:00 AM") instead of 24-hour "HH:MM" — the length/'T' check below
  // misclassified it as ISO, handed it to `new Date("12:00 AM")` (invalid,
  // NaN), and the time silently vanished from the Due row. Parse this shape
  // directly rather than only logging and giving up on it.
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2];
    const suffix = ampmMatch[3].toUpperCase();
    if (suffix === 'PM' && h !== 12) h += 12;
    if (suffix === 'AM' && h === 12) h = 0;
    const d = new Date(); d.setHours(h, parseInt(m, 10), 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // Handle ISO timestamps (e.g. "2026-10-12T17:00:00Z") and plain "HH:MM"
  if (clean.includes('T') || clean.length > 5) {
    const d = new Date(clean);
    if (isNaN(d.getTime())) {
      console.warn('[QuestDetailModal] fmt12hTime: unparseable ISO dueTime', clean);
      return '';
    }
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const [h, m] = clean.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) {
    // Was silently swallowed — a malformed dueTime (e.g. not "HH:MM" at
    // all) rendered the Due row as "Oct 12 ·" with nothing after the
    // separator instead of surfacing that the stored value is bad.
    console.warn('[QuestDetailModal] fmt12hTime: unparseable plain dueTime', clean);
    return '';
  }
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ── Timeline node ────────────────────────────────────────────────────────────
// Horizontal stepper node — dot+connector sit above the label, steps laid
// out left-to-right instead of top-to-bottom so "Progress" reads as a single
// scannable row rather than a tall vertical list.
function TimelineNode({
  label, detail, filled, isLast,
}: { label: string; detail?: string; filled: boolean; isLast?: boolean }) {
  const { colors } = useTheme();
  const dotBorder = filled ? colors.teal : colors.border;
  const dotBg     = filled ? colors.teal : 'transparent';

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      {/* Dot + connecting line */}
      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        <View style={{ flex: 1, height: 2, backgroundColor: 'transparent' }} />
        <View style={{
          width: 18, height: 18, borderRadius: 9,
          borderWidth: 2, borderColor: dotBorder,
          backgroundColor: dotBg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {filled && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />}
        </View>
        {!isLast ? (
          <View style={{ flex: 1, height: 2, backgroundColor: colors.border }} />
        ) : (
          <View style={{ flex: 1, height: 2, backgroundColor: 'transparent' }} />
        )}
      </View>
      {/* Text */}
      <View style={{ alignItems: 'center', marginTop: 8, paddingHorizontal: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: filled ? '700' : '500',
          color: filled ? colors.textPrimary : colors.textSecondary }}>
          {label}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2, textAlign: 'center' }}>
          {detail || 'Waiting'}
        </Text>
      </View>
    </View>
  );
}

// ── Detailed log row (parent-only) ───────────────────────────────────────────
const ACTION_META: Record<string, { icon: string; label: string }> = {
  created:    { icon: '✦', label: 'Created' },
  assigned:   { icon: '→', label: 'Assigned' },
  claimed:    { icon: '🤝', label: 'Claimed' },
  submitted:  { icon: '📤', label: 'Submitted' },
  approved:   { icon: '✓',  label: 'Approved' },
  declined:   { icon: '✕',  label: 'Declined' },
  reassigned: { icon: '↔',  label: 'Reassigned' },
  reopened:   { icon: '↩',  label: 'Reopened' },
  cancelled:  { icon: '✕',  label: 'Cancelled' },
  archived:   { icon: '📦', label: 'Archived' },
};

function LogRow({ entry, members, colors, isLast }: {
  entry: { at: string; action: string; by?: string; note?: string };
  members: any[];
  colors: any;
  isLast: boolean;
}) {
  const actor = members.find(m => m.id === entry.by);
  const meta  = ACTION_META[entry.action] ?? { icon: '·', label: entry.action };
  const d = parseDbTime(entry.at);
  const stamp = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingBottom: isLast ? 0 : 16 }}>
      {/* Icon column + connector */}
      <View style={{ alignItems: 'center', width: 28 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: colors.surface,
          borderWidth: 1, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{meta.icon}</Text>
        </View>
        {!isLast && <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginTop: 4 }} />}
      </View>
      {/* Content */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{meta.label}</Text>
          {actor && (
            <Text style={{ fontSize: 12, color: colors.textTertiary }}>by {actor.name.split(' ')[0]}</Text>
          )}
        </View>
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{stamp}</Text>
        {entry.note && (
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>"{entry.note}"</Text>
        )}
      </View>
    </View>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────
export function QuestDetailModal({ quest, onClose, onDelete, canEdit, isParent }: {
  quest: Quest;
  onClose: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  isParent?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [dbLog, setDbLog] = useState<ActivityLogRow[]>([]);
  const [cheered, setCheered] = useState(false);
  const [proofViewerUri, setProofViewerUri] = useState<string | null>(null);
  // Bridges the gap between submitChore's fire-and-forget RPC and the store
  // patch that actually lands liveQuest.photoUrl — see doSubmit's comment.
  const [optimisticPhotoUrl, setOptimisticPhotoUrl] = useState<string | null>(null);
  // Real submission history — chore_submissions (migration
  // 20260988000000_chore_submission_history.sql), one frozen row per
  // submit/resubmit. Consolidation: ChoreProofReviewScreen/
  // QuestReviewScreen (now retired — see HubScreen.tsx's own comment) had
  // this; QuestDetailModal's own "Earlier submission" block below used to
  // read only the single, overwritten declineReason field — a genuine
  // prior round's photo/note was simply gone by the time a second
  // submission landed. Ported here so there's one real history source,
  // not two screens each solving part of the same problem.
  const [submissionHistory, setSubmissionHistory] = useState<{
    id: string; submitted_at: string; note: string | null; photo_url: string | null;
    redo_round: number; outcome: string | null; reviewed_note: string | null; reviewed_at: string | null;
  }[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase.from('chore_submissions')
      .select('id, submitted_at, note, photo_url, redo_round, outcome, reviewed_note, reviewed_at')
      .eq('chore_id', quest.id)
      .order('submitted_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('[QuestDetailModal] submission history fetch failed', error.message); return; }
        setSubmissionHistory(data ?? []);
      });
    return () => { cancelled = true; };
  }, [quest.id]);
  // Inline call reminder toggle — same pattern as EventDetailScreen's: local
  // state mirrors liveQuest for an instant-feeling Switch, writes straight
  // through to updateQuest on change.
  const [alertCall, setAlertCallState] = useState((quest as any).alertCall ?? false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutesState] = useState((quest as any).alertCallLeadMinutes ?? 10);
  const {
    updateQuest, quests, cheerQuest, claimQuest, submitQuest, approveQuest, declineQuest, reassignQuest, reopenQuest,
  } = useQuestStore();
  const { giveBackChore, disputeRedo, startGrandparentQuest, updateChore } = useChoreStore();
  const activeMemberId = useFamilyStore(s => s.activeMemberId) ?? '';
  const activeMember   = useFamilyStore(s => s.members.find(m => m.id === s.activeMemberId));
  const insets    = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const members   = useFamilyStore(s => s.members);
  const choreData = useChoreStore(s => s.chores.find(c => c.id === quest.id));

  // Always read the latest version from the store so edits reflect immediately
  const liveQuest = quests.find(q => q.id === quest.id) ?? quest;

  const canvas  = isDark ? '#0E0C13' : '#FFFFFF';
  const chipBg  = isDark ? '#1E1E2A' : '#EEECF2';

  const refreshLog = () => fetchActivityLog('chore', quest.id, 10).then(rows => setDbLog(rows));
  // Re-fetch whenever the quest id changes OR whenever the status changes
  // (claim → submitted → approved etc. each write a new activity_log row)
  useEffect(() => { refreshLog(); }, [quest.id, liveQuest.status]);

  // Once the real store value lands, drop the optimistic stand-in.
  useEffect(() => {
    if (liveQuest.photoUrl && optimisticPhotoUrl) setOptimisticPhotoUrl(null);
  }, [liveQuest.photoUrl, optimisticPhotoUrl]);

  useEffect(() => {
    setAlertCallState((liveQuest as any).alertCall ?? false);
    setAlertCallLeadMinutesState((liveQuest as any).alertCallLeadMinutes ?? 10);
  }, [(liveQuest as any).alertCall, (liveQuest as any).alertCallLeadMinutes]);

  function handleAlertCallChange(v: boolean | ((prev: boolean) => boolean)) {
    const next = typeof v === 'function' ? v(alertCall) : v;
    setAlertCallState(next);
    updateQuest(liveQuest.id, { alertCall: next } as any);
  }
  function handleLeadMinutesChange(v: number) {
    setAlertCallLeadMinutesState(v);
    updateQuest(liveQuest.id, { alertCallLeadMinutes: v } as any);
  }

  // ── Command-center actions — the same gating QuestCard uses on the list,
  // ported onto the detail page so a single tap into "readonly" detail isn't
  // a dead end for an assigned/claimed/pending-review chore. ─────────────
  const isActiveApprover = useTemporaryApproverStore(s => s.isActiveApprover(activeMemberId));
  const actions = deriveQuestActions(
    liveQuest,
    { id: activeMemberId, role: activeMember?.role, isActiveApprover },
    choreData ? { categoryType: choreData.categoryType, status: choreData.status } : undefined,
  );
  const singleAssign = liveQuest.participants.length <= 1;

  const [claiming, setClaiming] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  // Reassign-with-note compose for a self-assigned-parent chore — "may be
  // reassign is the best action in this case, with notes" (live-requested).
  // Declining doesn't make sense when you assigned it to yourself; handing
  // it to someone else with context does.
  const [reassigning, setReassigning] = useState(false);
  const [reassignNote, setReassignNote] = useState('');
  const [reassignTargetId, setReassignTargetId] = useState<string | null>(null);
  // When reassigning to a kid/teen, a self-assigned-parent chore commonly
  // has 0 coins (coinsDisabled's whole point is "parents don't earn coins")
  // — handing it to a kid with no coin reward and no warning would be a
  // live-requested gap: "if assigning to kids we can ask for the coins,
  // provide a configure option and warning too." Flow: warning text + Yes/No
  // "add coins?" choice, Yes reveals an inline coin-amount picker.
  const [reassignAddCoins, setReassignAddCoins] = useState<boolean | null>(null);
  const [reassignCoins, setReassignCoins] = useState<string>('20');

  // Inline submit compose (replaces SubmitQuestSheet bottom sheet)
  const [submitting, setSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState('');
  const [submitPhotoUri, setSubmitPhotoUri] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Inline redo/decline compose (parent sending it back)
  const [redoing, setRedoing] = useState(false);
  // Decline vs. Redo share the same compose panel/RPC (see the Decline
  // button's own comment) — this just flags which framing is active, so
  // the panel's title/placeholder/required-ness can differ without a
  // second near-duplicate panel.
  const [declining, setDeclining] = useState(false);
  const [redoPreset, setRedoPreset] = useState<typeof REJECTION_PRESETS[number]['key'] | null>(null);
  const [redoCustom, setRedoCustom] = useState('');

  function resetSubmitCompose() {
    setSubmitting(false); setSubmitNote(''); setSubmitPhotoUri(null);
  }
  function resetRedoCompose() {
    setRedoing(false); setDeclining(false); setRedoPreset(null); setRedoCustom('');
  }

  async function doClaim() {
    setClaiming(true);
    claimQuest(liveQuest.id, activeMemberId, (reason) => {
      setClaiming(false);
      Alert.alert(reason === 'claimed' ? 'Already claimed' : 'No longer available',
        reason === 'claimed' ? 'Someone else just claimed this chore.' : 'This chore was removed.');
    });
    setTimeout(() => setClaiming(false), 600);
  }

  async function pickProofPhoto(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to attach proof.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setSubmitPhotoUri(result.assets[0].uri);
  }

  async function doSubmit() {
    if (liveQuest.photoRequired && !submitPhotoUri) {
      Alert.alert('📸 Photo required', 'Add a photo before submitting this chore for review.');
      return;
    }
    let photoUrl: string | undefined;
    if (submitPhotoUri) {
      setUploadingProof(true);
      try {
        const familyId = activeMember?.familyId ?? '';
        const path = `chore-proofs/${familyId || 'unknown'}/${liveQuest.id}-${Date.now()}.jpg`;
        const blob = await (await fetch(submitPhotoUri)).blob();
        const { error: upErr } = await supabase.storage.from('family-media').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('family-media').getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      } catch (e) {
        console.warn('[QuestDetailModal] proof photo upload failed', e);
        setUploadingProof(false);
        Alert.alert('Upload failed', "Couldn't upload the photo — check your connection and try again.");
        return;
      }
      setUploadingProof(false);
    }
    if (photoUrl) console.log('[QuestDetailModal] submitting with photoUrl', photoUrl);
    const ok = submitQuest(liveQuest.id, { photoUrl, note: submitNote.trim() || undefined }, activeMemberId);
    if (!ok) {
      Alert.alert('Not due yet', "This chore's next turn hasn't started yet — check back on its due date.");
      return;
    }
    // submitChore fires its RPC fire-and-forget (synchronous boolean return,
    // doesn't await the server round-trip) — the store patch that actually
    // lands liveQuest.photoUrl happens a beat later. Show the just-uploaded
    // photo immediately from local state instead of waiting on that round-
    // trip, so the proof never appears to "vanish" right after submitting.
    if (photoUrl) setOptimisticPhotoUrl(photoUrl);
    resetSubmitCompose();
    refreshLog();
  }

  async function doApprove() {
    setActionBusy('approve');
    approveQuest(liveQuest.id, activeMemberId);
    setActionBusy(null);
    refreshLog();
  }

  function doSendRedo() {
    // Preset label and the free-text message box are independent now — a
    // preset gives the parent a quick starting reason, the message box is
    // always available to add detail or stand alone with no preset picked.
    const presetLabel = redoPreset ? REJECTION_PRESETS.find(p => p.key === redoPreset)?.label : undefined;
    const custom = redoCustom.trim();
    const reason = presetLabel && custom ? `${presetLabel} — ${custom}` : presetLabel || custom;
    if (!reason) return;
    setActionBusy('redo');
    declineQuest(liveQuest.id, activeMemberId, reason, redoPreset ?? 'custom');
    setActionBusy(null);
    resetRedoCompose();
    refreshLog();
  }

  async function doGiveBack() {
    setActionBusy('giveback');
    await giveBackChore(liveQuest.id, activeMemberId);
    setActionBusy(null);
  }

  async function doReassignWithNote() {
    if (!reassignTargetId) return;
    const targetMember = members.find(m => m.id === reassignTargetId);
    const targetIsAdult = targetMember?.role === 'parent' || targetMember?.role === 'senior';
    setActionBusy('reassign');
    // reassignQuest is now awaited (was previously fired without awaiting
    // its own internal store.updateChore — see choreAdapter.ts's own
    // comment) so this function's own follow-up patch below diffs against
    // the ROW THE REASSIGNMENT ACTUALLY PRODUCED, not a stale pre-
    // reassignment snapshot. That race was silently dropping the
    // reassignment from the activity log (logChoreUpdateActivity's diff
    // runs per updateChore call against whichever prevChore the race left
    // in local state) and could in principle also clobber the reassignment
    // itself if the two writes landed out of order.
    await reassignQuest(liveQuest.id, reassignTargetId, activeMemberId);

    const chorePatch: Record<string, any> = {};
    if (reassignNote.trim()) chorePatch.parentNote = reassignNote.trim();
    if (targetIsAdult) {
      // Symmetric case to the kid-coins-warning flow below: coinsDisabled's
      // whole rule (AddQuestModal/EditQuestModal) is "a parent/senior
      // assignee never earns coins" — reassigning TO a parent/senior must
      // enforce that here too, not just warn about it at create/edit time.
      // Zeroed unconditionally (not behind a toggle) since there's no
      // legitimate "keep the coins anyway" option for an adult assignee —
      // the warning shown below is purely informational, not a choice.
      if (liveQuest.coins > 0) {
        chorePatch.coinsReward = 0;
        chorePatch.basePoints = 0;
        chorePatch.bonusCoins = 0;
      }
    } else if (reassignAddCoins) {
      const coinAmount = parseInt(reassignCoins, 10) || 0;
      chorePatch.coinsReward = coinAmount;
      chorePatch.basePoints = coinAmount;
    }
    if (Object.keys(chorePatch).length) {
      await updateChore(liveQuest.id, chorePatch);
    }
    setActionBusy(null);
    setReassigning(false);
    setReassignNote('');
    setReassignTargetId(null);
    setReassignAddCoins(null);
    setReassignCoins('20');
    refreshLog();
  }

  async function doDispute() {
    setActionBusy('dispute');
    await disputeRedo(liveQuest.id, activeMemberId);
    setActionBusy(null);
    refreshLog();
  }

  // Full role audit found this completely dead — actions.canReopen was
  // computed by deriveQuestActions (isParentOrSenior && declined) but never
  // wired to any button in QuestCard.tsx or QuestDetailModal, only in the
  // Kiosk tab. A parent viewing a fully declined chore on the phone had no
  // recourse besides Delete — Resubmit is kid/teen-only (canResubmit), so a
  // declined chore the kid never resubmits just sat there permanently.
  async function doReopen() {
    setActionBusy('reopen');
    reopenQuest(liveQuest.id, activeMemberId);
    setActionBusy(null);
    refreshLog();
  }

  function confirmCantDoThis() {
    Alert.alert("Can't do this?", 'This chore will go back to the pool for someone else.', [
      { text: 'Cancel', style: 'cancel' },
      { text: "Can't do it", style: 'destructive', onPress: async () => {
        setActionBusy('decline');
        declineQuest(liveQuest.id, activeMemberId, 'Declined by assignee');
        setActionBusy(null);
      }},
    ]);
  }

  const assigneeIds = liveQuest.assignedToIds?.length
    ? liveQuest.assignedToIds
    : liveQuest.assignedToId ? [liveQuest.assignedToId] : [];
  const assignees = assigneeIds.map(id => members.find(m => m.id === id)).filter(Boolean) as typeof members;

  // Activity timeline stamps — prefer choreData timestamps (always populated)
  // over quest-adapter fields which may not survive the choreToQuest mapping
  const rawCreatedAt   = choreData?.createdAt ?? (liveQuest as any).createdAt;
  const rawClaimedAt   = liveQuest.claimedAt  ?? choreData?.claimedAt;
  const rawSubmittedAt = liveQuest.submittedAt ?? choreData?.submittedAt;
  const rawApprovedAt  = (liveQuest as any).approvedAt ?? choreData?.approvedAt;
  const rawDeclinedAt  = (liveQuest as any).declinedAt ?? choreData?.declinedAt;

  const createdBy  = members.find(m => m.id === (liveQuest.createdById ?? choreData?.createdById));
  const claimedBy  = members.find(m => m.id === liveQuest.assignedToId);
  const approvedBy = members.find(m => m.id === ((liveQuest as any).reviewedById ?? choreData?.reviewedById));

  // name + date joined with " · ", either half optional — collapses to
  // undefined (renders as TimelineNode's own "Waiting" fallback) rather than
  // an empty string when neither a name nor a parseable date is available.
  function joinDetail(name: string | undefined, dateStr: string): string | undefined {
    const parts = [name, dateStr].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
  }

  const createdDetail = rawCreatedAt
    ? joinDetail(createdBy?.name?.split(' ')[0], fmt12hFromIso(rawCreatedAt))
    : undefined;
  const claimedDetail = rawClaimedAt
    ? joinDetail(claimedBy?.name?.split(' ')[0], fmt12hFromIso(rawClaimedAt))
    : undefined;
  const submittedDetail = rawSubmittedAt
    ? (fmt12hFromIso(rawSubmittedAt) || undefined)
    : undefined;
  const approvedDetail = rawApprovedAt
    ? joinDetail(approvedBy?.name?.split(' ')[0], fmt12hFromIso(rawApprovedAt))
    : rawDeclinedAt
      ? joinDetail('Declined', fmt12hFromIso(rawDeclinedAt))
      : undefined;

  // Human-readable label + style per DB action+field combo
  function trailLabel(row: ActivityLogRow): { label: string; detail?: string; emoji: string; dot: string } {
    const actor = members.find(m => m.id === row.actorId)?.name?.split(' ')[0] ?? '';
    const by = actor ? ` — ${actor}` : '';
    switch (row.action) {
      case 'created':      return { label: `Created${by}`, emoji: '✨', dot: colors.teal };
      case 'claimed':      return { label: `Claimed${by}`, emoji: '🙋', dot: colors.pink };
      case 'submitted':    return { label: `Submitted for review${by}`, emoji: '📤', dot: colors.amber };
      case 'approved':     return { label: `Approved${by}`, emoji: '✅', dot: colors.teal };
      case 'declined':     return { label: `Declined${by}`, detail: row.note ?? undefined, emoji: '❌', dot: colors.danger };
      case 'reassigned': {
        const to = members.find(m => m.id === row.newValue)?.name?.split(' ')[0] ?? row.newValue ?? '?';
        return { label: `Reassigned to ${to}${by}`, emoji: '🔀', dot: colors.pink };
      }
      case 'reward_changed': {
        const field = row.field === 'bonusCoins' ? 'bonus coins' : 'coins';
        return { label: `Reward updated${by}`, detail: `${field}: ${row.oldValue ?? '?'} → ${row.newValue ?? '?'}`, emoji: '🪙', dot: colors.amber };
      }
      case 'due_date_changed': {
        const newDate = row.newValue ? fmtDateShort(row.newValue) : '—';
        return { label: `Due date changed${by}`, detail: newDate, emoji: '📅', dot: colors.teal };
      }
      case 'notes_changed':   return { label: `Notes updated${by}`, emoji: '📝', dot: colors.textTertiary };
      case 'status_changed':  return { label: `Status → ${row.newValue ?? '?'}${by}`, emoji: '🔄', dot: colors.pink };
      case 'deleted':         return { label: `Deleted${by}`, emoji: '🗑️', dot: colors.danger };
      default:                return { label: `${row.action}${by}`, emoji: '•', dot: colors.textTertiary };
    }
  }

  const note = (liveQuest as any).note || liveQuest.completionNote || choreData?.parentNote;

  // Bonus expiry info
  const bonusCoins     = choreData?.bonusCoins ?? 0;
  const bonusExpiresAt = choreData?.bonusExpiresAt;
  const bonusExpired   = bonusExpiresAt ? new Date(bonusExpiresAt) < new Date() : false;
  const bonusActive    = bonusCoins > 0 && !bonusExpired;
  const totalCoins     = (liveQuest.coins ?? 0) + (bonusActive ? bonusCoins : 0);

  // Meta chips
  const chips: { label: string; color?: string }[] = [];
  if (liveQuest.dueDate) {
    // dueDate may be a plain YYYY-MM-DD or a full ISO timestamp — normalise to date-only
    const datePart = liveQuest.dueDate.includes('T') ? liveQuest.dueDate.split('T')[0] : liveQuest.dueDate;
    const dateStr = fmtDateShort(datePart);
    // Only show the separator if the time actually rendered — a malformed
    // dueTime previously still produced the " · " with nothing after it.
    const timeRendered = fmt12hTime(liveQuest.dueTime);
    const timeStr = timeRendered ? ` · ${timeRendered}` : '';
    chips.push({ label: `${dateStr}${timeStr}` });
  }
  if (liveQuest.coins > 0 && !liveQuest.isAdultTask) {
    chips.push({ label: bonusCoins > 0 ? `${totalCoins} coins (${liveQuest.coins} + ${bonusCoins} bonus)` : `${liveQuest.coins} coins` });
  }
  if (liveQuest.category) chips.push({ label: liveQuest.category });
  if (liveQuest.difficulty) chips.push({ label: liveQuest.difficulty.charAt(0).toUpperCase() + liveQuest.difficulty.slice(1) });
  if (liveQuest.recurrence && liveQuest.recurrence !== 'once') chips.push({ label: `🔄 ${liveQuest.recurrence}` });
  if (liveQuest.photoRequired) chips.push({ label: '📸 Photo required' });
  if (liveQuest.isAdultTask) chips.push({ label: '👨‍👩 Adult only' });

  // Status badge
  // pending_approval's label now carries the assignee's own name ("Awaiting
  // review · Leo") instead of a flat "In Review" — live-reported: removing
  // the "Who's on it" avatar card for this status (previous fix) dropped
  // the assignee's name from the page entirely with nothing replacing it.
  // The mock's own framing puts assignee + status together as plain top-
  // of-page text, in the danger/peach tint (this IS the moment a parent is
  // being asked to act), not the lavender "In Review" used for a kid/teen
  // just passively glancing at their own submission elsewhere in the app.
  const pendingApprovalAssigneeFirst = members.find(m => m.id === liveQuest.assignedToId)?.name?.split(' ')[0];
  const statusMap: Record<string, { label: string; color: string }> = {
    todo:             { label: 'Open',        color: colors.textSecondary },
    claimed:          { label: 'Claimed',     color: colors.teal },
    in_progress:      { label: 'In Progress', color: colors.teal },
    pending_approval: {
      label: pendingApprovalAssigneeFirst ? `Awaiting review · ${pendingApprovalAssigneeFirst}` : 'Awaiting review',
      color: colors.danger,
    },
    approved:         { label: 'Approved',    color: colors.teal },
    done:             { label: 'Done',        color: colors.teal },
    declined:         { label: 'Declined',    color: colors.danger },
  };
  const statusInfo = statusMap[liveQuest.status] ?? { label: liveQuest.status, color: colors.textSecondary };

  // When in edit mode, render EditQuestModal inside the same already-open Modal
  if (editing) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setEditing(false)}>
        <EditQuestModal
          quest={liveQuest}
          activeMemberId={activeMemberId}
          onClose={() => setEditing(false)}
          onSave={(id, patch) => {
            updateQuest(id, patch);
            setEditing(false);
            setTimeout(refreshLog, 1500); // allow DB write to settle
          }}
          onDelete={onDelete ? (_id: string) => { onDelete(); onClose(); } : undefined}
        />
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SwipeBackWrapper onDismiss={onClose}>
      <View style={{ flex: 1, backgroundColor: canvas }}>

        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 8 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.teal }}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {/* canEdit prop is role-only (isParent) — was letting a parent open
              Edit on an already-approved/declined chore with nothing left to
              change, stale-state risk same as EventDetailScreen's past-event
              gating. actions.canEdit (deriveQuestActions) already factors in
              !done && !declined on top of the role check — use that instead. */}
          {canEdit && actions.canEdit && (
            <TouchableOpacity
              onPress={() => setEditing(true)}
              style={{
                paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                borderWidth: 1.5, borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero block: title + status + description ───────────────────────
              Live direction: "we can brought down to the below task name"
              — title and status pill used to sit side-by-side on the same
              row; the mock stacks them (full-width title, pill on its own
              line underneath), matching how the assignee's name now lives
              IN that pill ("Awaiting review · Leo") rather than needing
              room next to a long title. */}
          <View style={{ paddingHorizontal: 20, paddingTop: 6, marginBottom: 14, gap: 8 }}>
            <Text style={{ fontSize: 29, fontWeight: '700', letterSpacing: -0.5, color: colors.textPrimary, lineHeight: 41 }}>
              {liveQuest.title}
            </Text>
            {/* Live direction: "call reminder should go to the same row
                right side so we can save space" — the status pill and the
                call-reminder toggle now share one row (pill left, a
                compact icon-only toggle right) instead of the reminder
                living in its own separate REMINDER section further down
                the page. Lead-time chips still expand below, but only
                while alertCall is on — a reminder for an already-decided
                chore is meaningless, same gating the old section had. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Live-approved pill style ("Awaiting review · Leo") — solid
                  flat fill, no border, bold text. Was a lighter tinted fill
                  with a visible outline; this reads cleaner/punchier. */}
              <View style={{
                height: 25, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 100,
                backgroundColor: statusInfo.color + '22',
              }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: statusInfo.color }}>{statusInfo.label}</Text>
              </View>
              {liveQuest.status !== 'approved' && liveQuest.status !== 'done' && liveQuest.status !== 'declined' && (() => {
                // Live direction: "don't be another chip, convert the call
                // reminder to that selected one" — one chip total, not a
                // toggle chip plus a separate lead-time chip underneath.
                // Off: tap turns it on (default lead time). On: the SAME
                // chip's own label shows the selected lead time, tap cycles
                // to the next one; long-press turns the reminder back off.
                const LEAD_OPTIONS = [0, 10, 15, 30];
                const idx = LEAD_OPTIONS.indexOf(alertCallLeadMinutes);
                const label = !alertCall ? 'Call reminder' : (alertCallLeadMinutes === 0 ? 'Call · on time' : `Call · ${alertCallLeadMinutes} min before`);
                return (
                  <TouchableOpacity
                    onPress={() => {
                      if (!alertCall) handleAlertCallChange(true);
                      else handleLeadMinutesChange(LEAD_OPTIONS[(idx + 1) % LEAD_OPTIONS.length]);
                    }}
                    onLongPress={() => handleAlertCallChange(false)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 25,
                      borderRadius: 100, backgroundColor: alertCall ? colors.pink + '18' : colors.surface,
                      borderWidth: 1, borderColor: alertCall ? colors.pink + '50' : colors.border }}>
                    <Text style={{ fontSize: 13 }}>{alertCall ? '📞' : '📴'}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: alertCall ? colors.pink : colors.textSecondary }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
            {(liveQuest.description || note) && (
              <Text style={{ fontSize: 15, color: colors.textSecondary, lineHeight: 22 }}>
                {liveQuest.description || note}
              </Text>
            )}
          </View>

          {/* ── Reward + due tinted card ─────────────────────────────────────── */}
          <View style={{
            marginHorizontal: 20, marginBottom: 14,
            backgroundColor: isDark ? colors.surface : colors.amberLight,
            borderRadius: 16, padding: 16, gap: 12,
          }}>
            {/* Coins row */}
            {liveQuest.coins > 0 && !liveQuest.isAdultTask && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.amber, marginBottom: 2 }}>Reward</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary }}>
                    {bonusActive ? totalCoins : liveQuest.coins}
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}> coins</Text>
                  </Text>
                  {bonusCoins > 0 && (
                    <Text style={{ fontSize: 12, color: bonusActive ? colors.amber : colors.textTertiary, marginTop: 2 }}>
                      {liveQuest.coins} base
                      {bonusActive ? ` + ${bonusCoins} bonus ⚡` : ` + ${bonusCoins} bonus (expired)`}
                    </Text>
                  )}
                </View>
                {bonusCoins > 0 && bonusExpiresAt && (
                  <View style={{
                    alignItems: 'flex-end', paddingLeft: 12,
                    borderLeftWidth: 1, borderLeftColor: colors.amber + '40',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: bonusActive ? colors.amber : colors.textTertiary }}>
                      {bonusActive ? 'Bonus expires' : 'Bonus expired'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'right' }}>
                      {new Date(bonusExpiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Due date / time row */}
            {liveQuest.dueDate && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 16 }}>📅</Text>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textTertiary }}>Due</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                    {fmtDateShort(liveQuest.dueDate.includes('T') ? liveQuest.dueDate.split('T')[0] : liveQuest.dueDate)}
                    {fmt12hTime(liveQuest.dueTime) ? `  ·  ${fmt12hTime(liveQuest.dueTime)}` : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Tags row: category · difficulty · recurrence */}
            {(liveQuest.category || liveQuest.difficulty || (liveQuest.recurrence && liveQuest.recurrence !== 'once') || liveQuest.photoRequired) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {liveQuest.category && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.amber + '22' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.amber }}>{liveQuest.category}</Text>
                  </View>
                )}
                {liveQuest.difficulty && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.teal + '18' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>{liveQuest.difficulty.charAt(0).toUpperCase() + liveQuest.difficulty.slice(1)}</Text>
                  </View>
                )}
                {liveQuest.recurrence && liveQuest.recurrence !== 'once' && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.pink + '18' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.pink }}>🔄 {liveQuest.recurrence}</Text>
                  </View>
                )}
                {liveQuest.photoRequired && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: chipBg }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>📸 Photo required</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Who's on it ────────────────────────────────────────────────────
              Hidden while reviewing a pending_approval submission — live
              direction: "assigned and status is just simple text top so we
              can remove avatar section" (the mock shows who/status as the
              page title + "Awaiting review · Leo" pill, not a separate
              avatar card). Kept for every OTHER status (todo/claimed/
              approved/etc.) where this is the only place that info shows. */}
          {liveQuest.status !== 'pending_approval' && (
          <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
            <SectionLabel color={colors.textTertiary}>
              {liveQuest.isPool && assignees.length === 0 ? 'Open to' : 'Assigned to'}
            </SectionLabel>
            {liveQuest.isPool && assignees.length === 0 ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: isDark ? colors.surface : colors.tealLight,
                borderRadius: 12, padding: 14,
              }}>
                <Text style={{ fontSize: 24 }}>⚡</Text>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>Open pool</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Anyone in the family can claim this</Text>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 20 }}>
                {assignees.map(m => {
                  const roleColor = m.role === 'parent' ? colors.teal : colors.amber;
                  return (
                    <View key={m.id} style={{ alignItems: 'center', gap: 6 }}>
                      <FamilyAvatar
                        name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
                        siblings={members.map(x => x.name)} size={52}
                        ringColor={roleColor} ringWidth={2}
                      />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{m.name.split(' ')[0]}</Text>
                      <Text style={{ fontSize: 11, color: roleColor }}>{m.role === 'parent' ? 'Parent' : 'Kid'}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
          )}

          {/* ── Progress — right below Who's on it, ahead of proof/actions/history ── */}
          <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
            <SectionLabel color={colors.textTertiary}>Progress</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <TimelineNode label="Created"   detail={createdDetail}   filled={!!rawCreatedAt} />
              <TimelineNode label="Claimed"   detail={claimedDetail}   filled={!!rawClaimedAt} />
              <TimelineNode label="Submitted" detail={submittedDetail} filled={!!rawSubmittedAt} />
              <TimelineNode label="Approved"  detail={approvedDetail}  filled={!!(rawApprovedAt || rawDeclinedAt)} isLast />
            </View>
          </View>

          {/* ── Call reminder — ringing (CallKit-style) alert before the task
              is due, distinct from an ordinary push notification. A
              reminder for an already-approved/declined chore is meaningless
              — same reasoning as EventDetailScreen's past-event gating. ── */}

          {/* ── Remaining sections: all padded ──────────────────────────────── */}
          <View style={{ paddingHorizontal: 20 }}>

          {/* ── Submitted proof — shown FIRST, before any decision buttons, so a
              reviewer sees the evidence before being asked to act on it. Full-
              width photo card matches the reference's hero-photo-then-note
              layout instead of a small inline thumbnail. ─────────────────── */}
          {(liveQuest.status === 'pending_approval' || liveQuest.completionNote || liveQuest.photoUrl || optimisticPhotoUrl) && (() => {
            const submitter = members.find(m => m.id === liveQuest.assignedToId);
            const submitterLabel = submitter
              ? (submitter.role === 'kid' || submitter.role === 'teen'
                  ? `Submitted by ${submitter.name.split(' ')[0]}`
                  : `Submitted by ${submitter.name.split(' ')[0]} (${submitter.role === 'parent' ? 'parent' : submitter.role})`)
              : 'Submitted';
            // Prefer the real store value once it lands; fall back to the
            // just-uploaded local URL in the brief window before it does.
            const displayPhotoUrl = liveQuest.photoUrl || optimisticPhotoUrl || undefined;
            return (
              <View style={{ marginBottom: 14 }}>
                <SectionLabel color={colors.textTertiary}>{submitterLabel}</SectionLabel>
                <View style={{ backgroundColor: isDark ? colors.surface : colors.card,
                  borderRadius: 18, overflow: 'hidden',
                  borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(44,39,34,0.08)' }}>
                  {displayPhotoUrl && (
                    <TouchableOpacity onPress={() => setProofViewerUri(displayPhotoUrl)} activeOpacity={0.9}>
                      <Image source={{ uri: displayPhotoUrl }}
                        style={{ width: '100%', height: 220, backgroundColor: chipBg }} />
                      <View style={{ position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
                        <Maximize2 size={12} color="#fff" />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>View full size</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  <View style={{ padding: 14, gap: 6 }}>
                    {liveQuest.completionNote ? (
                      <Text style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 20 }}>
                        "{liveQuest.completionNote}"
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>No note was added</Text>
                    )}
                    {submittedDetail && (
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>{submittedDetail}</Text>
                    )}
                    {/* Mock's own footer line ("Submission P-106 · Tue 6
                        Oct, 09:30 · 10 coins on approval. Original photo
                        and note are read-only.") — was missing entirely;
                        uses the real submission number (submissionHistory
                        length, ordinal) and coin reward instead of the
                        mock's placeholder ID. */}
                    {liveQuest.status === 'pending_approval' && (
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                        Submission {submissionHistory.length || 1} · {liveQuest.coins} coin{liveQuest.coins === 1 ? '' : 's'} on approval. Original photo and note are read-only.
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })()}

          {/* ── Earlier submission(s) — real history (chore_submissions),
              not the single stale declineReason field this used to read.
              Only ever shows PAST rounds (everything except the current/
              latest one, which the proof card above already covers), so a
              redo cycle's actual prior photo/note stays visible instead
              of silently vanishing the moment a new one lands. ── */}
          {(() => {
            if (liveQuest.status !== 'pending_approval' || submissionHistory.length < 2) return null;
            const earlierRounds = submissionHistory.slice(0, -1);
            const assigneeFirst = members.find(m => m.id === liveQuest.assignedToId)?.name?.split(' ')[0] ?? 'They';
            return (
              <View style={{ marginBottom: 16, backgroundColor: isDark ? colors.surface : colors.surface,
                borderRadius: 16, padding: 14, gap: 10 }}>
                <SectionLabel color={colors.textTertiary} marginBottom={0}>
                  {earlierRounds.length > 1 ? `${earlierRounds.length} earlier submissions` : 'Earlier submission'}
                </SectionLabel>
                {earlierRounds.map(round => (
                  <View key={round.id} style={{ gap: 2 }}>
                    <Text style={{ fontSize: 12, color: colors.textTertiary, lineHeight: 17 }}>
                      {fmt12hFromIso(round.submitted_at)} · {round.photo_url ? 'photo attached' : 'no photo attached'}
                      {round.reviewed_note ? ` — sent back: "${round.reviewed_note}"` : round.outcome === 'redo_requested' ? ' — sent back for another pass' : ''}
                    </Text>
                    {round.note ? (
                      <Text style={{ fontSize: 12, color: colors.textTertiary, fontStyle: 'italic', lineHeight: 17 }}>
                        "{round.note}"
                      </Text>
                    ) : null}
                  </View>
                ))}
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                  {assigneeFirst} tried again — nothing from the earlier attempt was overwritten.
                </Text>
              </View>
            );
          })()}

          {/* ── Action center — the actual lifecycle actions, inline, no sheets ── */}
          {singleAssign && (
            <View style={{ marginBottom: 16, gap: 10 }}>

              {/* Claim (open pool) */}
              {!liveQuest.pendingTerms && actions.canClaim && (
                <TouchableOpacity onPress={doClaim} disabled={claiming}
                  style={{ height: 52, borderRadius: 16, backgroundColor: colors.teal,
                    alignItems: 'center', justifyContent: 'center' }}>
                  {claiming
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Claim chore</Text>}
                </TouchableOpacity>
              )}

              {/* GP: accept a grandparent quest before working it */}
              {!liveQuest.pendingTerms && actions.canAcceptGp && (
                <TouchableOpacity onPress={() => startGrandparentQuest(liveQuest.id, activeMemberId)}
                  style={{ height: 52, borderRadius: 16, backgroundColor: colors.teal,
                    alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>🙌 I'll take it</Text>
                </TouchableOpacity>
              )}

              {/* Kid disputed a redo — waiting on a second parent */}
              {liveQuest.kidDisputedRedo && (
                <Text style={{ fontSize: 13, color: colors.textTertiary, fontStyle: 'italic', textAlign: 'center' }}>
                  Waiting on a second parent to take a look…
                </Text>
              )}

              {/* Submit / Resubmit — inline compose, replaces the old bottom sheet */}
              {!liveQuest.pendingTerms && !liveQuest.kidDisputedRedo && (actions.canSubmit || actions.canResubmit) && !actions.canAcceptGp && !submitting && (
                <TouchableOpacity onPress={() => setSubmitting(true)}
                  style={{ height: 52, borderRadius: 16, backgroundColor: colors.pink,
                    alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                    {actions.canResubmit ? '↩ Revise & resubmit' : 'Submit for review'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* "I did do it" — dispute a redo instead of resubmitting */}
              {!liveQuest.pendingTerms && !liveQuest.kidDisputedRedo && actions.canResubmit && !submitting && (
                <TouchableOpacity onPress={doDispute} disabled={actionBusy === 'dispute'}
                  style={{ height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.pink,
                    alignItems: 'center', justifyContent: 'center' }}>
                  {actionBusy === 'dispute'
                    ? <ActivityIndicator color={colors.pink} />
                    : <Text style={{ fontSize: 14, fontWeight: '600', color: colors.pink }}>I did do it</Text>}
                </TouchableOpacity>
              )}

              {submitting && (
                <View style={{ backgroundColor: isDark ? colors.surface : colors.pinkLight,
                  borderRadius: 16, padding: 16, gap: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                    {actions.canResubmit ? 'Revise & resubmit' : 'Submit for review'}
                  </Text>
                  {liveQuest.photoRequired && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Camera size={13} color={colors.amber} />
                      <Text style={{ fontSize: 12, color: colors.amber, fontWeight: '600' }}>Photo required</Text>
                    </View>
                  )}
                  {submitPhotoUri ? (
                    <View style={{ alignSelf: 'flex-start' }}>
                      <Image source={{ uri: submitPhotoUri }}
                        style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: colors.card }} />
                      <TouchableOpacity onPress={() => setSubmitPhotoUri(null)}
                        style={{ position: 'absolute', top: -8, right: -8, width: 26, height: 26, borderRadius: 13,
                          backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
                          borderWidth: 2, borderColor: isDark ? colors.surface : colors.pinkLight }}>
                        <XIcon size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => pickProofPhoto(true)}
                        style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Camera size={15} color={colors.textSecondary} />
                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => pickProofPhoto(false)}
                        style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <ImageIcon size={15} color={colors.textSecondary} />
                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>Library</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TextInput
                    value={submitNote}
                    onChangeText={setSubmitNote}
                    placeholder="Add a note (optional)…"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12,
                      fontSize: 14, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={resetSubmitCompose}
                      style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={doSubmit} disabled={uploadingProof}
                      style={{ flex: 2, height: 42, borderRadius: 12, backgroundColor: colors.pink,
                        alignItems: 'center', justifyContent: 'center' }}>
                      {uploadingProof
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Submit</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Reassign-with-note — a self-assigned-parent chore has no
                  sensible "decline" (you'd be declining your own
                  assignment), so the real escape hatch is handing it to a
                  different parent/senior with context, not Submit or
                  Delete. Live-requested: "may be reassign is the best
                  action in this case, with notes."
                  Not scoped to isSelfAssignedParent or to whoever reassigned
                  it last — any parent can keep reassigning for as long as
                  the chore sits untouched at 'todo' (live-requested: "once
                  reassigned to someone, parent should always have the
                  option to reassign until one of the person accepts").
                  There's no separate "pending acceptance" status for a
                  chore the way an event has driverStatus — a fresh
                  assignment lands straight at 'todo', so "hasn't accepted
                  yet" IS "still todo, nothing claimed/submitted." The
                  moment the new assignee actually claims/starts/submits it,
                  todo flips to claimed/in_progress/pending_approval and
                  this button naturally stops showing. */}
              {!liveQuest.pendingTerms &&
                (activeMember?.role === 'parent' || activeMember?.role === 'senior') &&
                liveQuest.status === 'todo' && !submitting && !reassigning && (
                <TouchableOpacity onPress={() => setReassigning(true)}
                  style={{ height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.pink,
                    alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.pink }}>↔ Reassign to someone else</Text>
                </TouchableOpacity>
              )}

              {reassigning && (
                <View style={{ backgroundColor: isDark ? colors.surface : colors.pinkLight,
                  borderRadius: 16, padding: 16, gap: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Reassign to</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {/* An ordinary (non-adult-only) chore can go to anyone in
                        the family, kid/teen included — "Water plants" (53
                        coins, Yard, kid-eligible) just happened to be
                        self-assigned to a parent; a kid is a perfectly
                        legitimate reassign target for it. Only an explicit
                        isAdultTask chore restricts the list to parents/
                        seniors, matching the same rule the assignee picker
                        in Add/Edit Quest already enforces at creation time. */}
                    {members.filter(m =>
                      // Excludes only whoever the chore is ALREADY assigned
                      // to — reassigning to the current holder is a no-op.
                      // Does NOT blanket-exclude the viewer: that was only
                      // ever correct for the self-assigned-parent case
                      // (viewer === current assignee, already covered by
                      // the check below); a DIFFERENT parent/senior opening
                      // this chore's detail page — the whole reason the
                      // Reassign button isn't scoped to isSelfAssignedParent
                      // anymore — can legitimately reassign it TO themselves.
                      m.id !== liveQuest.assignedToId &&
                      !liveQuest.assignedToIds?.includes(m.id) &&
                      (!liveQuest.isAdultTask || m.role === 'parent' || m.role === 'senior'),
                    ).map(m => {
                      const sel = reassignTargetId === m.id;
                      const roleColor = m.role === 'parent' ? colors.teal
                        : m.role === 'senior' ? colors.pink : colors.kid;
                      return (
                        <TouchableOpacity key={m.id} onPress={() => { setReassignTargetId(m.id); setReassignAddCoins(null); }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                            backgroundColor: sel ? colors.pink : colors.card,
                            borderWidth: sel ? 0 : 1, borderColor: colors.border }}>
                          <Text style={{ fontSize: 13, fontWeight: sel ? '700' : '500', color: sel ? '#fff' : colors.textPrimary }}>
                            {m.name}
                          </Text>
                          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
                            backgroundColor: sel ? 'rgba(255,255,255,0.25)' : roleColor + '20' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: sel ? '#fff' : roleColor }}>
                              {m.role === 'kid' || m.role === 'teen' ? 'Kid' : m.role === 'senior' ? 'Senior' : 'Parent'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Coin warning + Yes/No + inline configure — only when
                      handing to a kid/teen AND the chore currently has no
                      coin reward (the common case: a self-assigned-parent
                      chore has 0 coins by design, since parents don't earn
                      them). Flow: warning text first, then an explicit
                      Yes/No choice, Yes reveals the coin-amount picker. */}
                  {reassignTargetId && (() => {
                    const target = members.find(m => m.id === reassignTargetId);
                    const targetIsKid = target?.role === 'kid' || target?.role === 'teen';
                    if (!targetIsKid || liveQuest.coins > 0) return null;
                    return (
                      <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 10 }}>
                        <Text style={{ fontSize: 12, color: colors.amber, fontWeight: '600', lineHeight: 17 }}>
                          ⚠ This chore has no coin reward right now — {target?.name.split(' ')[0]} won't earn anything for doing it.
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>Add coins?</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity onPress={() => setReassignAddCoins(true)}
                            style={{ flex: 1, height: 36, borderRadius: 10,
                              backgroundColor: reassignAddCoins === true ? colors.amber : colors.pinkLight,
                              borderWidth: reassignAddCoins === true ? 0 : 1, borderColor: colors.border,
                              alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: reassignAddCoins === true ? '#fff' : colors.textPrimary }}>Yes</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setReassignAddCoins(false)}
                            style={{ flex: 1, height: 36, borderRadius: 10,
                              backgroundColor: reassignAddCoins === false ? colors.textTertiary : colors.pinkLight,
                              borderWidth: reassignAddCoins === false ? 0 : 1, borderColor: colors.border,
                              alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: reassignAddCoins === false ? '#fff' : colors.textPrimary }}>No, leave at 0</Text>
                          </TouchableOpacity>
                        </View>
                        {reassignAddCoins === true && (
                          <View style={{ gap: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                              {[10, 20, 30, 50, 75, 100].map(c => {
                                const isActive = parseInt(reassignCoins, 10) === c;
                                return (
                                  <TouchableOpacity key={c} onPress={() => setReassignCoins(String(c))}
                                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                      backgroundColor: isActive ? colors.amber : colors.amberLight,
                                      borderWidth: isActive ? 0 : 1, borderColor: colors.border }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: isActive ? '#fff' : colors.amber }}>{c}🪙</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            {/* Custom amount — presets cover the common cases,
                                but a parent should be able to type any exact
                                value, same as Add/EditQuestModal's own coin
                                field (live-requested: "give custom coin box"). */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 12, color: colors.textTertiary, fontWeight: '600' }}>Custom:</Text>
                              <TextInput
                                value={reassignCoins}
                                onChangeText={v => setReassignCoins(v.replace(/[^0-9]/g, ''))}
                                keyboardType="number-pad"
                                placeholder="e.g. 25"
                                placeholderTextColor={colors.textTertiary}
                                style={{ flex: 1, backgroundColor: colors.card, borderRadius: 10,
                                  borderWidth: 1, borderColor: colors.border,
                                  paddingHorizontal: 12, paddingVertical: 8,
                                  fontSize: 14, fontWeight: '700', color: colors.amber }}
                              />
                              <Text style={{ fontSize: 13, color: colors.textTertiary }}>🪙</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Symmetric case — reassigning TO a parent/senior when
                      the chore currently HAS coins: those coins will be
                      removed (adults never earn coins — same coinsDisabled
                      rule Add/EditQuestModal already enforce at
                      create/edit time), so show the warning and make the
                      actual removal explicit rather than silent — no
                      toggle/choice here since there's no legitimate "keep
                      the coins" option once the assignee is an adult. */}
                  {reassignTargetId && (() => {
                    const target = members.find(m => m.id === reassignTargetId);
                    const targetIsAdult = target?.role === 'parent' || target?.role === 'senior';
                    if (!targetIsAdult || liveQuest.coins <= 0) return null;
                    return (
                      <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6 }}>
                        <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600', lineHeight: 17 }}>
                          ⚠ {target?.name.split(' ')[0]} is a {target?.role} — the {liveQuest.coins} coin reward will be removed. Parents/seniors don't earn coins.
                        </Text>
                      </View>
                    );
                  })()}

                  <TextInput
                    value={reassignNote}
                    onChangeText={setReassignNote}
                    placeholder="Add a note for them (optional)…"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12,
                      fontSize: 14, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => {
                        setReassigning(false); setReassignNote(''); setReassignTargetId(null);
                        setReassignAddCoins(null); setReassignCoins('20');
                      }}
                      style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={doReassignWithNote} disabled={!reassignTargetId || actionBusy === 'reassign'}
                      style={{ flex: 2, height: 42, borderRadius: 12, backgroundColor: colors.amber,
                        alignItems: 'center', justifyContent: 'center', opacity: !reassignTargetId ? 0.5 : 1 }}>
                      {actionBusy === 'reassign'
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Reassign</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Decline assigned chore — kid/teen, or (previously missing)
                  an adult assigned a parent_only_quest/isAdultTask by
                  someone ELSE. A parent's own self-assigned task is
                  excluded (that's what Submit's auto-approve shortcut is
                  for — declining your own self-assignment doesn't make
                  sense); see canAdultDecline's own comment. */}
              {!liveQuest.pendingTerms && (actions.canKidDecline || actions.canAdultDecline) && !submitting && (
                <TouchableOpacity onPress={confirmCantDoThis} disabled={actionBusy === 'decline'}
                  style={{ height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.danger,
                    alignItems: 'center', justifyContent: 'center' }}>
                  {actionBusy === 'decline'
                    ? <ActivityIndicator color={colors.danger} />
                    : <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger }}>Can't do this</Text>}
                </TouchableOpacity>
              )}

              {/* Give it back — quick undo on a self-claimed pool chore, no reason needed */}
              {!liveQuest.pendingTerms && actions.canGiveBack && !actions.canKidDecline && !actions.canAdultDecline && (
                <TouchableOpacity onPress={doGiveBack} disabled={actionBusy === 'giveback'}
                  style={{ height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.textTertiary,
                    alignItems: 'center', justifyContent: 'center' }}>
                  {actionBusy === 'giveback'
                    ? <ActivityIndicator color={colors.textSecondary} />
                    : <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Give it back</Text>}
                </TouchableOpacity>
              )}

              {/* ── Parent/approver review — reward-impact card + full-width
                  stacked Approve / Redo / Decline buttons, matching the
                  reference's structure instead of cramped side-by-side pills ── */}
              {actions.canApprove && !redoing && (() => {
                const assignee = members.find(m => m.id === liveQuest.assignedToId);
                const assigneeFirst = assignee?.name?.split(' ')[0] ?? 'They';
                const reviewerCoins = assignee?.mainCoins ?? 0;
                const totalReward = liveQuest.coins + (liveQuest.bonusCoins ?? 0);
                // Dynamic, parent-engaging framing instead of a flat "Approval
                // earns N coins" every time — acknowledges whether this took
                // more than one try, and how long it's been waiting, the same
                // signal ChoresReviewQueueScreen's own list rows already
                // surface. A kid who stuck with it through a redo round reads
                // differently than a first-try submission.
                const priorRounds = submissionHistory.length > 0 ? submissionHistory.length - 1 : (liveQuest.declineReason ? 1 : 0);
                const waitMins = rawSubmittedAt ? Math.floor((Date.now() - new Date(rawSubmittedAt).getTime()) / 60000) : 0;
                const effortLine = priorRounds > 0
                  ? `${assigneeFirst} stuck with it through ${priorRounds} redo round${priorRounds === 1 ? '' : 's'} to get here.`
                  : waitMins > 60 * 24
                    ? `${assigneeFirst} finished this a while ago — worth a timely look.`
                    : `${assigneeFirst} just finished this.`;
                return (
                  <>
                    {totalReward > 0 && !liveQuest.isAdultTask && (
                      <View style={{ backgroundColor: isDark ? colors.surface : colors.amberLight,
                        borderRadius: 16, padding: 14, gap: 4 }}>
                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 2 }}>
                          {effortLine}
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.amber }}>
                          Approving earns {assigneeFirst} {totalReward} coin{totalReward === 1 ? '' : 's'}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                          Balance: {reviewerCoins} → {reviewerCoins + totalReward}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                          Redo or decline: no coins awarded
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={doApprove} disabled={actionBusy === 'approve'}
                      style={{ height: 54, borderRadius: 16, backgroundColor: colors.teal,
                        alignItems: 'center', justifyContent: 'center' }}>
                      {actionBusy === 'approve'
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                            ✓ Approve{totalReward > 0 && !liveQuest.isAdultTask ? ` +${totalReward}` : ''}
                          </Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setRedoing(true)}
                      style={{ height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>↩ Redo · send a helpful reason</Text>
                    </TouchableOpacity>
                    {/* Decline — live-reported gap: only Approve/Redo existed,
                        no distinct "this doesn't count" path for a reviewer
                        (separate from canKidDecline, which is the ASSIGNEE
                        declining their own assignment, not a reviewer
                        declining a submission). In this app's data model
                        decline-on-submission and redo both route through the
                        same requestRedo RPC — there's no separate "reject
                        outright" server action — so this opens the identical
                        compose panel, just framed as a decline (reason
                        required, not optional) via declining=true below. */}
                    <TouchableOpacity onPress={() => { setRedoing(true); setDeclining(true); }}
                      style={{ height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: colors.danger,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger }}>
                        ✕ Decline · explain to {assigneeFirst}
                      </Text>
                    </TouchableOpacity>
                  </>
                );
              })()}

              {/* Inline redo/decline-reason compose — one panel, two framings.
                  declining=true requires a reason (Decline must explain to
                  the kid why it didn't count); declining=false (plain
                  Redo) keeps the reason optional, same as before. */}
              {redoing && (
                <View style={{ backgroundColor: isDark ? colors.surface : colors.danger + '0E',
                  borderRadius: 16, padding: 16, gap: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                    {declining ? `Decline · explain to ${members.find(m => m.id === liveQuest.assignedToId)?.name?.split(' ')[0] ?? 'them'}` : 'Send back for redo'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {REJECTION_PRESETS.map(p => {
                      const sel = redoPreset === p.key;
                      return (
                        <TouchableOpacity key={p.key} onPress={() => setRedoPreset(p.key)}
                          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                            backgroundColor: sel ? colors.danger : colors.card,
                            borderWidth: sel ? 0 : 1, borderColor: colors.border }}>
                          <Text style={{ fontSize: 12, fontWeight: sel ? '700' : '500',
                            color: sel ? '#fff' : colors.textSecondary }}>{p.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    value={redoCustom}
                    onChangeText={setRedoCustom}
                    placeholder={declining
                      ? 'Let them know why this didn’t count…'
                      : redoPreset === 'CUSTOM' ? 'What needs fixing?' : 'Add a message for them (optional)'}
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12,
                      fontSize: 14, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={resetRedoCompose}
                      style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={doSendRedo}
                      disabled={(!redoPreset && !redoCustom.trim()) || (redoPreset === 'CUSTOM' && !redoCustom.trim()) || actionBusy === 'redo'}
                      style={{ flex: 2, height: 42, borderRadius: 12, backgroundColor: colors.danger,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: (!redoPreset && !redoCustom.trim()) ? 0.5 : 1 }}>
                      {actionBusy === 'redo'
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{declining ? 'Send decline' : 'Send redo'}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── Decline reason (parent previously sent this back) ─────────── */}
          {liveQuest.declineReason && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 16 }} />
              <View style={{ marginBottom: 16 }}>
                <SectionLabel color={colors.danger}>Declined — reason sent</SectionLabel>
                <View style={{ backgroundColor: colors.danger + '12', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.danger }}>
                  <Text style={{ fontSize: 14, color: colors.danger, lineHeight: 20 }}>{liveQuest.declineReason}</Text>
                </View>
                {actions.canReopen && (
                  <TouchableOpacity onPress={doReopen} disabled={actionBusy === 'reopen'}
                    style={{ marginTop: 10, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal,
                      alignItems: 'center', justifyContent: 'center' }}>
                    {actionBusy === 'reopen'
                      ? <ActivityIndicator color={colors.teal} />
                      : <Text style={{ fontSize: 14, fontWeight: '600', color: colors.teal }}>↺ Reopen</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* ── 9. Delete — only while nothing real has happened yet (unclaimed,
              not started, not submitted) — once in motion, use Redo/Decline
              instead so real work/history isn't silently destroyed. ────── */}
          {actions.canDelete && onDelete && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 16 }} />
              <TouchableOpacity
                onPress={onDelete}
                style={{
                  paddingVertical: 14, borderRadius: 14, marginBottom: 16,
                  borderWidth: 1.5, borderColor: colors.danger, alignItems: 'center',
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>Delete chore</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── 10. Send appreciation (Figma "celebrate" card) ──────────────── */}
          {(() => {
            // Only show when the quest is done (approved) — a quick-thank-you prompt
            if (liveQuest.status !== 'approved') return null;
            const alreadyCheered = cheered || (liveQuest.cheers ?? []).some((c: any) => c.memberId === activeMemberId);
            const cheerCount = (liveQuest.cheers ?? []).length;
            return (
              <>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 16 }} />
                <View style={{
                  marginBottom: 16,
                  backgroundColor: isDark ? '#231F14' : '#FFF2CF',
                  borderRadius: 22, padding: 18,
                }}>
                  <Text style={{
                    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: isDark ? colors.amber : '#B8860B',
                    marginBottom: 6,
                  }}>
                    🏆 Small Win
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>
                    {liveQuest.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : '#786F5F', marginBottom: 10, lineHeight: 17 }}>
                    {alreadyCheered
                      ? `You sent appreciation${cheerCount > 1 ? ` · ${cheerCount} cheers total` : ''} 🎉`
                      : 'A quick thank-you goes a long way.'}
                  </Text>
                  {!alreadyCheered && (
                    <TouchableOpacity
                      onPress={() => {
                        cheerQuest(liveQuest.id, activeMemberId);
                        setCheered(true);
                      }}
                      activeOpacity={0.75}
                      style={{
                        alignSelf: 'flex-start',
                        backgroundColor: isDark ? colors.surface : '#FFFFFF',
                        borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '650' as any, color: isDark ? colors.amber : '#87681C' }}>
                        Send appreciation 🙌
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            );
          })()}

          {/* ── 11. Trail log (parent-only, newest→oldest so latest is on top) */}
          {isParent && dbLog.length > 0 && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 16 }} />
              <View style={{ marginBottom: 16 }}>
                <SectionLabel color={colors.textTertiary}>Trail Log</SectionLabel>
                {dbLog.map((row, i, arr) => {
                  const { label, detail, emoji, dot } = trailLabel(row);
                  const bgMap: Record<string, string> = {
                    [colors.teal]:         isDark ? '#1A2420' : '#E6F4EC',
                    [colors.pink]:         isDark ? '#1E1A28' : '#F0EBF8',
                    [colors.amber]:        isDark ? '#231F14' : '#FDF6E3',
                    [colors.danger]:       isDark ? '#2A1A1A' : '#FDEAEA',
                    [colors.textTertiary]: isDark ? '#1A1A22' : '#F4F4F6',
                  };
                  const bg = bgMap[dot] ?? (isDark ? '#1A1A22' : '#F4F4F6');
                  return (
                    <View key={row.id} style={{
                      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                      backgroundColor: bg, borderRadius: 12, padding: 12,
                      marginBottom: i < arr.length - 1 ? 8 : 0,
                    }}>
                      <View style={{
                        width: 34, height: 34, borderRadius: 9,
                        backgroundColor: dot + '20',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Text style={{ fontSize: 15 }}>{emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, lineHeight: 18 }}>{label}</Text>
                        {detail && <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{detail}</Text>}
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>
                          {new Date(row.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                        </Text>
                      </View>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot, marginTop: 6, flexShrink: 0 }} />
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Decision-receipt explainer + household signature — the
              mock's own closing "Explanation" paragraphs + centered
              signature line, shown only while there's a real decision to
              make (matches the mock's context: a pending_approval item
              being reviewed). ── */}
          {liveQuest.status === 'pending_approval' && actions.canApprove && (
            <View style={{ marginTop: 4, gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textTertiary, lineHeight: 18 }}>
                Redo keeps the chore open. Decline closes this submission, not the original evidence. A reason is required for either; {members.find(m => m.id === liveQuest.assignedToId)?.name?.split(' ')[0] ?? 'they'} is notified and the record is kept.
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textTertiary, lineHeight: 18 }}>
                Decision receipt → records actor, reason, evidence version and coin effect for every outcome.
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, textAlign: 'center', letterSpacing: 0.3, marginTop: 4 }}>
                Connect. Organize. Care. Grow.
              </Text>
            </View>
          )}

          </View>{/* end padded wrapper */}
        </ScrollView>
      </View>
      </SwipeBackWrapper>

      {/* ── Proof photo viewer — tap-to-enlarge, full screen ── */}
      {proofViewerUri && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setProofViewerUri(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setProofViewerUri(null)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: proofViewerUri }}
              style={{ width: '92%', height: '70%', borderRadius: 16 }}
              resizeMode="contain" />
            <TouchableOpacity onPress={() => setProofViewerUri(null)}
              style={{ position: 'absolute', top: insets.top + 16, right: 20, width: 36, height: 36, borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <XIcon size={18} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </Modal>
  );
}
