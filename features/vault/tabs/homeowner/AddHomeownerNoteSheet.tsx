/**
 * AddHomeownerNoteSheet — add a maintenance reminder or free-form note.
 * Two entry points: pick from MAINTENANCE_PRESETS (auto-fills title,
 * category, and a sensible recurrence) or type a fully custom entry
 * [live-requested: "I want all possible maintenance add as many as
 * possible"] — presets are a starting point, everything stays editable.
 */
import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { X, Search, ChevronDown, ChevronUp } from 'lucide-react-native';
import { ScanDateField } from '../health/ScanDateField';
import { fmtDate } from '../health/types';
import { MAINTENANCE_PRESETS, CATEGORY_LABEL, CATEGORY_EMOJI } from './maintenancePresets';
import type { HomeownerNoteCategory, HomeownerNotePriority } from '@/store/homeownerNotesStore';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';

const CATEGORIES: HomeownerNoteCategory[] = ['general', 'hvac', 'plumbing', 'electrical', 'appliance', 'exterior', 'safety', 'warranty'];
const PRIORITIES: HomeownerNotePriority[] = ['low', 'normal', 'high'];
const PRIORITY_LABEL: Record<HomeownerNotePriority, string> = { low: 'Low', normal: 'Normal', high: 'High' };

export function AddHomeownerNoteSheet({ visible, colors, isDark, onClose, onSave }: {
  visible: boolean; colors: any; isDark: boolean;
  onClose: () => void;
  onSave: (params: {
    title: string; notes?: string; category: HomeownerNoteCategory; dueDate?: string; recurEveryDays?: number;
    serialNumber?: string; purchaseDate?: string; warrantyExpiresDate?: string;
    vendorName?: string; vendorPhone?: string; vendorNotes?: string;
    costCents?: number; priority?: HomeownerNotePriority; room?: string;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');
  const [presetSearch, setPresetSearch] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<HomeownerNoteCategory>('general');
  const [dueDate, setDueDate] = useState<string | null>(fmtDate(new Date()));
  const [recurDays, setRecurDays] = useState('');
  const [priority, setPriority] = useState<HomeownerNotePriority>('normal');
  const [room, setRoom] = useState('');
  // Was a plain `saving` state — a fast double-tap on "Save" could fire
  // onSave twice, creating a duplicate homeowner note [live-requested
  // app-wide: "We should avoid double tab submit for all the app wide"].
  const { submitting: saving, guard } = useSubmitGuard();

  const [showMore, setShowMore] = useState(false);
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [warrantyExpiresDate, setWarrantyExpiresDate] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorNotes, setVendorNotes] = useState('');
  const [cost, setCost] = useState('');

  const reset = () => {
    setMode('presets'); setPresetSearch(''); setTitle(''); setNotes('');
    setCategory('general'); setDueDate(fmtDate(new Date())); setRecurDays('');
    setPriority('normal'); setRoom(''); setShowMore(false);
    setSerialNumber(''); setPurchaseDate(null); setWarrantyExpiresDate(null);
    setVendorName(''); setVendorPhone(''); setVendorNotes(''); setCost('');
  };

  const close = () => { reset(); onClose(); };

  const pickPreset = (preset: typeof MAINTENANCE_PRESETS[number]) => {
    setTitle(preset.title);
    setCategory(preset.category);
    setRecurDays(preset.suggestedIntervalDays ? String(preset.suggestedIntervalDays) : '');
    setMode('custom');
  };

  const filteredPresets = presetSearch.trim()
    ? MAINTENANCE_PRESETS.filter(p => p.title.toLowerCase().includes(presetSearch.trim().toLowerCase()))
    : MAINTENANCE_PRESETS;

  const grouped = CATEGORIES.map(cat => ({
    category: cat,
    items: filteredPresets.filter(p => p.category === cat),
  })).filter(g => g.items.length > 0);

  const save = guard(async () => {
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      notes: notes.trim() || undefined,
      category,
      dueDate: dueDate ?? undefined,
      recurEveryDays: recurDays ? parseInt(recurDays, 10) : undefined,
      serialNumber: serialNumber.trim() || undefined,
      purchaseDate: purchaseDate ?? undefined,
      warrantyExpiresDate: warrantyExpiresDate ?? undefined,
      vendorName: vendorName.trim() || undefined,
      vendorPhone: vendorPhone.trim() || undefined,
      vendorNotes: vendorNotes.trim() || undefined,
      costCents: cost ? Math.round(parseFloat(cost) * 100) : undefined,
      priority,
      room: room.trim() || undefined,
    });
    close();
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={close} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>
            {mode === 'presets' ? 'Add maintenance' : 'Details'}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {mode === 'presets' ? (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card }}>
                <Search size={16} color={colors.textTertiary} />
                <TextInput
                  value={presetSearch}
                  onChangeText={setPresetSearch}
                  placeholder="Search maintenance tasks..."
                  placeholderTextColor={colors.textTertiary}
                  style={{ flex: 1, fontSize: 14, color: colors.textPrimary }}
                />
              </View>
              <TouchableOpacity
                onPress={() => { setTitle(''); setCategory('general'); setRecurDays(''); setMode('custom'); }}
                style={{ marginTop: 10, alignSelf: 'flex-start' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>+ Write a custom entry instead</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
              {grouped.map(g => (
                <View key={g.category} style={{ marginBottom: 18 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary,
                    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    {CATEGORY_EMOJI[g.category]} {CATEGORY_LABEL[g.category]}
                  </Text>
                  {g.items.map(preset => (
                    <TouchableOpacity
                      key={preset.title}
                      onPress={() => pickPreset(preset)}
                      style={{
                        borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                        backgroundColor: colors.card, padding: 12, marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{preset.title}</Text>
                      {preset.suggestedIntervalDays && (
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                          Suggested: every {preset.suggestedIntervalDays} days
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              {grouped.length === 0 && (
                <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 24 }}>
                  No matches — try a custom entry instead.
                </Text>
              )}
            </ScrollView>
          </>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}>
              <TouchableOpacity onPress={() => setMode('presets')}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>← Back to suggestions</Text>
              </TouchableOpacity>

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>TITLE</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Replace HVAC air filter"
                  placeholderTextColor={colors.textTertiary}
                  style={{
                    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                    paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                    backgroundColor: colors.card,
                  }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 6, letterSpacing: 0.4 }}>CATEGORY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {CATEGORIES.map(cat => {
                    const active = category === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setCategory(cat)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          borderRadius: 99, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary + '18' : colors.card,
                        }}
                      >
                        <Text style={{ fontSize: 14 }}>{CATEGORY_EMOJI[cat]}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colors.primary : colors.textSecondary }}>
                          {CATEGORY_LABEL[cat]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <ScanDateField label="Due date" value={dueDate} onChange={setDueDate} colors={colors} isDark={isDark} accent={colors.primary} />

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>REPEAT EVERY (DAYS, OPTIONAL)</Text>
                <TextInput
                  value={recurDays}
                  onChangeText={setRecurDays}
                  keyboardType="number-pad"
                  placeholder="e.g. 90"
                  placeholderTextColor={colors.textTertiary}
                  style={{
                    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                    paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                    backgroundColor: colors.card,
                  }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 6, letterSpacing: 0.4 }}>PRIORITY</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {PRIORITIES.map(p => {
                    const isActive = priority === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setPriority(p)}
                        style={{
                          flex: 1, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, paddingVertical: 8,
                          borderColor: isActive ? colors.primary : colors.border,
                          backgroundColor: isActive ? colors.primary + '18' : colors.card,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isActive ? colors.primary : colors.textSecondary }}>
                          {PRIORITY_LABEL[p]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>ROOM / AREA (OPTIONAL)</Text>
                <TextInput
                  value={room}
                  onChangeText={setRoom}
                  placeholder="e.g. Kitchen, Garage, Basement"
                  placeholderTextColor={colors.textTertiary}
                  style={{
                    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                    paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                    backgroundColor: colors.card,
                  }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>NOTES (OPTIONAL)</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Filter size, brand, anything worth remembering..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                  style={{
                    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                    paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                    backgroundColor: colors.card, minHeight: 80, textAlignVertical: 'top',
                  }}
                />
              </View>

              <TouchableOpacity
                onPress={() => setShowMore(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                {showMore ? <ChevronUp size={16} color={colors.primary} /> : <ChevronDown size={16} color={colors.primary} />}
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                  {showMore ? 'Hide' : 'Add'} serial number, warranty, contractor info
                </Text>
              </TouchableOpacity>

              {showMore && (
                <>
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>SERIAL / MODEL NUMBER</Text>
                    <TextInput
                      value={serialNumber}
                      onChangeText={setSerialNumber}
                      placeholder="e.g. WH-4500-SN12345"
                      placeholderTextColor={colors.textTertiary}
                      style={{
                        borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                        paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                        backgroundColor: colors.card,
                      }}
                    />
                  </View>

                  <ScanDateField label="Purchase / install date" value={purchaseDate} onChange={setPurchaseDate} colors={colors} isDark={isDark} accent={colors.primary} />
                  <ScanDateField label="Warranty expires" value={warrantyExpiresDate} onChange={setWarrantyExpiresDate} colors={colors} isDark={isDark} accent={colors.primary} />

                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>COST</Text>
                    <TextInput
                      value={cost}
                      onChangeText={setCost}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 249.99"
                      placeholderTextColor={colors.textTertiary}
                      style={{
                        borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                        paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                        backgroundColor: colors.card,
                      }}
                    />
                  </View>

                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>CONTRACTOR / COMPANY NAME</Text>
                    <TextInput
                      value={vendorName}
                      onChangeText={setVendorName}
                      placeholder="e.g. ABC HVAC Co. or Mike the plumber"
                      placeholderTextColor={colors.textTertiary}
                      style={{
                        borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                        paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                        backgroundColor: colors.card,
                      }}
                    />
                  </View>

                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>CONTRACTOR PHONE</Text>
                    <TextInput
                      value={vendorPhone}
                      onChangeText={setVendorPhone}
                      keyboardType="phone-pad"
                      placeholder="e.g. (555) 123-4567"
                      placeholderTextColor={colors.textTertiary}
                      style={{
                        borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                        paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                        backgroundColor: colors.card,
                      }}
                    />
                  </View>

                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>CONTRACTOR NOTES</Text>
                    <TextInput
                      value={vendorNotes}
                      onChangeText={setVendorNotes}
                      placeholder="e.g. Ask for Mike, does our AC every year"
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      numberOfLines={2}
                      style={{
                        borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
                        paddingHorizontal: 14, paddingVertical: 11, color: colors.textPrimary, fontSize: 15,
                        backgroundColor: colors.card, minHeight: 60, textAlignVertical: 'top',
                      }}
                    />
                  </View>
                </>
              )}

              <TouchableOpacity
                onPress={save}
                disabled={!title.trim() || saving}
                style={{
                  backgroundColor: !title.trim() ? colors.border : colors.primary,
                  borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 6,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}
