/**
 * PawBond — Event Detail Screen
 *
 * Shows full event details: title, description, date/time, location,
 * organizer info, attendee list, RSVP toggle, and link to chat.
 */

import React, { useState, useCallback } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { format, parseISO, isPast } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/lib/ThemeContext';
import { getEventTypes } from '@/features/social/utils';
import PawBondLoader from '@/components/PawBondLoader';

interface EventData {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  event_date: string;
  event_time: string | null;
  event_end_date: string | null;
  event_end_time: string | null;
  location_name: string | null;
  organizer_id: string;
  cover_url: string | null;
  is_public: boolean;
  created_at: string;
}

interface Attendee {
  user_id: string;
  full_name: string;
  handle: string | null;
  avatar_url: string | null;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const { colors, isDark } = useTheme();
  const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
  const pet = activePet();
  const ac = pet?.accent_color ?? '#7C5CBF';
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [event, setEvent] = useState<EventData | null>(null);
  const [organizer, setOrganizer] = useState<{ full_name: string; handle: string | null; avatar_url: string | null } | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [rsvpd, setRsvpd] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  const EVENT_TYPES = getEventTypes(colors);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const eventRes = await supabase.from('community_events')
        .select('id, title, description, event_type, event_date, event_time, event_end_date, event_end_time, location_name, organizer_id, cover_url, is_public, created_at')
        .eq('id', id).single();

      if (!eventRes.data) { setLoadError(true); return; }
      setEvent(eventRes.data);

      const [orgRes, attendeeRes, rsvpRes] = await Promise.allSettled([
        supabase.from('profiles').select('full_name, handle, avatar_url').eq('id', eventRes.data.organizer_id).single(),
        supabase.from('event_rsvps')
          .select('user_id')
          .eq('event_id', id).order('created_at', { ascending: true }),
        userId
          ? supabase.from('event_rsvps').select('user_id').eq('event_id', id).eq('user_id', userId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (orgRes.status === 'fulfilled' && orgRes.value.data) setOrganizer(orgRes.value.data);
      if (attendeeRes.status === 'fulfilled') {
        const rsvpRows = attendeeRes.value.data ?? [];
        const attUserIds = rsvpRows.map((r: any) => r.user_id).filter(Boolean);
        let attProfileMap: Record<string, any> = {};
        if (attUserIds.length > 0) {
          const { data: attProfiles } = await supabase.from('profiles')
            .select('id, full_name, handle, avatar_url')
            .in('id', attUserIds);
          for (const p of (attProfiles ?? [])) attProfileMap[p.id] = p;
        }
        setAttendees(rsvpRows.map((r: any) => ({
          user_id: r.user_id,
          ...(attProfileMap[r.user_id] ?? {}),
        })));
      }
      if (rsvpRes.status === 'fulfilled') setRsvpd(!!rsvpRes.value.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleRsvp = async () => {
    if (!userId || !id) return;
    setRsvpLoading(true);
    try {
      if (rsvpd) {
        await supabase.from('event_rsvps').delete().eq('event_id', id).eq('user_id', userId);
        setRsvpd(false);
        setAttendees(prev => prev.filter(a => a.user_id !== userId));
      } else {
        await supabase.from('event_rsvps').insert({ event_id: id, user_id: userId });
        setRsvpd(true);
        load();
      }
    } finally {
      setRsvpLoading(false);
    }
  };

  const isOrganizer = event?.organizer_id === userId;
  const cfg = EVENT_TYPES[event?.event_type ?? 'other'] ?? EVENT_TYPES.other;

  let dateStr = '';
  let timeStr = '';
  if (event) {
    try { dateStr = format(parseISO(event.event_date), 'EEEE, MMMM d, yyyy'); } catch { dateStr = event.event_date; }
    if (event.event_time) timeStr = event.event_time;
  }

  const eventPast = event ? isPast(parseISO(event.event_end_date ?? event.event_date)) : false;

  if (loading) return <PawBondLoader />;

  if (loadError || !event) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView edges={['top']}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </SafeAreaView>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Ionicons name="calendar-outline" size={48} color={colors.textTertiary} />
          <Text style={{ fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary, marginTop: 14 }}>Event not found</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: 6 }}>
            This event may have been removed or you don't have access yet.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>Event</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Cover image */}
        {event.cover_url ? (
          <Image source={{ uri: event.cover_url }} style={s.cover} />
        ) : (
          <View style={[s.coverPlaceholder, { backgroundColor: `${cfg.color}15` }]}>
            <Ionicons name={cfg.icon} size={48} color={cfg.color} />
          </View>
        )}

        {/* Type badge + Title */}
        <View style={s.content}>
          <View style={[s.typeBadge, { backgroundColor: `${cfg.color}15` }]}>
            <Ionicons name={cfg.icon} size={13} color={cfg.color} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: cfg.color, textTransform: 'capitalize' }}>
              {event.event_type}
            </Text>
          </View>

          <Text style={[s.title, { color: colors.textPrimary }]}>{event.title}</Text>

