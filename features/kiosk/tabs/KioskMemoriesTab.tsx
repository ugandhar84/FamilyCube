/**
 * KioskMemoriesTab — the family album on the kiosk, as an area menu (All
 * memories, Most loved, My posts, Ambient slideshow) beside a three-column
 * pastel photo wall with type and person filters. One useFamilyMemories hook
 * instance drives the wall, the detail drawer and the composer, so a memory
 * posted from the composer shows up immediately. A senior can love and watch
 * but not post or delete (`readOnly`).
 */
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, Text, Pressable, TextInput } from 'react-native';
import { Plus, Images, Heart, Pencil, Play, Camera, CalendarDays, Search } from 'lucide-react-native';
import { KIOSK_SPACE, KIOSK_TYPO, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KioskMemorySlideshow } from '../components/KioskMemorySlideshow';
import { KioskMemoryFeed } from '../components/KioskMemoryFeed';
import { KioskFormDrawer } from '../components/KioskFormDrawer';
import { KioskAreaMenu, type AreaItem } from '../components/KioskAreaMenu';
import { useFamilyStore } from '@/store/familyStore';
import { useFamilyMemories } from '@/features/vault/tabs/useFamilyMemories';
import { ComposeMemoryModal } from '@/features/vault/tabs/MemoriesTab';

type Area = 'feed' | 'loved' | 'mine' | 'month' | 'ambient';
const TYPES: { key: string; label: string; emoji: string }[] = [
  { key: 'milestone', label: 'Milestone', emoji: '🎂' }, { key: 'everyday', label: 'Everyday', emoji: '☀️' },
  { key: 'celebration', label: 'Celebration', emoji: '🎉' }, { key: 'just_because', label: 'Just because', emoji: '🌙' },
];

