import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@/components/BottomSheet';
import { insertChecklistItem } from '@/lib/db/daily';
import { dateStr, Urgency, PriorityCard, URGENCY_GROUPS } from './todayTypes';
import type { Pet } from '@/lib/types';
import { TYPO } from '@/constants/theme';

interface Props {
  priorities: PriorityCard[];
  pets: Pet[];
  colors: any;
  isDark: boolean;
  petColor: (p: Pet) => string;
  stripeColor: (u: Urgency) => string;
  iconBg: (u: Urgency) => string;
  onTaskAdded: () => void;
}

export default function NeedsAttentionSection({
  priorities, pets, colors, isDark, petColor, stripeColor, iconBg, onTaskAdded,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<Urgency, boolean>>({
    critical: false, warn: false, suggest: false,
  });

  const [addOpen,    setAddOpen]    = useState(false);
  const [taskType,   setTaskType]   = useState<'task' | 'medicine'>('task');
  const [taskLabel,  setTaskLabel]  = useState('');
  const [taskPetIds, setTaskPetIds] = useState<string[]>([pets[0]?.id ?? '']);
  const [saving,     setSaving]     = useState(false);
  const today = useMemo(() => dateStr(new Date()), []);

  const toggleTaskPet = (id: string) => {
    if (taskType === 'medicine') {
      setTaskPetIds([id]);
    } else {
      setTaskPetIds(prev =>
        prev.includes(id) ? (prev.length > 1 ? prev.filter(p => p !== id) : prev) : [...prev, id]
      );
    }
  };

  const handleAddTask = async () => {
    const label = taskLabel.trim();
    if (!label || !taskPetIds.length) return;
    setSaving(true);
    try {
      await Promise.all(
        taskPetIds.map(pid =>
          insertChecklistItem({ pet_id: pid, date: today, type: taskType, label, completed: false })
        )
      );
      setTaskLabel('');
      setAddOpen(false);
      onTaskAdded();
    } catch {}
    setSaving(false);
  };

  if (priorities.length === 0) {
    return (
      <View style={s.section}>
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Needs attention</Text>
        <View style={[s.allGood, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: TYPO.hero }}>🎉</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.allGoodTitle, { color: colors.textPrimary }]}>All caught up!</Text>
            <Text style={[s.allGoodSub, { color: colors.textSecondary }]}>All babies are taken care of today</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Needs attention</Text>
        <View style={[s.badge, { backgroundColor: colors.danger + '22' }]}>
          <Text style={[s.badgeText, { color: colors.danger }]}>{priorities.length}</Text>
        </View>
      </View>

      {URGENCY_GROUPS.map(({ key, label, emoji }) => {
        const group = priorities.filter(c => c.urgency === key);
        if (!group.length) return null;
        const isCollapsed  = collapsed[key];
        const headerColor  = stripeColor(key);

        return (
          <View key={key} style={[s.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              onPress={() => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))}
              activeOpacity={0.7}
              style={[s.groupHeader, {
                borderBottomColor: isCollapsed ? 'transparent' : colors.border,
                borderBottomWidth: isCollapsed ? 0 : StyleSheet.hairlineWidth,
              }]}>
              <View style={[s.groupDot, { backgroundColor: headerColor }]} />
              <Text style={[s.groupLabel, { color: colors.textPrimary }]}>{emoji} {label}</Text>
              <View style={[s.countChip, { backgroundColor: headerColor + '22' }]}>
                <Text style={[s.countText, { color: headerColor }]}>{group.length}</Text>
              </View>
              <Ionicons
                name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                size={14} color={colors.textTertiary}
                style={{ marginLeft: 'auto' }}
              />
            </TouchableOpacity>

            {!isCollapsed && group.map((card, idx) => {
              const pet = pets.find(p => p.id === card.petId);
              const pc  = pet ? petColor(pet) : colors.primary;
              return (
                <View
                  key={card.id}
                  style={[
                    s.cardRow,
                    idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                  ]}>
                  <View style={[s.stripe, { backgroundColor: stripeColor(card.urgency) }]} />
                  <View style={[s.iconWrap, { backgroundColor: iconBg(card.urgency) }]}>
                    <Text style={{ fontSize: TYPO.subheading }}>{card.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {card.title}
                    </Text>
                    <Text style={[s.cardSub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {card.subtitle}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={card.onAction}
                    activeOpacity={0.75}
                    style={[s.actionPill, { backgroundColor: pc }]}>
                    <Text style={s.actionText}>{card.actionLabel}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        );
      })}

      <TouchableOpacity
        onPress={() => { setTaskPetIds([pets[0]?.id ?? '']); setTaskLabel(''); setAddOpen(true); }}
        activeOpacity={0.7}
        style={[s.addBtn, { borderColor: colors.border }]}>
        <Ionicons name="add-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={[s.addBtnText, { color: colors.textSecondary }]}>Add task or medication</Text>
      </TouchableOpacity>

      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add to today">
        <View style={[s.typeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {(['task', 'medicine'] as const).map(t => (
            <TouchableOpacity key={t}
              onPress={() => {
                setTaskType(t);
                if (t === 'medicine') setTaskPetIds(prev => [prev[0] ?? pets[0]?.id ?? '']);
              }}
              activeOpacity={0.7}
              style={[s.typeChip, taskType === t && { backgroundColor: colors.primary }]}>
              <Text style={[s.typeChipText, { color: taskType === t ? '#fff' : colors.textSecondary }]}>
                {t === 'task' ? '📋 Task' : '💊 Medication'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {pets.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
            {pets.map(p => {
              const pc  = (p as any).accent_color ?? colors.primary;
              const sel = taskPetIds.includes(p.id);
              return (
                <TouchableOpacity key={p.id} onPress={() => toggleTaskPet(p.id)} activeOpacity={0.7}
                  style={[s.petChip, { borderColor: sel ? pc : colors.border, backgroundColor: sel ? pc + '18' : colors.background }]}>
                  <Text style={{ fontSize: TYPO.caption }}>{(p as any).emoji ?? '🐾'}</Text>
                  <Text style={[s.petChipText, { color: sel ? pc : colors.textSecondary }]}>{p.name}</Text>
                  {taskType === 'task' && sel && <Ionicons name="checkmark" size={13} color={pc} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <TextInput
          style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
          placeholder={taskType === 'task' ? 'e.g. Evening walk, brush teeth…' : 'e.g. Apoquel 16mg, eye drops…'}
          placeholderTextColor={colors.textTertiary}
          value={taskLabel}
          onChangeText={setTaskLabel}
          returnKeyType="done"
          onSubmitEditing={handleAddTask}
          maxLength={80}
          autoFocus
        />

        <View style={s.sheetActions}>
          <TouchableOpacity onPress={() => setAddOpen(false)} activeOpacity={0.7}
            style={[s.cancelBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: TYPO.body }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleAddTask} activeOpacity={0.7}
            disabled={saving || !taskLabel.trim()}
            style={[s.saveBtn, { backgroundColor: taskLabel.trim() ? colors.primary : colors.border }]}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Add</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  section:      { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel:  { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  badge:        { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText:    { fontSize: TYPO.label, fontWeight: '800' },
  allGood:      { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  allGoodTitle: { fontSize: TYPO.body, fontWeight: '700' },
  allGoodSub:   { fontSize: TYPO.caption, marginTop: 2 },
  group:        { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 10 },
  groupHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  groupDot:     { width: 8, height: 8, borderRadius: 4 },
  groupLabel:   { fontSize: TYPO.caption, fontWeight: '700' },
  countChip:    { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  countText:    { fontSize: TYPO.label, fontWeight: '800' },
  cardRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 12, paddingVertical: 11 },
  stripe:       { width: 3, alignSelf: 'stretch' },
  iconWrap:     { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginLeft: 8, flexShrink: 0 },
  cardTitle:    { fontSize: TYPO.caption, fontWeight: '700', letterSpacing: -0.1 },
  cardSub:      { fontSize: TYPO.caption, marginTop: 1 },
  actionPill:   { borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7, flexShrink: 0 },
  actionText:   { fontSize: TYPO.label, fontWeight: '800', color: '#fff' },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 6, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  addBtnText:   { fontSize: TYPO.caption, fontWeight: '600' },
  typeRow:      { flexDirection: 'row', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 14 },
  typeChip:     { flex: 1, alignItems: 'center', paddingVertical: 10 },
  typeChipText: { fontSize: TYPO.body, fontWeight: '700' },
  petChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  petChipText:  { fontSize: TYPO.caption, fontWeight: '600' },
  input:        { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: TYPO.body, marginBottom: 16, marginTop: 12 },
  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  saveBtn:      { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14 },
});
