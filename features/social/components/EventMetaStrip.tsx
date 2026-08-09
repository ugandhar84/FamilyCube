import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

interface EventMetaStripProps {
  eventDate: string | null;
  eventTime: string | null;
  locationName: string | null;
  organizer: { full_name: string; handle?: string | null } | null;
  ac: string;
  colors: any;
  avgRating?: number | null;
  feedbackCount?: number;
}

function EventMetaStripBase({ eventDate, eventTime, locationName, organizer, ac, colors, avgRating, feedbackCount }: EventMetaStripProps) {
  return (
    <View style={[s.strip, { backgroundColor: `${ac}0C`, borderBottomColor: `${ac}20` }]}>
      {eventDate ? (
        <View style={s.item}>
          <Ionicons name="calendar-outline" size={13} color={ac} />
          <Text style={[s.text, { color: colors.textSecondary }]}>
            {format(parseISO(eventDate), 'EEE, MMM d')}
            {eventTime ? ` · ${eventTime}` : ''}
          </Text>
        </View>
      ) : null}
      {locationName ? (
        <View style={s.item}>
          <Ionicons name="location-outline" size={13} color={ac} />
          <Text style={[s.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {locationName}
          </Text>
        </View>
      ) : null}
      {organizer ? (
        <View style={s.item}>
          <Ionicons name="person-outline" size={13} color={ac} />
          <Text style={[s.text, { color: colors.textSecondary }]}>
            Organised by {organizer.handle ? `@${organizer.handle}` : 'Pet parent'}
          </Text>
        </View>
      ) : null}
      {avgRating != null && feedbackCount && feedbackCount > 0 ? (
        <View style={s.item}>
          <Text style={{ fontSize: TYPO.caption }}>⭐</Text>
          <Text style={[s.text, { color: colors.textSecondary, fontWeight: '700' }]}>
            {avgRating.toFixed(1)} ({feedbackCount} {feedbackCount === 1 ? 'review' : 'reviews'})
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export const EventMetaStrip = React.memo(EventMetaStripBase);

const s = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 10,
           paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  item:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text:  { fontSize: TYPO.body },
});
