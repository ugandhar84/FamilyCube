import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import FullPageOverlay from '@/components/FullPageOverlay';
import { ScanDateField } from '../health/ScanDateField';
import { CATEGORY_LABEL, CATEGORY_EMOJI } from './maintenancePresets';
import {
  useHomeownerNotesStore, type HomeownerNote, type HomeownerNoteCategory,
  type HomeownerNotePriority, type ReminderLeadDays,
} from '@/store/homeownerNotesStore';
import { showAlert } from '@/components/AppAlert';
import { useFamilyStore } from '@/store/familyStore';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception, 2026-10-10) — see
// features/vault/tabs/SchoolHomeScreen.tsx's own comment for the full
// rationale.
const CANVAS = '#ECE6DE';
const TITLE_CLR = '#0D1210';
const BODY_CLR = '#3D4D47';
const BODY_CLR_LIGHT = '#4E5C56';
const BLUE = '#3B5FE4';
const LINK_BLUE = '#23352B';
const BORDER = '#DDD6CC';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F0EDE6';
const CARD_SHADOW = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } as const;

const ALL_CATEGORIES: HomeownerNoteCategory[] = [
  'hvac', 'plumbing', 'electrical', 'appliance', 'exterior', 'safety', 'warranty', 'general',
];
const PRIORITIES: HomeownerNotePriority[] = ['low', 'normal', 'high'];
const PRIORITY_LABEL: Record<HomeownerNotePriority, string> = { low: 'Low', normal: 'Normal', high: 'High' };

type ReminderOption = { days: ReminderLeadDays; label: string };
const REMINDER_OPTIONS: ReminderOption[] = [
  { days: 1, label: '1 day before' },
  { days: 2, label: '2 days before' },
  { days: 7, label: '1 week before' },
  { days: 15, label: '15 days before' },
  { days: 30, label: '1 month before' },
];

function parseLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}
function fmtDisplay(s: string) {
  return parseLocalDateStr(s).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}
