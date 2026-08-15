/**
 * TimelineEditSheet — long-press on any timeline card opens this.
 *
 * Shows editable fields for the entry type, an audit footer (edited by / at),
 * and a Delete button at the very bottom — delete never lives on the card itself.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import type { TLEvent } from './HealthUtils';
import { TYPO } from '@/constants/theme';
import { format, parseISO } from 'date-fns';

interface Props {
  event: TLEvent | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (ev: TLEvent) => void;
}

function field(label: string, value: string, onChange: (v: string) => void, colors: any, multiline = false) {
  return (
    <View key={label} style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={{ backgroundColor: colors.inputBg ?? colors.surface, borderRadius: 10, borderWidth: 1,
          borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10,
          fontSize: TYPO.body, color: colors.textPrimary, minHeight: multiline ? 72 : undefined }}
      />
    </View>
  );
}

export function TimelineEditSheet({ event, onClose, onSaved, onDelete }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members } = useFamilyStore();
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);

  // Generic editable fields
  const [title,  setTitle]  = useState('');
  const [notes,  setNotes]  = useState('');
  const [extra1, setExtra1] = useState(''); // type-specific field 1
  const [extra2, setExtra2] = useState(''); // type-specific field 2

  useEffect(() => {
    if (!event) return;
    const r = event.raw;
    setTitle(r.title ?? r.name ?? r.vaccine_name ?? '');
    setNotes(r.notes ?? r.result ?? '');
    setExtra1('');
    setExtra2('');
    if (event.type === 'appointment') {
      setExtra1(r.vet_name ?? '');
      setExtra2(r.clinic_name ?? '');
    } else if (event.type === 'medication') {
      setExtra1(r.dosage ?? '');
      setExtra2(r.frequency ?? '');
    } else if (event.type === 'vaccine') {
      setExtra1(r.administered_by ?? '');
      setExtra2(r.next_due ?? '');
    } else if (event.type === 'weight') {
      setExtra1(String(r.weight ?? ''));
    }
  }, [event]);

  if (!event) return null;

  const r = event.raw;
  const editedBy = r.edited_by
    ? (members.find(m => m.id === r.edited_by)?.name ?? 'Someone')
    : null;
  const editedAt = r.edited_at
    ? format(parseISO(r.edited_at), 'MMM d, yyyy · h:mm a')
    : null;

  const extra1Label = event.type === 'appointment' ? 'Vet Name'
    : event.type === 'medication'  ? 'Dosage'
    : event.type === 'vaccine'     ? 'Administered By'
    : event.type === 'weight'      ? 'Weight'
    : '';
  const extra2Label = event.type === 'appointment' ? 'Clinic'
    : event.type === 'medication'  ? 'Frequency'
    : event.type === 'vaccine'     ? 'Next Due Date'
    : '';

  const handleSave = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const editorId = user?.id ?? null;
    try {
      const base = { notes: notes || null, edited_at: now, edited_by: editorId };
      if (event.type === 'appointment') {
        await supabase.from('appointments').update({
          title: title || r.title, vet_name: extra1 || null, clinic_name: extra2 || null, ...base,
        }).eq('id', r.id);
      } else if (event.type === 'medication') {
        await supabase.from('medications').update({
          name: title || r.name, dosage: extra1 || null, frequency: extra2 || null, ...base,
        }).eq('id', r.id);
      } else if (event.type === 'vaccine') {
        await supabase.from('vaccinations').update({
          vaccine_name: title || r.vaccine_name, administered_by: extra1 || null,
          next_due: extra2 || null, notes: notes || null, edited_at: now, edited_by: editorId,
        }).eq('id', r.id);
      } else if (event.type === 'weight') {
        await supabase.from('weight_logs').update({
          weight: parseFloat(extra1) || r.weight, notes: notes || null,
          edited_at: now, edited_by: editorId,
        }).eq('id', r.id);
      } else if (event.type === 'lab') {
        await supabase.from('lab_results').update({
          name: title || r.name, result: notes || null, edited_at: now, edited_by: editorId,
        }).eq('id', r.id);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not update record.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      `Delete ${event.title}?`,
      'This record will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { onDelete(event); onClose(); } },
      ],
    );
  };

  const typeLabel = event.type.charAt(0).toUpperCase() + event.type.slice(1);

  return (
    <Modal visible={!!event} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
            maxHeight: '85%', paddingBottom: Math.max(insets.bottom, 16) }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
              alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>Edit {typeLabel}</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                  Long-press saved changes
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>

              {/* Fields */}
              {event.type !== 'weight' && field('Title / Name', title, setTitle, colors)}
              {extra1Label ? field(extra1Label, extra1, setExtra1, colors) : null}
              {extra2Label ? field(extra2Label, extra2, setExtra2, colors) : null}
              {field('Notes', notes, setNotes, colors, true)}

              {/* Audit trail */}
              {(editedBy || editedAt) && (
                <View style={{ borderRadius: 10, backgroundColor: isDark ? colors.surface : '#F8FAFC',
                  borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 14,
                  flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="time-outline" size={13} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
                    {editedBy ? `Edited by ${editedBy}` : 'Edited'}{editedAt ? ` · ${editedAt}` : ''}
                  </Text>
                </View>
              )}

              {/* Save */}
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: colors.primary, marginBottom: 10 }}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Save Changes</Text>}
              </TouchableOpacity>

              {/* Delete — only here, never on the card */}
              <TouchableOpacity onPress={handleDelete}
                style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center',
                  borderWidth: 1.5, borderColor: '#EF444440', backgroundColor: '#EF444412' }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#EF4444' }}>
                  Delete {typeLabel}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
