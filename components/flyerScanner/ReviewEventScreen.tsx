/**
 * ReviewEventScreen — Step 3 ("review") of the full-page flyer scanner
 * flow: the single-event AI result, fully editable, with a kid-picker and
 * "Add to Schedule" action. Full-page conversion of the former
 * AppBottomSheet step body (same fields, same editing affordances, same
 * handleConfirmEvent save handler passed in from the parent) — matches
 * ReviewFindingsScreen.tsx's full-page "AI review" shape (hand-rolled
 * header, scroll body, sticky action row) rather than a sheet.
 */
import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import FlyerScreenHeader from './FlyerScreenHeader';
import {
  ExtractedEvent, CATEGORIES, CAT_EMOJI,
  fmtDateDisplay, fmtTime12, parseDateToObj, parseTimeToObj, dateToStr, dateToTimeStr,
} from './types';

export default function ReviewEventScreen({
  colors, isDark,
  event, updateEvent,
  kids, allNames, selectedKids, setSelKids,
  onConfirm, onRescan, onClose,
}: {
  colors: any; isDark: boolean;
  event: ExtractedEvent;
  updateEvent: (field: keyof ExtractedEvent, value: any) => void;
  kids: any[]; allNames: string[];
  selectedKids: string[];
  setSelKids: React.Dispatch<React.SetStateAction<string[]>>;
  onConfirm: () => void;
  onRescan: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pickerField, setPickerField] = useState<'date' | 'time' | 'endTime' | 'rsvp' | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
      <FlyerScreenHeader
        colors={colors} isDark={isDark}
        backLabel="‹ Cancel"
        onBack={onClose}
        title="Scan Activity Flyer"
        subtitle="Review & assign to your kid(s)"
      />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 }}>
        {/* Extracted event card */}
        <View style={[f.eventCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFF', borderColor: BRAND.purple + '40' }]}>
          {/* Category badge + title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <View style={[f.catBadge, { backgroundColor: BRAND.purple + '20' }]}>
              <Text style={{ fontSize: TYPO.subheading }}>{CAT_EMOJI[event.category] ?? '📋'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                value={event.title}
                onChangeText={v => updateEvent('title', v)}
                style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, padding: 0 }}
                placeholder="Event title"
                placeholderTextColor={colors.textTertiary}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {CATEGORIES.map(cat => (
                  <Pressable key={cat} onPress={() => updateEvent('category', cat)}
                    style={[f.catChip, {
                      backgroundColor: event.category === cat ? BRAND.purple + '20' : colors.surface,
                      borderColor: event.category === cat ? BRAND.purple : colors.border,
                    }]}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: event.category === cat ? BRAND.purple : colors.textTertiary }}>
                      {CAT_EMOJI[cat]} {cat}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Date */}
          <Pressable onPress={() => setPickerField('date')} style={f.fieldRow}>
            <Text style={f.fieldLabel}>📅 Date</Text>
            <Text style={[f.fieldValue, { color: event.date ? colors.textPrimary : colors.textTertiary }]}>
              {fmtDateDisplay(event.date)}
            </Text>
            <Ionicons name="pencil" size={13} color={colors.textTertiary} />
          </Pressable>
          {pickerField === 'date' && (
            <DateTimePicker value={parseDateToObj(event.date)} mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_: any, d?: Date) => { if (d) updateEvent('date', dateToStr(d)); setPickerField(null); }} />
          )}

          {/* Time */}
          <Pressable onPress={() => setPickerField('time')} style={f.fieldRow}>
            <Text style={f.fieldLabel}>🕐 Start</Text>
            <Text style={[f.fieldValue, { color: event.time ? colors.textPrimary : colors.textTertiary }]}>
              {fmtTime12(event.time)}
            </Text>
            <Ionicons name="pencil" size={13} color={colors.textTertiary} />
          </Pressable>
          {pickerField === 'time' && (
            <DateTimePicker value={parseTimeToObj(event.time)} mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_: any, d?: Date) => { if (d) updateEvent('time', dateToTimeStr(d)); setPickerField(null); }} />
          )}

          {/* End time */}
          <Pressable onPress={() => setPickerField('endTime')} style={f.fieldRow}>
            <Text style={f.fieldLabel}>🕐 End</Text>
            <Text style={[f.fieldValue, { color: event.end_time ? colors.textPrimary : colors.textTertiary }]}>
              {fmtTime12(event.end_time)}
            </Text>
            <Ionicons name="pencil" size={13} color={colors.textTertiary} />
          </Pressable>
          {pickerField === 'endTime' && (
            <DateTimePicker value={parseTimeToObj(event.end_time)} mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_: any, d?: Date) => { if (d) updateEvent('end_time', dateToTimeStr(d)); setPickerField(null); }} />
          )}

          {/* Location */}
          <View style={f.fieldRow}>
            <Text style={f.fieldLabel}>📍 Place</Text>
            <TextInput
              value={event.location ?? ''}
              onChangeText={v => updateEvent('location', v || null)}
              placeholder="Location"
              placeholderTextColor={colors.textTertiary}
              style={[f.inlineInput, { color: colors.textPrimary, flex: 1 }]}
            />
          </View>

          {/* Organizer */}
          {event.organizer ? (
            <View style={f.fieldRow}>
              <Text style={f.fieldLabel}>🏫 By</Text>
              <TextInput
                value={event.organizer ?? ''}
                onChangeText={v => updateEvent('organizer', v || null)}
                style={[f.inlineInput, { color: colors.textPrimary, flex: 1 }]}
              />
            </View>
          ) : null}

          {/* Cost */}
          {event.cost !== null && (
            <View style={f.fieldRow}>
              <Text style={f.fieldLabel}>💵 Cost</Text>
              <TextInput
                value={event.cost !== null ? String(event.cost) : ''}
                onChangeText={v => updateEvent('cost', v ? parseFloat(v) : null)}
                keyboardType="decimal-pad"
                style={[f.inlineInput, { color: colors.textPrimary, flex: 1 }]}
              />
            </View>
          )}

          {/* RSVP deadline */}
          {event.rsvp_deadline && (
            <Pressable onPress={() => setPickerField('rsvp')} style={f.fieldRow}>
              <Text style={f.fieldLabel}>📬 RSVP by</Text>
              <Text style={[f.fieldValue, { color: '#EF4444' }]}>{fmtDateDisplay(event.rsvp_deadline)}</Text>
              <Ionicons name="pencil" size={13} color={colors.textTertiary} />
            </Pressable>
          )}
          {pickerField === 'rsvp' && (
            <DateTimePicker value={parseDateToObj(event.rsvp_deadline)} mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_: any, d?: Date) => { if (d) updateEvent('rsvp_deadline', dateToStr(d)); setPickerField(null); }} />
          )}

          {/* Description */}
          {event.description ? (
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', marginBottom: 6 }}>Summary</Text>
              <TextInput
                value={event.description ?? ''}
                onChangeText={v => updateEvent('description', v)}
                multiline
                style={{ fontSize: TYPO.caption, color: colors.textSecondary, padding: 0 }}
              />
            </View>
          ) : null}

          {/* Notes */}
          {event.notes ? (
            <View style={{ marginTop: 10, backgroundColor: BRAND.amber + '15', borderRadius: 12, padding: 10 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber, marginBottom: 4 }}>📋 Notes</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{event.notes}</Text>
            </View>
          ) : null}

          {/* Recurring badge */}
          {event.recurring && (
            <View style={{ marginTop: 8, backgroundColor: BRAND.teal + '15', borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="repeat" size={15} color={BRAND.teal} />
              <Text style={{ fontSize: TYPO.label, color: BRAND.teal, fontWeight: '700', flex: 1 }}>
                Recurring: {event.recurrence_desc ?? 'Regular event'}
              </Text>
            </View>
          )}
        </View>

        {/* Kid picker */}
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>
          Add to whose schedule?
        </Text>
        {kids.length === 0 ? (
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No kids in the family yet.</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {kids.map(k => {
              const sel = selectedKids.includes(k.id);
              return (
                <Pressable key={k.id} onPress={() => setSelKids((prev: string[]) => sel ? prev.filter(id => id !== k.id) : [...prev, k.id])}
                  style={[f.kidChip, {
                    backgroundColor: sel ? BRAND.teal + '20' : colors.surface,
                    borderColor: sel ? BRAND.teal : colors.border,
                  }]}>
                  <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl}
                    siblings={allNames} size={36} ringColor={sel ? BRAND.teal : colors.textTertiary} />
                  <View>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? BRAND.teal : colors.textPrimary }}>
                      {k.name.split(' ')[0]}
                    </Text>
                    {sel && <Text style={{ fontSize: TYPO.micro, color: BRAND.teal, fontWeight: '700' }}>✓ Selected</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Sticky footer */}
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 16, flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={onRescan}
          style={[f.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="arrow-back" size={15} color={colors.textSecondary} />
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Rescan</Text>
        </Pressable>
        <Pressable onPress={onConfirm}
          style={[f.submitBtn, { flex: 2, backgroundColor: selectedKids.length ? BRAND.teal : colors.border }]}>
          <Ionicons name="calendar-outline" size={16} color={selectedKids.length ? '#fff' : colors.textTertiary} />
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: selectedKids.length ? '#fff' : colors.textTertiary }}>
            Add to Schedule →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const f = StyleSheet.create({
  eventCard:  { borderRadius: 20, borderWidth: 1.5, padding: 16, marginBottom: 20 },
  catBadge:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  catChip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, marginRight: 7 },
  fieldRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.2)' },
  fieldLabel: { fontSize: TYPO.label, fontWeight: '700', color: '#64748B', width: 72 },
  fieldValue: { fontSize: TYPO.caption, fontWeight: '600', flex: 1 },
  inlineInput:{ fontSize: TYPO.caption, fontWeight: '600', padding: 0 },
  kidChip:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1.5, padding: 10, paddingRight: 16 },
  cancelBtn:  { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtn:  { flexDirection: 'row', gap: 6, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});
