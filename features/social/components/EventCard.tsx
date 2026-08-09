import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { getEventTypes } from '@/features/social/utils';
import { CommunityEvent } from '@/features/social/types';

interface EventCardProps {
  event: CommunityEvent;
  onToggleRsvp: () => void;
  onChat: () => void;
  onPress?: () => void;
  colors: any;
}

function EventCardBase({ event, onToggleRsvp, onChat, onPress, colors }: EventCardProps) {
  const EVENT_TYPES = getEventTypes(colors);
  const cfg = EVENT_TYPES[event.event_type] ?? EVENT_TYPES.other;

  const organizer = event.organizer;
  const orgName = organizer?.handle ? `@${organizer.handle}` : 'Pet parent';
  const orgHandle: string | null = null; // handle already shown in orgName

  let dateStr = event.event_date;
  try { dateStr = format(parseISO(event.event_date), 'EEE, MMM d'); } catch {}

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      disabled={!onPress}
      style={[ev.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

      {/* Left accent bar */}
      <View style={[ev.accentBar, { backgroundColor: cfg.color }]} />

      <View style={{ flex: 1, paddingLeft: 4 }}>
        {/* Organizer row — user profile attribution */}
        <View style={ev.hostRow}>
          {organizer?.avatar_url ? (
            <Image source={{ uri: organizer.avatar_url }} style={ev.hostAvatar} />
          ) : (
            <View style={[ev.hostAvatarFallback, { backgroundColor: `${cfg.color}22` }]}>
              <Text style={{ fontSize: TYPO.caption }}>👤</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[ev.hostName, { color: colors.textPrimary }]} numberOfLines={1}>
              {orgName}
            </Text>
            {orgHandle && (
              <Text style={[ev.hostHandle, { color: colors.textTertiary }]}>{orgHandle}</Text>
            )}
          </View>
          <View style={[ev.typeBadge, { backgroundColor: `${cfg.color}18` }]}>
            <Ionicons name={cfg.icon} size={11} color={cfg.color} />
            <Text style={[ev.typeText, { color: cfg.color }]}>{event.event_type}</Text>
          </View>
        </View>

        {/* Event title */}
        <Text style={[ev.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>

        {/* Date + location */}
        <View style={{ gap: 4, marginTop: 6 }}>
          <View style={ev.metaRow}>
            <Ionicons name="calendar-outline" size={12} color={cfg.color} />
            <Text style={[ev.meta, { color: colors.textSecondary }]}>
              {dateStr}{event.event_time ? ` · ${event.event_time}` : ''}
            </Text>
          </View>
          {event.location_name ? (
            <View style={ev.metaRow}>
              <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
              <Text style={[ev.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                {event.location_name}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Actions row */}
        <View style={ev.actionRow}>
          {/* Attendee count */}
          <View style={[ev.attendeePill, { backgroundColor: `${cfg.color}12` }]}>
            <Text style={{ fontSize: TYPO.caption }}>🐾</Text>
            <Text style={[ev.attendeeText, { color: cfg.color }]}>
              {event.rsvp_count} going
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          {/* RSVP button */}
          <TouchableOpacity
            onPress={onToggleRsvp}
            activeOpacity={0.8}
            style={[ev.rsvpBtn, {
              backgroundColor: event.user_rsvpd ? `${cfg.color}15` : cfg.color,
              borderColor: cfg.color,
            }]}>
            {event.user_rsvpd && (
              <Ionicons name="checkmark" size={13} color={cfg.color} />
            )}
            <Text style={[ev.rsvpText, { color: event.user_rsvpd ? cfg.color : '#fff' }]}>
              {event.user_rsvpd ? 'Going' : 'RSVP'}
            </Text>
          </TouchableOpacity>

          {/* Chat button */}
          <TouchableOpacity
            onPress={onChat}
            activeOpacity={0.8}
            style={[ev.chatBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const EventCard = React.memo(EventCardBase);

export const ev = StyleSheet.create({
  card:               { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, borderRadius: 16,
                        overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth,
                        shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
                        padding: 14, paddingLeft: 16, gap: 12 },
  accentBar:          { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  hostRow:            { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  hostAvatar:         { width: 32, height: 32, borderRadius: 16 },
  hostAvatarFallback: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hostName:           { fontSize: TYPO.caption, fontWeight: '700', letterSpacing: -0.1 },
  hostHandle:         { fontSize: TYPO.label, marginTop: 1 },
  typeBadge:          { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText:           { fontSize: TYPO.label, fontWeight: '700', textTransform: 'capitalize' },
  title:              { fontSize: TYPO.body, fontWeight: '800', letterSpacing: -0.3, lineHeight: 21 },
  metaRow:            { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta:               { fontSize: TYPO.caption, flex: 1 },
  actionRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  attendeePill:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  attendeeText:       { fontSize: TYPO.caption, fontWeight: '700' },
  rsvpBtn:            { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, borderWidth: 1.5 },
  rsvpText:           { fontSize: TYPO.caption, fontWeight: '800' },
  chatBtn:            { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
