/**
 * CreateResponsibilitySheet — bottom-sheet for creating and directly assigning
 * a chore/responsibility. Pixel-faithful to Figma node 90:12520
 * "Create and directly assign responsibility · Mobile", re-skinned in the
 * Kinfolk palette.
 *
 * Uses AppBottomSheet as the container (the canonical modal bottom sheet).
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import type { ChoreCategoryType } from '@/store/choreStore';
import { todayLocal } from '@/lib/dates';
import AppDateTimePicker from '@/components/AppDateTimePicker';

// ─── Types ─────────────────────────────────────────────────────────────────────

// Quest/Bounty is a separate flow — this sheet is for direct assignment only
type PillCategory = 'Chore' | 'Errand' | 'Care';

const PILL_CATEGORIES: PillCategory[] = ['Chore', 'Errand', 'Care'];

const CATEGORY_TYPE_MAP: Record<PillCategory, ChoreCategoryType> = {
  Chore:  'routine',
  Errand: 'shopping',
  Care:   'citizenship',
};

const COIN_PRESETS = [0, 5, 10, 20, 50];

// Simple keyword → category auto-detection (English-only, best-effort)
function detectCategory(title: string): PillCategory | null {
  const t = title.toLowerCase();
  if (/\b(wash|clean|vacuum|sweep|mop|tidy|dishes|laundry|trash|wipe|dust)\b/.test(t)) return 'Chore';
  if (/\b(buy|pick up|store|groceries|errand|shop|get|fetch)\b/.test(t)) return 'Errand';
  if (/\b(help|care|read|walk|feed|water|pet|assist|check|remind)\b/.test(t)) return 'Care';
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateResponsibilitySheet({
  visible,
  onClose,
  onCreated,
  onConvertToRide,
  prefillTitle,
  prefillMemberId,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (choreId: string) => void;
  onConvertToRide?: (seed: { title: string; memberId?: string; dueDate?: string }) => void;
  prefillTitle?: string;
  prefillMemberId?: string;
}) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, familyName } = useFamilyStore();
  const { addChore } = useChoreStore();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [title, setTitle]               = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PillCategory>('Chore');
  const [assignedMemberId, setAssignedMemberId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visible && (prefillTitle || prefillMemberId)) {
      if (prefillTitle) setTitle(prefillTitle);
      if (prefillMemberId) setAssignedMemberId(prefillMemberId);
    }
  }, [visible, prefillTitle, prefillMemberId]);
  const [dueDate, setDueDate]           = useState<string>(todayLocal());
  const [dueTime, setDueTime]           = useState<string | undefined>(undefined);
  const [coins, setCoins]               = useState<number>(10);
  const [customCoins, setCustomCoins]   = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting]     = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const detectedCategory = useMemo(() => detectCategory(title), [title]);
  const activeMember     = useMemo(() => members.find(m => m.id === activeMemberId), [members, activeMemberId]);
  const assignedMember   = useMemo(() => members.find(m => m.id === assignedMemberId), [members, assignedMemberId]);
  const firstName        = assignedMember?.name?.split(' ')[0] ?? '';

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const effectiveCoins = customCoins !== '' ? (parseInt(customCoins, 10) || 0) : coins;

  const resetForm = useCallback(() => {
    setTitle('');
    setSelectedCategory('Chore');
    setAssignedMemberId(undefined);
    setDueDate(todayLocal());
    setDueTime(undefined);
    setCoins(10);
    setCustomCoins('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const familyId = members.find(m => m.familyId)?.familyId;
      const chore = await addChore({
        title:              title.trim(),
        assignedToId:       assignedMemberId,
        coinsReward:        effectiveCoins,
        dueDate:            dueDate,
        dueTime:            dueTime,
        categoryType:       CATEGORY_TYPE_MAP[selectedCategory],
        category:           selectedCategory,
        familyId:           familyId,
        status:             'todo',
        basePoints:         effectiveCoins,
        xpReward:           effectiveCoins,
        isPool:             !assignedMemberId,
        recurrenceRule:     { type: 'none' } as any,
        requiresPhotoProof: false,
      });
      onCreated?.(chore.id);
      resetForm();
      onClose();
    } catch (e) {
      // error toast is shown by choreStore.addChore itself
    } finally {
      setSubmitting(false);
    }
  }, [title, assignedMemberId, effectiveCoins, dueDate, dueTime, selectedCategory, members, addChore, onCreated, resetForm, onClose]);

  const handleConvertToRide = useCallback(() => {
    onConvertToRide?.({ title: title.trim(), memberId: assignedMemberId, dueDate });
    resetForm();
    onClose();
  }, [title, assignedMemberId, dueDate, onConvertToRide, resetForm, onClose]);

  // ── Styles (theme-dependent, so inlined with colors.*) ──────────────────────
  const fieldBorder = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  // ── Date display ────────────────────────────────────────────────────────────
  const today = todayLocal();
  const dueDateLabel = dueDate === today
    ? 'Today'
    : new Date(dueDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }} edges={['top', 'bottom']}>
        {/* ── Fixed page header ───────────────────────────────────────────── */}
        <View style={[s.pageHeader, { borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)' }]}>
          <View style={s.chromeRow}>
            <Text style={[s.chromeFamilyName, { color: colors.textTertiary }]}>
              {familyName?.toUpperCase() ?? 'FAMILY'}
            </Text>
            {activeMember ? (
              <Text style={[s.chromeMember, { color: colors.teal }]}>
                {activeMember.name} · {activeMember.role}
              </Text>
            ) : null}
          </View>
          <View style={s.titleRow}>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={handleClose} style={{ alignSelf: 'flex-start' }}>
                <Text style={[s.backLinkText, { color: colors.teal }]}>← Tasks</Text>
              </TouchableOpacity>
              <Text style={[s.pageTitle, { color: colors.textPrimary }]}>Assign a task</Text>
            </View>
            <Pressable onPress={handleClose} style={[s.closeBtn, { backgroundColor: colors.surface }]}>
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
      <View style={{ gap: 20 }}>

        {/* ── Category filter pills ────────────────────────────────────────── */}
        <View style={[s.pillsRow, { backgroundColor: colors.surface }]}>
          {PILL_CATEGORIES.map(cat => {
            const active = cat === selectedCategory;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  s.pill,
                  active
                    ? { backgroundColor: colors.primaryLight }
                    : { backgroundColor: 'transparent' },
                ]}
              >
                <Text
                  style={[
                    s.pillText,
                    active
                      ? { color: colors.primary, fontWeight: '600' }
                      : { color: colors.textSecondary, fontWeight: '400' },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Field 1: What needs doing? ───────────────────────────────────── */}
        <View style={[s.fieldCard, { backgroundColor: colors.card, borderColor: fieldBorder }]}>
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>What needs doing?</Text>
          <TextInput
            style={[s.textInput, { color: colors.textPrimary }]}
            placeholder="Name this responsibility"
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
            returnKeyType="done"
            maxLength={120}
          />
          {detectedCategory ? (
            <View style={[s.detectedPill, { backgroundColor: colors.primaryLight }]}>
              <Text style={[s.detectedPillText, { color: colors.primary }]}>
                {detectedCategory}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Field 2: Who's responsible? ─────────────────────────────────── */}
        <View style={[s.fieldCard, { backgroundColor: colors.card, borderColor: fieldBorder }]}>
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Who&apos;s responsible?</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.memberChipRow}
            style={{ marginTop: 10 }}
          >
            {/* "Anyone" = open pool chip */}
            <TouchableOpacity
              onPress={() => setAssignedMemberId(undefined)}
              style={s.memberChipOuter}
            >
              <View
                style={[
                  s.memberChipAvatar,
                  assignedMemberId === undefined
                    ? { backgroundColor: colors.primaryLight, borderColor: colors.primary, borderWidth: 2 }
                    : { backgroundColor: colors.surface, borderColor: fieldBorder, borderWidth: 1 },
                ]}
              >
                <Text style={[s.memberChipInitial, { color: assignedMemberId === undefined ? colors.primary : colors.textSecondary }]}>
                  ★
                </Text>
              </View>
              <Text style={[s.memberChipName, { color: colors.textSecondary }]} numberOfLines={1}>
                Anyone
              </Text>
            </TouchableOpacity>
            {members.map(member => {
              const selected = member.id === assignedMemberId;
              const initial  = (member.name ?? '?')[0].toUpperCase();
              const roleColor = member.role === 'parent' ? colors.teal : colors.amber;
              return (
                <TouchableOpacity
                  key={member.id}
                  onPress={() => setAssignedMemberId(member.id)}
                  style={s.memberChipOuter}
                >
                  <View
                    style={[
                      s.memberChipAvatar,
                      selected
                        ? { backgroundColor: roleColor, borderColor: roleColor, borderWidth: 2 }
                        : { backgroundColor: colors.surface, borderColor: fieldBorder, borderWidth: 1 },
                    ]}
                  >
                    <Text style={[s.memberChipInitial, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>
                      {initial}
                    </Text>
                  </View>
                  <Text style={[s.memberChipName, { color: selected ? roleColor : colors.textSecondary }]} numberOfLines={1}>
                    {member.name?.split(' ')[0] ?? '?'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Field 3: When is it due? ─────────────────────────────────────── */}
        <View style={[s.fieldCard, { backgroundColor: colors.card, borderColor: fieldBorder }]}>
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>When is it due?</Text>
          <View style={s.dateRow}>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={[s.dateChip, { backgroundColor: colors.surface }]}
            >
              <Text style={[s.dateChipText, { color: colors.textPrimary }]}>{dueDateLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              style={[s.dateChip, { backgroundColor: colors.surface }]}
            >
              <Text style={[s.dateChipText, { color: dueTime ? colors.textPrimary : colors.textTertiary }]}>
                {dueTime ?? 'No time'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Field 4: Coins reward ────────────────────────────────────────── */}
        <View style={[s.fieldCard, { backgroundColor: colors.card, borderColor: fieldBorder }]}>
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Coins reward</Text>
          <View style={s.coinsRow}>
            {COIN_PRESETS.map(preset => {
              const active = customCoins === '' && preset === coins;
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => { setCoins(preset); setCustomCoins(''); }}
                  style={[
                    s.coinChip,
                    active
                      ? { backgroundColor: colors.amberLight }
                      : { backgroundColor: colors.surface },
                  ]}
                >
                  <Text
                    style={[
                      s.coinChipText,
                      active
                        ? { color: colors.amber, fontWeight: '600' }
                        : { color: colors.textSecondary },
                    ]}
                  >
                    {preset === 0 ? '0' : `${preset}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TextInput
              style={[
                s.coinCustomInput,
                {
                  backgroundColor: colors.surface,
                  color: colors.textPrimary,
                  borderColor: customCoins !== '' ? colors.amber : fieldBorder,
                },
              ]}
              placeholder="…"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              value={customCoins}
              onChangeText={setCustomCoins}
              maxLength={4}
            />
          </View>
        </View>

        {/* ── Assignment summary card ──────────────────────────────────────── */}
        <View style={[s.detailCard, { backgroundColor: colors.card, borderColor: fieldBorder }]}>
          <Text style={[s.detailCardTitle, { color: colors.textPrimary }]}>
            {assignedMemberId ? 'Assigned to' : 'Open to everyone'}
          </Text>
          {members.map(member => {
            const isAssigned = member.id === assignedMemberId;
            const roleColor = member.role === 'parent' ? colors.teal : colors.amber;
            const roleLightBg = member.role === 'parent' ? colors.tealLight : colors.amberLight;
            if (!isAssigned && assignedMemberId) return null;
            return (
              <View key={member.id} style={s.eligibilityRow}>
                <View style={[
                  s.eligibilityAvatar,
                  { backgroundColor: isAssigned ? roleColor : colors.surface },
                ]}>
                  <Text style={[
                    s.eligibilityInitial,
                    { color: isAssigned ? '#FFFFFF' : colors.textTertiary },
                  ]}>
                    {(member.name ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.eligibilityName, { color: colors.textPrimary }]}>
                    {member.name?.split(' ')[0] ?? '?'}
                  </Text>
                  <Text style={[s.eligibilityStatus, { color: colors.textTertiary }]}>
                    {member.role === 'parent' ? 'Parent' : 'Kid'}
                  </Text>
                </View>
                {isAssigned ? (
                  <View style={[s.eligibilityBadge, { backgroundColor: roleLightBg }]}>
                    <Text style={[s.eligibilityBadgeText, { color: roleColor }]}>Assigned ✓</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          {!assignedMemberId && (
            <Text style={[s.eligibilityNote, { color: colors.textTertiary }]}>
              Any family member can claim this task
            </Text>
          )}
        </View>

        {/* ── Explanation text ─────────────────────────────────────────────── */}
        {assignedMember ? (
          <Text style={[s.explanationText, { color: colors.textSecondary }]}>
            {firstName} can be swapped for someone else before the due date.
          </Text>
        ) : null}

        {/* ── Primary CTA ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleCreate}
          disabled={submitting || !title.trim()}
          style={[
            s.primaryBtn,
            { backgroundColor: submitting || !title.trim() ? colors.border : colors.primary },
          ]}
          activeOpacity={0.8}
        >
          <Text style={s.primaryBtnText}>
            {submitting
              ? 'Creating…'
              : assignedMember
              ? `Assign to ${firstName} →`
              : 'Add to family queue →'}
          </Text>
        </TouchableOpacity>

        {/* ── Secondary CTA ────────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleConvertToRide}
          style={[s.secondaryBtn, { backgroundColor: colors.surface, borderColor: fieldBorder }]}
          activeOpacity={0.8}
        >
          <Text style={[s.secondaryBtnText, { color: colors.teal }]}>
            Convert to a ride instead →
          </Text>
        </TouchableOpacity>

        {/* ── What happens next card ───────────────────────────────────────── */}
        <View style={[s.detailCard, { backgroundColor: colors.tealLight, borderColor: 'transparent' }]}>
          <Text style={[s.detailCardTitle, { color: colors.textPrimary }]}>What happens next</Text>
          <Text style={[s.nextRow, { color: colors.textPrimary }]}>
            {firstName
              ? `${firstName} gets notified and can accept or propose changes.`
              : 'The responsibility will be visible in the household queue.'}
          </Text>
          <Text style={[s.nextRow, { color: colors.textSecondary }]}>
            Coins are awarded when you approve completion.
          </Text>
        </View>

        {/* ── Signature ────────────────────────────────────────────────────── */}
        <Text style={[s.signature, { color: colors.textSecondary }]}>
          Connect. Organize. Care. Grow.
        </Text>

      </View>
        </ScrollView>

        {/* Date pickers rendered outside ScrollView but inside SafeAreaView */}
        {showDatePicker && (
          <AppDateTimePicker
            mode="date"
            value={new Date(dueDate + 'T00:00:00')}
            visible={showDatePicker}
            onConfirm={(date: Date) => {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const d = String(date.getDate()).padStart(2, '0');
              setDueDate(`${y}-${m}-${d}`);
              setShowDatePicker(false);
            }}
            onCancel={() => setShowDatePicker(false)}
          />
        )}
        {showTimePicker && (
          <AppDateTimePicker
            mode="time"
            value={(() => {
              if (dueTime) {
                const [h, min] = dueTime.split(':').map(Number);
                const d = new Date(); d.setHours(h, min, 0, 0); return d;
              }
              const d = new Date(); d.setHours(9, 0, 0, 0); return d;
            })()}
            visible={showTimePicker}
            onConfirm={(date: Date) => {
              setDueTime(`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`);
              setShowTimePicker(false);
            }}
            onCancel={() => setShowTimePicker(false)}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Page header (fixed, above scroll)
  pageHeader: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  pageTitle: {
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 34,
    marginTop: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  // Household chrome
  chromeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chromeFamilyName: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  chromeMember: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Back link
  backLinkText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Filter pills
  pillsRow: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 12,
  },
  pillText: {
    fontSize: 13,
  },

  // Field cards
  fieldCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  textInput: {
    fontSize: 15,
    fontWeight: '400',
    minHeight: 36,
    paddingVertical: Platform.OS === 'ios' ? 0 : 4,
  },

  // Auto-detected category pill (under the title input)
  detectedPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  detectedPillText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Member chips
  memberChipRow: {
    paddingRight: 4,
    gap: 12,
  },
  memberChipOuter: {
    alignItems: 'center',
    gap: 4,
    minWidth: 48,
  },
  memberChipAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberChipInitial: {
    fontSize: 16,
    fontWeight: '600',
  },
  memberChipName: {
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 52,
  },

  // Date row
  dateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  dateChip: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateChipText: {
    fontSize: 14,
    fontWeight: '400',
  },

  // Coins row
  coinsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  coinChip: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  coinChipText: {
    fontSize: 13,
  },
  coinCustomInput: {
    width: 60,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
    textAlign: 'center',
    borderWidth: 1,
  },

  // Detail / eligibility card
  detailCard: {
    borderRadius: 22,
    padding: 18,
    gap: 12,
    borderWidth: 1,
  },
  detailCardTitle: {
    fontSize: 20,
    fontWeight: '600',
  },

  // Eligibility rows
  eligibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eligibilityAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eligibilityInitial: {
    fontSize: 12,
    fontWeight: '600',
  },
  eligibilityName: {
    fontSize: 13,
    fontWeight: '500',
  },
  eligibilityBadge: {
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  eligibilityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  eligibilityNote: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 4,
  },
  eligibilityStatus: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 1,
  },

  // Explanation
  explanationText: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Primary CTA
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Secondary CTA
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // What happens next rows
  nextRow: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },

  // Signature
  signature: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
    paddingBottom: 4,
  },
});
