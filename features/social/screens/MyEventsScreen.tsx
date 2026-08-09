/**
 * PawBond — My Events
 * Timeline view of all events the user has RSVP'd to or organized,
 * grouped by date proximity: Live Now → Today → Tomorrow → This Week
 * → Next Month → Past. Tap any card to open the event chat.
 * Smart FAB: + create event (always), ^ scroll to top (after scrolling).
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import {
  format, parseISO, isBefore, isAfter, addHours,
  isToday, isTomorrow, isThisWeek, isThisMonth, startOfDay,
} from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import PawBondLoader from '@/components/PawBondLoader';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MyEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  event_date: string;
  event_time: string | null;
  event_end_date: string | null;
  event_end_time: string | null;
  location_name: string | null;
  cover_url: string | null;
  organizer_id: string;
  rsvp_count: number;
  is_organizer: boolean;
  organizer?: { full_name: string; handle?: string | null; avatar_url: string | null } | null;
}

const TYPE_COLOR: Record<string, string> = {
  meetup:      '#FF8C55',
  vaccination: '#16A34A',
  adoption:    '#E24B4A',
  walk:        '#7C5CBF',
  training:    '#3B82F6',
  other:       '#E8A320',
};

const TYPE_EMOJI: Record<string, string> = {
  meetup: '🐾', walk: '🦮', vaccination: '💉', adoption: '🏡', training: '🎓', other: '🎪',
};

function eventStart(ev: MyEvent): Date {
  const base = parseISO(ev.event_date);
  if (ev.event_time) {
    const [h, m] = ev.event_time.split(':').map(Number);
    base.setHours(h, m, 0, 0);
  } else {
    base.setHours(8, 0, 0, 0);
  }
  return base;
}

function eventEnd(ev: MyEvent): Date {
  if (ev.event_end_date) {
    const base = parseISO(ev.event_end_date);
    if (ev.event_end_time) {
      const [h, m] = ev.event_end_time.split(':').map(Number);
      base.setHours(h, m, 0, 0);
    } else {
      base.setHours(23, 59, 0, 0);
    }
    return base;
  }
  return addHours(eventStart(ev), 2);
}

// ── Section helpers ─────────────────────────────────────────────────────────────

interface DateSection {
  key: string;
  label: string;
  sublabel?: string;
  emoji: string;
  accent?: string;
  events: MyEvent[];
}

function buildSections(events: MyEvent[], accentColor: string): DateSection[] {
  const now = new Date();

  const live:      MyEvent[] = [];
  const today:     MyEvent[] = [];
  const tomorrow:  MyEvent[] = [];
  const thisWeek:  MyEvent[] = [];
  const later:     MyEvent[] = [];
  const past:      MyEvent[] = [];

  const sorted = [...events].sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());

  for (const ev of sorted) {
    const start = eventStart(ev);
    const end   = eventEnd(ev);
    if (!isBefore(end, now) && !isAfter(start, now)) {
      live.push(ev);
    } else if (isAfter(start, now)) {
      if (isToday(start))          today.push(ev);
      else if (isTomorrow(start))  tomorrow.push(ev);
      else if (isThisWeek(start, { weekStartsOn: 1 })) thisWeek.push(ev);
      else                          later.push(ev);
    } else {
      past.push(ev);
    }
  }

  const sections: DateSection[] = [];
  if (live.length)     sections.push({ key: 'live',     label: 'Happening Now',  emoji: '🔴', accent: '#E24B4A', events: live });
  if (today.length)    sections.push({ key: 'today',    label: 'Today',          emoji: '☀️',  events: today });
  if (tomorrow.length) sections.push({ key: 'tomorrow', label: 'Tomorrow',       emoji: '📅',  events: tomorrow });
  if (thisWeek.length) sections.push({ key: 'week',     label: 'This Week',      emoji: '🗓️',  events: thisWeek });
  if (later.length)    sections.push({ key: 'later',    label: 'Coming Up',      emoji: '✨',  events: later });
  if (past.length)     sections.push({ key: 'past',     label: 'Attended',       emoji: '✅',  events: [...past].reverse() });

  return sections;
}

// ── Screen ──────────────────────────────────────────────────────────────────────

export default function MyEventsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();
  const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
  const pet = activePet();
  const ac = pet?.accent_color ?? '#7C5CBF';

  const userId = session?.user?.id ?? useAuthStore.getState().user?.id ?? null;

  const scrollRef = useRef<ScrollView>(null);
  const [events, setEvents] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Smart FAB
  const [showFab, setShowFab] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim     = useRef(new Animated.Value(0)).current;
  const fabExpanded = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fabAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    Animated.spring(fabExpanded, { toValue: fabOpen ? 1 : 0, useNativeDriver: true, tension: 130, friction: 8 }).start();
  }, [fabOpen]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Fetch RSVPed event IDs
      const { data: rsvpData } = await supabase
        .from('event_rsvps').select('event_id').eq('user_id', userId);
      const rsvpIds = (rsvpData ?? []).map((r: any) => r.event_id as string);

      const eventCols = 'id, title, description, event_type, event_date, event_time, event_end_date, event_end_time, location_name, cover_url, organizer_id, event_rsvps(user_id)';
      const [orgRes, rsvpRes] = await Promise.all([
        supabase.from('community_events').select(eventCols)
          .eq('organizer_id', userId).order('event_date', { ascending: true }),
        rsvpIds.length > 0
          ? supabase.from('community_events').select(eventCols)
              .in('id', rsvpIds).neq('organizer_id', userId)
              .order('event_date', { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const combined = [...(orgRes.data ?? []), ...(rsvpRes.data ?? [])];
      combined.sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));

      const organizerIds = [...new Set(combined.map((ev: any) => ev.organizer_id).filter(Boolean))];
      let orgProfileMap: Record<string, any> = {};
      if (organizerIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles')
          .select('id, full_name, handle, avatar_url')
          .in('id', organizerIds as string[]);
        for (const p of (profiles ?? [])) orgProfileMap[p.id] = p;
      }

      setEvents(combined.map((ev: any) => ({
        ...ev,
        rsvp_count: (ev.event_rsvps ?? []).length,
        is_organizer: ev.organizer_id === userId,
        organizer: orgProfileMap[ev.organizer_id] ?? null,
      })));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections = useMemo(() => buildSections(events, ac), [events, ac]);

  const totalUpcoming = events.filter(e => {
    const s = eventStart(e);
    const end = eventEnd(e);
    return isAfter(s, new Date()) || (!isBefore(end, new Date()) && !isAfter(s, new Date()));
  }).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={st.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[st.backBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[st.title, { color: colors.textPrimary }]}>My Events</Text>
            {totalUpcoming > 0 && (
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 1 }}>
                {totalUpcoming} upcoming
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={load}
            style={[st.refreshBtn, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="refresh-outline" size={18} color={ac} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <PawBondLoader size={52} />
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Loading events…</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 }}>
          <Text style={{ fontSize: 56 }}>🐾</Text>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.4, textAlign: 'center' }}>
            No events yet
          </Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, opacity: 0.75 }}>
            RSVP to community events or tap + below to host your own.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/social' as any)}
            style={{ marginTop: 8, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 22, backgroundColor: ac }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Explore Events</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={e => setShowFab(e.nativeEvent.contentOffset.y > 250)}>

          {sections.map(section => (
            <View key={section.key}>
              {/* Section header */}
              <View style={[st.sectionHeader, {
                backgroundColor: section.accent ? `${section.accent}12` : `${ac}08`,
                borderLeftColor: section.accent ?? ac,
              }]}>
                <Text style={{ fontSize: TYPO.body }}>{section.emoji}</Text>
                <Text style={[st.sectionTitle, { color: section.accent ?? ac }]}>
                  {section.label}
                </Text>
                <View style={[st.sectionCount, { backgroundColor: section.accent ?? ac }]}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                    {section.events.length}
                  </Text>
                </View>
              </View>

              {/* Event cards */}
              <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 12 }}>
                {section.events.map(ev => (
                  <EventCard
                    key={ev.id}
                    ev={ev}
                    ac={ac}
                    colors={colors}
                    isLive={section.key === 'live'}
                    isPast={section.key === 'past'}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Smart FAB */}
      <Animated.View style={[st.fabContainer, { bottom: insets.bottom + 20, opacity: fabAnim }]}>
        {/* Scroll-to-top mini action */}
        {showFab && (
          <Animated.View style={{
            opacity: fabExpanded,
            transform: [{ scale: fabExpanded }, { translateY: fabExpanded.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            pointerEvents: fabOpen ? 'auto' : 'none',
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }}>
            <View style={[st.fabLabel, { backgroundColor: colors.inputBg }]}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Back to top</Text>
            </View>
            <TouchableOpacity
              onPress={() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); setFabOpen(false); }}
              style={[st.fabMini, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="chevron-up" size={20} color={ac} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Create event mini action */}
        <Animated.View style={{
          opacity: fabExpanded,
          transform: [{ scale: fabExpanded }, { translateY: fabExpanded.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          pointerEvents: fabOpen ? 'auto' : 'none',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <View style={[st.fabLabel, { backgroundColor: colors.inputBg }]}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Create event</Text>
          </View>
          <TouchableOpacity
            onPress={() => { router.push('/social' as any); setFabOpen(false); }}
            style={[st.fabMini, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name="megaphone-outline" size={20} color={ac} />
          </TouchableOpacity>
        </Animated.View>

        {/* Main FAB */}
        <TouchableOpacity
          onPress={() => setFabOpen(o => !o)}
          activeOpacity={0.85}
          style={[st.fab, { backgroundColor: ac }]}>
          <Animated.View style={{ transform: [{ rotate: fabExpanded.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
            <Ionicons name="add" size={28} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── Event Card ─────────────────────────────────────────────────────────────────

function EventCard({ ev, ac, colors, isLive, isPast }: {
  ev: MyEvent; ac: string; colors: any; isLive?: boolean; isPast?: boolean;
}) {
  const typeColor = TYPE_COLOR[ev.event_type] ?? ac;
  const start = eventStart(ev);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => isPast
        ? router.push(`/event-chat/${ev.id}` as any)
        : router.push({ pathname: '/event/[id]', params: { id: ev.id } })}
      style={[st.card, {
        backgroundColor: colors.inputBg,
        borderColor: isLive ? '#E24B4A' : colors.border,
        borderWidth: isLive ? 1.5 : StyleSheet.hairlineWidth,
        opacity: isPast ? 0.72 : 1,
      }]}>

      {/* Cover / placeholder */}
      {ev.cover_url ? (
        <Image source={{ uri: ev.cover_url }} style={st.cover} resizeMode="cover" />
      ) : (
        <View style={[st.coverPlaceholder, { backgroundColor: `${typeColor}14` }]}>
          <Text style={{ fontSize: 40 }}>{TYPE_EMOJI[ev.event_type] ?? '🎪'}</Text>
          {isLive && (
            <View style={[st.livePill, { backgroundColor: '#E24B4A' }]}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' }} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>LIVE</Text>
            </View>
          )}
        </View>
      )}

      {/* Organizer badge */}
      {ev.is_organizer && (
        <View style={[st.orgBadge, { backgroundColor: ac }]}>
          <Ionicons name="star" size={10} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Organizer</Text>
        </View>
      )}

      <View style={{ padding: 13, gap: 7 }}>
        {/* Type + date row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={[st.typeChip, { backgroundColor: `${typeColor}18` }]}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: typeColor, textTransform: 'capitalize', letterSpacing: 0.2 }}>
              {ev.event_type}
            </Text>
          </View>
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>
            {isToday(start) ? (ev.event_time ? format(start, 'h:mm a') : 'Today') :
             isTomorrow(start) ? (ev.event_time ? `Tomorrow · ${format(start, 'h:mm a')}` : 'Tomorrow') :
             format(start, 'EEE, MMM d') + (ev.event_time ? ` · ${format(start, 'h:mm a')}` : '')}
          </Text>
        </View>

        {/* Title */}
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }} numberOfLines={2}>
          {ev.title}
        </Text>

        {/* Location + attendees */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {ev.location_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
              <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>
                {ev.location_name}
              </Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="people-outline" size={12} color={colors.textTertiary} />
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>
              {ev.rsvp_count}
            </Text>
          </View>
        </View>

        {/* Organizer byline */}
        {ev.organizer && !ev.is_organizer && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {ev.organizer.avatar_url ? (
              <Image source={{ uri: ev.organizer.avatar_url }} style={{ width: 16, height: 16, borderRadius: 8 }} />
            ) : (
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: `${ac}22`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: TYPO.micro }}>👤</Text>
              </View>
            )}
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
              by {ev.organizer.handle ? `@${ev.organizer.handle}` : 'Pet parent'}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:       { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.4 },
  refreshBtn:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8, borderLeftWidth: 3 },
  sectionTitle:  { fontSize: TYPO.body, fontWeight: '800', letterSpacing: 0.2, flex: 1 },
  sectionCount:  { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  card:          { borderRadius: 16, overflow: 'hidden' },
  cover:         { width: '100%', height: 130 },
  coverPlaceholder: { width: '100%', height: 90, alignItems: 'center', justifyContent: 'center' },
  livePill:      { position: 'absolute', bottom: 8, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  orgBadge:      { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  typeChip:      { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  fabContainer:  { position: 'absolute', right: 20, alignItems: 'flex-end', gap: 10 },
  fab:           { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabMini:       { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  fabLabel:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
