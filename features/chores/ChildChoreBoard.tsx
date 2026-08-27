/**
 * ChildChoreBoard — Teen Hub's chore/quest command centre.
 * Flows: Citizenship checkbox → instant complete
 *        Routine/Bounty → submit sheet (note + photo)
 *        Bounty → claim or "Claimed by Sibling" read-only
 *        GP Quest → START → submit → pending_grandparent_approval
 *        Cash-Out → amount picker → jar preview → submit
 */
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput,
  Alert, ActivityIndicator, TouchableOpacity, Image,
  Modal, KeyboardAvoidingView, Platform, Keyboard, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  Sprout, Star, Gem, ShoppingBag, HeartHandshake, Lock,
  Check, Camera, Image as ImageIcon, Clock, HandMetal, Play, Undo2,
  MessageCircle, Zap, Target, ChevronDown, ChevronUp,
  Flame, Trophy, Wallet, PiggyBank, HandHeart,
} from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO, RADIUS, SPACING } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import {
  useChoreStore, BADGE_DEFINITIONS, type ChoreTask, type ChoreCategoryType,
} from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import { parseLocalDate, localDateStr, todayLocal } from '@/lib/dates';

// Money-green — "done/positive" accent, distinct from brand teal used for
// confirmed/assigned state elsewhere. Not colors.success (which IS brand
// teal in this app) — kept as one local constant.
const MONEY_GREEN = '#059669';
// Amber — bounty/claim accent, a distinct hue from BRAND.amber for this
// file's bounty-specific chrome. Kept as one local constant.
const BOUNTY_AMBER = '#D97706';
const BOUNTY_AMBER_BG = '#FEF3C7';
const GP_BLUE = '#2563EB';
const GP_BLUE_BG = '#DBEAFE';

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META: Record<ChoreCategoryType, { Icon: any; label: string; color: string; bg: string }> = {
  citizenship:       { Icon: Sprout,         label: 'Citizenship', color: MONEY_GREEN,  bg: '#D1FAE5' },
  routine:           { Icon: Star,           label: 'Routine',     color: BRAND.purple, bg: '#EDE9FE' },
  bounty:            { Icon: Gem,            label: 'Bounty',      color: BOUNTY_AMBER, bg: BOUNTY_AMBER_BG },
  shopping:          { Icon: ShoppingBag,    label: 'Shopping',    color: '#0D9488',    bg: '#CCFBF1' },
  grandparent_quest: { Icon: HeartHandshake, label: 'GP Quest',    color: GP_BLUE,      bg: GP_BLUE_BG },
  parent_only_quest: { Icon: Lock,           label: 'Adult Task',  color: '#6B7280',    bg: '#F3F4F6' },
};

// ─── Auto-approve countdown hook ──────────────────────────────────────────────

function useCountdown(expiryIso?: string) {
  const [hoursLeft, setHoursLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiryIso) { setHoursLeft(null); return; }
    const tick = () => {
      const diff = (new Date(expiryIso).getTime() - Date.now()) / 3600_000;
      setHoursLeft(Math.max(0, diff));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [expiryIso]);
  return hoursLeft;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ Icon, iconColor, title, count, colors }: {
  Icon: any; iconColor?: string; title: string; count: number; colors: any;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 10, paddingHorizontal: 16 }}>
      <Icon size={18} color={iconColor ?? BRAND.purple} />
      <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
      <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Citizenship checkbox card (instant complete, no sheet) ───────────────────

