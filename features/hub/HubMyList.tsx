/**
 * HubMyList — everyone's private reminder list on the phone Hub. Add a task for yourself with an optional quick
 * deadline, tick it off with one tap. Only the owner sees these (see lib/personalTasks.ts).
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Plus, Check } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { showToast } from '@/components/AppToast';
import { addPersonalTask, quickDeadlines, deadlineLabel, customDeadline } from '@/lib/personalTasks';

export function HubMyList({ active, colors, isDark }: { active: FamilyMember; colors: any; isDark: boolean }) {
  const { quests, submitQuest } = useQuestStore();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [dl, setDl] = useState('today');
  const [pickDate, setPickDate] = useState<Date | null>(null);
  const [pickTime, setPickTime] = useState<Date | null>(null);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const mine = useMemo(() => quests
    .filter((q: any) => q.createdById === active.id && q.assignedToId === active.id && q.trustedAutoApprove && !q.coins
      && ['todo', 'in_progress', 'claimed', 'declined'].includes(q.status))
    .sort((a: any, b: any) => `${a.dueDate ?? '9999'} ${a.dueTime ?? '99:99'}`.localeCompare(`${b.dueDate ?? '9999'} ${b.dueTime ?? '99:99'}`)), [quests, active.id]);
  const save = () => {
    const d = dl === 'custom' && pickDate ? customDeadline(pickDate, pickTime) : (quickDeadlines().find(x => x.key === dl) ?? quickDeadlines()[1]);
    if (!text.trim()) return;
    addPersonalTask(active, text, d);
    setText(''); setAdding(false); setDl('today'); setPickDate(null); setPickTime(null); setPicker(null); showToast('Added to your list');
  };
  if (mine.length === 0 && !adding) {
    return (
      <Pressable onPress={() => setAdding(true)} style={[s.empty, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Add to my private task list">
        <Plus size={16} color={colors.textSecondary} /><Text style={[s.emptyT, { color: colors.textSecondary }]}>Add to my private task list</Text>
      </Pressable>
    );
  }
  return (
    <View style={s.wrap}>
      <Text style={[s.eyebrow, { color: colors.textTertiary }]}>MY PRIVATE TASK LIST · ONLY YOU SEE THIS</Text>
      {mine.map((q: any) => {
        const late = q.dueDate && new Date(`${q.dueDate}T${q.dueTime ?? '23:59'}:00`).getTime() < Date.now();
        return (
          <Pressable key={q.id} onPress={() => { submitQuest(q.id, undefined, active.id); showToast('Done'); }} accessibilityRole="button" accessibilityLabel={`${q.title}. Tap when done`}
            style={[s.row, { backgroundColor: isDark ? colors.card : '#FFFFFF' }]}>
            <View style={[s.ring, { borderColor: late ? colors.danger : colors.primary }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
              {!!q.dueDate && <Text style={[s.sub, { color: late ? colors.danger : colors.textSecondary }]}>{deadlineLabel(q.dueDate, q.dueTime)}</Text>}
            </View>
          </Pressable>
        );
      })}
      {adding ? (
        <View style={[s.add, { backgroundColor: isDark ? colors.card : '#FFFFFF' }]}>
          <TextInput value={text} onChangeText={setText} maxLength={80} autoFocus placeholder="What do you need to do?" placeholderTextColor={colors.textTertiary}
            onSubmitEditing={save} returnKeyType="done" style={[s.input, { color: colors.textPrimary }]} accessibilityLabel="New task" />
          <View style={s.chips}>
            {quickDeadlines().map(d => (
              <Pressable key={d.key} onPress={() => setDl(d.key)} style={[s.chip, { backgroundColor: dl === d.key ? colors.primary : colors.surface }]}>
                <Text style={[s.chipT, { color: dl === d.key ? '#fff' : colors.textSecondary }]}>{d.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => { setDl('custom'); if (!pickDate) setPickDate(new Date()); setPicker(p => (p === 'date' ? null : 'date')); }} style={[s.chip, { backgroundColor: dl === 'custom' ? colors.primary : colors.surface }]}>
              <Text style={[s.chipT, { color: dl === 'custom' ? '#fff' : colors.textSecondary }]}>{dl === 'custom' && pickDate ? customDeadline(pickDate, pickTime).label : 'Pick a date…'}</Text>
            </Pressable>
          </View>
          {dl === 'custom' && (
            <View style={s.chips}>
              <Pressable onPress={() => setPicker(p => (p === 'date' ? null : 'date'))} style={[s.chip, { backgroundColor: colors.surface }]}><Text style={[s.chipT, { color: colors.textSecondary }]}>Date</Text></Pressable>
              <Pressable onPress={() => { if (!pickTime) { const t0 = new Date(); t0.setMinutes(0, 0, 0); t0.setHours(t0.getHours() + 1); setPickTime(t0); } setPicker(p => (p === 'time' ? null : 'time')); }} style={[s.chip, { backgroundColor: colors.surface }]}><Text style={[s.chipT, { color: colors.textSecondary }]}>{pickTime ? 'Change time' : 'Add a time'}</Text></Pressable>
              {!!pickTime && <Pressable onPress={() => { setPickTime(null); setPicker(null); }} style={[s.chip, { backgroundColor: colors.surface }]}><Text style={[s.chipT, { color: colors.textSecondary }]}>No time</Text></Pressable>}
            </View>
          )}
          {picker === 'date' && pickDate && (
            <DateTimePicker value={pickDate} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={new Date(new Date().setHours(0, 0, 0, 0))}
              onChange={(_e, d) => { if (Platform.OS !== 'ios') setPicker(null); if (d) setPickDate(d); }} />
          )}
          {picker === 'time' && pickTime && (
            <DateTimePicker value={pickTime} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_e, d) => { if (Platform.OS !== 'ios') setPicker(null); if (d) setPickTime(d); }} />
          )}
          <View style={s.btns}>
            <Pressable onPress={() => setAdding(false)} style={[s.btn, { backgroundColor: colors.surface }]}><Text style={[s.btnT, { color: colors.textPrimary }]}>Cancel</Text></Pressable>
            <Pressable onPress={save} disabled={!text.trim()} style={[s.btn, { backgroundColor: colors.primary, opacity: text.trim() ? 1 : 0.4 }]}><Check size={16} color="#fff" /><Text style={[s.btnT, { color: '#fff' }]}>Add</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} style={[s.empty, { borderColor: colors.border }]} accessibilityRole="button"><Plus size={16} color={colors.textSecondary} /><Text style={[s.emptyT, { color: colors.textSecondary }]}>Add to my private task list</Text></Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 8 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  ring: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, fontWeight: '700', marginTop: 1 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 4, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 12, justifyContent: 'center' },
  emptyT: { fontSize: 14, fontWeight: '700' },
  add: { borderRadius: 16, padding: 12, gap: 10 },
  input: { fontSize: 16, fontWeight: '700', paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 8 },
  chipT: { fontSize: 12.5, fontWeight: '800' },
  btns: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  btnT: { fontSize: 14, fontWeight: '800' },
});
