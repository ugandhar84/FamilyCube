import React, { memo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_CONFIG, type ExpenseCategory } from '@/lib/db/expenses';
import { s } from './expensesStyles';
import { TYPO } from '@/constants/theme';

interface Props {
  categoryTotals: Partial<Record<ExpenseCategory, number>>;
  colors: any;
  onAdd: (cat: ExpenseCategory) => void;
}

const ExpenseQuickLog = memo(function ExpenseQuickLog({ categoryTotals, colors, onAdd }: Props) {
  const cfg = EXPENSE_CATEGORY_CONFIG;
  // Split into two rows of ~6 each for a compact horizontal scroll grid
  const row1 = EXPENSE_CATEGORIES.slice(0, Math.ceil(EXPENSE_CATEGORIES.length / 2));
  const row2 = EXPENSE_CATEGORIES.slice(Math.ceil(EXPENSE_CATEGORIES.length / 2));

  const renderChip = (cat: ExpenseCategory) => {
    const c = cfg[cat];
    const total = categoryTotals[cat];
    return (
      <TouchableOpacity
        key={cat}
        onPress={() => onAdd(cat)}
        activeOpacity={0.75}
        style={{
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: total ? c.color + '66' : colors.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 4,
          minWidth: 76,
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.color + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>{c.emoji}</Text>
        </View>
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' }} numberOfLines={1}>
          {c.label}
        </Text>
        <Text style={{ fontSize: 11, fontWeight: '800', color: total ? c.color : (colors.textTertiary ?? colors.textSecondary) }}>
          {total ? `$${total.toFixed(0)}` : '—'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ paddingTop: 20 }}>
      <Text style={[s.sectionLabel, { color: colors.textSecondary, paddingHorizontal: 16, marginBottom: 10 }]}>
        LOG EXPENSE
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {row1.map(renderChip)}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {row2.map(renderChip)}
          </View>
        </View>
      </ScrollView>
    </View>
  );
});

export default ExpenseQuickLog;