function addDays(iso: string, days: number): string {
  const d = parseLocalDateStr(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function intervalLabel(days: number): string {
  if (days === 7) return 'every week';
  if (days === 14) return 'every 2 weeks';
  if (days === 30) return 'every month';
  if (days === 90) return 'every 3 months';
  if (days === 180) return 'every 6 months';
  if (days === 365) return 'every year';
  return `every ${days} days`;
}

function FieldRow({ label, value, onChangeText, placeholder, multiline, keyboardType, colors, isDark }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any; colors: any; isDark: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  return (
    <View style={{ borderWidth: 1, borderColor: focused ? BLUE : border, borderRadius: 14,
      backgroundColor: cardBg, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor="#C0C7D4"
        multiline={multiline}
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ fontSize: 15, color: titleC, padding: 0, minHeight: multiline ? 60 : undefined }}
      />
    </View>
  );
}

function DropRow({ label, value, options, onSelect, isDark, colors }: {
  label: string; value: string; options: { key: string; label: string }[];
  onSelect: (k: string) => void; isDark: boolean; colors: any;
}) {
  const [open, setOpen] = useState(false);
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>{label}</Text>
        <Text style={{ fontSize: 15, color: titleC }}>{options.find(o => o.key === value)?.label ?? value} ▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: border }}>
          {options.map(opt => (
            <TouchableOpacity key={opt.key} onPress={() => { onSelect(opt.key); setOpen(false); }}
              style={{ paddingHorizontal: 16, paddingVertical: 10,
                backgroundColor: opt.key === value ? (isDark ? colors.surface : SURFACE) : cardBg }}>
              <Text style={{ fontSize: 14, color: opt.key === value ? BLUE : titleC,
                fontWeight: opt.key === value ? '600' : '400' }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export function EditHomeownerNoteSheet({ visible, note, colors, isDark, onClose, zIndex = 60 }: {
  visible: boolean; note: HomeownerNote; colors: any; isDark: boolean; onClose: () => void; zIndex?: number;
}) {
  const { updateNote } = useHomeownerNotesStore();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId);
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState(note.title);
  const [noteText, setNoteText] = useState(note.notes ?? '');
  const [category, setCategory] = useState<HomeownerNoteCategory>(note.category);
  const [recurDays, setRecurDays] = useState(note.recurEveryDays ? String(note.recurEveryDays) : '');
  const [startDate, setStartDate] = useState<string | null>(note.dueDate ?? null);
  const [reminderDays, setReminderDays] = useState<ReminderLeadDays | null>(note.reminderDaysBefore ?? null);
  const [priority, setPriority] = useState<HomeownerNotePriority>(note.priority ?? 'normal');
  const [room, setRoom] = useState(note.room ?? '');

  const [showMore, setShowMore] = useState(false);
  const [serialNumber, setSerialNumber] = useState(note.serialNumber ?? '');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(note.purchaseDate ?? null);
  const [warrantyExpiresDate, setWarrantyExpiresDate] = useState<string | null>(note.warrantyExpiresDate ?? null);
  const [vendorName, setVendorName] = useState(note.vendorName ?? '');
  const [vendorPhone, setVendorPhone] = useState(note.vendorPhone ?? '');
  const [vendorNotes, setVendorNotes] = useState(note.vendorNotes ?? '');
  const [cost, setCost] = useState(note.costCents ? (note.costCents / 100).toFixed(2) : '');
  const [assignedTo, setAssignedTo] = useState<string>(note.assignedTo ?? note.createdBy);

  const [saving, setSaving] = useState(false);

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  // Infer next due from start date + interval
  const nextDueInferred = startDate && recurDays
    ? addDays(startDate, parseInt(recurDays, 10))
    : null;

  const otherNames = members.filter(m => m.id !== activeMemberId).map(m => m.name.split(' ')[0]);
  const visibilityLine = otherNames.length
    ? `${activeMember?.name?.split(' ')[0] ?? 'You'}, ${otherNames.join(' & ')} · permitted view`
    : 'Only you';

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await updateNote(note.id, {
      title: title.trim(),
      notes: noteText.trim() || undefined,
      category,
      dueDate: startDate || undefined,
      recurEveryDays: recurDays ? parseInt(recurDays, 10) : undefined,
      reminderDaysBefore: reminderDays ?? undefined,
      priority,
      room: room.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      purchaseDate: purchaseDate || undefined,
      warrantyExpiresDate: warrantyExpiresDate || undefined,
      vendorName: vendorName.trim() || undefined,
      vendorPhone: vendorPhone.trim() || undefined,
      vendorNotes: vendorNotes.trim() || undefined,
      costCents: cost ? Math.round(parseFloat(cost) * 100) : undefined,
      assignedTo: assignedTo || undefined,
    });
    setSaving(false);
    if (error) showAlert('Could not save', error);
    else onClose();
  };

  return (
    <FullPageOverlay visible={visible} onDismiss={onClose} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6, backgroundColor: canvas }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Home care</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
            Edit {note.title.length > 24 ? note.title.slice(0, 24) + '…' : note.title}
          </Text>
          <View style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: 8, backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
            <Text style={{ fontSize: 12, color: isDark ? BLUE : LINK_BLUE, fontWeight: '600' }}>Admin edit · unsaved changes</Text>
          </View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48, gap: 12 }}>

            <DropRow
              label="Category"
              value={category}
              options={ALL_CATEGORIES.map(c => ({ key: c, label: `${CATEGORY_EMOJI[c]} ${CATEGORY_LABEL[c]}` }))}
              onSelect={v => setCategory(v as HomeownerNoteCategory)}
              isDark={isDark} colors={colors}
            />

            <FieldRow label="Title" value={title} onChangeText={setTitle}
              placeholder="e.g. Replace kitchen filter" colors={colors} isDark={isDark} />

            <FieldRow label="Homeowner note" value={noteText} onChangeText={setNoteText}
              placeholder="Spare filter under the sink. Confirm the model in its booklet." multiline
              colors={colors} isDark={isDark} />

            {/* Repeat interval */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Repeat interval (days)</Text>
              <TextInput
                value={recurDays}
                onChangeText={v => setRecurDays(v.replace(/[^\d]/g, ''))}
                placeholder="e.g. 90 = every 3 months"
                placeholderTextColor="#C0C7D4"
                keyboardType="numeric"
                style={{ fontSize: 15, color: titleC, padding: 0 }}
              />
              {recurDays ? (
                <Text style={{ fontSize: 11, color: bodyC, marginTop: 4 }}>
                  {intervalLabel(parseInt(recurDays, 10))} · editable suggestion
                </Text>
              ) : null}
            </View>

            {/* Start date — native picker */}
            <ScanDateField label="Start date" value={startDate} onChange={setStartDate}
              colors={colors} isDark={isDark} accent={BLUE} />

            {/* Reminder — call alert */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 2 }}>Reminder · call alert</Text>
              <Text style={{ fontSize: 11, color: bodyC, marginBottom: 10, lineHeight: 15 }}>
                Send a call-style reminder before the due date.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REMINDER_OPTIONS.map(opt => {
                  const active = reminderDays === opt.days;
                  return (
                    <TouchableOpacity key={opt.days}
                      onPress={() => setReminderDays(active ? null : opt.days)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: active ? BLUE : border,
                        backgroundColor: active ? (isDark ? colors.surface : '#EEF3FB') : cardBg }}>
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: active ? BLUE : bodyC }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={() => setReminderDays(null)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                    borderWidth: 1.5, borderColor: border,
                    backgroundColor: reminderDays === null ? (isDark ? colors.surface : SURFACE) : cardBg }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: bodyC }}>No reminder</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Last done — read-only */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Last done</Text>
              <Text style={{ fontSize: 15, color: note.completedAt ? titleC : bodyC }}>
                {note.completedAt ? fmtDisplay(note.completedAt.slice(0, 10)) : 'Not recorded yet'}
              </Text>
            </View>

            {/* Next due inferred */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Next due · inferred</Text>
              <Text style={{ fontSize: 15, color: nextDueInferred ? titleC : bodyC }}>
                {nextDueInferred
                  ? `${fmtDisplay(nextDueInferred)} · last done + ${intervalLabel(parseInt(recurDays, 10))}`
                  : 'Set start date and interval above'}
              </Text>
            </View>

            {/* Room */}
            <FieldRow label="Room / area (optional)" value={room} onChangeText={setRoom}
              placeholder="e.g. Kitchen, Hall cupboard" colors={colors} isDark={isDark} />

            {/* Priority */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 8 }}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PRIORITIES.map(p => {
                  const active = priority === p;
                  return (
                    <TouchableOpacity key={p} onPress={() => setPriority(p)}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                        borderWidth: 1.5,
                        borderColor: active ? BLUE : border,
                        backgroundColor: active ? (isDark ? colors.surface : '#EEF3FB') : cardBg }}>
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: active ? BLUE : bodyC }}>{PRIORITY_LABEL[p]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Advanced toggle */}
            <TouchableOpacity onPress={() => setShowMore(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
              {showMore ? <ChevronUp size={16} color={BLUE} /> : <ChevronDown size={16} color={BLUE} />}
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>
                {showMore ? 'Hide' : 'Show'} serial number, warranty & contractor details
              </Text>
            </TouchableOpacity>

            {showMore && (
              <>
                <FieldRow label="Serial / model number" value={serialNumber} onChangeText={setSerialNumber}
                  placeholder="Optional" colors={colors} isDark={isDark} />

                <ScanDateField label="Purchase / install date" value={purchaseDate}
                  onChange={setPurchaseDate} colors={colors} isDark={isDark} accent={BLUE} />

                <ScanDateField label="Warranty expires" value={warrantyExpiresDate}
                  onChange={setWarrantyExpiresDate} colors={colors} isDark={isDark} accent={BLUE} />

                <FieldRow label="Cost ($)" value={cost} onChangeText={setCost}
                  placeholder="0.00" keyboardType="decimal-pad" colors={colors} isDark={isDark} />

                <FieldRow label="Contractor / company name" value={vendorName} onChangeText={setVendorName}
                  placeholder="e.g. ABC HVAC" colors={colors} isDark={isDark} />

                <FieldRow label="Contractor phone" value={vendorPhone} onChangeText={setVendorPhone}
                  placeholder="Optional" keyboardType="phone-pad" colors={colors} isDark={isDark} />

                <FieldRow label="Contractor notes" value={vendorNotes} onChangeText={setVendorNotes}
                  placeholder="e.g. Ask for Mike, does our AC every year" multiline
                  colors={colors} isDark={isDark} />
              </>
            )}

            {/* Assigned to */}
            <DropRow label="Assigned to" value={assignedTo}
              options={members.map(m => ({
                key: m.id,
                label: m.id === activeMemberId ? `${m.name} (you)` : m.name,
              }))}
              onSelect={setAssignedTo}
              isDark={isDark} colors={colors} />

            {/* Visibility */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Visibility</Text>
              <Text style={{ fontSize: 15, color: titleC }}>{visibilityLine}</Text>
            </View>

            {/* Editing authority */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 14, gap: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Editing authority</Text>
              <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18 }}>
                {activeMember?.name?.split(' ')[0] ?? 'You'} is the house admin.{' '}
                {otherNames.length ? `${otherNames.join(' and ')} may view this note; their task assignments do not grant admin editing.` : ''}
              </Text>
            </View>

            {/* Save */}
            <TouchableOpacity onPress={save} disabled={saving || !title.trim()}
              style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                backgroundColor: title.trim() ? BLUE : (isDark ? colors.surface : SURFACE) }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: title.trim() ? '#FFFFFF' : bodyC }}>
                {saving ? 'Saving…' : 'Save note changes'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose}
              style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? BLUE : LINK_BLUE }}>
                Cancel · back to home care
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </FullPageOverlay>
  );
}
