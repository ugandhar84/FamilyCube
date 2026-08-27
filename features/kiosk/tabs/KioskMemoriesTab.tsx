/**
 * KioskMemoriesTab — read-only photo grid for the senior/grandparent kiosk
 * profile, mirroring MemoriesTab.tsx's own family_memories query (fetch-
 * on-mount, no realtime — matches that screen's existing behavior).
 */
import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';
import { fmtDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';

interface Memory {
  id: string;
  description: string | null;
  date: string;
  photo_url: string | null;
  photo_urls: string[] | null;
}

export function KioskMemoriesTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const familyId = useFamilyStore(s => (s.members[0] as any)?.familyId);
  const [memories, setMemories] = useState<Memory[]>([]);

  useEffect(() => {
    if (!familyId) return;
    (async () => {
      const { data } = await supabase.from('family_memories')
        .select('*').eq('family_id', familyId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setMemories(data as Memory[]);
    })();
  }, [familyId]);

  return (
    <View style={s.root}>
      <Text style={[s.title, { color: colors.textPrimary }]}>Family Memories</Text>
      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        {memories.map(m => {
          const img = m.photo_urls?.[0] ?? m.photo_url;
          if (!img) return null;
          return (
            <View key={m.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image source={{ uri: img }} style={s.image} />
              <View style={s.caption}>
                {!!m.description && <Text style={[s.desc, { color: colors.textPrimary }]} numberOfLines={2}>{m.description}</Text>}
                <Text style={[s.date, { color: colors.textTertiary }]}>{fmtDate(m.date)}</Text>
              </View>
            </View>
          );
        })}
        {memories.length === 0 && (
          <Text style={[s.empty, { color: colors.textTertiary }]}>No memories shared yet</Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: 220, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  image: { width: '100%', height: 160, backgroundColor: '#0002' },
  caption: { padding: 10, gap: 3 },
  desc: { fontSize: TYPO.caption, fontWeight: '700' },
  date: { fontSize: 10.5, fontWeight: '600' },
  empty: { fontSize: TYPO.body, fontWeight: '600', textAlign: 'center', width: '100%', marginTop: 40 },
});
