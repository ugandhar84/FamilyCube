import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { EXPENSE_CATEGORY_CONFIG, type ExpenseCategory, type PetExpense } from '@/lib/db/expenses';
import { s } from './expensesStyles';
import { TYPO } from '@/constants/theme';

interface Pet { id: string; name: string; [key: string]: any; }

interface Props {
  visibleEntries: PetExpense[];
  selectedCategory: ExpenseCategory | null;
  colors: any;
  selectedPetId: string | null;
  petForEntry: (pid: string) => Pet | undefined;
  accent: string;
  onEdit: (e: PetExpense) => void;
  onDelete: (id: string, label: string) => void;
}

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d))     return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, MMM d');
}

const ExpenseEntryList = memo(function ExpenseEntryList({
  visibleEntries, selectedCategory, colors, selectedPetId, petForEntry, accent, onEdit, onDelete,
}: Props) {
  if (visibleEntries.length === 0) return null;
  const cfg = EXPENSE_CATEGORY_CONFIG;

  // Group entries by date, newest first
  const groups = useMemo(() => {
    const map = new Map<string, PetExpense[]>();
    [...visibleEntries]
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
      .forEach(e => {
        const key = e.expense_date.slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(e);
      });
    return [...map.entries()];
  }, [visibleEntries]);

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={[s.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
          {selectedCategory
            ? `${cfg[selectedCategory].emoji} ${cfg[selectedCategory].label.toUpperCase()}`
            : 'ALL EXPENSES'}
        </Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>
          {visibleEntries.length} · ${visibleEntries.reduce((sum, e) => sum + Number(e.amount), 0).toFixed(2)}
        </Text>
      </View>

      {groups.map(([dateKey, entries]) => {
        const dayTotal = entries.reduce((sum, e) => sum + Number(e.amount), 0);
        return (
          <View key={dateKey} style={{ marginBottom: 12 }}>
            {/* Day header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {dayLabel(dateKey)}
              </Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                ${dayTotal.toFixed(2)}
              </Text>
            </View>
            {/* Entries card */}
            <View style={[s.card, { backgroundColor: colors.card }]}>
              {entries.map((e, i) => {
                const c = cfg[e.category];
                const p = !selectedPetId ? petForEntry(e.pet_id) : null;
                return (
                  <TouchableOpacity key={e.id}
                    style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                    onPress={() => onEdit(e)} onLongPress={() => onDelete(e.id, c.label)} activeOpacity={0.75}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: TYPO.heading }}>{c.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: TYPO.subheading, fontWeight: '600', color: colors.textPrimary }}>{c.label}</Text>
                      {p && <Text style={{ fontSize: TYPO.caption, color: p.accent_color ?? accent, fontWeight: '600', marginTop: 1 }}>{p.emoji ?? '🐾'} {p.name}</Text>}
                      {e.notes ? <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>{e.notes}</Text> : null}
                    </View>
                    <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: c.color }}>${Number(e.amount).toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
});

export default ExpenseEntryList;