          {eventPast && (
            <View style={[s.pastBadge, { backgroundColor: colors.inputBg }]}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textSecondary }}>Past event</Text>
            </View>
          )}

          {/* Date & Time */}
          <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.infoRow}>
              <View style={[s.infoIcon, { backgroundColor: `${cfg.color}15` }]}>
                <Ionicons name="calendar" size={18} color={cfg.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: colors.textSecondary }]}>Date</Text>
                <Text style={[s.infoValue, { color: colors.textPrimary }]}>{dateStr}</Text>
                {timeStr ? <Text style={[s.infoSub, { color: colors.textSecondary }]}>{timeStr}</Text> : null}
              </View>
            </View>

            {event.location_name && (
              <>
                <View style={[s.divider, { backgroundColor: colors.border }]} />
                <View style={s.infoRow}>
                  <View style={[s.infoIcon, { backgroundColor: `${cfg.color}15` }]}>
                    <Ionicons name="location" size={18} color={cfg.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.infoLabel, { color: colors.textSecondary }]}>Location</Text>
                    <Text style={[s.infoValue, { color: colors.textPrimary }]}>{event.location_name}</Text>
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Description */}
          {event.description ? (
            <View style={{ marginTop: 20 }}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>About</Text>
              <Text style={{ fontSize: TYPO.body, lineHeight: 22, color: colors.textSecondary, marginTop: 6 }}>
                {event.description}
              </Text>
            </View>
          ) : null}

          {/* Organizer */}
          <View style={{ marginTop: 24 }}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Organised by</Text>
            <View style={[s.organizerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {organizer?.avatar_url ? (
                <Image source={{ uri: organizer.avatar_url }} style={s.orgAvatar} />
              ) : (
                <View style={[s.orgAvatarFallback, { backgroundColor: `${cfg.color}20` }]}>
                  <Text style={{ fontSize: TYPO.subheading }}>👤</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                  {organizer?.handle ? `@${organizer.handle}` : 'Pet parent'}
                </Text>
                {organizer?.handle && (
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>@{organizer.handle}</Text>
                )}
              </View>
              {isOrganizer && (
                <View style={[s.youBadge, { backgroundColor: `${ac}18` }]}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: ac }}>You</Text>
                </View>
              )}
            </View>
          </View>

          {/* Attendees */}
          <View style={{ marginTop: 24 }}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              Attending · {attendees.length}
            </Text>
            {attendees.length === 0 ? (
              <Text style={{ fontSize: TYPO.body, color: colors.textTertiary, marginTop: 8 }}>
                No one has RSVP'd yet. Be the first!
              </Text>
            ) : (
              <View style={s.attendeeGrid}>
                {attendees.slice(0, 12).map(a => (
                  <View key={a.user_id} style={s.attendeeChip}>
                    {a.avatar_url ? (
                      <Image source={{ uri: a.avatar_url }} style={s.attAvatar} />
                    ) : (
                      <View style={[s.attAvatarFallback, { backgroundColor: `${cfg.color}20` }]}>
                        <Text style={{ fontSize: TYPO.label }}>👤</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                      {a.handle ? `@${a.handle}` : 'Pet parent'}
                    </Text>
                  </View>
                ))}
                {attendees.length > 12 && (
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 4 }}>
                    +{attendees.length - 12} more
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Chat / Feedback button */}
          <TouchableOpacity
            style={[s.chatBtn, { backgroundColor: eventPast ? `${ac}15` : colors.card, borderColor: eventPast ? ac : colors.border }]}
            onPress={() => router.push(`/event-chat/${id}` as any)}>
            <Ionicons name={eventPast ? 'star-outline' : 'chatbubbles-outline'} size={20} color={ac} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>
              {eventPast ? 'Leave Feedback' : 'Event Chat'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom RSVP bar — hidden for past events */}
      {!isOrganizer && !eventPast && (
        <SafeAreaView edges={['bottom']} style={[s.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[s.rsvpBtn, { backgroundColor: rsvpd ? `${cfg.color}15` : cfg.color, borderColor: cfg.color }]}
            onPress={toggleRsvp}
            disabled={rsvpLoading}>
            {rsvpLoading ? (
              <ActivityIndicator size="small" color={rsvpd ? cfg.color : '#fff'} />
            ) : (
              <>
                {rsvpd && <Ionicons name="checkmark" size={18} color={cfg.color} />}
                <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: rsvpd ? cfg.color : '#fff' }}>
                  {rsvpd ? 'Going' : 'RSVP'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle:      { fontSize: TYPO.subheading, fontWeight: '700' },
  backBtn:          { padding: 12 },
  backCircle:       { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cover:            { width: '100%', height: 200, backgroundColor: '#000' },
  coverPlaceholder: { width: '100%', height: 160, alignItems: 'center', justifyContent: 'center' },
  content:          { paddingHorizontal: 20, paddingTop: 18 },
  typeBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
  title:            { fontSize: TYPO.title, fontWeight: '800', letterSpacing: -0.5, lineHeight: 30 },
  pastBadge:        { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  infoCard:         { marginTop: 18, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  infoRow:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon:         { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel:        { fontSize: TYPO.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue:        { fontSize: TYPO.body, fontWeight: '600', marginTop: 2 },
  infoSub:          { fontSize: TYPO.caption, marginTop: 1 },
  divider:          { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  sectionTitle:     { fontSize: TYPO.subheading, fontWeight: '700' },
  organizerCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  orgAvatar:        { width: 42, height: 42, borderRadius: 21 },
  orgAvatarFallback:{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  youBadge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  attendeeGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  attendeeChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10 },
  attAvatar:        { width: 28, height: 28, borderRadius: 14 },
  attAvatarFallback:{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chatBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  bottomBar:        { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10 },
  rsvpBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
});
