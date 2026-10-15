import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Image, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle2, RotateCcw, Sparkles, Trophy, Maximize2, Image as ImageIcon, X as XIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import FullPageOverlay from '@/components/FullPageOverlay';
import { useUIStore } from '@/store/uiStore';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { fmtDateShort } from '@/lib/dates';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { useChoreStore } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

// Kid Hub's quest detail page — same rhythm as QuestDetailModal (Parent
// Hub's reference full-page detail screen): hero title+status, a tinted
// reward/due card, Who's on it, a Progress stepper, submitted-proof card.
// Deliberately NO trail log / activity history here — that's parent-only
// on QuestDetailModal too (gated by `isParent`), and kids don't need the
// audit trail [live-requested: "we should have the details page and edit
// similar to the parent.. but kids dont need the activity logs"]. Also no
// Edit — deriveQuestActions.canEdit is isParent-only by design, a kid has
// no edit permission on a chore, so there's no parity gap to close there.
// Not a straight reuse of QuestDetailModal itself — that component also
// carries parent-only machinery (Reassign, Approve, Dispute) that doesn't
// apply to a kid actor — this is a smaller, kid-voiced sibling covering
// only the actions KidQuestCard already exposes (Claim, Start, Submit±
// photo, Decline/Can't-do-this, Accept/Decline a grandparent quest,
// Resubmit after a redo).

// Preset reason chips for the inline "Can't do this" compose panel —
// same wording as CantMakeItSheet.tsx's REASONS list, kept local here
// since that sheet component itself is not reused (no bottom sheets).
const DECLINE_REASONS = ['Something came up', 'Not feeling well', 'No ride', 'Need more time', 'Too hard, need help'];

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
      <View style={{ height: 2, borderRadius: 1, backgroundColor: color, marginBottom: 6, opacity: 0.6 }} />
      <Text style={{ color, fontSize: 10, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' }}>
        {children}
      </Text>
    </View>
  );
}

function fmt12hFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmt12hTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const clean = hhmm.trim();
  if (clean.includes('T') || clean.length > 5) {
    const d = new Date(clean);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const [h, m] = clean.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function TimelineNode({ label, detail, filled, isLast }: { label: string; detail?: string; filled: boolean; isLast?: boolean }) {
  const { colors } = useTheme();
  const dotBorder = filled ? colors.teal : colors.border;
  const dotBg = filled ? colors.teal : 'transparent';
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        <View style={{ flex: 1, height: 2, backgroundColor: 'transparent' }} />
        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: dotBorder, backgroundColor: dotBg, alignItems: 'center', justifyContent: 'center' }}>
          {filled && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />}
        </View>
        {!isLast ? (
          <View style={{ flex: 1, height: 2, backgroundColor: colors.border }} />
        ) : (
          <View style={{ flex: 1, height: 2, backgroundColor: 'transparent' }} />
        )}
      </View>
      <View style={{ alignItems: 'center', marginTop: 8, paddingHorizontal: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: filled ? '700' : '500', color: filled ? colors.textPrimary : colors.textSecondary }}>
          {label}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2, textAlign: 'center' }}>
          {detail || 'Waiting'}
        </Text>
      </View>
    </View>
  );
}

