import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '@/components/AppAlert';
import { useTheme } from '@/lib/ThemeContext';
import { todayLocal } from '@/lib/dates';
import { fmtDate, fmtTime } from '@/features/playdates/components/playdateDetailTypes';
import type { PlaydateRequest, Pet, OwnerContact } from '@/features/playdates/components/playdateDetailTypes';
import { TYPO } from '@/constants/theme';

interface Props {
  request: PlaydateRequest;
  otherPet: Pet | null;
  contact: OwnerContact | null;
  iAmFrom: boolean;
  ac: string;
  working: boolean;
  requestId: string;
  onReschedule: () => void;
  onComplete: () => void;
}

function PlaydateAcceptedSection({ request, otherPet, contact, iAmFrom, ac, working, requestId, onReschedule, onComplete }: Props) {
  const { colors } = useTheme();

  const iHaveConfirmed = iAmFrom ? !!request.from_confirmed : !!request.to_confirmed;
  const isOnOrPast = request.agreed_date
    ? new Date(request.agreed_date + 'T23:59:59') <= new Date() || request.agreed_date <= todayLocal()
    : false;

  return (
    <>
      {/* Confirmed details card */}
      <View style={[s.card, { backgroundColor: `${ac}12`, borderColor: `${ac}30` }]}>
        <View style={[s.cardStrip, { backgroundColor: '#22C55E' }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5, color: '#22C55E' }}>CONFIRMED PLAYDATE</Text>
          <View style={s.row}>
            <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{fmtDate(request.agreed_date)}</Text>
          </View>
          {request.agreed_time && (
            <View style={s.row}>
              <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{fmtTime(request.agreed_time)}</Text>
            </View>
          )}
          {request.agreed_location && (
            <View style={s.row}>
              <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{request.agreed_location}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Contact card */}
      {contact && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.cardStrip, { backgroundColor: ac }]} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5, color: colors.textSecondary }}>
              {otherPet?.name?.toUpperCase() ?? 'OTHER PET'}'S PARENT
            </Text>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
              {contact.handle ? `@${contact.handle}` : 'Pet parent'}
            </Text>
            {contact.phone ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <View style={[s.phonePill, { backgroundColor: `${ac}18`, borderColor: `${ac}30` }]}>
                  <Ionicons name="call-outline" size={13} color={ac} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>{contact.phone}</Text>
                </View>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Tap to call</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>No phone number on file</Text>
            )}
          </View>
        </View>
      )}

      {/* Reschedule button */}
      <TouchableOpacity
        style={[s.outlineBtn, { borderColor: ac }]}
        onPress={onReschedule}
        disabled={working}>
        <Ionicons name="calendar-outline" size={15} color={ac} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>Propose Reschedule</Text>
      </TouchableOpacity>

      {/* Mark as Completed */}
      {isOnOrPast && (
        iHaveConfirmed ? (
          <View style={[s.outlineBtn, { borderColor: '#22C55E50', backgroundColor: '#22C55E08' }]}>
            <Ionicons name="checkmark-circle" size={15} color="#22C55E" />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#22C55E' }}>
              Waiting for {otherPet?.name} to confirm…
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.outlineBtn, { borderColor: '#22C55E', backgroundColor: '#22C55E12' }]}
            onPress={() => {
              showAlert(
                'Mark as Completed? 🎉',
                `Did you have a great time with ${otherPet?.name}? Both parents need to confirm.`,
                [
                  { text: 'Not yet', style: 'cancel' },
                  { text: 'Yes, we met! 🐾', onPress: onComplete },
                ],
              );
            }}
            disabled={working}>
            <Ionicons name="checkmark-done-outline" size={15} color="#22C55E" />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#22C55E' }}>Mark as Completed 🎉</Text>
          </TouchableOpacity>
        )
      )}
    </>
  );
}

export default React.memo(PlaydateAcceptedSection);

const s = StyleSheet.create({
  card:       { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden', paddingVertical: 14, paddingRight: 14 },
  cardStrip:  { width: 4, marginRight: 12 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, borderWidth: 1.5 },
  phonePill:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
});
