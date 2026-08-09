/**
 * WeightWidget / WeightSheet — weight tracking UI for the Health screen.
 *
 * `WeightWidget` shows the current weight, a delta vs the previous reading,
 * an all-time delta, and a trend sparkline bar chart for the last 12 entries.
 * Automatically converts between kg and lb based on the user's locale preference.
 * Shows an EmptyCard when no logs exist.
 *
 * `WeightSheet` is a bottom-sheet modal for adding or editing a weight entry.
 * Supports unit switching (kg ↔ lb) with live value conversion, a date picker,
 * and optional notes. Uses AppDateTimePicker for cross-platform date selection.
 *
 * Both components are memoized.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput,
  ActivityIndicator, Platform, ScrollView, Keyboard,
  TouchableWithoutFeedback, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { usesImperial } from '@/lib/units';
import { logWeight } from '@/lib/db';
import { updateWeightLog, type WeightLog } from '@/lib/db/weight';
import { useAuthStore } from '@/store/authStore';
import { showAlert } from '@/components/AppAlert';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { EmptyCard, FieldLabel } from '@/features/health/components/EmptyCard';
import { TYPO } from '@/constants/theme';

// ─── Shared sheet styles (no color deps — colors applied inline) ───────────────
const ss = StyleSheet.create({
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 24, maxHeight: '92%' },
  sheetHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle:  { fontSize: TYPO.heading, fontWeight: '800' },
  dateBtn:     { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtnText: { fontSize: TYPO.body, flex: 1 },
  input:       { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: TYPO.body },
  modalBtns:   { flexDirection: 'row', gap: 10, marginTop: 22 },
  cancelBtn:   { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelText:  { fontSize: TYPO.body },
  saveBtn:     { flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText:    { fontSize: TYPO.body, color: '#fff', fontWeight: '700' },
});

// ─── WeightWidget ─────────────────────────────────────────────────────────────

interface WeightWidgetProps {
  /** Weight log entries ordered newest-first; up to 12 are used for the sparkline. */
  weights: WeightLog[];
  /** Pet accent colour used for sparkline bars and the "View all" link. */
  accent: string;
  /** Theme colour tokens. */
  colors: any;
  /** Called when the user wants to add a new entry. */
  onAdd: () => void;
  /** Called when the user selects an existing entry to edit. */
  onEdit: (w: WeightLog) => void;
  /** Called when the user confirms deletion of an entry by id. */
  onDelete: (id: string) => void;
}

