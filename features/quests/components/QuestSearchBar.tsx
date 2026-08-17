import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Search, Calendar, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { localDateStr, fmtDateShort } from '@/lib/dates';

export type DateRange = { from: string; to: string } | null;

// Text search + a due-date range filter (single day when from===to, or a
// span) — the range picker uses two native date spinners rather than a
// calendar grid, matching how AddQuestModal already picks a single due
// date elsewhere in this app.
export function QuestSearchBar({ query, onQueryChange, range, onRangeChange, colors, isDark }: {
  query: string; onQueryChange: (q: string) => void;
  range: DateRange; onRangeChange: (r: DateRange) => void;
  colors: any; isDark: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickingFrom, setPickingFrom] = useState(true);
  const [draftFrom, setDraftFrom] = useState<Date>(range ? new Date(range.from + 'T12:00') : new Date());
  const [draftTo, setDraftTo] = useState<Date>(range ? new Date(range.to + 'T12:00') : new Date());

  const openPicker = () => {
    setDraftFrom(range ? new Date(range.from + 'T12:00') : new Date());
    setDraftTo(range ? new Date(range.to + 'T12:00') : new Date());
    setPickingFrom(true);
    setPickerOpen(true);
  };

  const applyRange = () => {
    const from = localDateStr(draftFrom);
    const to = localDateStr(draftTo);
    onRangeChange(from <= to ? { from, to } : { from: to, to: from });
    setPickerOpen(false);
  };

  const rangeLabel = range
    ? range.from === range.to
      ? fmtDateShort(range.from)
      : `${fmtDateShort(range.from)} – ${fmtDateShort(range.to)}`
    : 'Filter by date';

  return (
    <View style={{ paddingHorizontal: 14, marginBottom: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          borderRadius: 14, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0',
          backgroundColor: isDark ? colors.surface : '#F8FAFC', paddingHorizontal: 12, paddingVertical: 9 }}>
          <Search size={15} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search quests…"
            placeholderTextColor={colors.textTertiary}
            style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 0 }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => onQueryChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={15} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={openPicker}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5,
            paddingHorizontal: 12, paddingVertical: 9,
            borderColor: range ? BRAND.purple : (isDark ? colors.border : '#E2E8F0'),
            backgroundColor: range ? BRAND.purple + '15' : (isDark ? colors.surface : '#F8FAFC') }}>
          <Calendar size={15} color={range ? BRAND.purple : colors.textTertiary} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: range ? BRAND.purple : colors.textSecondary }} numberOfLines={1}>
            {rangeLabel}
          </Text>
          {range && (
            <TouchableOpacity onPress={() => onRangeChange(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={13} color={BRAND.purple} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      <Modal transparent animationType="fade" visible={pickerOpen} onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 20 }}
          activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: colors.card, paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>📅 Filter by Date</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
              <TouchableOpacity onPress={() => setPickingFrom(true)}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', borderWidth: 1.5,
                  backgroundColor: pickingFrom ? BRAND.purple + '18' : 'transparent',
                  borderColor: pickingFrom ? BRAND.purple : (isDark ? colors.border : '#E2E8F0') }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontWeight: '700' }}>FROM</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: pickingFrom ? BRAND.purple : colors.textPrimary }}>
                  {fmtDateShort(localDateStr(draftFrom))}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPickingFrom(false)}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', borderWidth: 1.5,
                  backgroundColor: !pickingFrom ? BRAND.purple + '18' : 'transparent',
                  borderColor: !pickingFrom ? BRAND.purple : (isDark ? colors.border : '#E2E8F0') }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontWeight: '700' }}>TO</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: !pickingFrom ? BRAND.purple : colors.textPrimary }}>
                  {fmtDateShort(localDateStr(draftTo))}
                </Text>
              </TouchableOpacity>
            </View>

            <DateTimePicker
              value={pickingFrom ? draftFrom : draftTo}
              mode="date"
              display="spinner"
              onChange={(_e, d) => { if (d) (pickingFrom ? setDraftFrom(d) : setDraftTo(d)); }}
              textColor={colors.textPrimary}
              style={{ height: 180, width: '100%' }}
            />

            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 8 }}>
              <TouchableOpacity onPress={() => { onRangeChange(null); setPickerOpen(false); }}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
                  backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={applyRange}
                style={{ flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: BRAND.purple }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
