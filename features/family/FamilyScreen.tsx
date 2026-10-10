import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import {
  Users, MapPin, Heart, GraduationCap, Home, Image as ImageIcon,
  Gift, Gamepad2, Plus, ChevronRight, CalendarDays,
} from 'lucide-react-native';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { ConnectCalendarPage } from './ConnectCalendarPage';
import { FamilyTreePage } from './FamilyTreePage';
import HomeownerNotesScreen from '@/features/vault/tabs/HomeownerNotesScreen';
import HealthRecordsScreen from '@/features/vault/tabs/HealthRecordsScreen';
import HealthPeoplePage from '@/features/vault/tabs/health/HealthPeoplePage';
import SchoolScreen from '@/features/vault/tabs/SchoolScreen';
import FindFamScreen from '@/features/gps/FindFamScreen';
import FullPageOverlay from '@/components/FullPageOverlay';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { PageHeading } from '@/components/PageHeading';
import Reanimated, { Keyframe, Easing as REasing } from 'react-native-reanimated';
import { useUIStore } from '@/store/uiStore';

// Tool card definition
interface Tool {
  key: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  accent: string;        // bg tint token name
  route: string;
}

function FamilyMemberAvatar({ member, size = 52 }: { member: any; size?: number }) {
  const name: string = member?.name ?? '?';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const hue = name.charCodeAt(0) % 360;
  const avatarBg = `hsl(${hue},50%,55%)`;

  if (member?.avatarUrl) {
    return (
      <Image
        source={{ uri: member.avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2,
          borderWidth: 2.5, borderColor: '#fff' }}
      />
    );
  }

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: avatarBg, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2.5, borderColor: '#fff' }}>
      <Text style={{ fontSize: size * 0.34, fontWeight: '700', color: '#fff' }}>{initials}</Text>
    </View>
  );
}

// One-time entrance on the UI thread (10px rise + fade, 240ms, 40ms stagger) for the
// first four cards only. The view's final style is committed from the start, so a
// stalled animation can never leave a card invisible, and nothing replays on focus.
const familyCardRise = (index: number) =>
  new Keyframe({
    from: { opacity: 0, transform: [{ translateY: 10 }] },
    to:   { opacity: 1, transform: [{ translateY: 0 }], easing: REasing.out(REasing.cubic) },
  }).delay(index * 40).duration(240);

// Module-level, not component state — survives FamilyScreen remounting
// underneath a swipe-dismissed overlay (School/Home care/GPS/etc. all sit
// on top of this screen via FullPageOverlay). Without this, swiping back
// re-mounted the Reanimated tree and replayed the rise/fade on the first
// four cards every single time, reported as "few cards are
// animation/flickering" when returning from another page.
let familyEntranceShown = false;

function AnimatedCard({ index, children, style }: {
  index: number; children: React.ReactNode; style?: any;
}) {
  const playEntrance = index < 4 && !familyEntranceShown;
  return (
    <Reanimated.View style={style} entering={playEntrance ? familyCardRise(index) : undefined}>
      {children}
    </Reanimated.View>
  );
}