/* Module-level so a re-render never remounts it. */
function Chip({ label, on, onPress, tone, small }: { label: string; on: boolean; onPress: () => void; tone: { card: string; fg: string }; small?: boolean }) {
  const { k } = useKioskColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={[s.chip, small && { minHeight: 38 }, { backgroundColor: on ? k.primary : tone.card }]}>
      <Text style={[s.chipText, { color: on ? k.onPrimary : tone.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function KioskMemoriesTab({ colors, isDark, readOnly = false }: {
  colors: any; isDark: boolean; readOnly?: boolean;
}) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const { registerActivity } = useKioskActivity();
  const members = useFamilyStore(s => s.members);
  const [area, setArea] = useState<Area>('feed');
  const [type, setType] = useState('all');
  const [person, setPerson] = useState('all');
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const feedTopRef = useRef(0);
  const api = useFamilyMemories({ focusMemoryId: null });
  useKioskLockSuspended(composing);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    let l = api.memories.filter(m => (type === 'all' || m.tag === type) && (!q || (m.description ?? '').toLowerCase().includes(q)) && (person === 'all' || m.created_by === person || (m.tagged_member_ids ?? []).includes(person)));
    if (area === 'loved') l = [...l].sort((a, b) => (b.hearts ?? 0) - (a.hearts ?? 0));
    if (area === 'mine') l = l.filter(m => m.created_by === api.myId);
    if (area === 'month') l = l.filter(m => { const d = new Date(m.date + 'T00:00:00'); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    return l;
  }, [api.memories, type, person, area, api.myId, query]);

  const items: AreaItem<Area>[] = [
    { id: 'feed', label: 'All memories', Icon: Images, badge: api.memories.length },
    { id: 'loved', label: 'Most loved', Icon: Heart },
    { id: 'month', label: 'On this month', Icon: CalendarDays },
    ...(readOnly ? [] : [{ id: 'mine' as Area, label: 'My posts', Icon: Pencil }]),
    { id: 'ambient', label: 'Ambient slideshow', Icon: Play },
  ];

  return (
    <View style={s.shell}>
      <KioskAreaMenu title="Memories" items={items} area={area} onPick={a => { registerActivity(); setArea(a); }} />
      <View style={s.content}>
        {area === 'ambient' ? (
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} onScrollBeginDrag={registerActivity}>
            <Text style={[s.h1, { color: k.text }]}>Ambient slideshow</Text>
            <Text style={[s.sub, { color: k.textMuted }]}>Photos advance on their own, for a countertop glance.</Text>
            <KioskMemorySlideshow style={{ marginTop: KIOSK_SPACE.md }} />
          </ScrollView>
        ) : (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            onScrollBeginDrag={registerActivity}
            scrollEventThrottle={200}
            onScroll={({ nativeEvent }) => {
              const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
              if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < 600) api.loadMore();
            }}
          >
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={[s.h1, { color: k.text }]}>The ordinary, kept.</Text>
                <Text style={[s.sub, { color: k.textMuted }]}>Little moments from everyday life: photos, notes and the stories behind them.</Text>
              </View>
              {!readOnly && (
                <Pressable onPress={() => { registerActivity(); setComposing(true); }} accessibilityRole="button" accessibilityLabel="New memory"
                  style={[s.newBtn, { backgroundColor: k.primary }]}>
                  <Plus size={18} color={k.onPrimary} strokeWidth={2.5} /><Text style={[s.newText, { color: k.onPrimary }]}>New memory</Text>
                </Pressable>
              )}
            </View>
            <View style={[s.search, { backgroundColor: k.well }]}>
              <Search size={16} color={k.textFaint} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search captions" placeholderTextColor={k.textFaint} style={[s.searchIn, { color: k.text }]} accessibilityLabel="Search captions" />
            </View>
            <View style={s.chips}>
              <Chip label="All" on={type === 'all'} onPress={() => setType('all')} tone={pastels[0]} />
              {TYPES.map((t, i) => <Chip key={t.key} label={`${t.emoji} ${t.label}`} on={type === t.key} onPress={() => setType(t.key)} tone={pastels[(i + 1) % 4]} />)}
            </View>
            <View style={s.chips}>
              <Chip small label="Everyone" on={person === 'all'} onPress={() => setPerson('all')} tone={pastels[1]} />
              {members.map((m, i) => <Chip small key={m.id} label={m.name.split(' ')[0]} on={person === m.id} onPress={() => setPerson(m.id)} tone={pastels[(i + 2) % 4]} />)}
            </View>
            <View onLayout={e => { feedTopRef.current = e.nativeEvent.layout.y; }}>
              <KioskMemoryFeed api={api} list={list} readOnly={readOnly} focusMemoryId={null} />
            </View>
            {api.hasMore && !api.loadingMore && (
              <Pressable onPress={() => { registerActivity(); api.loadMore(); }} accessibilityRole="button" style={[s.more, { backgroundColor: k.well }]}>
                <Text style={[s.chipText, { color: k.text }]}>Load more</Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </View>

      {!readOnly && (
        <ComposeMemoryModal
          visible={composing}
          onClose={() => { registerActivity(); setComposing(false); }}
          onPost={api.postMemory}
          members={members}
          myId={api.myId}
          colors={colors}
          isDark={isDark}
          renderShell={(shellVisible, shellOnClose, children) => (
            <KioskFormDrawer visible={shellVisible} variant="drawer" title="New memory" subtitle="Tuck away a photo or video for the family album"
              accent={k.purple} Icon={Camera} k={k} onClose={shellOnClose}>
              {children}
            </KioskFormDrawer>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', minHeight: 0 },
  content: { flex: 1, minWidth: 0 },
  scroll: { padding: KIOSK_SPACE.xl, paddingBottom: 120, gap: KIOSK_SPACE.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 18 },
  newText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, paddingHorizontal: 16, minHeight: 46 },
  searchIn: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '600', paddingVertical: 8 },
  more: { alignSelf: 'center', minHeight: 50, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, borderRadius: 100, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
});