export const WeightWidget = React.memo(function WeightWidget({
  weights, accent, colors, onAdd, onEdit, onDelete,
}: WeightWidgetProps) {
  const imperial = usesImperial();
  const toDisplay = (kg: number) => imperial ? +(kg * 2.20462).toFixed(1) : +kg.toFixed(2);
  const unitLabel = imperial ? 'lb' : 'kg';

  if (weights.length === 0) {
    return (
      <EmptyCard
        icon="scale-outline"
        label="No weight logs yet"
        addLabel="Weight Log"
        onPress={onAdd}
        colors={colors}
      />
    );
  }

  const chartData = [...weights].reverse().slice(-12);
  const vals = chartData.map(w => toDisplay(w.weight_kg));
  const maxV = Math.max(...vals);
  const minV = Math.min(...vals);
  const range = maxV - minV || 0.1;
  const CHART_H = 60;

  const latest = weights[0];
  const prev   = weights[1];
  const oldest = weights[weights.length - 1];

  const GAIN_COLOR = colors.success;
  const LOSS_COLOR = colors.danger;
  const SAME_COLOR = colors.textDisabled;

  const deltaPrev    = prev ? +(toDisplay(latest.weight_kg) - toDisplay(prev.weight_kg)).toFixed(1) : null;
  const deltaPrevStr = deltaPrev == null ? null : (deltaPrev > 0 ? `+${deltaPrev}` : `${deltaPrev}`);
  const deltaPrevCol = deltaPrev == null ? SAME_COLOR : deltaPrev > 0 ? GAIN_COLOR : deltaPrev < 0 ? LOSS_COLOR : SAME_COLOR;

  const deltaAll    = weights.length >= 3 && oldest.id !== latest.id
    ? +(toDisplay(latest.weight_kg) - toDisplay(oldest.weight_kg)).toFixed(1) : null;
  const deltaAllStr = deltaAll == null ? null : (deltaAll > 0 ? `+${deltaAll}` : `${deltaAll}`);
  const deltaAllCol = deltaAll == null ? SAME_COLOR : deltaAll > 0 ? GAIN_COLOR : deltaAll < 0 ? LOSS_COLOR : SAME_COLOR;

  const delta    = deltaPrev;
  const deltaStr = deltaPrevStr;
  const deltaCol = deltaPrevCol;

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>

      {/* Hero row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 16, gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 4 }}>
            CURRENT WEIGHT
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={{ fontSize: TYPO.hero, fontWeight: '800', color: colors.textPrimary }}>
              {toDisplay(latest.weight_kg)}
            </Text>
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>{unitLabel}</Text>
          </View>
          {deltaStr && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Ionicons
                name={delta! > 0 ? 'trending-up' : delta! < 0 ? 'trending-down' : 'remove-outline'}
                size={14} color={deltaCol} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: deltaCol }}>
                {deltaStr} {unitLabel} vs last reading
              </Text>
            </View>
          )}
          {deltaAllStr && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons
                name={deltaAll! > 0 ? 'trending-up' : deltaAll! < 0 ? 'trending-down' : 'remove-outline'}
                size={12} color={deltaAllCol} />
              <Text style={{ fontSize: TYPO.body, color: deltaAllCol }}>
                {deltaAllStr} {unitLabel} all-time
              </Text>
            </View>
          )}
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>
            {(() => { try { return format(parseISO(latest.logged_at), 'MMM d, yyyy'); } catch { return ''; } })()}
          </Text>
        </View>

        {/* Trend sparkline */}
        {chartData.length >= 2 && (
          <View style={{ width: 120, height: CHART_H + 14, position: 'relative' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: CHART_H / 2,
              height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, gap: 2 }}>
              {vals.map((v, i) => {
                const barH = Math.max(6, ((v - minV) / range) * (CHART_H - 8) + 4);
                const isLast = i === vals.length - 1;
                const diff = i === 0 ? 0 : v - vals[i - 1];
                const barColor = isLast
                  ? (diff > 0 ? GAIN_COLOR : diff < 0 ? LOSS_COLOR : accent)
                  : diff > 0 ? GAIN_COLOR + '90' : diff < 0 ? LOSS_COLOR + '90' : SAME_COLOR + '60';
                return (
                  <View key={i} style={{ flex: 1, height: barH, borderRadius: 3, backgroundColor: barColor }} />
                );
              })}
            </View>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 4, textAlign: 'center' }}>
              last {chartData.length} readings
            </Text>
          </View>
        )}
      </View>

      {/* View all link */}
      <TouchableOpacity
        onPress={() => router.push('/health/weights' as any)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
        <Ionicons name="list-outline" size={14} color={accent} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: accent }}>
          View all {weights.length} {weights.length === 1 ? 'entry' : 'entries'} →
        </Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── WeightSheet ──────────────────────────────────────────────────────────────

interface WeightSheetProps {
  /** Controls sheet visibility. */
  visible: boolean;
  /** Pet UUID to associate the new log entry with — null prevents saving. */
  petId: string | null;
  /** Pet accent colour for header icon and save button. */
  accent: string;
  /** Theme colour tokens. */
  colors: any;
  /** True in dark mode — drives sheet background selection. */
  isDark: boolean;
  /** When non-null, pre-fills the form for editing an existing entry. */
  editEntry: WeightLog | null;
  /** Called when the sheet is dismissed without saving. */
  onClose: () => void;
  /** Called after a successful save or update — parent re-fetches weight logs. */
  onSaved: () => void;
}