function CitizenshipCard({ task, childId, colors, isDark }: {
  task: ChoreTask; childId: string; colors: any; isDark: boolean;
}) {
  const { instantCompleteChore } = useChoreStore();
  const done = ['completed', 'approved', 'auto_approved', 'pending_approval'].includes(task.status);

  return (
    <Pressable
      onPress={() => {
        if (done) return;
        Alert.alert('Mark complete?', `"${task.title}" — keeps your streak going.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Done', onPress: () => instantCompleteChore(task.id, childId) },
        ]);
      }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: isDark ? colors.card : '#fff',
        borderRadius: 14, padding: 14,
        marginHorizontal: 16, marginBottom: 8,
        borderWidth: 1,
        borderColor: done ? '#BBF7D0' : colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Checkbox */}
      <View style={{
        width: 26, height: 26, borderRadius: 13,
        borderWidth: 2,
        borderColor: done ? MONEY_GREEN : colors.border,
        backgroundColor: done ? MONEY_GREEN : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {done && <Check size={14} color="#fff" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: TYPO.body, fontWeight: '700',
          color: done ? colors.textTertiary : colors.textPrimary,
          textDecorationLine: done ? 'line-through' : 'none',
        }}>
          {task.title}
        </Text>
        {task.description && !done && (
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>{task.description}</Text>
        )}
      </View>
      {done && <Sprout size={16} color={MONEY_GREEN} />}
    </Pressable>
  );
}

// ─── Bounty card (claim / "claimed by sibling" / submit) ─────────────────────

function BountyCard({ task, childId, members, colors, isDark, onAction }: {
  task: ChoreTask; childId: string; members: FamilyMember[];
  colors: any; isDark: boolean; onAction: (t: ChoreTask) => void;
}) {
  const isMine     = task.assignedToId === childId;
  const claimedBy  = task.assignedToId && !isMine
    ? members.find(m => m.id === task.assignedToId)
    : null;
  const isUnclaimed = !task.assignedToId;
  const isPending  = task.status === 'pending_approval' && isMine;

  const hoursLeft = useCountdown(isPending ? task.approvalWindowExpiresAt : undefined);

  // Bounty expiry: first_come bounties expire after durationDays (default 7d from createdAt)
  const expiryDays = (() => {
    if (!task.recurrenceRule?.durationDays && !task.dueDate) return null;
    const expiryMs = task.dueDate
      ? parseLocalDate(task.dueDate).getTime()
      : new Date(task.createdAt).getTime() + (task.recurrenceRule.durationDays ?? 7) * 86_400_000;
    const daysLeft = (expiryMs - Date.now()) / 86_400_000;
    return Math.max(0, daysLeft);
  })();

  return (
    <View style={{
      backgroundColor: isDark ? colors.card : '#fff',
      borderRadius: 16, borderWidth: 1,
      borderColor: claimedBy ? colors.border : `${BOUNTY_AMBER}40`,
      marginHorizontal: 16, marginBottom: 8, padding: 14,
      opacity: claimedBy ? 0.6 : 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ backgroundColor: isDark ? `${BOUNTY_AMBER}20` : BOUNTY_AMBER_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Gem size={11} color={BOUNTY_AMBER} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BOUNTY_AMBER }}>Bounty</Text>
        </View>
        {task.basePoints > 0 && (
          <View style={{ backgroundColor: BOUNTY_AMBER_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BOUNTY_AMBER }}>+{task.basePoints} pts</Text>
          </View>
        )}
        {claimedBy && (
          <View style={{ backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#6B7280' }}>
              Claimed by {claimedBy.name.split(' ')[0]}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {isPending && hoursLeft !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Clock size={10} color={hoursLeft < 4 ? colors.danger : colors.textTertiary} />
            <Text style={{ fontSize: 10, color: hoursLeft < 4 ? colors.danger : colors.textTertiary, fontWeight: '600' }}>
              Auto in {hoursLeft < 1 ? '<1h' : `${Math.round(hoursLeft)}h`}
            </Text>
          </View>
        )}
        {!isPending && expiryDays !== null && (
          <View style={{ backgroundColor: expiryDays < 1 ? `${colors.danger}20` : BOUNTY_AMBER_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: expiryDays < 1 ? colors.danger : '#92400E' }}>
              {expiryDays < 1 ? 'Expires today!' : `Expires in ${Math.ceil(expiryDays)}d`}
            </Text>
          </View>
        )}
      </View>

      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>{task.title}</Text>
      {task.description && (
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8, lineHeight: 18 }}>{task.description}</Text>
      )}

      {/* Action area */}
      {!claimedBy && !isPending && (
        <Pressable
          onPress={() => onAction(task)}
          style={({ pressed }) => ({
            marginTop: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            backgroundColor: isMine ? BRAND.purple : BOUNTY_AMBER,
            padding: 10, opacity: pressed ? 0.8 : 1,
          })}
        >
          {isMine ? <Check size={14} color="#fff" /> : <Gem size={14} color="#fff" />}
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>
            {isMine ? 'Submit Done' : 'Claim Bounty'}
          </Text>
        </Pressable>
      )}
      {isPending && (
        <View style={{ backgroundColor: BRAND.purple + '15', borderRadius: 10, padding: 8, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Clock size={13} color={BRAND.purple} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>Reviewing…</Text>
        </View>
      )}
    </View>
  );
}

// ─── GP Quest card ────────────────────────────────────────────────────────────

function GPQuestCard({ task, childId, members, colors, isDark, onStart, onSubmit, onDecline }: {
  task: ChoreTask; childId: string; members: FamilyMember[];
  colors: any; isDark: boolean;
  onStart: (t: ChoreTask) => void;
  onSubmit: (t: ChoreTask) => void;
  onDecline: (t: ChoreTask) => void;
}) {
  const sponsor = members.find(m => m.id === task.sponsorUserId);
  const isPendingGP = task.status === 'pending_grandparent_approval';
  const isInProgress = task.status === 'in_progress' && task.assignedToId === childId;
  // Bounty Pool: any grandchild can grab it first-come (no assignedToId)
  const isPooled = task.status === 'todo' && !task.assignedToId;
  const isMyTodo = task.status === 'todo' && (task.assignedToId === childId || isPooled);

  return (
    <View style={{
      backgroundColor: isDark ? colors.card : '#fff',
      borderRadius: 16, borderWidth: 1, borderColor: '#93C5FD40',
      marginHorizontal: 16, marginBottom: 8, padding: 14,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ backgroundColor: isDark ? `${GP_BLUE}20` : GP_BLUE_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <HeartHandshake size={11} color={GP_BLUE} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: GP_BLUE }}>GP Quest</Text>
        </View>
        {/* GP quests never show pts — GPs don't earn coins */}
        {task.basePoints > 0 && task.categoryType !== 'grandparent_quest' && (
          <View style={{ backgroundColor: BOUNTY_AMBER_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BOUNTY_AMBER }}>+{task.basePoints} pts</Text>
          </View>
        )}
        {isPendingGP && (
          <View style={{ backgroundColor: GP_BLUE_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: GP_BLUE }}>Grandparent reviewing…</Text>
          </View>
        )}
      </View>

      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>{task.title}</Text>
      {sponsor && (
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginBottom: 4 }}>
          From {sponsor.name.split(' ')[0]}
        </Text>
      )}
      {task.description && (
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 8, lineHeight: 18 }}>{task.description}</Text>
      )}
      {task.dueDate && (
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginBottom: 6 }}>
          Due {parseLocalDate(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      )}

      {isMyTodo && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Pressable
            onPress={() => Alert.alert(
              'Decline Quest?',
              `You won't be able to earn the ${task.basePoints} pts. Your grandparent will be notified.`,
              [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Decline', style: 'destructive', onPress: () => onDecline(task) },
              ]
            )}
            style={({ pressed }) => ({
              flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5',
              backgroundColor: isDark ? colors.surface : '#FEF2F2',
              padding: 10, alignItems: 'center', opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>Not Now</Text>
          </Pressable>
          <Pressable
            onPress={() => onStart(task)}
            style={({ pressed }) => ({
              flex: 2, borderRadius: 12, backgroundColor: GP_BLUE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: 10, opacity: pressed ? 0.8 : 1,
            })}
          >
            {isPooled ? <HandMetal size={14} color="#fff" /> : <Play size={14} color="#fff" fill="#fff" />}
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>
              {isPooled ? "I'll Take It" : 'Start Quest'}
            </Text>
          </Pressable>
        </View>
      )}
      {isInProgress && (
        <Pressable
          onPress={() => onSubmit(task)}
          style={({ pressed }) => ({
            marginTop: 4, borderRadius: 12, backgroundColor: BRAND.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: 10, opacity: pressed ? 0.8 : 1,
          })}
        >
          <Check size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Mark Complete & Submit</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Routine / task card ──────────────────────────────────────────────────────

function TaskCard({ task, childId, colors, isDark, onAction }: {
  task: ChoreTask; childId: string; colors: any; isDark: boolean;
  onAction: (t: ChoreTask) => void;
}) {
  const isPending = task.status === 'pending_approval';
  const isRedo    = task.status === 'redo_requested';
  const hoursLeft = useCountdown(isPending ? task.approvalWindowExpiresAt : undefined);
  const meta = CAT_META[task.categoryType];

  return (
    <Pressable
      onPress={() => onAction(task)}
      style={({ pressed }) => ({
        backgroundColor: isDark ? colors.card : '#fff',
        borderRadius: 16, borderWidth: 1,
        borderColor: isRedo ? colors.danger : isPending ? BRAND.purple + '30' : colors.border,
        marginHorizontal: 16, marginBottom: 8, padding: 14,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <View style={{ backgroundColor: isDark ? meta.color + '25' : meta.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <meta.Icon size={11} color={meta.color} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: meta.color }}>{meta.label}</Text>
        </View>
        {task.basePoints > 0 && task.categoryType !== 'grandparent_quest' && (
          <View style={{ backgroundColor: BOUNTY_AMBER_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BOUNTY_AMBER }}>+{task.basePoints} pts</Text>
          </View>
        )}
        {task.requiresPhotoProof && <Camera size={13} color={colors.textTertiary} />}
        <View style={{ flex: 1 }} />
        {isPending && hoursLeft !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Clock size={10} color={hoursLeft < 4 ? colors.danger : colors.textTertiary} />
            <Text style={{ fontSize: 10, color: hoursLeft < 4 ? colors.danger : colors.textTertiary, fontWeight: '600' }}>
              Auto in {hoursLeft < 1 ? '<1h' : `${Math.round(hoursLeft)}h`}
            </Text>
          </View>
        )}
        {isPending && <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>Reviewing…</Text></View>}
        {isRedo && (
          <View style={{ backgroundColor: `${colors.danger}20`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Undo2 size={10} color={colors.danger} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.danger }}>Redo</Text>
          </View>
        )}
      </View>

      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 }}>{task.title}</Text>
      {task.description && !isPending && (
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 }}>{task.description}</Text>
      )}
      {isRedo && task.rejectionReason && (
        <View style={{ backgroundColor: `${colors.danger}10`, borderRadius: 10, padding: 10, marginTop: 6, flexDirection: 'row', gap: 6 }}>
          <MessageCircle size={13} color={colors.danger} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.danger, fontWeight: '600' }}>{task.rejectionReason}</Text>
        </View>
      )}
      {!isPending && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
          <View style={{ backgroundColor: BRAND.purple, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {isRedo ? <Undo2 size={13} color="#fff" /> : <Check size={13} color="#fff" />}
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>
              {isRedo ? 'Resubmit' : 'Done'}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── Submit sheet ─────────────────────────────────────────────────────────────

function SubmitSheet({ task, childId, visible, onClose, isDark, colors }: {
  task: ChoreTask | null; childId: string; visible: boolean; onClose: () => void;
  isDark: boolean; colors: any;
}) {
  const { submitChore, resubmitChore, claimBounty, startGrandparentQuest, submitGrandparentQuest } = useChoreStore();
  const [note, setNote]         = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const isRedo      = task?.status === 'redo_requested';
  const isClaimOnly = task?.categoryType === 'bounty' && !task.assignedToId;
  const isGP        = task?.categoryType === 'grandparent_quest';
  const isGPStart   = isGP && task?.status === 'todo';
  const needsPhoto  = !!task?.requiresPhotoProof && !isClaimOnly && !isGPStart;
  const canSubmit   = !needsPhoto || !!photoUri;

  const title = isClaimOnly ? 'Claim Bounty' : isGPStart ? 'Start Quest' : isRedo ? 'Resubmit' : 'Mark Done';

  // Reset photo when sheet opens for a new task
  useEffect(() => { if (visible) setPhotoUri(null); }, [visible]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take proof photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const handle = async () => {
    if (!task) return;
    if (needsPhoto && !photoUri) {
      Alert.alert('Photo required', 'Add a photo before submitting.');
      return;
    }
    setLoading(true);
    try {
      const opts = { note: note.trim() || undefined, photoUrl: photoUri ?? undefined };
      if (isClaimOnly) {
        claimBounty(task.id, childId);
      } else if (isGPStart) {
        startGrandparentQuest(task.id, childId);
      } else if (isGP) {
        submitGrandparentQuest(task.id, opts);
      } else if (isRedo) {
        resubmitChore(task.id, opts);
      } else {
        const ok = submitChore(task.id, opts);
        if (!ok) {
          Alert.alert('Not due yet', "This chore's next turn hasn't started yet — check back on its due date.");
          return;
        }
      }
      setNote(''); setPhotoUri(null);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>{title}</Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, marginBottom: 4 }}>
          {task.title}
        </Text>
        {task.basePoints > 0 && !isClaimOnly && !isGPStart && (
          <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontWeight: '700', marginBottom: 12 }}>
            +{task.basePoints} pts on approval
          </Text>
        )}

        {isRedo && task.rejectionReason && (
          <View style={{ backgroundColor: `${colors.danger}10`, borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.danger }}>Feedback:</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.danger, marginTop: 2 }}>{task.rejectionReason}</Text>
          </View>
        )}

        {isClaimOnly && (
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 20, lineHeight: 20 }}>
            Claiming assigns this bounty to you. Complete it and submit for approval to earn {task.basePoints} pts.
          </Text>
        )}

        {isGPStart && (
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 20, lineHeight: 20 }}>
            Starting this quest marks it in-progress — your grandparent will see you're on it.
          </Text>
        )}

        {!isClaimOnly && !isGPStart && (
          <>
            {/* Note input */}
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
              Add a note (optional)
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={isRedo ? 'What did you fix?' : 'Add a note about what you did…'}
              placeholderTextColor={colors.textTertiary}
              multiline numberOfLines={3}
              style={{
                backgroundColor: isDark ? colors.surface : '#F9FAFB',
                borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                padding: 12, fontSize: TYPO.body, color: colors.textPrimary,
                minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
              }}
            />

            {/* Photo proof section */}
            {needsPhoto && (
              <>
                {/* Mandatory banner */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: photoUri ? '#F0FDF4' : BOUNTY_AMBER_BG,
                  borderRadius: 12, padding: 10, marginBottom: 12,
                  borderWidth: 1, borderColor: photoUri ? '#BBF7D0' : '#FDE68A',
                }}>
                  {photoUri ? <Check size={16} color={MONEY_GREEN} /> : <Camera size={16} color={BOUNTY_AMBER} />}
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: photoUri ? MONEY_GREEN : BOUNTY_AMBER, flex: 1 }}>
                    {photoUri ? 'Photo attached — looks good' : 'Photo proof required to submit'}
                  </Text>
                </View>

                {/* Photo preview */}
                {photoUri && (
                  <View style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                    <Image source={{ uri: photoUri }} style={{ width: '100%', height: 160, borderRadius: 12 }} resizeMode="cover" />
                    <Pressable
                      onPress={() => setPhotoUri(null)}
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        backgroundColor: '#00000080', borderRadius: 12,
                        paddingHorizontal: 10, paddingVertical: 4,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '700' }}>Change</Text>
                    </Pressable>
                  </View>
                )}

                {/* Camera / Gallery buttons */}
                {!photoUri && (
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                    <Pressable
                      onPress={takePhoto}
                      style={({ pressed }) => ({
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        backgroundColor: isDark ? colors.surface : '#F1F5F9',
                        borderRadius: 12, paddingVertical: 12,
                        borderWidth: 1.5, borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Camera size={18} color={colors.textPrimary} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>Camera</Text>
                    </Pressable>
                    <Pressable
                      onPress={pickPhoto}
                      style={({ pressed }) => ({
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        backgroundColor: isDark ? colors.surface : '#F1F5F9',
                        borderRadius: 12, paddingVertical: 12,
                        borderWidth: 1.5, borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <ImageIcon size={18} color={colors.textPrimary} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>Gallery</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </>
        )}
        {(isClaimOnly || isGPStart) && <View style={{ height: 8 }} />}

        <Pressable
          onPress={handle}
          disabled={loading || (!canSubmit)}
          style={({ pressed }) => ({
            backgroundColor: canSubmit ? BRAND.purple : colors.border,
            borderRadius: 16, paddingVertical: 16,
            alignItems: 'center', opacity: pressed || loading ? 0.7 : 1,
          })}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: canSubmit ? '#fff' : colors.textTertiary }}>
                {isClaimOnly ? 'Claim Bounty' : isGPStart ? 'Start Quest' : isRedo ? 'Resubmit' : 'Submit for Approval'}
              </Text>
          }
        </Pressable>

        {needsPhoto && !photoUri && (
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', marginTop: 8 }}>
            Add a photo to unlock the submit button
          </Text>
        )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Streak + Badge progress banner ──────────────────────────────────────────

function StreakBadgeStrip({ member, colors, isDark }: {
  member: FamilyMember; colors: any; isDark: boolean;
}) {
  const { getBadgeProgress } = useChoreStore();
  const badges = getBadgeProgress(member.id);
  const [badgesOpen, setBadgesOpen] = useState(false);

  const streak = (member as any).streak ?? 0;

  // Work out next Streak Titan milestone
  const streakTiers = [
    { days: 7,  label: 'Bronze 🥉' },
    { days: 14, label: 'Silver 🥈' },
    { days: 30, label: 'Gold 🥇' },
    { days: 90, label: 'Diamond 💎' },
  ];
  const nextTier = streakTiers.find(t => streak < t.days);
  const streakPct = nextTier ? (streak / nextTier.days) * 100 : 100;
  const streakLabel = nextTier
    ? `${streak}/${nextTier.days} days → Streak Titan ${nextTier.label}`
    : `90-day Diamond streak! 💎`;

  // In-progress badges (not yet unlocked at max tier)
  const inProgress = BADGE_DEFINITIONS
    ? Object.entries(BADGE_DEFINITIONS)
        .map(([key, def]) => {
          const userBadge = badges.find(b => b.badgeKey === key as any);
          const progress = userBadge?.progress ?? 0;
          const tiers = (def as any).tiers as { tier: string; target: number; label: string }[] | undefined;
          const nextTarget = tiers ? (tiers.find(t => progress < t.target)?.target ?? null) : null;
          return { key, def, progress, nextTarget };
        })
        .filter(b => b.nextTarget !== null)
        .slice(0, 3)
    : [];

  if (streak === 0 && badges.length === 0) return null;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
      {/* Streak row */}
      {streak > 0 && (
        <View style={{
          backgroundColor: isDark ? '#1C1630' : '#FFF7ED',
          borderRadius: 14, padding: 13,
          borderWidth: 1, borderColor: '#F97316' + '40',
          marginBottom: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Flame size={22} color="#F97316" fill="#F97316" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#F97316' }}>
                Day {streak} Streak
              </Text>
              <Text style={{ fontSize: TYPO.label, color: isDark ? '#FED7AA' : '#7C2D12', marginTop: 1 }}>
                {streakLabel}
              </Text>
            </View>
            {streak >= 7 && (
              <View style={{ backgroundColor: '#F97316', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>+10% bonus</Text>
              </View>
            )}
          </View>
          <View style={{ height: 6, backgroundColor: '#FED7AA', borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.min(streakPct, 100)}%`, backgroundColor: '#F97316', borderRadius: 3 }} />
          </View>
        </View>
      )}

      {/* Badge progress (collapsible) */}
      {inProgress.length > 0 && (
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
        }}>
          <Pressable
            onPress={() => setBadgesOpen(o => !o)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 }}>
            <Trophy size={18} color={BRAND.amber} />
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
              Badge Progress
            </Text>
            {badgesOpen ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
          </Pressable>
          {badgesOpen && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 10 }}>
              {inProgress.map(({ key, def, progress, nextTarget }) => {
                const pct = nextTarget ? Math.min((progress / nextTarget) * 100, 100) : 100;
                return (
                  <View key={key}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 16 }}>{(def as any).emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>
                          {(def as any).label}
                        </Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>
                          {progress}/{nextTarget} · {(def as any).bonus}
                        </Text>
                      </View>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: BRAND.purple }}>
                        {Math.round(pct)}%
                      </Text>
                    </View>
                    <View style={{ height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: BRAND.purple, borderRadius: 3 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Wallet strip + Cash-Out ──────────────────────────────────────────────────

function WalletStrip({ memberId, colors, isDark, onCashOut }: {
  memberId: string; colors: any; isDark: boolean; onCashOut: () => void;
}) {
  const getMemberBalance = useChoreStore(s => s.getMemberBalance);
  const householdSettings = useChoreStore(s => s.householdSettings);
  const bal = getMemberBalance(memberId);
  const ratio = householdSettings.pointsToFiatRatio;

  const jars = [
    { key: 'spend', label: 'Spend', Icon: Wallet,    value: bal.spend, color: BRAND.purple },
    { key: 'save',  label: 'Save',  Icon: PiggyBank, value: bal.save,  color: GP_BLUE },
    { key: 'give',  label: 'Give',  Icon: HandHeart, value: bal.give,  color: MONEY_GREEN },
  ] as const;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {jars.map(jar => (
          <View key={jar.key} style={{
            flex: 1, backgroundColor: isDark ? colors.card : '#fff',
            borderRadius: 14, padding: 12, alignItems: 'center',
            borderWidth: 1, borderColor: colors.border,
          }}>
            <jar.Icon size={17} color={jar.color} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: jar.color }}>{jar.value}</Text>
            <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textTertiary }}>{jar.label}</Text>
            <Text style={{ fontSize: 9, color: colors.textTertiary, marginTop: 1 }}>{householdSettings.currencySymbol}{(jar.value * ratio).toFixed(2)}</Text>
          </View>
        ))}
      </View>
      {bal.total >= (householdSettings.minCashoutPoints) && (
        <Pressable
          onPress={onCashOut}
          style={({ pressed }) => ({
            backgroundColor: MONEY_GREEN, borderRadius: 14, paddingVertical: 12,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Wallet size={15} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
            Cash Out Points (min {householdSettings.minCashoutPoints} pts)
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Cash-Out sheet ───────────────────────────────────────────────────────────

function CashOutSheet({ memberId, visible, onClose, isDark, colors }: {
  memberId: string; visible: boolean; onClose: () => void; isDark: boolean; colors: any;
}) {
  const getMemberBalance = useChoreStore(s => s.getMemberBalance);
  const householdSettings = useChoreStore(s => s.householdSettings);
  const requestCashOut = useChoreStore(s => s.requestCashOut);

  const bal   = getMemberBalance(memberId);
  const ratio = householdSettings.pointsToFiatRatio;
  const min   = householdSettings.minCashoutPoints;

  const [pts, setPts]   = useState(String(min));
  const [step, setStep] = useState<'amount' | 'review'>('amount');
  const [customSplit, setCustomSplit] = useState(false);
  const [spendPct, setSpendPct] = useState(householdSettings.spendAllocationPct);
  const [savePct,  setSavePct]  = useState(householdSettings.saveAllocationPct);
  const [loading, setLoading]   = useState(false);

  const amount = Math.max(0, Math.min(bal.total, parseInt(pts || '0', 10) || 0));
  const givePct = 100 - spendPct - savePct;
  const spendAmt = Math.floor(amount * (spendPct / 100));
  const saveAmt  = Math.floor(amount * (savePct  / 100));
  const giveAmt  = amount - spendAmt - saveAmt;
  const dollars  = (amount * ratio).toFixed(2);
  const valid    = amount >= min && givePct >= 0 && (spendPct + savePct) <= 100;

  const handleSubmit = () => {
    if (!valid) return;
    setLoading(true);
    requestCashOut(memberId, amount, customSplit ? { spendPct, savePct, givePct } : undefined);
    setLoading(false);
    Alert.alert('Submitted!', 'Your cash-out request was sent to your parent for approval. 🎉');
    onClose();
  };

  const dismiss = () => { Keyboard.dismiss(); setStep('amount'); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Cash Out Points</Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>
        {step === 'amount' ? (
          <>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
              How many points? (min {min}, you have {bal.total})
            </Text>
            <TextInput
              value={pts}
              onChangeText={setPts}
              keyboardType="number-pad"
              style={{
                backgroundColor: isDark ? colors.surface : '#F9FAFB',
                borderRadius: 12, borderWidth: 1, borderColor: valid ? '#BBF7D0' : colors.border,
                padding: 14, fontSize: 24, fontWeight: '900',
                color: colors.textPrimary, textAlign: 'center', marginBottom: 16,
              }}
            />

            {/* Jar preview */}
            <View style={{ backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 }}>
                Split across jars — {householdSettings.currencySymbol}{dollars} total
              </Text>
              {[
                { label: 'Spend (50%)', Icon: Wallet,    amt: spendAmt, color: BRAND.purple },
                { label: 'Save (40%)',  Icon: PiggyBank, amt: saveAmt,  color: GP_BLUE },
                { label: 'Give (10%)',  Icon: HandHeart, amt: giveAmt,  color: MONEY_GREEN },
              ].map(j => (
                <View key={j.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <j.Icon size={15} color={j.color} style={{ marginRight: 8 }} />
                  <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textSecondary }}>{j.label}</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: j.color }}>
                    {j.amt} pts ({householdSettings.currencySymbol}{(j.amt * ratio).toFixed(2)})
                  </Text>
                </View>
              ))}
            </View>

            {householdSettings.allowChildAllocationOverride && (
              <Pressable
                onPress={() => setCustomSplit(v => !v)}
                style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                  borderColor: BRAND.purple,
                  backgroundColor: customSplit ? BRAND.purple : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {customSplit && <Check size={12} color="#fff" strokeWidth={3} />}
                </View>
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>Adjust split manually</Text>
              </Pressable>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={onClose} style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => valid && setStep('review')}
                style={({ pressed }) => ({
                  flex: 2, padding: 14, borderRadius: 14,
                  backgroundColor: valid ? BRAND.purple : colors.border,
                  alignItems: 'center', opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: valid ? '#fff' : colors.textTertiary }}>
                  Next
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={{ backgroundColor: isDark ? colors.surface : '#F0FDF4', borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 }}>
                Ready to cash out {amount} pts ({householdSettings.currencySymbol}{dollars})
              </Text>
              {[
                { label: 'Spend Jar', Icon: Wallet,    sub: 'immediate / debit',    amt: spendAmt, color: BRAND.purple },
                { label: 'Save Jar',  Icon: PiggyBank, sub: 'family vault',         amt: saveAmt,  color: GP_BLUE },
                { label: 'Give Jar',  Icon: HandHeart, sub: 'to your chosen cause', amt: giveAmt,  color: MONEY_GREEN },
              ].map(j => (
                <View key={j.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <j.Icon size={14} color={j.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{j.label}</Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>{j.sub}</Text>
                  </View>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: j.color }}>
                    {householdSettings.currencySymbol}{(j.amt * ratio).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setStep('amount')} style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Back</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={loading}
                style={({ pressed }) => ({
                  flex: 2, padding: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: MONEY_GREEN, opacity: pressed || loading ? 0.7 : 1,
                })}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Check size={15} color="#fff" />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Confirm & Submit</Text>
                    </>
                }
              </Pressable>
            </View>
          </>
        )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ChildChoreBoardProps {
  member: FamilyMember;
  members: FamilyMember[];
  colors: any;
  isDark: boolean;
}

export function ChildChoreBoard({ member, members, colors, isDark }: ChildChoreBoardProps) {
  const { syncFromDB, loadFromStorage, loaded, scanAndAutoApprove, resetDueRecurringChores, declineGrandparentQuest } = useChoreStore();

  const chores = useChoreStore(s => s.chores);

  const dash = useMemo(() => {
    // Was UTC-today compared against a UTC-timestamp prefix — dropped
    // evening-approved chores off "completed today" for hours in any
    // timezone west of UTC. See choreStore.ts's getChildDashboard for the
    // same fix.
    const todayStr = todayLocal();
    const visible = chores.filter(c => !c.isPrivateParent);
    return {
      citizenship: visible.filter(c =>
        c.categoryType === 'citizenship' &&
        (c.assignedToId === member.id || !c.assignedToId),
      ),
      routines: visible.filter(c =>
        c.categoryType === 'routine' &&
        ['todo', 'in_progress', 'redo_requested'].includes(c.status) &&
        c.assignedToId === member.id,
      ),
      bounties: visible.filter(c =>
        c.categoryType === 'bounty' &&
        ['todo', 'in_progress'].includes(c.status),
      ),
      grandparentQuests: visible.filter(c =>
        c.categoryType === 'grandparent_quest' &&
        ['todo', 'in_progress', 'pending_grandparent_approval'].includes(c.status) &&
        (c.assignedToId === member.id || !c.assignedToId),
      ),
      completedToday: visible.filter(c => {
        if (c.assignedToId !== member.id) return false;
        if (!['approved', 'auto_approved', 'completed'].includes(c.status)) return false;
        const ts = c.approvedAt ?? c.submittedAt;
        if (!ts) return false;
        const d = new Date(ts);
        return !isNaN(d.getTime()) && localDateStr(d) === todayStr;
      }),
      pendingReview: visible.filter(c =>
        c.assignedToId === member.id &&
        ['pending_approval', 'pending_grandparent_approval'].includes(c.status),
      ),
    };
  }, [chores, member.id]);

  const [selectedTask, setSelectedTask] = useState<ChoreTask | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [cashOutVisible, setCashOutVisible] = useState(false);

  useEffect(() => {
    loadFromStorage().then(() => {
      syncFromDB();
      scanAndAutoApprove();
      resetDueRecurringChores();
    });
  }, []);

  const handleTaskAction = (task: ChoreTask) => {
    if (task.status === 'pending_approval' || task.status === 'pending_grandparent_approval') {
      Alert.alert('Under Review', 'This task is waiting for approval.');
      return;
    }
    setSelectedTask(task);
    setSheetVisible(true);
  };

  const citizenshipDone  = dash.citizenship.filter(t =>
    ['completed', 'approved', 'auto_approved', 'pending_approval'].includes(t.status),
  ).length;
  const citizenshipTotal = dash.citizenship.length;
  const citizenshipPct   = citizenshipTotal > 0 ? (citizenshipDone / citizenshipTotal) * 100 : 0;

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
        <ActivityIndicator color={BRAND.purple} />
      </View>
    );
  }

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Wallet + cash-out */}
        <View style={{ paddingTop: 12, marginBottom: 12 }}>
          <WalletStrip memberId={member.id} colors={colors} isDark={isDark} onCashOut={() => setCashOutVisible(true)} />
        </View>

        {/* Streak + badge progress */}
        <StreakBadgeStrip member={member} colors={colors} isDark={isDark} />

        {/* Progress banner */}
        {(dash.completedToday.length > 0 || dash.pendingReview.length > 0) && (
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: isDark ? colors.card : '#F0FDF4', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#059669', marginBottom: 4 }}>🎉 Today's progress</Text>
            <Text style={{ fontSize: TYPO.caption, color: '#065F46', lineHeight: 18 }}>
              {dash.completedToday.length > 0 ? `${dash.completedToday.length} approved` : ''}
              {dash.completedToday.length > 0 && dash.pendingReview.length > 0 ? '  ·  ' : ''}
              {dash.pendingReview.length > 0 ? `${dash.pendingReview.length} awaiting review` : ''}
            </Text>
          </View>
        )}

        {/* Citizenship */}
        {dash.citizenship.length > 0 && (
          <>
            <SectionHeader Icon={Sprout} iconColor={MONEY_GREEN} title="Citizenship" count={citizenshipTotal} colors={colors} />
            {citizenshipTotal > 0 && (
              <View style={{ marginHorizontal: 16, marginBottom: 10 }}>
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${citizenshipPct}%`, backgroundColor: MONEY_GREEN, borderRadius: 3 }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  {citizenshipPct === 100 && <Check size={12} color={MONEY_GREEN} />}
                  <Text style={{ fontSize: TYPO.caption, color: MONEY_GREEN, fontWeight: '600' }}>
                    {citizenshipPct === 100 ? 'All done — streak maintained!' : `${citizenshipDone}/${citizenshipTotal} completed`}
                  </Text>
                </View>
              </View>
            )}
            {dash.citizenship.map(task => (
              <CitizenshipCard key={task.id} task={task} childId={member.id} colors={colors} isDark={isDark} />
            ))}
          </>
        )}

        {/* Routines */}
        {dash.routines.length > 0 && (
          <>
            <SectionHeader Icon={Star} title="My Routines" count={dash.routines.length} colors={colors} />
            {dash.routines.map(task => (
              <TaskCard key={task.id} task={task} childId={member.id} colors={colors} isDark={isDark} onAction={handleTaskAction} />
            ))}
          </>
        )}

        {/* Bounty Board */}
        {dash.bounties.length > 0 && (
          <>
            <SectionHeader Icon={Gem} iconColor={BOUNTY_AMBER} title="Bounty Board" count={dash.bounties.length} colors={colors} />
            <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: BOUNTY_AMBER_BG, borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Zap size={15} color={BOUNTY_AMBER} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: BOUNTY_AMBER, flex: 1 }}>First come, first served — claim it before someone else does.</Text>
            </View>
            {dash.bounties.map(task => (
              <BountyCard
                key={task.id} task={task} childId={member.id} members={members}
                colors={colors} isDark={isDark}
                onAction={task.assignedToId === member.id ? handleTaskAction : (t) => { setSelectedTask(t); setSheetVisible(true); }}
              />
            ))}
          </>
        )}

        {/* Grandparent Quests */}
        {dash.grandparentQuests.length > 0 && (
          <>
            <SectionHeader Icon={HeartHandshake} iconColor={GP_BLUE} title="Grandparent Quests" count={dash.grandparentQuests.length} colors={colors} />
            {dash.grandparentQuests.map(task => (
              <GPQuestCard
                key={task.id} task={task} childId={member.id} members={members}
                colors={colors} isDark={isDark}
                onStart={(t) => { setSelectedTask(t); setSheetVisible(true); }}
                onSubmit={(t) => { setSelectedTask(t); setSheetVisible(true); }}
                onDecline={(t) => declineGrandparentQuest(t.id, member.id, 'Child declined')}
              />
            ))}
          </>
        )}

        {/* Empty state */}
        {dash.citizenship.length === 0 && dash.routines.length === 0 &&
         dash.bounties.length === 0 && dash.grandparentQuests.length === 0 &&
         dash.completedToday.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 }}>
            <Target size={44} color={colors.textTertiary} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 6 }}>No tasks yet</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 }}>
              Nothing posted right now — check back later for new routines or bounties.
            </Text>
          </View>
        )}
      </ScrollView>

      <SubmitSheet
        task={selectedTask} childId={member.id}
        visible={sheetVisible} onClose={() => { setSheetVisible(false); setSelectedTask(null); }}
        isDark={isDark} colors={colors}
      />
      <CashOutSheet
        memberId={member.id} visible={cashOutVisible}
        onClose={() => setCashOutVisible(false)}
        isDark={isDark} colors={colors}
      />
    </>
  );
}