export default function FamilyScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const parentCount = members.filter(m => m.role === 'parent').length;
  const kidCount = members.filter(m => m.role === 'kid' || m.role === 'teen').length;
  const [showCalendarPage, setShowCalendarPage] = useState(false);
  const [showFamilyTree, setShowFamilyTree] = useState(false);
  const [showHomeCare, setShowHomeCare] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showSchool, setShowSchool] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const familySubtitle = `${members.length} ${members.length === 1 ? 'person' : 'people'} · ${parentCount} parent${parentCount === 1 ? '' : 's'}${kidCount > 0 ? `, ${kidCount} kid${kidCount === 1 ? '' : 's'}` : ''}. Everyone in one place.`;
  const activeMember = members.find(m => (m as any).id === activeMemberId) ?? members[0];
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const P = colors.primary;

  useEffect(() => {
    familyEntranceShown = true;
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => { useUIStore.getState().setFullBleedScreenActive(false); };
  }, []);

  // Pastel accents cycle: primary → teal → amber → pink (repeating)
  const PASTELS = [colors.primaryLight, colors.tealLight, colors.amberLight, colors.pinkLight];

  const TOOLS: Tool[] = [
    {
      key: 'people',
      label: 'People',
      subtitle: 'Profiles and permissions',
      icon: Users,
      accent: PASTELS[0],
      route: '__overlay:familyTree',
    },
    {
      key: 'calendars',
      label: 'Calendars',
      subtitle: 'Connect and sync',
      icon: CalendarDays,
      accent: PASTELS[1],
      route: '__overlay:calendar',
    },
    {
      key: 'locations',
      label: 'Locations',
      subtitle: 'Privacy-aware sharing',
      icon: MapPin,
      accent: PASTELS[2],
      route: '__overlay:locations',
    },
    {
      key: 'health',
      label: 'Health',
      subtitle: 'Medications and records',
      icon: Heart,
      accent: PASTELS[3],
      route: '__overlay:health',
    },
    {
      key: 'school',
      label: 'School',
      subtitle: 'Schedules and pickup',
      icon: GraduationCap,
      accent: PASTELS[0],
      route: '__overlay:school',
    },
    {
      key: 'homecare',
      label: 'Home care',
      subtitle: 'Maintenance and notes',
      icon: Home,
      accent: PASTELS[1],
      route: '__overlay:homeCare',
    },
    {
      key: 'memories',
      label: 'Memories',
      subtitle: 'Photos and family stories',
      icon: ImageIcon,
      accent: PASTELS[2],
      route: '/(tabs)/memories',
    },
    {
      key: 'rewards',
      label: 'Rewards',
      subtitle: 'Coins and perks',
      icon: Gift,
      accent: PASTELS[3],
      route: '/(tabs)/store',
    },
    {
      key: 'games',
      label: 'Games',
      subtitle: 'Fun for everyone',
      icon: Gamepad2,
      accent: PASTELS[0],
      route: '/(tabs)/tasks',
    },
  ];

  const countLabel = members.length === 1 ? 'One person'
    : members.length === 2 ? 'Two people'
    : members.length === 3 ? 'Three people'
    : members.length === 4 ? 'Four people'
    : members.length === 5 ? 'Five people'
    : `${members.length} people`;

  const handleToolPress = (tool: Tool) => {
    if (tool.route === '__overlay:calendar') { setShowCalendarPage(true); return; }
    if (tool.route === '__overlay:familyTree') { setShowFamilyTree(true); return; }
    if (tool.route === '__overlay:homeCare') { setShowHomeCare(true); return; }
    if (tool.route === '__overlay:health') {
      setShowHealth(true);
      if (activeMember?.role === 'parent') hideTabBar();
      return;
    }
    if (tool.route === '__overlay:school') { setShowSchool(true); return; }
    if (tool.route === '__overlay:locations') { setShowLocations(true); return; }
    // Rewards ('/(tabs)/store') is Hub-owned FullPageOverlay state, not a
    // real navigable screen — land on Hub first, then flip the one-shot
    // flag it consumes, same interception kioskNavStore.ts's
    // navigateFromNotification already does for notification-triggered
    // navigation to this same destination.
    if (tool.route === '/(tabs)/store') {
      router.push('/(tabs)' as any);
      useUIStore.getState().setOpenRewardsScreenRequested(true);
      return;
    }
    router.push(tool.route as any);
  };

  const byKey = (key: string) => TOOLS.find(t => t.key === key)!;

  // Grouped sections, same list-row rhythm across the board (icon chip +
  // title + subtitle + "Open X →" link), replacing the old 2-column card
  // grid [live-requested, with a mockup: "can we make the family this
  // way?"]. Each row keeps its own pastel accent per the brand's existing
  // *Light token set rather than one flat color for every row.
  const careRows = ['health', 'homecare', 'school'].map(byKey);
  const everydayRows = ['rewards', 'games', 'memories'].map(byKey);

  function ToolRow({ tool, index, accentBg, accentFg }: { tool: Tool; index: number; accentBg: string; accentFg: string }) {
    const Icon = tool.icon;
    return (
      <AnimatedCard index={index}>
        <AnimatedPressable onPress={() => handleToolPress(tool)}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: accentBg,
            alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
            <Icon size={18} color={accentFg} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
              {tool.label}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 17 }}>
              {tool.subtitle}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: accentFg, marginTop: 6 }}>
              Open {tool.label} →
            </Text>
          </View>
        </AnimatedPressable>
      </AnimatedCard>
    );
  }

  function SectionCard({ title, bg, children, style }: { title: string; bg: string; children: React.ReactNode; style?: any }) {
    return (
      <View style={[{
        backgroundColor: bg, borderRadius: 20, padding: 18,
        shadowColor: isDark ? 'transparent' : '#172337',
        shadowOpacity: isDark ? 0 : 0.04, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 1,
      }, style]}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
          {title}
        </Text>
        {children}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* ── Title header ── */}
        <View>
          <PageHeading
            topInset={insets.top}
            eyebrow="FAMILY CUBE · FAMILY"
            title="Your family"
            subtitle={familySubtitle}
            accent="primary"
            Icon={Users}
            right={
              <Pressable
                onPress={() => setShowFamilyTree(true)}
                style={({ pressed }) => ({
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: pressed ? colors.border : '#FFFFFF',
                  borderWidth: 1, borderColor: colors.border,
                  alignItems: 'center', justifyContent: 'center',
                })}>
                <Plus size={20} color={colors.textPrimary} strokeWidth={2} />
              </Pressable>
            }
          />
        </View>

        {/* ── Family card ── */}
        <AnimatedCard index={1} style={{ marginHorizontal: 20, marginBottom: 20 }}>
        <View style={{
          backgroundColor: colors.surface, borderRadius: 20, padding: 20,
          shadowColor: isDark ? 'transparent' : '#172337',
          shadowOpacity: isDark ? 0 : 0.04, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 1,
        }}>
          {/* Stacked avatars */}
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            {members.slice(0, 6).map((m, i) => (
              <View key={(m as any).id} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: members.length - i }}>
                <FamilyMemberAvatar member={m} size={52} />
              </View>
            ))}
          </View>

          {/* Family name + subtitle + link */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>
                The {familyName}s
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 3 }}>
                {countLabel} · one calm family space
              </Text>
            </View>
            <Pressable onPress={() => setShowFamilyTree(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: P }}>
                View family tree →
              </Text>
            </Pressable>
          </View>
        </View>
        </AnimatedCard>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>

          {/* ── Care, close at hand — teal-tinted card so each section reads
              as its own distinct block, not three identical gray cards
              [live feedback: "i hate the color of section card fills all
              has same"]. Icon chips sit on white so they still pop. ── */}
          <SectionCard title="Care, close at hand" bg={colors.tealLight}>
            {careRows.map((tool, i) => {
              const fg = tool.key === 'health' ? colors.pink : tool.key === 'homecare' ? colors.teal : colors.amber;
              return <ToolRow key={tool.key} tool={tool} index={i + 2} accentBg="#FFFFFF" accentFg={fg} />;
            })}
          </SectionCard>

          {/* ── The people in your life — lavender-tinted card ── */}
          <SectionCard title="The people in your life" bg={colors.pinkLight}>
            <ToolRow tool={byKey('people')} index={5} accentBg="#FFFFFF" accentFg={P} />
            <ToolRow tool={byKey('calendars')} index={6} accentBg="#FFFFFF" accentFg={colors.teal} />
            <AnimatedCard index={7}>
              <AnimatedPressable onPress={() => setShowFamilyTree(true)}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                  <Users size={18} color={colors.pink} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>Generations</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 17 }}>
                    Our family tree · your place in the story
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.pink, marginTop: 6 }}>
                    Open Generations →
                  </Text>
                </View>
              </AnimatedPressable>
            </AnimatedCard>
          </SectionCard>

          {/* ── Find my family — highlighted teal banner, same rhythm as
              School's "Scan a schedule flyer" banner. ── */}
          <AnimatedCard index={8}>
            <AnimatedPressable onPress={() => setShowLocations(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: colors.tealLight, borderRadius: 18, padding: 16 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF',
                alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={20} color={colors.teal} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>Find my family</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 }}>
                  Recent shared locations · freshness & privacy shown
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal, marginTop: 6 }}>
                  Open family map →
                </Text>
              </View>
            </AnimatedPressable>
          </AnimatedCard>

          {/* ── Everyday life stays simple — amber-tinted card ── */}
          <SectionCard title="Everyday life stays simple" bg={colors.amberLight}>
            {everydayRows.map((tool, i) => {
              const fg = tool.key === 'rewards' ? colors.pink : tool.key === 'games' ? P : colors.amber;
              return <ToolRow key={tool.key} tool={tool} index={i + 9} accentBg="#FFFFFF" accentFg={fg} />;
            })}
          </SectionCard>

          {/* ── Closing link — Family settings & permissions, last thing on
              the page [live-requested: "end should be settings"]. ── */}
          <AnimatedCard index={12}>
            <AnimatedPressable onPress={() => router.push('/profile-settings' as any)}
              style={{ borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
                paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: P }}>
                Family settings & permissions →
              </Text>
            </AnimatedPressable>
          </AnimatedCard>

          <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center',
            lineHeight: 17, paddingHorizontal: 8 }}>
            Kids own their own health records; parents may review. Membership never replaces personal consent.
          </Text>

        </View>

      </ScrollView>

      {/* Calendar page — standard FullPageOverlay shell (owns entrance/exit
          animation + edge-swipe-to-dismiss), same as every other full-page
          screen in this app; ConnectCalendarPage no longer hand-rolls its
          own slide animation/PanResponder. */}
      <FullPageOverlay visible={showCalendarPage} onDismiss={() => setShowCalendarPage(false)} zIndex={51}>
        <ConnectCalendarPage onClose={() => setShowCalendarPage(false)} />
      </FullPageOverlay>

      {/* Family tree full-page overlay — slide-in/out via FullPageOverlay,
          same as every other full-page screen (was a bare tab route with
          no entrance animation before). */}
      <FullPageOverlay visible={showFamilyTree} onDismiss={() => setShowFamilyTree(false)} zIndex={50}>
        <FamilyTreePage onClose={() => setShowFamilyTree(false)} />
      </FullPageOverlay>

      {/* Home care full-page overlay — same '__overlay:*' sentinel pattern
          as Calendars/Family Tree above. */}
      <FullPageOverlay visible={showSchool} onDismiss={() => setShowSchool(false)} zIndex={50}>
        <SchoolScreen onClose={() => setShowSchool(false)} />
      </FullPageOverlay>
      <FullPageOverlay visible={showHomeCare} onDismiss={() => setShowHomeCare(false)} zIndex={50}>
        <HomeownerNotesScreen onClose={() => setShowHomeCare(false)} />
      </FullPageOverlay>
      {/* Parent sees the person-picker landing page first [live-requested:
          "landing page with the persons/family members"] — a kid/teen/
          senior skips straight to their own records (HealthRecordsScreen
          already restricts them via kidView, so a person-picker would be
          meaningless for them). */}
      <FullPageOverlay visible={showHealth} onDismiss={() => { showTabBar(); setShowHealth(false); }} zIndex={50}>
        {activeMember?.role === 'parent'
          ? <HealthPeoplePage onClose={() => { showTabBar(); setShowHealth(false); }} />
          : <HealthRecordsScreen onClose={() => setShowHealth(false)} />}
      </FullPageOverlay>
      <FullPageOverlay visible={showLocations} onDismiss={() => setShowLocations(false)} zIndex={50}>
        <FindFamScreen onClose={() => setShowLocations(false)} />
      </FullPageOverlay>
    </View>
  );
}
