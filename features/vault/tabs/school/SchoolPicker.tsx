/**
 * SchoolPicker — pick the school from the family's own list, or add a new one once. The list is every school already on a
 * child's schedule (siblings at the same school share one entry), so a name is typed once and tapped after that.
 */
import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { School, Plus } from 'lucide-react-native';
import { GEMINI } from '@/constants/geminiRhythm';
import { useSchoolStore } from '@/store/schoolStore';

/** The distinct school names across the family's schedules (case-insensitive), most used first. */
export function useFamilySchools(): string[] {
  const schedules = useSchoolStore(s => s.schedules);
  return useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const sc of schedules) {
      const name = sc.school?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur = counts.get(key);
      counts.set(key, { name: cur?.name ?? name, n: (cur?.n ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).map(v => v.name);
  }, [schedules]);
}

export function SchoolPicker({ value, onChange, colors, isDark }: {
  value: string; onChange: (v: string) => void; colors: any; isDark: boolean;
}) {
  const schools = useFamilySchools();
  const [adding, setAdding] = useState(schools.length === 0);
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const BLUE = GEMINI.blue;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.4, color: bodyC, textTransform: 'uppercase' }}>School</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {schools.map(name => {
          const on = value.trim().toLowerCase() === name.toLowerCase();
          return (
            <TouchableOpacity key={name} onPress={() => { onChange(name); setAdding(false); }} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5,
                borderColor: on ? BLUE : border, backgroundColor: on ? BLUE + '18' : cardBg }}>
              <School size={14} color={on ? BLUE : bodyC} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: on ? BLUE : titleC }} numberOfLines={1}>{name}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity onPress={() => { setAdding(true); onChange(''); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: border }}>
          <Plus size={14} color={bodyC} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: bodyC }}>New school</Text>
        </TouchableOpacity>
      </View>
      {adding && (
        <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: cardBg }}>
          <TextInput value={value} onChangeText={onChange} placeholder="School name (added once, then one tap)" placeholderTextColor={bodyC + '88'}
            autoFocus={schools.length > 0} style={{ fontSize: 15, color: titleC, padding: 0 }} />
        </View>
      )}
    </View>
  );
}
