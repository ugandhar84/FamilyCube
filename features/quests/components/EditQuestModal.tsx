import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, Platform,
  KeyboardAvoidingView, Keyboard, StyleSheet, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import type { Quest, QuestCategory, QuestDifficulty } from '@/store/questStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { localDateStr, parseLocalDate, parseTimeInput } from '@/lib/dates';
import { I } from './icons';
import { QUEST_SUGGESTIONS, ALL_CATEGORIES, fmtDateLabel, fmtTimeLabel } from './questFormShared';
import { aq } from './AddQuestModal';
import {
  resolveDomainFromLooseLabel, fetchSubcategoriesForDomain, previewAssignment, previewKidChoreAssignment,
  type ResponsibilityCategory, type AssignmentSuggestion,
} from '@/lib/responsibilityCategories';

// ─── Edit Quest Modal (parent, unclaimed quests only) ────────────────────────
export function EditQuestModal({ quest, activeMemberId, onClose, onSave, onDelete, editMode = 'full' }: {
  quest: Quest;
  activeMemberId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Quest>) => void;
  onDelete?: (id: string) => void;
  editMode?: 'full' | 'restricted';
}) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);

  const parseDue = () => {
    if (quest.dueDate) {
      const d = parseLocalDate(quest.dueDate);
      if (quest.dueTime) {
        const parsed = parseTimeInput(quest.dueTime);
        if (parsed) {
          const [h, m] = parsed.split(':').map(Number);
          d.setHours(h, m || 0, 0, 0);
        }
      }
      return d;
    }
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d;
  };

  const [title,        setTitle]        = useState(quest.title);
  const [desc,         setDesc]         = useState(quest.description ?? '');
  const [coins,        setCoins]        = useState(String(quest.coins));
  const [bonusCoins,   setBonusCoins]   = useState(quest.bonusCoins > 0 ? String(quest.bonusCoins) : '');
  const [category,     setCategory]     = useState<QuestCategory>(quest.category);
  const [difficulty,   setDifficulty]   = useState<QuestDifficulty | ''>(quest.difficulty ?? '');
  const [isPool,       setIsPool]       = useState(quest.isPool ?? false);
  const [assignIds,         setAssignIds]         = useState<string[]>(quest.assignedToId ? [quest.assignedToId] : (quest.assignedToIds ?? []));
  const [photoReq,          setPhotoReq]          = useState(quest.photoRequired ?? false);
  const [isAdultTask,       setIsAdultTask]        = useState(quest.isAdultTask ?? false);
  const [inviteGrandparent, setInviteGrandparent] = useState(quest.inviteGrandparents ?? false);
  const [dueDate,           setDueDate]           = useState<Date>(parseDue);
  // Always shown regardless of whether recurrence was ever set — a chore
  // can silently carry a recurrence_rule (e.g. from a prior form default
  // bug) with no way to see or clear it otherwise.
  const [routineFreq,       setRoutineFreq]        = useState<'once' | 'daily' | 'weekly' | 'monthly'>(
    (['once', 'daily', 'weekly', 'monthly'] as const).includes(quest.recurrence as any) ? (quest.recurrence as any) : 'once'
  );
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [alertCall,           setAlertCall]           = useState(quest.alertCall ?? false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(quest.alertCallLeadMinutes ?? 10);

  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';
  const siblings = members.map(m => m.name);
  const locked = editMode === 'restricted';
  const familyId = members.find(m => m.id === activeMemberId)?.familyId ?? '';

  // Responsibility Engine — optional subcategory refinement + live
  // assignment preview. Unlike AddQuestModal, this quest already has a real
  // id, so the kid-chore preview (which needs an existing row to read
  // age/skill/rotation/effort from) actually works here.
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [subcategoryOptions, setSubcategoryOptions] = useState<ResponsibilityCategory[]>([]);
  const [assignmentSuggestion, setAssignmentSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  React.useEffect(() => {
    setSubcategoryId(null);
    setAssignmentSuggestion(null);
    const domain = resolveDomainFromLooseLabel(category);
    fetchSubcategoriesForDomain(domain).then(setSubcategoryOptions);
  }, [category]);

  const editSuggestions = useMemo(() => {
    const q = title.toLowerCase().trim();
    if (!q) return QUEST_SUGGESTIONS.filter(s => s.category === category).slice(0, 8);
    return QUEST_SUGGESTIONS.filter(s => s.title.toLowerCase().includes(q)).slice(0, 6);
  }, [title, category]);

  const applyEditSuggestion = (s: typeof QUEST_SUGGESTIONS[0]) => {
    setTitle(s.title);
    setDesc(s.desc);
    setCoins(String(s.coins));
    setCategory(s.category);
  };

  const onDateChange = (_: any, selected?: Date) => {
    setShowDatePick(Platform.OS === 'ios');
    if (selected) { const d = new Date(selected); d.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0); setDueDate(d); }
  };
  const onTimeChange = (_: any, selected?: Date) => {
    setShowTimePick(Platform.OS === 'ios');
    if (selected) { const d = new Date(dueDate); d.setHours(selected.getHours(), selected.getMinutes(), 0, 0); setDueDate(d); }
  };

  const save = async () => {
    setSaving(true);

    // Reassigning an adult task to a different co-parent has to go through
    // the same PENDING/Accept negotiation a brand-new assignment gets
    // (addParentQuest), not a direct assignedToId write — otherwise the new
    // assignee lands pre-accepted with only Done/Reassign, and if this
    // chore already had a live System-A row (pending/locked), that row is
    // left dangling and unreferenced while the chore quietly points
    // somewhere else.
    const reassigningAdultTask = isAdultTask && !isPool && assignIds.length === 1
      && assignIds[0] !== quest.assignedToId && assignIds[0] !== activeMemberId;

    let patch: Partial<Quest>;
    if (locked) {
      // Restricted: only due date + reassign allowed — never touch coins/title
      patch = {
        dueDate: localDateStr(dueDate),
        dueTime: fmtTimeLabel(dueDate),
        assignedToId: reassigningAdultTask ? quest.assignedToId : (!isPool && assignIds.length === 1 ? assignIds[0] : undefined),
        assignedToIds: !isPool && assignIds.length > 1 ? assignIds : [],
        alertCall, alertCallLeadMinutes,
      };
    } else {
      if (!title.trim()) { setSaving(false); return; }
      patch = {
        title: title.trim(),
        description: desc.trim() || undefined,
        coins: parseInt(coins) || quest.coins,
        bonusCoins: parseInt(bonusCoins) || 0,
        category,
        difficulty: difficulty || undefined,
        assignedToId: reassigningAdultTask ? quest.assignedToId : (!isPool && assignIds.length === 1 ? assignIds[0] : undefined),
        assignedToIds: !isPool && assignIds.length > 1 ? assignIds : [],
        isPool: isPool || assignIds.length === 0,
        photoRequired: photoReq,
        isAdultTask,
        inviteGrandparents: inviteGrandparent || undefined,
        dueDate: localDateStr(dueDate),
        dueTime: fmtTimeLabel(dueDate),
        recurrence: routineFreq,
        alertCall, alertCallLeadMinutes,
      };
    }
    onSave(quest.id, patch);
    if (reassigningAdultTask) {
      useChoreStore.getState().addParentQuest(quest.id, activeMemberId, assignIds[0], 'DIRECT');
    }
    setSaving(false);
  };

  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card }}>

            {/* Drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            {/* Fixed header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>
                  {locked ? 'Adjust Chore' : 'Edit Chore'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: colors.primary ?? BRAND.purple }}>
                  {locked ? 'Reassign or adjust coins' : 'Edit title, assignment & more'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrollable body — no `flex: 1` here: the sheet container above
                isn't itself flex-laid-out (just a maxHeight cap, matching
                EventFormModal's proven pattern), so flex:1 on this ScrollView
                has nothing to grow into and collapses to zero height instead. */}
            <ScrollView
              keyboardShouldPersistTaps="always"
              onScrollBeginDrag={Keyboard.dismiss}
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>

              {/* Title */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title *</Text>
              {locked ? (
                <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12,
                  borderColor: isDark ? '#1E293B' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{quest.title}</Text>
                  {quest.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 4 }}>{quest.description}</Text> : null}
                </View>
              ) : (
                <>
                  <TextInput
                    style={[aq.input, { color: colors.textPrimary, borderColor: title.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
                    value={title} onChangeText={setTitle} returnKeyType="next"
                    placeholder="e.g. Wash the dishes, Take out trash…" placeholderTextColor={colors.textTertiary}
                  />
                  {editSuggestions.length > 0 && (
                    <View style={{ marginTop: -6, marginBottom: 12 }}>
                      <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginBottom: 8, fontWeight: '700', letterSpacing: 0.4 }}>
                        {title.trim() ? 'Matching suggestions' : 'Quick picks — tap to fill'}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {editSuggestions.map((s, i) => (
                            <TouchableOpacity key={i}
                              style={[aq.suggPill, {
                                backgroundColor: title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple + '25' : colors.surface,
                                borderColor: title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple : colors.border,
                              }]}
                              onPress={() => applyEditSuggestion(s)}>
                              <Text style={{ fontSize: TYPO.micro, color: title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple : colors.textSecondary, fontWeight: '700' }} numberOfLines={1}>{s.title}</Text>
                              <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginLeft: 5 }}>+{s.coins}🪙</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                  <Text style={[aq.label, { color: colors.textSecondary }]}>
                    Description *{'  '}<Text style={{ fontWeight: '400', color: colors.textTertiary }}>what needs to be done</Text>
                  </Text>
                  <TextInput
                    style={[aq.input, aq.descInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                    value={desc} onChangeText={t => setDesc(t.slice(0, 150))}
                    multiline numberOfLines={3} textAlignVertical="top"
                    placeholder="Describe exactly what's expected…" placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={{ fontSize: TYPO.micro, color: desc.length > 130 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 12 }}>
                    {desc.length}/150
                  </Text>
                </>
              )}

              {/* Coins + Bonus — locked once quest is claimed */}
              {!isAdultTask && (
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[aq.label, { color: colors.textSecondary }]}>Coins 🪙</Text>
                  {locked ? (
                    <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#1E293B' : '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{coins}</Text>
                      <Text style={{ fontSize: TYPO.label }}>🪙</Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginLeft: 4 }}>locked — task claimed</Text>
                    </View>
                  ) : (
                    <TextInput
                      style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
                      keyboardType="number-pad" value={coins} onChangeText={setCoins}
                    />
                  )}
                </View>
                {!locked && (
                  <View style={{ width: 90 }}>
                    <Text style={[aq.label, { color: colors.textSecondary }]}>Bonus 🎉</Text>
                    <TextInput
                      style={[aq.input, { color: colors.textPrimary, borderColor: bonusCoins ? BRAND.amber : colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
                      keyboardType="number-pad" placeholder="+coins" placeholderTextColor={colors.textTertiary}
                      value={bonusCoins} onChangeText={t => setBonusCoins(t.replace(/[^0-9]/g, ''))}
                    />
                  </View>
                )}
              </View>
              )}

              {/* Category */}
              {!locked && (
                <>
                  <Text style={[aq.label, { color: colors.textSecondary }]}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {ALL_CATEGORIES.map(c => (
                        <TouchableOpacity key={c}
                          style={[aq.catChip, { borderColor: pillBdr, backgroundColor: pillBg },
                            category === c && { backgroundColor: BRAND.purple, borderColor: BRAND.purple }]}
                          onPress={() => setCategory(c)}>
                          <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '700', color: category === c ? '#fff' : colors.textSecondary }}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* ── Optional subcategory refinement (Responsibility Engine taxonomy) ── */}
              {!locked && subcategoryOptions.length > 0 && (
                <View style={{ marginBottom: 14, marginTop: -6 }}>
                  <Text style={[aq.label, { color: colors.textSecondary, marginBottom: 6 }]}>
                    Specifically… <Text style={{ color: colors.textTertiary, fontWeight: '600' }}>(optional)</Text>
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {subcategoryOptions.map(sc => {
                        const active = subcategoryId === sc.id;
                        return (
                          <TouchableOpacity
                            key={sc.id}
                            onPress={() => setSubcategoryId(active ? null : sc.id)}
                            style={[aq.catChip, { borderColor: pillBdr, backgroundColor: pillBg },
                              active && { backgroundColor: BRAND.purple, borderColor: BRAND.purple }]}
                          >
                            <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '700', color: active ? '#fff' : colors.textSecondary }}>
                              {sc.subcategoryLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* ── Assignment suggestion — real preview since this quest
                   already exists. Adult tasks call process-task-assignment
                   directly from the category; kid tasks call
                   process-kid-chore-assignment against the real chore row
                   (only possible in edit mode, not in AddQuestModal). ── */}
              {!locked && familyId && (
                <View style={{ marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      setLoadingSuggestion(true);
                      setAssignmentSuggestion(null);
                      const result = isAdultTask
                        ? await previewAssignment({
                            taskId: quest.id, taskType: 'chore', familyId,
                            category: subcategoryId ?? resolveDomainFromLooseLabel(category),
                          })
                        : await previewKidChoreAssignment({ choreId: quest.id, familyId });
                      setAssignmentSuggestion(result);
                      setLoadingSuggestion(false);
                    }}
                    disabled={loadingSuggestion}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      borderRadius: 14, paddingVertical: 11, borderWidth: 1.5, borderStyle: 'dashed',
                      borderColor: BRAND.purple + '60', backgroundColor: isDark ? colors.surface : '#F8F5FF',
                      opacity: loadingSuggestion ? 0.6 : 1, marginBottom: 8,
                    }}
                  >
                    {loadingSuggestion
                      ? <ActivityIndicator size="small" color={BRAND.purple} />
                      : <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
                          ✨ Who would this go to?
                        </Text>
                    }
                  </TouchableOpacity>

                  {assignmentSuggestion && (
                    <View style={{
                      borderRadius: 14, padding: 12,
                      backgroundColor: isDark ? colors.surface : '#F8FAFC',
                      borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
                    }}>
                      {assignmentSuggestion.error ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
                          {assignmentSuggestion.error}
                        </Text>
                      ) : assignmentSuggestion.decisionType === 'blocked' ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                          {assignmentSuggestion.reason ?? 'No eligible family member found for this.'}
                        </Text>
                      ) : (
                        <>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                            {assignmentSuggestion.decisionType === 'auto' ? '✅ Would auto-assign to ' :
                             assignmentSuggestion.decisionType === 'suggest' ? '💡 Suggested: ' : '🤔 Close call — '}
                            {assignmentSuggestion.explanation.selected ?? '—'}
                          </Text>
                          {assignmentSuggestion.candidates.filter(c => !c.excluded).length > 1 && (
                            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 3 }}>
                              {assignmentSuggestion.candidates
                                .filter(c => !c.excluded)
                                .map(c => `${c.memberName} (${Math.round(c.score)})`)
                                .join(' · ')}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Difficulty */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>Difficulty <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {([
                  { key: 'easy',   label: '😊 Easy',   color: '#10B981' },
                  { key: 'medium', label: '💪 Medium',  color: BRAND.amber },
                  { key: 'hard',   label: '🔥 Hard',   color: '#EF4444' },
                  { key: 'hero',   label: '⚡ Hero',   color: BRAND.purple },
                ] as { key: QuestDifficulty; label: string; color: string }[]).map(d => (
                  <TouchableOpacity key={d.key}
                    style={[aq.diffChip, { borderColor: difficulty === d.key ? d.color : pillBdr, backgroundColor: difficulty === d.key ? d.color + '22' : pillBg }]}
                    onPress={() => setDifficulty(p => p === d.key ? '' : d.key)}>
                    <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: difficulty === d.key ? d.color : colors.textTertiary }}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Due Date & Time */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>Due Date & Time</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <TouchableOpacity style={[aq.datePill, { backgroundColor: showDatePick ? BRAND.purple + '20' : pillBg, borderColor: showDatePick ? BRAND.purple : pillBdr }]}
                  onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}>
                  <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>📅</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showDatePick ? BRAND.purple : colors.textPrimary }}>{fmtDateLabel(dueDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[aq.datePill, { backgroundColor: showTimePick ? BRAND.purple + '20' : pillBg, borderColor: showTimePick ? BRAND.purple : pillBdr }]}
                  onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}>
                  <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>🕐</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showTimePick ? BRAND.purple : colors.textPrimary }}>{fmtTimeLabel(dueDate)}</Text>
                </TouchableOpacity>
              </View>
              {(showDatePick || showTimePick) && (
                <Modal transparent animationType="fade" visible onRequestClose={() => { setShowDatePick(false); setShowTimePick(false); }}>
                  <TouchableOpacity style={aq.pickerOverlay} activeOpacity={1} onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                    <TouchableOpacity activeOpacity={1} style={[aq.pickerCard, { backgroundColor: colors.card }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>{showDatePick ? '📅 Pick a Date' : '🕐 Pick a Time'}</Text>
                        <TouchableOpacity onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                          <Text style={{ color: BRAND.purple, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      {showDatePick && <DateTimePicker value={dueDate} mode="date" display="spinner" minimumDate={new Date()} onChange={onDateChange} textColor={colors.textPrimary} style={{ height: 180, width: '100%' }} />}
                      {showTimePick && <DateTimePicker value={dueDate} mode="time" display="spinner" is24Hour={false} onChange={onTimeChange} textColor={colors.textPrimary} style={{ height: 180, width: '100%' }} />}
                    </TouchableOpacity>
                  </TouchableOpacity>
                </Modal>
              )}

              {/* Call-style reminder — allowed even in restricted edit mode,
                  since it's not a sensitive field like title/coins. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: alertCall ? 8 : 14 }}>
                <TouchableOpacity onPress={() => setAlertCall(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name={alertCall ? 'call' : 'call-outline'} size={18} color={alertCall ? BRAND.purple : colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>Call to remind</Text>
                </TouchableOpacity>
                <Switch value={alertCall} onValueChange={setAlertCall} trackColor={{ true: BRAND.purple }} />
              </View>
              {alertCall && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  {[0, 5, 10].map(mins => (
                    <TouchableOpacity key={mins} onPress={() => setAlertCallLeadMinutes(mins)}
                      style={[aq.datePill, {
                        backgroundColor: alertCallLeadMinutes === mins ? BRAND.purple + '20' : pillBg,
                        borderColor: alertCallLeadMinutes === mins ? BRAND.purple : pillBdr,
                      }]}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: alertCallLeadMinutes === mins ? BRAND.purple : colors.textPrimary }}>
                        {mins === 0 ? 'On time' : `${mins} min before`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Repeats — always shown, even if recurrence was never
                  explicitly set (or was set by accident, e.g. a past form
                  default bug) so it's never invisible from this sheet. */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>Repeats</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                {([
                  { key: 'once',    label: 'One-time' },
                  { key: 'daily',   label: '📅 Daily' },
                  { key: 'weekly',  label: '🗓 Weekly' },
                  { key: 'monthly', label: '📆 Monthly' },
                ] as const).map(({ key, label }) => (
                  <TouchableOpacity key={key} disabled={locked}
                    onPress={() => setRoutineFreq(key)}
                    style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
                      opacity: locked && routineFreq !== key ? 0.4 : 1,
                      borderColor: routineFreq === key ? BRAND.purple : colors.border,
                      backgroundColor: routineFreq === key ? BRAND.purple + '18' : 'transparent' }}>
                    <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800',
                      color: routineFreq === key ? BRAND.purple : colors.textSecondary }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!locked && routineFreq !== (quest.recurrence ?? 'once') && (
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: -8, marginBottom: 14 }}>
                  {routineFreq === 'once'
                    ? "This turns off repeating — future occurrences won't be generated."
                    : `This chore will repeat ${routineFreq} going forward. Only future occurrences are affected — today's task stays as-is.`}
                </Text>
              )}

              {/* Adult Task toggle — always visible so locked (Adjust) mode still shows the flags */}
              {(
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 10,
                    backgroundColor: isAdultTask ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? colors.surface : '#F8FAFC'),
                    borderWidth: 1.5, borderColor: isAdultTask ? BRAND.purple : colors.border }}
                  onPress={() => { setIsAdultTask(p => !p); if (!isAdultTask) { setIsPool(false); setAssignIds([]); setInviteGrandparent(false); } }}
                  activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isAdultTask ? BRAND.purple : colors.textPrimary }}>
                      👨‍👩 Adult-Only Task
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      Hidden from kids — assignable to parents & GP
                    </Text>
                  </View>
                  <View style={{ width: 40, height: 24, borderRadius: 12,
                    backgroundColor: isAdultTask ? BRAND.purple : (isDark ? '#334155' : '#CBD5E1'),
                    justifyContent: 'center', padding: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                      alignSelf: isAdultTask ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Invite Grandparents toggle — always visible when adult task is on */}
              {isAdultTask && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 10,
                    backgroundColor: inviteGrandparent ? (isDark ? '#1a0f00' : '#FFFBEB') : (isDark ? colors.surface : '#F8FAFC'),
                    borderWidth: 1.5, borderColor: inviteGrandparent ? BRAND.amber : colors.border }}
                  onPress={() => setInviteGrandparent(p => !p)}
                  activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: inviteGrandparent ? BRAND.amber : colors.textPrimary }}>
                      {inviteGrandparent ? '👴 Grandparents included' : '👴 Invite Grandparents?'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      Grandparents can see & claim this task
                    </Text>
                  </View>
                  <View style={{ width: 40, height: 24, borderRadius: 12,
                    backgroundColor: inviteGrandparent ? BRAND.amber : (isDark ? '#334155' : '#CBD5E1'),
                    justifyContent: 'center', padding: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                      alignSelf: inviteGrandparent ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Assign To */}
              <Text style={[aq.label, { color: colors.textSecondary }]}>
                Assign To{'  '}
                <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
                  {isPool ? 'open bounty' : assignIds.length === 0 ? 'tap to select' : `${assignIds.length} selected`}
                </Text>
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ flexDirection: 'row', gap: 12, paddingRight: 4 }}>
                {/* Bounty only available for non-adult tasks */}
                {!isAdultTask && (
                  <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} onPress={() => { setIsPool(true); setAssignIds([]); }}>
                    <View style={{ position: 'relative' }}>
                      <FamilyAvatar name="Bounty" emoji="⚡" size={40} ringColor={BRAND.amber} ringWidth={isPool ? 2.5 : 1} bgColor={isPool ? BRAND.amber + '30' : pillBg} />
                      {isPool && <View style={[aq.avatarCheck, { backgroundColor: BRAND.amber }]}><Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text></View>}
                    </View>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: isPool ? BRAND.amber : colors.textTertiary }}>Bounty</Text>
                  </TouchableOpacity>
                )}
                {members.filter(m => {
                  if (isAdultTask) {
                    if (m.role === 'parent') return true;
                    if (m.role === 'senior') return inviteGrandparent; // only when GP invited
                    return false;
                  }
                  return m.role === 'kid' || m.role === 'teen' || m.role === 'parent' || m.role === 'senior';
                }).map(m => {
                  const sel = assignIds.includes(m.id) && !isPool;
                  const roleColor = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? '#0EA5E9' : '#10B981';
                  return (
                    <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 4 }}
                      onPress={() => { setIsPool(false); const next = assignIds.includes(m.id) ? assignIds.filter(id => id !== m.id) : [...assignIds, m.id]; setAssignIds(next); }}>
                      <View style={{ position: 'relative' }}>
                        <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={siblings} size={40} ringColor={roleColor} ringWidth={sel ? 2.5 : 1} bgColor={sel ? roleColor + '25' : pillBg} />
                        {sel && <View style={[aq.avatarCheck, { backgroundColor: roleColor }]}><Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text></View>}
                      </View>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? roleColor : colors.textTertiary }} numberOfLines={1}>{m.id === activeMemberId ? 'Me' : m.name.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Photo required toggle */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 14,
                  backgroundColor: photoReq ? (isDark ? '#0B2218' : '#F0FDF4') : (isDark ? colors.surface : '#F8FAFC'),
                  borderWidth: 1.5, borderColor: photoReq ? '#10B981' : colors.border }}
                onPress={() => setPhotoReq(p => !p)} activeOpacity={0.8}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: photoReq ? '#10B981' : colors.textPrimary }}>📸 Photo Required</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Kid must attach proof when submitting</Text>
                </View>
                <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: photoReq ? '#10B981' : (isDark ? '#334155' : '#CBD5E1'), justifyContent: 'center', paddingHorizontal: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: photoReq ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>

              {/* Save + Delete */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {onDelete && (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A560', backgroundColor: isDark ? '#2D1515' : '#FEF2F2' }}
                    onPress={() => {
                      if (locked) {
                        // Active quest — prompt for reason before deleting
                        Alert.prompt(
                          'Delete Active Chore',
                          `"${quest.title}" is in progress. Add a note for the assignee (required):`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: (note: string | undefined) => {
                              if (!note?.trim()) { Alert.alert('Note required', 'Please add a reason so the assignee knows why this was removed.'); return; }
                              onDelete(quest.id);
                              onClose();
                            }},
                          ],
                          'plain-text',
                        );
                      } else {
                        Alert.alert('Delete Chore', `Remove "${quest.title}"? This cannot be undone.`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => { onDelete(quest.id); onClose(); } },
                        ]);
                      }
                    }}>
                    <I.X c="#EF4444" />
                    <Text style={{ color: '#EF4444', fontSize: TYPO.micro, fontWeight: '700', marginTop: 2 }}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[aq.submitBtn, { flex: 1, backgroundColor: title.trim() ? '#059669' : colors.border, opacity: saving ? 0.6 : 1 }]}
                  onPress={save} disabled={saving || !title.trim()}>
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>Save Changes</Text>
                        <Text style={{ color: '#A7F3D0', fontSize: TYPO.label, marginTop: 2 }}>Due {fmtDateLabel(dueDate)} at {fmtTimeLabel(dueDate)}</Text>
                      </>}
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
