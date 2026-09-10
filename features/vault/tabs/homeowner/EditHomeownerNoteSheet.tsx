/**
 * EditHomeownerNoteSheet — edit an existing maintenance note/reminder.
 * Free-text title/notes throughout, native date picker for due date, same
 * visual language as AddHomeownerNoteSheet's custom-entry form.
 */
import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { X, ChevronDown, ChevronUp } from 'lucide-react-native';
import { ScanDateField } from '../health/ScanDateField';
import { CATEGORY_LABEL, CATEGORY_EMOJI } from './maintenancePresets';
import { useHomeownerNotesStore, type HomeownerNote, type HomeownerNoteCategory, type HomeownerNotePriority } from '@/store/homeownerNotesStore';
import { showAlert } from '@/components/AppAlert';

const CATEGORIES: HomeownerNoteCategory[] = ['general', 'hvac', 'plumbing', 'electrical', 'appliance', 'exterior', 'safety', 'warranty'];
const PRIORITIES: HomeownerNotePriority[] = ['low', 'normal', 'high'];
const PRIORITY_LABEL: Record<HomeownerNotePriority, string> = { low: 'Low', normal: 'Normal', high: 'High' };

export function EditHomeownerNoteSheet({ visible, note, colors, isDark, onClose }: {
  visible: boolean; note: HomeownerNote; colors: any; isDark: boolean; onClose: () => void;
}) {
  const { updateNote } = useHomeownerNotesStore();
  const [title, setTitle] = useState(note.title);
  const [notes, setNotes] = useState(note.notes ?? '');
  const [category, setCategory] = useState<HomeownerNoteCategory>(note.category);
  const [dueDate, setDueDate] = useState<string | null>(note.dueDate ?? null);
  const [recurDays, setRecurDays] = useState(note.recurEveryDays ? String(note.recurEveryDays) : '');
  const [priority, setPriority] = useState<HomeownerNotePriority>(note.priority ?? 'normal');
  const [room, setRoom] = useState(note.room ?? '');
  const [saving, setSaving] = useState(false);

  const [showMore, setShowMore] = useState(false);
  const [serialNumber, setSerialNumber] = useState(note.serialNumber ?? '');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(note.purchaseDate ?? null);
  const [warrantyExpiresDate, setWarrantyExpiresDate] = useState<string | null>(note.warrantyExpiresDate ?? null);
  const [vendorName, setVendorName] = useState(note.vendorName ?? '');
  const [vendorPhone, setVendorPhone] = useState(note.vendorPhone ?? '');
  const [vendorNotes, setVendorNotes] = useState(note.vendorNotes ?? '');
  const [cost, setCost] = useState(note.costCents != null ? (note.costCents / 100).toFixed(2) : '');

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await updateNote(note.id, {
      title: title.trim(),
      notes: notes.trim() || undefined,
      category,
      dueDate: dueDate ?? undefined,
      recurEveryDays: recurDays ? parseInt(recurDays, 10) : undefined,
      priority,
      room: room.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      purchaseDate: purchaseDate ?? undefined,
      warrantyExpiresDate: warrantyExpiresDate ?? undefined,
      vendorName: vendorName.trim() || undefined,
      vendorPhone: vendorPhone.trim() || undefined,
      vendorNotes: vendorNotes.trim() || undefined,
      costCents: cost ? Math.round(parseFloat(cost) * 100) : undefined,
    });
    setSaving(false);
    if (error) showAlert('Could not save', error);
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>Edit reminder</Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>TITLE</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
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
                  const isActive = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setCategory(cat)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        borderRadius: 99, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
                        borderColor: isActive ? colors.primary : colors.border,
                        backgroundColor: isActive ? colors.primary + '18' : colors.card,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{CATEGORY_EMOJI[cat]}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isActive ? colors.primary : colors.textSecondary }}>
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
                multiline
                numberOfLines={3}
                placeholderTextColor={colors.textTertiary}
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
                {showMore ? 'Hide' : 'Show'} serial number, warranty, contractor info
              </Text>
            </TouchableOpacity>

            {showMore && (
              <>
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4, letterSpacing: 0.4 }}>SERIAL / MODEL NUMBER</Text>
                  <TextInput
                    value={serialNumber}
                    onChangeText={setSerialNumber}
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
                    multiline
                    numberOfLines={2}
                    placeholderTextColor={colors.textTertiary}
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
                {saving ? 'Saving…' : 'Save changes'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