export function KidQuestDetailScreen({
  quest, active, members, allQuests,
  onClose, onClaim, onStart, onSubmit, onAcceptGpQuest, onDeclineGpQuest,
}: {
  quest: Quest;
  active: FamilyMember; members: FamilyMember[]; allQuests: Quest[];
  onClose: () => void;
  onClaim: (id: string) => void;
  onStart: (id: string) => void;
  onSubmit: (q: Quest) => void;
  onAcceptGpQuest: (id: string) => void;
  onDeclineGpQuest: (q: Quest) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [proofViewerUri, setProofViewerUri] = useState<string | null>(null);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const { submitQuest } = useQuestStore();

  // Inline photo-proof compose — mirrors QuestDetailModal.tsx's own
  // submitPhotoUri/pickProofPhoto/compose-card pattern exactly, rendered as
  // a plain View in this page rather than a Modal bottom sheet
  // [live-corrected: "I said don't use bottom sheets use inline photo
  // proof similar to parent" — SubmitProofSheet.tsx's <Modal> was the
  // wrong shape even though it technically captured a photo].
  const [composingSubmit, setComposingSubmit] = useState(false);
  const [submitPhotoUri, setSubmitPhotoUri] = useState<string | null>(null);
  const [submitNote, setSubmitNote] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  // Editing an already-submitted, still-pending proof (retake photo / fix
  // the comment) reuses this same compose panel instead of a second one —
  // only the save path differs (patch submissionPhoto/Note in place, no
  // status change) [live-requested: "in review task - kids can quickly
  // recall and correct that if they need like remove existing picure and
  // take new and comments correction etc"]. RLS already allows this: any
  // write that leaves status alone (still pending_approval, not moving
  // INTO an approval/payout terminal state) is unrestricted family-wide —
  // see chore_tasks_update policy, 20260925112000_chore_tasks_approver_
  // only_write.sql — so a plain updateChore patch is safe, no new RPC
  // needed.
  const [editingSubmission, setEditingSubmission] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  function resetSubmitCompose() {
    setComposingSubmit(false);
    setEditingSubmission(false);
    setSubmitPhotoUri(null);
    setSubmitNote('');
  }

  function openEditSubmission() {
    // Photo-required chores always need a fresh photo on every
    // resubmission/edit — never prefill the old one here, same as the
    // declined->resubmit path already does (that one starts from null too)
    // [live-requested: "when resubmitting the photo required task we
    // should always ask the picure on every resubmission"]. Only a
    // non-photo chore's note-only edit can start prefilled, since there's
    // nothing to re-capture.
    setSubmitPhotoUri(liveQuest.photoRequired ? null : (liveQuest.photoUrl ?? null));
    setSubmitNote(liveQuest.completionNote ?? '');
    setEditingSubmission(true);
    setComposingSubmit(true);
  }

  async function doInlineEditSave() {
    setSavingEdit(true);
    try {
      await useChoreStore.getState().editPendingSubmission(liveQuest.id, activeMemberId ?? '', {
        photoUrl: submitPhotoUri ?? undefined,
        note: submitNote.trim() || undefined,
      });
      resetSubmitCompose();
    } finally {
      setSavingEdit(false);
    }
  }

  // "Can't do this" — inline reason chips + free text, same shape as the
  // photo-proof compose panel above, not a bottom sheet
  // [live-corrected: "make it inlie reasons and free text" — the earlier
  // CantMakeItSheet Modal attempt was rejected]. Submits straight to
  // declineChoreAssignment; the simpler isGpTodo "Decline" button keeps
  // using onDeclineGpQuest unchanged (no reason needed there).
  const [composingDecline, setComposingDecline] = useState(false);
  const [declineReasonPick, setDeclineReasonPick] = useState<string | null>(null);
  const [declineReasonText, setDeclineReasonText] = useState('');

  function resetDeclineCompose() {
    setComposingDecline(false);
    setDeclineReasonPick(null);
    setDeclineReasonText('');
  }

  function doInlineDecline() {
    const reason = (declineReasonText.trim() || declineReasonPick || '').trim();
    if (!reason) return;
    useChoreStore.getState().declineChoreAssignment(liveQuest.id, active.id, reason);
    resetDeclineCompose();
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

  function doInlineSubmit() {
    setUploadingProof(true);
    try {
      submitQuest(liveQuest.id, { photoUrl: submitPhotoUri ?? undefined, note: submitNote.trim() || undefined }, activeMemberId ?? undefined);
      resetSubmitCompose();
    } finally {
      setUploadingProof(false);
    }
  }

  useEffect(() => {
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => {
      showTabBar();
      useUIStore.getState().setFullBleedScreenActive(false);
    };
  }, []);

  const liveQuest = allQuests.find(q => q.id === quest.id) ?? quest;
  const choreData = useChoreStore(s => s.chores.find(c => c.id === liveQuest.id));
  const canvas = isDark ? colors.background : GEMINI.canvas;
  const chipBg = isDark ? colors.surface : '#EEECF2';

  const { canClaim, canSubmit, canResubmit, canKidDecline, canAcceptGp } = deriveQuestActions(
    liveQuest,
    { id: active.id, role: active.role },
    choreData ? { categoryType: choreData.categoryType, status: choreData.status } : undefined,
  );
  const isPool = liveQuest.isPool && liveQuest.status === 'todo';
  const isClaimed = liveQuest.status === 'claimed';
  const isDeclined = liveQuest.status === 'declined';
  const isActionable = ['todo', 'claimed', 'in_progress', 'declined'].includes(liveQuest.status);
  const isPendingReview = liveQuest.status === 'pending_approval';

  const assigneeIds = liveQuest.assignedToIds?.length
    ? liveQuest.assignedToIds
    : liveQuest.assignedToId ? [liveQuest.assignedToId] : [];
  const assignees = assigneeIds.map(id => members.find(m => m.id === id)).filter(Boolean) as FamilyMember[];

  const rawCreatedAt = choreData?.createdAt ?? (liveQuest as any).createdAt;
  const rawClaimedAt = liveQuest.claimedAt ?? choreData?.claimedAt;
  const rawSubmittedAt = liveQuest.submittedAt ?? choreData?.submittedAt;
  const rawApprovedAt = (liveQuest as any).approvedAt ?? choreData?.approvedAt;
  const rawDeclinedAt = (liveQuest as any).declinedAt ?? choreData?.declinedAt;
  const claimedBy = members.find(m => m.id === liveQuest.assignedToId);

  function joinDetail(name: string | undefined, dateStr: string): string | undefined {
    const parts = [name, dateStr].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
  }
  const createdDetail = rawCreatedAt ? fmt12hFromIso(rawCreatedAt) || undefined : undefined;
  const claimedDetail = rawClaimedAt ? joinDetail(claimedBy?.name?.split(' ')[0], fmt12hFromIso(rawClaimedAt)) : undefined;
  const submittedDetail = rawSubmittedAt ? (fmt12hFromIso(rawSubmittedAt) || undefined) : undefined;
  const approvedDetail = rawApprovedAt
    ? fmt12hFromIso(rawApprovedAt) || undefined
    : rawDeclinedAt ? joinDetail('Declined', fmt12hFromIso(rawDeclinedAt)) : undefined;

  const bonusCoins = choreData?.bonusCoins ?? 0;
  const bonusExpiresAt = choreData?.bonusExpiresAt;
  const bonusExpired = bonusExpiresAt ? new Date(bonusExpiresAt) < new Date() : false;
  const bonusActive = bonusCoins > 0 && !bonusExpired;
  const totalCoins = (liveQuest.coins ?? 0) + (bonusActive ? bonusCoins : 0);

  const statusMap: Record<string, { label: string; color: string }> = {
    todo: { label: isPool ? 'Up for grabs' : 'To do', color: colors.textSecondary },
    claimed: { label: 'Claimed', color: colors.teal },
    in_progress: { label: 'In progress', color: colors.teal },
    pending_approval: { label: 'Waiting on review', color: colors.danger },
    approved: { label: 'Approved', color: colors.teal },
    done: { label: 'Approved', color: colors.teal },
    declined: { label: 'Needs another try', color: colors.danger },
  };
  const statusInfo = statusMap[liveQuest.status] ?? { label: liveQuest.status, color: colors.textSecondary };
  const note = liveQuest.description || liveQuest.completionNote || choreData?.parentNote;
  const isGpTodo = canAcceptGp;
  // Muted blue — primary CTA fill on this page's Actions row, matching the
  // same color swapped onto KidQuestCard's CTAs [live-requested: "make the
  // CTA buttons to muted blue color in fill"]. No brand token for this
  // exists, so kept local same as KidQuestCard.tsx's own CTA_BLUE constant.
  const CTA_BLUE = '#5B7FA6';

  return (
    <>
      <FullPageOverlay visible onDismiss={onClose} zIndex={55} backgroundColor={canvas}>
        <View style={{ flex: 1, backgroundColor: canvas }}>

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 8 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.teal }}>‹ Back</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

            <View style={{ paddingHorizontal: 20, paddingTop: 6, marginBottom: 14, gap: 8 }}>
              <Text style={{ fontSize: 29, fontWeight: '700', letterSpacing: -0.5, color: colors.textPrimary, lineHeight: 41 }}>
                {liveQuest.title}
              </Text>
              <View style={{ height: 25, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 100, alignSelf: 'flex-start', backgroundColor: statusInfo.color + '22' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: statusInfo.color }}>{statusInfo.label}</Text>
              </View>
              {note && (
                <Text style={{ fontSize: 15, color: colors.textSecondary, lineHeight: 22 }}>{note}</Text>
              )}
            </View>

            {/* Reward + due tinted card */}
            <View style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: isDark ? colors.surface : colors.amberLight, borderRadius: 16, padding: 16, gap: 12 }}>
              {liveQuest.coins > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.amber, marginBottom: 2 }}>Reward</Text>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary }}>
                      {bonusActive ? totalCoins : liveQuest.coins}
                      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}> coins</Text>
                    </Text>
                    {bonusCoins > 0 && (
                      <Text style={{ fontSize: 12, color: bonusActive ? colors.amber : colors.textTertiary, marginTop: 2 }}>
                        {liveQuest.coins} base{bonusActive ? ` + ${bonusCoins} bonus ⚡` : ` + ${bonusCoins} bonus (expired)`}
                      </Text>
                    )}
                  </View>
                  {bonusCoins > 0 && bonusExpiresAt && (
                    <View style={{ alignItems: 'flex-end', paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.amber + '40' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: bonusActive ? colors.amber : colors.textTertiary }}>
                        {bonusActive ? 'Bonus expires' : 'Bonus expired'}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'right' }}>
                        {fmt12hFromIso(bonusExpiresAt)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
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
              {(liveQuest.category || liveQuest.difficulty || liveQuest.photoRequired) && (
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
                  {liveQuest.photoRequired && (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: chipBg }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>📸 Photo required</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Who's on it */}
            {liveQuest.status !== 'pending_approval' && (
              <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
                <SectionLabel color={colors.textTertiary}>{isPool && assignees.length === 0 ? 'Open to' : 'Assigned to'}</SectionLabel>
                {isPool && assignees.length === 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: isDark ? colors.surface : colors.tealLight, borderRadius: 12, padding: 14 }}>
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
                          <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={members.map(x => x.name)} size={52} ringColor={roleColor} ringWidth={2} />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{m.name.split(' ')[0]}</Text>
                          <Text style={{ fontSize: 11, color: roleColor }}>{m.role === 'parent' ? 'Parent' : 'Kid'}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Progress stepper */}
            <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
              <SectionLabel color={colors.textTertiary}>Progress</SectionLabel>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <TimelineNode label="Created" detail={createdDetail} filled={!!rawCreatedAt} />
                <TimelineNode label="Claimed" detail={claimedDetail} filled={!!rawClaimedAt} />
                <TimelineNode label="Submitted" detail={submittedDetail} filled={!!rawSubmittedAt} />
                <TimelineNode label="Approved" detail={approvedDetail} filled={!!(rawApprovedAt || rawDeclinedAt)} isLast />
              </View>
            </View>

            <View style={{ paddingHorizontal: 20 }}>

              {/* Submitted proof */}
              {(liveQuest.status === 'pending_approval' || liveQuest.completionNote || liveQuest.photoUrl) && (
                <View style={{ marginBottom: 14 }}>
                  <SectionLabel color={colors.textTertiary}>Your submission</SectionLabel>
                  <View style={{ backgroundColor: isDark ? colors.surface : GEMINI.cardBg, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : GEMINI.border, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
                    {liveQuest.photoUrl && (
                      <TouchableOpacity onPress={() => setProofViewerUri(liveQuest.photoUrl!)} activeOpacity={0.9}>
                        <Image source={{ uri: liveQuest.photoUrl }} style={{ width: '100%', height: 220, backgroundColor: chipBg }} />
                        <View style={{ position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
                          <Maximize2 size={12} color="#fff" />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>View full size</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    {liveQuest.completionNote && (
                      <View style={{ padding: 14 }}>
                        <Text style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 20 }}>"{liveQuest.completionNote}"</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {isDeclined && liveQuest.declineReason && (
                <View style={{ backgroundColor: colors.danger + '12', borderLeftWidth: 3, borderLeftColor: colors.danger, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger, marginBottom: 2 }}>What to fix</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>"{liveQuest.declineReason}"</Text>
                </View>
              )}

              {/* Action center — mirrors KidQuestCard's action gating exactly.
                  Also renders while pending_approval now, for the one new
                  action a kid has at that stage: edit their own submission
                  before a parent reviews it. */}
              {(isActionable || isPendingReview) && (
                <View style={{ marginBottom: 14, gap: 8 }}>
                  <SectionLabel color={colors.textTertiary}>Actions</SectionLabel>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {isPendingReview ? (
                      <Pressable onPress={() => composingSubmit ? resetSubmitCompose() : openEditSubmission()}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1.5, borderColor: CTA_BLUE, paddingVertical: 15 }}>
                        <RotateCcw size={16} color={CTA_BLUE} />
                        <Text style={{ fontSize: 15, fontWeight: '800', color: CTA_BLUE }}>Edit submission</Text>
                      </Pressable>
                    ) : isGpTodo ? (
                      <>
                        <Pressable onPress={() => onAcceptGpQuest(liveQuest.id)}
                          style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: CTA_BLUE, paddingVertical: 15 }}>
                          <Sparkles size={16} color="#fff" />
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>I'll take it</Text>
                        </Pressable>
                        <Pressable onPress={() => onDeclineGpQuest(liveQuest)}
                          style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger + '50', paddingVertical: 15, alignItems: 'center' }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.danger }}>Decline</Text>
                        </Pressable>
                      </>
                    ) : isPool && canClaim ? (
                      <Pressable onPress={() => onClaim(liveQuest.id)}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: CTA_BLUE, paddingVertical: 15 }}>
                        <Trophy size={16} color="#fff" />
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Claim (+{liveQuest.coins} 🪙)</Text>
                      </Pressable>
                    ) : isClaimed ? (
                      <>
                        <Pressable onPress={() => onStart(liveQuest.id)}
                          style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: CTA_BLUE, paddingVertical: 15 }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Start Chore</Text>
                        </Pressable>
                        {canKidDecline && (
                          <Pressable onPress={() => composingDecline ? resetDeclineCompose() : setComposingDecline(true)}
                            style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger + '50', paddingVertical: 15, alignItems: 'center' }}>
                            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.danger }}>Can't do this</Text>
                          </Pressable>
                        )}
                      </>
                    ) : isDeclined ? (
                      <>
                        <Pressable onPress={() => onSubmit(liveQuest)}
                          style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: colors.danger, paddingVertical: 15 }}>
                          <RotateCcw size={16} color="#fff" />
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>↩ Revise & Resubmit</Text>
                        </Pressable>
                      </>
                    ) : canSubmit ? (
                      <>
                        <Pressable onPress={() => liveQuest.photoRequired ? (composingSubmit ? resetSubmitCompose() : setComposingSubmit(true)) : onSubmit(liveQuest)}
                          style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: CTA_BLUE, paddingVertical: 15 }}>
                          {liveQuest.photoRequired ? <Camera size={16} color="#fff" /> : <CheckCircle2 size={16} color="#fff" />}
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                            {liveQuest.photoRequired ? 'Take Photo to Get Paid' : 'Mark Done → Get Paid'}
                          </Text>
                        </Pressable>
                        {canKidDecline && (
                          <Pressable onPress={() => composingDecline ? resetDeclineCompose() : setComposingDecline(true)}
                            style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger + '50', paddingVertical: 15, alignItems: 'center' }}>
                            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.danger }}>Can't do this</Text>
                          </Pressable>
                        )}
                      </>
                    ) : null}
                  </View>

                  {/* Inline photo-proof compose — plain View, not a Modal
                      sheet, rendered directly in this page's button stack
                      (mirrors QuestDetailModal.tsx's parent-side pattern
                      exactly) [live-corrected: "don't use bottom sheets
                      use inline photo proof similar to parent"]. */}
                  {composingSubmit && (
                    <View style={{ backgroundColor: isDark ? colors.surface : colors.pinkLight, borderRadius: 16, padding: 16, gap: 10, marginTop: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                        {editingSubmission ? 'Edit your submission' : canResubmit ? 'Revise & resubmit' : 'Submit for review'}
                      </Text>

                      {liveQuest.photoRequired && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Camera size={13} color={colors.amber} />
                          <Text style={{ fontSize: 12, color: colors.amber, fontWeight: '600' }}>Photo required</Text>
                        </View>
                      )}

                      {submitPhotoUri ? (
                        <View style={{ alignSelf: 'flex-start' }}>
                          <Image source={{ uri: submitPhotoUri }} style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: colors.card }} />
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
                        style={{ backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 12, padding: 12,
                          fontSize: 14, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
                      />

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={resetSubmitCompose}
                          style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                            alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
                        </TouchableOpacity>
                        {editingSubmission ? (
                          <TouchableOpacity onPress={doInlineEditSave} disabled={(liveQuest.photoRequired && !submitPhotoUri) || savingEdit}
                            style={{ flex: 2, height: 42, borderRadius: 12, backgroundColor: CTA_BLUE,
                              alignItems: 'center', justifyContent: 'center', opacity: (liveQuest.photoRequired && !submitPhotoUri) ? 0.5 : 1 }}>
                            {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Save changes</Text>}
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={doInlineSubmit} disabled={!submitPhotoUri || uploadingProof}
                            style={{ flex: 2, height: 42, borderRadius: 12, backgroundColor: CTA_BLUE,
                              alignItems: 'center', justifyContent: 'center', opacity: submitPhotoUri ? 1 : 0.5 }}>
                            {uploadingProof ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Submit</Text>}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Inline "Can't do this" compose — reason chips + free
                      text, plain View not a Modal sheet, same shape as the
                      photo-proof panel above [live-corrected: "make it
                      inlie reasons and free text"]. */}
                  {composingDecline && (
                    <View style={{ backgroundColor: isDark ? colors.surface : colors.amberLight, borderRadius: 16, padding: 16, gap: 10, marginTop: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Why can't you do this right now?</Text>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {DECLINE_REASONS.map(r => {
                          const selected = declineReasonPick === r;
                          return (
                            <Pressable key={r} onPress={() => { setDeclineReasonPick(r); setDeclineReasonText(''); }}
                              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                                backgroundColor: selected ? colors.danger : (isDark ? colors.card : GEMINI.cardBg),
                                borderWidth: 1, borderColor: selected ? colors.danger : colors.border }}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : colors.textSecondary }}>{r}</Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <TextInput
                        value={declineReasonText}
                        onChangeText={(t) => { setDeclineReasonText(t); if (t) setDeclineReasonPick(null); }}
                        placeholder="Or type your own reason…"
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        style={{ backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 12, padding: 12,
                          fontSize: 14, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
                      />

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={resetDeclineCompose}
                          style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                            alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={doInlineDecline} disabled={!declineReasonPick && !declineReasonText.trim()}
                          style={{ flex: 2, height: 42, borderRadius: 12, backgroundColor: colors.danger,
                            alignItems: 'center', justifyContent: 'center', opacity: (declineReasonPick || declineReasonText.trim()) ? 1 : 0.5 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Send</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}

            </View>
          </ScrollView>
        </View>
      </FullPageOverlay>

      {proofViewerUri && (
        <FullPageOverlay visible onDismiss={() => setProofViewerUri(null)} zIndex={70} backgroundColor="#000">
          <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onPress={() => setProofViewerUri(null)}>
            <Image source={{ uri: proofViewerUri }} style={{ width: '100%', height: '60%' }} resizeMode="contain" />
          </Pressable>
        </FullPageOverlay>
      )}
    </>
  );
}