export const WeightSheet = React.memo(function WeightSheet({
  visible, petId, accent, colors, isDark, editEntry, onClose, onSaved,
}: WeightSheetProps) {
  const imperial = usesImperial();
  const defaultUnit: 'kg' | 'lb' = imperial ? 'lb' : 'kg';

  const [val,        setVal]        = useState('');
  const [unit,       setUnit]       = useState<'kg' | 'lb'>(defaultUnit);
  const [notes,      setNotes]      = useState('');
  const [logDate,    setLogDate]    = useState(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTmp,  setPickerTmp]  = useState(new Date());
  const [saving,     setSaving]     = useState(false);

  const isEdit = !!editEntry;

  useEffect(() => {
    if (!visible) return;
    const u = imperial ? 'lb' : 'kg';
    setUnit(u);
    if (editEntry) {
      const displayed = u === 'lb' ? +(editEntry.weight_kg * 2.20462).toFixed(1) : +editEntry.weight_kg.toFixed(2);
      setVal(String(displayed));
      setNotes(editEntry.notes ?? '');
      try { setLogDate(parseISO(editEntry.logged_at)); } catch { setLogDate(new Date()); }
    } else {
      setVal('');
      setNotes('');
      setLogDate(new Date());
    }
  }, [visible, editEntry]);

  const save = async () => {
    const n = parseFloat(val.replace(',', '.'));
    if (!petId || isNaN(n) || n <= 0) {
      showAlert('Invalid weight', 'Enter a valid number greater than 0.');
      return;
    }
    const kg = parseFloat((unit === 'lb' ? n / 2.20462 : n).toFixed(3));
    setSaving(true);
    try {
      const userId = useAuthStore.getState().user?.id;
      if (isEdit && editEntry) {
        await updateWeightLog(editEntry.id, kg, logDate.toISOString(), notes.trim() || null);
      } else {
        await logWeight(petId, kg, userId ?? undefined, notes.trim() || null, logDate.toISOString());
      }
      onSaved();
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}>

        <TouchableWithoutFeedback onPress={dismiss}>
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' }} />
        </TouchableWithoutFeedback>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[ss.sheet, { backgroundColor: colors.surface }]}>

            {/* Drag handle */}
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>

            {/* Header */}
            <View style={ss.sheetHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="scale-outline" size={16} color={accent} />
                </View>
                <Text style={[ss.sheetTitle, { color: colors.textPrimary }]}>
                  {isEdit ? 'Edit Weight' : 'Log Weight'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Fields */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}>

              {/* Unit toggle */}
              <FieldLabel label="Unit" colors={colors} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['kg', 'lb'] as const).map(u => {
                  const sel = unit === u;
                  return (
                    <TouchableOpacity key={u}
                      onPress={() => {
                        const n = parseFloat(val.replace(',', '.'));
                        if (!isNaN(n) && n > 0) {
                          const cv = u === 'lb' ? +(n * 2.20462).toFixed(1) : +(n / 2.20462).toFixed(2);
                          setVal(String(cv));
                        }
                        setUnit(u);
                      }}
                      style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5,
                        borderColor: sel ? accent : colors.inputBorder,
                        backgroundColor: sel ? accent + '12' : colors.inputBg,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: sel ? accent : colors.textSecondary }}>
                        {u.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Weight input */}
              <FieldLabel label="Weight *" colors={colors} />
              <TextInput
                style={[ss.input, { height: 72, fontSize: 36, textAlign: 'center', fontWeight: '800',
                  color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                placeholder="0.0"
                placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
                value={val}
                onChangeText={setVal}
                returnKeyType="done"
              />
              <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: TYPO.body, marginTop: 4 }}>
                {unit === 'lb' ? 'pounds (lb)' : 'kilograms (kg)'}
              </Text>

              {/* Date */}
              <FieldLabel label="Date" colors={colors} />
              <TouchableOpacity
                style={[ss.dateBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                onPress={() => { setPickerTmp(logDate); setPickerOpen(v => !v); }}>
                <Ionicons name="calendar-outline" size={14} color={accent} />
                <Text style={[ss.dateBtnText, { color: colors.textPrimary }]}>
                  {format(logDate, 'MMMM d, yyyy')}
                </Text>
              </TouchableOpacity>
              <AppDateTimePicker
                visible={pickerOpen}
                value={pickerTmp}
                mode="date"
                maximumDate={new Date()}
                accent={accent}
                onCancel={() => setPickerOpen(false)}
                onConfirm={(d) => { setLogDate(d); setPickerOpen(false); }}
              />

              {/* Notes */}
              <FieldLabel label="Notes (optional)" colors={colors} />
              <TextInput
                style={[ss.input, { height: 70, paddingTop: 12, textAlignVertical: 'top',
                  color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                multiline
                placeholder="e.g. after vet visit, fasted weight…"
                placeholderTextColor={colors.placeholder}
                value={notes}
                onChangeText={setNotes}
              />
            </ScrollView>

            {/* Actions */}
            <View style={[ss.modalBtns, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 }]}>
              <TouchableOpacity style={[ss.cancelBtn, { borderColor: colors.border }]} onPress={dismiss}>
                <Text style={[ss.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ss.saveBtn, { backgroundColor: accent, opacity: (saving || !val.trim()) ? 0.5 : 1 }]}
                onPress={save} disabled={saving || !val.trim()}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={ss.saveText}>{isEdit ? 'Update' : 'Save'}</Text>}
              </TouchableOpacity>
            </View>

          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
});
