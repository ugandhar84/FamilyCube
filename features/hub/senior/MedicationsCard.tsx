import { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { Pill, CheckCircle, Plus, Trash2 } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { SectionCard } from '../hubComponents';
import { GP } from './seniorTheme';

export type Medication = { id: string; name: string; time: string };

// Money-green — "taken" status accent, distinct from brand teal used
// elsewhere in this card. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

export function MedicationsCard({ meds, medsTaken, toggleMed, onAddMed, onRemoveMed, colors, isDark, active }: {
  meds: Medication[];
  medsTaken: Record<string, boolean>;
  toggleMed: (id: string) => void;
  // Was seeded once with 3 hardcoded placeholders and never editable — a
  // grandparent had no way to add their own real medications or remove the
  // demo ones, making the whole card non-functional as a real feature (QA
  // sweep, grandparent-role audit, Medium M4).
  onAddMed: (name: string, time: string) => void;
  onRemoveMed: (id: string) => void;
  colors: any; isDark: boolean;
  active?: { name: string };
}) {
  const actorName = active?.name ?? 'senior';
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState('');

  const submitAdd = () => {
    if (!newName.trim()) return;
    onAddMed(newName.trim(), newTime.trim() || 'Anytime');
    setNewName(''); setNewTime(''); setAdding(false);
  };

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        large
        icon={<Pill size={18} color={colors.danger} />}
        title="Today's Medications"
        badge={meds.filter(m => !medsTaken[m.id]).length || undefined} badgeColor={colors.danger}
        collapsible defaultExpanded={meds.some(m => !medsTaken[m.id])}
        colors={colors} isDark={isDark}>
        {meds.map((med, i) => {
          const taken = !!medsTaken[med.id];
          return (
            <View key={med.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i < meds.length - 1 || adding ? 1 : 0, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
              <Pill size={22} color={taken ? colors.textTertiary : BRAND.teal} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.sub, fontWeight: '700', color: taken ? colors.textTertiary : colors.textPrimary, textDecorationLine: taken ? 'line-through' : 'none' }}>{med.name}</Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary }}>{med.time}</Text>
              </View>
              <Pressable onPress={() => toggleMed(med.id)} style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: taken ? MONEY_GREEN + '20' : BRAND.teal, borderWidth: taken ? 1 : 0, borderColor: MONEY_GREEN + '40' }}>
                <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: taken ? MONEY_GREEN : '#fff' }}>
                  {taken ? 'Taken' : 'Mark Taken'}
                </Text>
              </Pressable>
              {/* Extra left margin (was flush against "Mark Taken") — a
                  stray tap near two adjacent controls, one destructive, one
                  the primary action, is a real risk for a medication list
                  specifically. The confirm Alert is the real safety net,
                  but more separation reduces how often it even needs to
                  catch a mis-tap. */}
              <Pressable onPress={() => Alert.alert('Remove Medication', `Remove "${med.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => onRemoveMed(med.id) },
              ])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
                <Trash2 size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          );
        })}

        {adding ? (
          <View style={{ paddingVertical: 12, gap: 8 }}>
            <TextInput
              value={newName} onChangeText={setNewName} placeholder="Medication name"
              placeholderTextColor={colors.textTertiary} autoFocus
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: GP.sub, color: colors.textPrimary, backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
            />
            <TextInput
              value={newTime} onChangeText={setNewTime} placeholder="Time (e.g. 8:00 AM)"
              placeholderTextColor={colors.textTertiary}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: GP.sub, color: colors.textPrimary, backgroundColor: isDark ? colors.surface : '#F8FAFC' }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => { setAdding(false); setNewName(''); setNewTime(''); }}
                style={{ flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: GP.tiny, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitAdd}
                style={{ flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10, backgroundColor: BRAND.teal }}>
                <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: '#fff' }}>Add</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => { setAdding(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 }}>
            <Plus size={15} color={BRAND.teal} />
            <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: BRAND.teal }}>Add Medication</Text>
          </Pressable>
        )}

        {meds.length > 0 && meds.every(m => medsTaken[m.id]) && (
          <View style={{ alignItems: 'center', paddingVertical: 13, gap: 4 }}>
            <CheckCircle size={26} color={MONEY_GREEN} />
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: MONEY_GREEN }}>All done for today!</Text>
          </View>
        )}
      </SectionCard>
    </View>
  );
}
