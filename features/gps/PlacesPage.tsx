/**
 * PlacesPage — full-page list of the family's pinned places (Home, schools,
 * workplaces, other). Parents add and edit; everyone else can see where the
 * family checks in. Opened from the full-width Places card on the map sheet.
 */
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { PageHeading } from '@/components/PageHeading';
import { SectionHeading } from '@/components/SectionHeading';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useFamilyStore } from '@/store/familyStore';
import { usePlacesStore, type FamilyPlace, type PlaceKind } from '@/store/placesStore';
import { placeKindMeta, PLACE_KINDS } from './placeKinds';

const GROUP_TITLE: Record<PlaceKind, { overline: string; title: string }> = {
  home:   { overline: 'Home',    title: 'Where you live' },
  school: { overline: 'Schools', title: 'Drop-off & pick-up' },
  work:   { overline: 'Work',    title: 'Where the grown-ups are' },
  other:  { overline: 'Other',   title: 'Everywhere else' },
};

export function PlacesPage({ onClose, onAdd, onEdit, onShow }: {
  onClose: () => void;
  onAdd: (kind: PlaceKind) => void;
  onEdit: (place: FamilyPlace) => void;
  onShow: (place: FamilyPlace) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const places = usePlacesStore(s => s.places);
  const isParent = members.find(m => m.id === activeMemberId)?.role === 'parent';
  const canvas = isDark ? '#0E0C13' : '#FFFFFF';

  const home = places.find(p => p.kind === 'home');
  const schools = places.filter(p => p.kind === 'school').length;
  const works = places.filter(p => p.kind === 'work').length;
  const subtitle = places.length === 0
    ? (isParent ? 'Pin Home, schools and work so your family gets arrival check-ins.' : 'Your parents haven\'t pinned any places yet.')
    : [home ? 'Home is pinned' : 'No Home pin yet', schools ? `${schools} school${schools === 1 ? '' : 's'}` : null, works ? `${works} workplace${works === 1 ? '' : 's'}` : null]
        .filter(Boolean).join(' · ') + '.';

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ paddingTop: insets.top + 8, backgroundColor: canvas, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ alignSelf: 'flex-start', paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>← Locations</Text>
        </Pressable>
        <PageHeading eyebrow="FAMILY CUBE · PLACES" title="Places" subtitle={subtitle} accent="teal"
          Icon={placeKindMeta('home', colors).Icon} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {isParent && !home && (
          <Pressable onPress={() => onAdd('home')}
            style={{ marginHorizontal: 20, marginTop: 18, borderRadius: 20, padding: 18, backgroundColor: colors.tealLight, flexDirection: 'row', alignItems: 'center', gap: 14,
              borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.09)' }}>
            {(() => { const m = placeKindMeta('home', colors); return <m.Icon size={30} color={m.fg} strokeWidth={2} />; })()}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>Pin your Home</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Everyone gets checked in when they get back.</Text>
            </View>
            <ChevronRight size={20} color={colors.teal} />
          </Pressable>
        )}

        {PLACE_KINDS.map(kind => {
          const group = places.filter(p => p.kind === kind);
          if (group.length === 0) return null;
          const meta = placeKindMeta(kind, colors);
          return (
            <View key={kind}>
              <SectionHeading overline={GROUP_TITLE[kind].overline} title={GROUP_TITLE[kind].title}
                accent={kind === 'home' ? 'teal' : kind === 'school' ? 'sky' : kind === 'work' ? 'amber' : 'pink'} marginTop={22} />
              <View style={{ paddingHorizontal: 20, gap: 10 }}>
                {group.map(p => {
                  const people = p.memberIds.map(id => members.find(m => m.id === id)).filter(Boolean) as typeof members;
                  return (
                    <Pressable key={p.id} onPress={() => (isParent ? onEdit(p) : onShow(p))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: meta.bg,
                        borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.09)' }}>
                      <meta.Icon size={28} color={meta.fg} strokeWidth={2} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{p.name}</Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                          {p.address ?? 'Pinned on the map'} · {p.radiusM >= 1000 ? `${p.radiusM / 1000} km` : `${p.radiusM} m`}
                        </Text>
                      </View>
                      {people.length > 0 && (
                        <View style={{ flexDirection: 'row' }}>
                          {people.slice(0, 3).map((m, i) => (
                            <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, borderWidth: 2, borderColor: meta.bg, borderRadius: 999 }}>
                              <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} siblings={members.map(x => x.name)} size={26} ringColor={meta.fg} ringWidth={0} bgColor={colors.card} />
                            </View>
                          ))}
                        </View>
                      )}
                      <ChevronRight size={18} color={meta.fg} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        {places.length === 0 && !isParent && (
          <View style={{ marginHorizontal: 20, marginTop: 24, borderRadius: 20, padding: 20, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
              When a parent pins Home, school or work, you'll see them here and your family gets a check-in as people arrive and leave.
            </Text>
          </View>
        )}

        {isParent && (
          <Pressable onPress={() => onAdd(home ? 'school' : 'home')}
            style={{ marginHorizontal: 20, marginTop: 24, height: 54, borderRadius: 16, backgroundColor: colors.amberLight, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(217,119,6,0.22)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Plus size={20} color={colors.amber} strokeWidth={2.4} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.amber }}>Add a place</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
