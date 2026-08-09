import React, { memo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback,
  KeyboardAvoidingView, Platform, ScrollView, TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_CONFIG } from '@/lib/db/expenses';
import { s } from './expensesStyles';
import type { ScannedItem } from './expensesUtils';
import { TYPO } from '@/constants/theme';

interface Pet { id: string; name: string; [key: string]: any; }

interface Props {
  visible: boolean;
  scannedItems: ScannedItem[];
  setScannedItems: React.Dispatch<React.SetStateAction<ScannedItem[]>>;
  scanMerchant: string | null;
  scanDate: string | null;
  pets: Pet[];
  accent: string;
  colors: any;
  savingAll: boolean;
  onClose: () => void;
  onSave: () => void;
}

const ReceiptReviewSheet = memo(function ReceiptReviewSheet({
  visible, scannedItems, setScannedItems, scanMerchant, scanDate,
  pets, accent, colors, savingAll, onClose, onSave,
}: Props) {
  const cfg = EXPENSE_CATEGORY_CONFIG;
  const keepCount = scannedItems.filter(i => i.keep).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFillObject} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        {visible && <View style={[s.sheet, { backgroundColor: colors.surface ?? colors.card, maxHeight: '90%' }]}>
          {/* Handle */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>
                {scanMerchant ? `📄 ${scanMerchant}` : '📄 Receipt Items'}
              </Text>
              {scanDate && (
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 3 }}>
                  {format(parseISO(scanDate), 'MMMM d, yyyy')} · {keepCount} items selected
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Items list */}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
            {scannedItems.map((item, idx) => {
              const c = cfg[item.category];
              return (
                <View key={item.id} style={{
                  borderRadius: 14, borderWidth: 1.5,
                  borderColor: item.keep ? c.color + '55' : colors.border,
                  backgroundColor: item.keep ? c.color + '08' : colors.background,
                  padding: 12, gap: 10,
                  opacity: item.keep ? 1 : 0.45,
                }}>
                  {/* Row 1: toggle + emoji + description + amount */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setScannedItems(prev => prev.map((it, i) => i === idx ? { ...it, keep: !it.keep } : it))}
                      style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2,
                        borderColor: item.keep ? c.color : colors.border,
                        backgroundColor: item.keep ? c.color : 'transparent',
                        alignItems: 'center', justifyContent: 'center' }}>
                      {item.keep && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </TouchableOpacity>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: TYPO.heading }}>{c.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }} numberOfLines={2}>
                        {item.description}
                      </Text>
                      {item.confidence === 'low' && (
                        <Text style={{ fontSize: TYPO.label, color: colors.warning ?? '#F59E0B', fontWeight: '600', marginTop: 2 }}>
                          ⚠ Low confidence — please verify
                        </Text>
                      )}
                    </View>
                    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>$</Text>
                      <TextInput
                        style={{ fontSize: TYPO.subheading, fontWeight: '800', color: c.color, minWidth: 50, textAlign: 'right' }}
                        value={item.amount}
                        onChangeText={v => setScannedItems(prev => prev.map((it, i) => i === idx ? { ...it, amount: v.replace(/[^0-9.]/g, '') } : it))}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    </View>
                  </View>

                  {/* Row 2: category selector */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
                      contentContainerStyle={{ gap: 6, flexDirection: 'row' }}>
                      {EXPENSE_CATEGORIES.map(cat => {
                        const cc = cfg[cat];
                        const sel = item.category === cat;
                        return (
                          <TouchableOpacity key={cat}
                            onPress={() => setScannedItems(prev => prev.map((it, i) => i === idx ? { ...it, category: cat } : it))}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                              paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14, borderWidth: 1.5,
                              borderColor: sel ? cc.color : colors.border,
                              backgroundColor: sel ? cc.color + '18' : 'transparent' }}>
                            <Text style={{ fontSize: TYPO.caption }}>{cc.emoji}</Text>
                            {sel && <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: cc.color }}>{cc.label}</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Row 3: pet selector (if multiple pets) */}
                  {pets.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 6, flexDirection: 'row' }}>
                      {pets.map(p => {
                        const sel = item.petId === p.id;
                        const pa = p.accent_color ?? accent;
                        return (
                          <TouchableOpacity key={p.id}
                            onPress={() => setScannedItems(prev => prev.map((it, i) => i === idx ? { ...it, petId: p.id } : it))}
                            style={[s.petChip, { borderColor: sel ? pa : colors.border, backgroundColor: sel ? pa + '18' : colors.card }]}>
                            <Text style={{ fontSize: TYPO.caption }}>{p.emoji ?? '🐾'}</Text>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: sel ? pa : colors.textSecondary }}>{p.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 8 }}>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: keepCount > 0 ? accent : colors.border }]}
              onPress={onSave}
              disabled={savingAll || keepCount === 0}>
              {savingAll
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>
                    Save {keepCount} expense{keepCount !== 1 ? 's' : ''}
                  </Text>}
            </TouchableOpacity>
          </View>
        </View>}
      </KeyboardAvoidingView>
    </Modal>
  );
});

export default ReceiptReviewSheet;
