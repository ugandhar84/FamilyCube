import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import FullPageOverlay from '@/components/FullPageOverlay';
import { ScanDateField } from '../health/ScanDateField';
import { MAINTENANCE_PRESETS, CATEGORY_LABEL, CATEGORY_EMOJI } from './maintenancePresets';
import type { HomeownerNoteCategory, HomeownerNotePriority, ReminderLeadDays } from '@/store/homeownerNotesStore';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';
import { useFamilyStore } from '@/store/familyStore';

const CANVAS = '#FFFFFF';
const TITLE_CLR = '#172337';
const BODY_CLR = '#657185';
const BLUE = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER = '#E8EBF0';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F5F7FB';

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

function intervalLabel(days: number): string {
  if (days === 7) return 'every week';
  if (days === 14) return 'every 2 weeks';
  if (days === 30) return 'every month';
  if (days === 90) return 'every 3 months';
  if (days === 180) return 'every 6 months';
  if (days === 365) return 'every year';
  return `every ${days} days`;
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

type Mode = 'presets' | 'custom';

export function AddHomeownerNoteSheet({ visible, colors, isDark, onClose, onSave, zIndex = 60 }: {
  zIndex?: number;
  visible: boolean; colors: any; isDark: boolean;
  onClose: () => void;
  onSave: (params: {
    title: string; notes?: string; category: HomeownerNoteCategory; dueDate?: string;
    recurEveryDays?: number; reminderDaysBefore?: ReminderLeadDays;
    priority?: HomeownerNotePriority; room?: string;
    serialNumber?: string; purchaseDate?: string; warrantyExpiresDate?: string;
    vendorName?: string; vendorPhone?: string; vendorNotes?: string; costCents?: number;
    assignedTo?: string;
  }) => Promise<void>;
}) {
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId);

  const [mode, setMode] = useState<Mode>('presets');
  const [presetSearch, setPresetSearch] = useState('');
  const [activeCatTab, setActiveCatTab] = useState<HomeownerNoteCategory>('hvac');
  const [selectedPreset, setSelectedPreset] = useState<typeof MAINTENANCE_PRESETS[number] | null>(null);
  const [presetHint, setPresetHint] = useState('');

  // Core fields
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<HomeownerNoteCategory>('general');
  const [recurDays, setRecurDays] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [reminderDays, setReminderDays] = useState<ReminderLeadDays | null>(null);
  const [priority, setPriority] = useState<HomeownerNotePriority>('normal');
  const [room, setRoom] = useState('');

  // Advanced fields
  const [showMore, setShowMore] = useState(false);
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [warrantyExpiresDate, setWarrantyExpiresDate] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorNotes, setVendorNotes] = useState('');
  const [cost, setCost] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>(activeMemberId ?? '');

  const { submitting: saving, guard } = useSubmitGuard();
  const insets = useSafeAreaInsets();

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  const reset = () => {
    setMode('presets'); setPresetSearch(''); setSelectedPreset(null); setPresetHint('');
    setTitle(''); setNotes(''); setCategory('general'); setRecurDays(''); setStartDate(null);
    setReminderDays(null); setPriority('normal'); setRoom(''); setShowMore(false);
    setActiveCatTab('hvac');
    setSerialNumber(''); setPurchaseDate(null); setWarrantyExpiresDate(null);
    setVendorName(''); setVendorPhone(''); setVendorNotes(''); setCost('');
    setAssignedTo(activeMemberId ?? '');
  };
  const close = () => { reset(); onClose(); };

  const pickPreset = (preset: typeof MAINTENANCE_PRESETS[number]) => {
    setSelectedPreset(preset);
    setTitle(preset.title);
    setCategory(preset.category);
    setRecurDays(preset.suggestedIntervalDays ? String(preset.suggestedIntervalDays) : '');
    const iDays = preset.suggestedIntervalDays;
    setPresetHint(
      `${preset.title} preset${iDays ? ` · suggested interval ${intervalLabel(iDays)}` : ''}. ` +
      `Check the manual for your specific model before adopting it.`
    );
    setMode('custom');
  };

  const save = guard(async () => {
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      notes: notes.trim() || undefined,
      category,
      recurEveryDays: recurDays ? parseInt(recurDays, 10) : undefined,
      dueDate: startDate || undefined,
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
    close();
  });

  const filteredPresets = presetSearch
    ? MAINTENANCE_PRESETS.filter(p => p.title.toLowerCase().includes(presetSearch.toLowerCase()))
    : MAINTENANCE_PRESETS.filter(p => p.category === activeCatTab);

  const otherNames = members.filter(m => m.id !== activeMemberId).map(m => m.name.split(' ')[0]).join(' and ');

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ Home care</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
            {mode === 'presets' ? 'Start with a suggestion' : 'Add a home care note'}
          </Text>
          {mode === 'presets' && (
            <Text style={{ fontSize: 14, color: bodyC, marginTop: 6, lineHeight: 20 }}>
              Choose a starting point, then edit the title, interval and note for your home.
            </Text>
          )}
          {mode === 'custom' && selectedPreset && (
            <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
              backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
              <Text style={{ fontSize: 12, color: isDark ? BLUE : LINK_BLUE, fontWeight: '600', marginBottom: 2 }}>
                Preset selected · unsaved
              </Text>
              <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18 }}>{presetHint}</Text>
            </View>
          )}
        </View>

        {mode === 'presets' ? (
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40, gap: 14 }}>

            {/* Search */}
            <View style={{ marginHorizontal: 20 }}>
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14,
                paddingHorizontal: 14, paddingVertical: 12, backgroundColor: cardBg }}>
                <TextInput
                  value={presetSearch}
                  onChangeText={setPresetSearch}
                  placeholder="Search presets"
                  placeholderTextColor={isDark ? colors.textTertiary : '#B0B8C8'}
                  style={{ fontSize: 15, color: titleC, padding: 0 }}
                />
                {!presetSearch && (
                  <Text style={{ fontSize: 13, color: bodyC, marginTop: 2 }}>Filter, service or inspection</Text>
                )}
              </View>
            </View>

            {/* Category tabs — all 8, horizontal scroll */}
            {!presetSearch && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
                {ALL_CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat} onPress={() => setActiveCatTab(cat)}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
                      backgroundColor: activeCatTab === cat ? (isDark ? colors.teal : TITLE_CLR) : cardBg,
                      borderWidth: 1, borderColor: activeCatTab === cat ? 'transparent' : border }}>
                    <Text style={{ fontSize: 13, fontWeight: '600',
                      color: activeCatTab === cat ? '#FFFFFF' : bodyC }}>
                      {CATEGORY_EMOJI[cat]} {CATEGORY_LABEL[cat]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Preset list */}
            <View style={{ marginHorizontal: 20, borderWidth: 1, borderColor: border,
              borderRadius: 18, backgroundColor: cardBg, overflow: 'hidden' }}>
              {!presetSearch && (
                <Text style={{ fontSize: 16, fontWeight: '700', color: titleC,
                  paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
                  {CATEGORY_EMOJI[activeCatTab]} {CATEGORY_LABEL[activeCatTab]} suggestions
                </Text>
              )}
              {filteredPresets.length === 0 ? (
                <Text style={{ fontSize: 14, color: bodyC, padding: 20, textAlign: 'center' }}>No presets found</Text>
              ) : filteredPresets.map((preset, i) => (
                <TouchableOpacity key={preset.title + i} onPress={() => pickPreset(preset)}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                    paddingHorizontal: 16, paddingVertical: 14,
                    borderTopWidth: i > 0 || !presetSearch ? 1 : 0, borderTopColor: border }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
                    borderColor: border, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: titleC }}>{preset.title}</Text>
                    <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>
                      {preset.suggestedIntervalDays
                        ? `Suggested ${intervalLabel(preset.suggestedIntervalDays)} · check model manual`
                        : CATEGORY_LABEL[preset.category]}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17, marginHorizontal: 20 }}>
              Intervals are editable suggestions, not a substitute for required maintenance.
            </Text>

            {selectedPreset && (
              <TouchableOpacity onPress={() => setMode('custom')} style={{ marginHorizontal: 20,
                height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                  Use {selectedPreset.title.length > 28 ? selectedPreset.title.slice(0, 28) + '…' : selectedPreset.title} preset
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { setSelectedPreset(null); setTitle(''); setCategory('general'); setRecurDays(''); setMode('custom'); }}
              style={{ marginHorizontal: 20, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? BLUE : LINK_BLUE }}>Start blank</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={close} style={{ marginHorizontal: 20,
              height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: bodyC }}>Cancel · back to home care</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 12 }}>

              {/* Category */}
              <DropRow label="Category" value={category}
                options={ALL_CATEGORIES.map(c => ({ key: c, label: `${CATEGORY_EMOJI[c]} ${CATEGORY_LABEL[c]}` }))}
                onSelect={v => setCategory(v as HomeownerNoteCategory)}
                isDark={isDark} colors={colors} />

              {/* Title */}
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Title</Text>
                <TextInput value={title} onChangeText={setTitle}
                  placeholder="e.g. Replace kitchen filter"
                  placeholderTextColor="#C0C7D4"
                  style={{ fontSize: 15, color: titleC, padding: 0 }} />
              </View>

              {/* Homeowner note */}
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Homeowner note</Text>
                <TextInput value={notes} onChangeText={setNotes} multiline
                  placeholder="Spare filter under the sink. Confirm the model in its booklet."
                  placeholderTextColor="#C0C7D4"
                  style={{ fontSize: 15, color: titleC, padding: 0, minHeight: 60 }} />
              </View>

              {/* Repeat interval */}
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Repeat interval (days)</Text>
                <TextInput value={recurDays} onChangeText={setRecurDays}
                  placeholder="e.g. 90 = every 3 months"
                  placeholderTextColor="#C0C7D4" keyboardType="numeric"
                  style={{ fontSize: 15, color: titleC, padding: 0 }} />
                {recurDays ? (
                  <Text style={{ fontSize: 11, color: bodyC, marginTop: 4 }}>
                    {intervalLabel(parseInt(recurDays, 10))} · editable suggestion
                  </Text>
                ) : null}
              </View>

              {/* Start date — native date picker */}
              <ScanDateField label="Start date / first due" value={startDate} onChange={setStartDate}
                colors={colors} isDark={isDark} accent={BLUE} />

              {/* Reminder — call alert */}
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 2 }}>Reminder · call alert</Text>
                <Text style={{ fontSize: 11, color: bodyC, marginBottom: 10, lineHeight: 15 }}>
                  Send a call-style reminder before the due date. Only fires when a start date is set.
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
                      borderWidth: 1.5,
                      borderColor: reminderDays === null ? border : border,
                      backgroundColor: reminderDays === null ? (isDark ? colors.surface : SURFACE) : cardBg }}>
                    <Text style={{ fontSize: 13, fontWeight: '700',
                      color: reminderDays === null ? bodyC : bodyC }}>No reminder</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Room */}
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Room / area (optional)</Text>
                <TextInput value={room} onChangeText={setRoom}
                  placeholder="e.g. Kitchen, Hall cupboard"
                  placeholderTextColor="#C0C7D4"
                  style={{ fontSize: 15, color: titleC, padding: 0 }} />
              </View>

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
                  <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                    paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Serial / model number</Text>
                    <TextInput value={serialNumber} onChangeText={setSerialNumber}
                      placeholder="Optional" placeholderTextColor="#C0C7D4"
                      style={{ fontSize: 15, color: titleC, padding: 0 }} />
                  </View>

                  <ScanDateField label="Purchase / install date" value={purchaseDate}
                    onChange={setPurchaseDate} colors={colors} isDark={isDark} accent={BLUE} />

                  <ScanDateField label="Warranty expires" value={warrantyExpiresDate}
                    onChange={setWarrantyExpiresDate} colors={colors} isDark={isDark} accent={BLUE} />

                  <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                    paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Cost ($)</Text>
                    <TextInput value={cost} onChangeText={setCost}
                      placeholder="0.00" placeholderTextColor="#C0C7D4" keyboardType="decimal-pad"
                      style={{ fontSize: 15, color: titleC, padding: 0 }} />
                  </View>

                  <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                    paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Contractor / company name</Text>
                    <TextInput value={vendorName} onChangeText={setVendorName}
                      placeholder="e.g. ABC HVAC" placeholderTextColor="#C0C7D4"
                      style={{ fontSize: 15, color: titleC, padding: 0 }} />
                  </View>

                  <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                    paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Contractor phone</Text>
                    <TextInput value={vendorPhone} onChangeText={setVendorPhone}
                      placeholder="Optional" placeholderTextColor="#C0C7D4" keyboardType="phone-pad"
                      style={{ fontSize: 15, color: titleC, padding: 0 }} />
                  </View>

                  <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                    paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Text style={{ fontSize: 12, color: bodyC, marginBottom: 3 }}>Contractor notes</Text>
                    <TextInput value={vendorNotes} onChangeText={setVendorNotes}
                      placeholder="e.g. Ask for Mike, does our AC every year" placeholderTextColor="#C0C7D4"
                      multiline style={{ fontSize: 15, color: titleC, padding: 0, minHeight: 60 }} />
                  </View>
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

              {/* Editing authority */}
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 14, gap: 6 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Editing authority</Text>
                <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18 }}>
                  {activeMember?.name?.split(' ')[0] ?? 'You'} is the house admin.
                  {otherNames ? ` ${otherNames} may view this note; their task assignments do not grant admin editing.` : ''}
                </Text>
              </View>

              {/* Save */}
              <TouchableOpacity onPress={save} disabled={saving || !title.trim()}
                style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: title.trim() ? BLUE : (isDark ? colors.surface : SURFACE) }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: title.trim() ? '#FFFFFF' : bodyC }}>
                  {saving ? 'Saving…' : 'Add home care note'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={close}
                style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? BLUE : LINK_BLUE }}>
                  Cancel · back to home care
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </FullPageOverlay>
  );
}
