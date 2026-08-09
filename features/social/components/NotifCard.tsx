import React, { useRef } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseISO, isToday, isYesterday, format } from 'date-fns';
import { formatTime } from '@/lib/units';
import type { NotificationLog } from '@/lib/types';

export function timeLabel(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d) || isYesterday(d)) return formatTime(d);
    return format(d, 'MMM d');
  } catch { return ''; }
}

export const TYPE_META: Record<string, { icon: string; label: string; tint: string; gradient: string[] }> = {
  // ── Alerts ──────────────────────────────────────────────────────────────────
  lost_alert:                    { icon: '🚨', label: 'Lost Alert',       tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  pet_found:                     { icon: '🎉', label: 'Found!',           tint: '#1D9E75', gradient: ['#1D9E7522','#1D9E7508'] },
  lost_owner_checkin:            { icon: '🔍', label: 'Lost Alert',       tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  // ── Health ──────────────────────────────────────────────────────────────────
  appointment_reminder:          { icon: '📅', label: 'Appointment',      tint: '#7C5CBF', gradient: ['#7C5CBF22','#7C5CBF08'] },
  appointment_complete_prompt:   { icon: '✅', label: 'Appointment',      tint: '#7C5CBF', gradient: ['#7C5CBF22','#7C5CBF08'] },
  medication_reminder:           { icon: '💊', label: 'Medication',       tint: '#14B8A6', gradient: ['#14B8A622','#14B8A608'] },
  med_missed_dose:               { icon: '⚠️', label: 'Missed Dose',      tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  med_monthly_nudge:             { icon: '💊', label: 'Medication',       tint: '#14B8A6', gradient: ['#14B8A622','#14B8A608'] },
  med_monthly_followup:          { icon: '💊', label: 'Medication',       tint: '#14B8A6', gradient: ['#14B8A622','#14B8A608'] },
  vaccine_reminder:              { icon: '💉', label: 'Vaccine',          tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  symptom_scan_ready:            { icon: '🩺', label: 'Symptom Scan',     tint: '#14B8A6', gradient: ['#14B8A622','#14B8A608'] },
  // ── Care ────────────────────────────────────────────────────────────────────
  walk_reminder:                 { icon: '🐕', label: 'Walk Time',        tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  feeding_reminder:              { icon: '🍽️', label: 'Feeding',          tint: '#F59E0B', gradient: ['#F59E0B22','#F59E0B08'] },
  mood_reminder:                 { icon: '📸', label: 'Mood Scan',        tint: '#7C5CBF', gradient: ['#7C5CBF22','#7C5CBF08'] },
  birthday_notif:                { icon: '🎂', label: 'Birthday',         tint: '#EC4899', gradient: ['#EC489922','#EC489908'] },
  memorial_notif:                { icon: '🕯️', label: 'Memorial',         tint: '#8B5CF6', gradient: ['#8B5CF622','#8B5CF608'] },
  daily_tip:                     { icon: '💡', label: 'Daily Tip',        tint: '#F59E0B', gradient: ['#F59E0B22','#F59E0B08'] },
  // ── Social — posts & follows ─────────────────────────────────────────────────
  post_like:                     { icon: '❤️', label: 'Like',             tint: '#EC4899', gradient: ['#EC489922','#EC489908'] },
  post_comment:                  { icon: '💬', label: 'Comment',          tint: '#2196F3', gradient: ['#2196F322','#2196F308'] },
  follow:                        { icon: '👤', label: 'New Follower',     tint: '#8B5CF6', gradient: ['#8B5CF622','#8B5CF608'] },
  mention:                       { icon: '🏷️', label: 'Mention',          tint: '#F59E0B', gradient: ['#F59E0B22','#F59E0B08'] },
  new_post:                      { icon: '📝', label: 'New Post',         tint: '#8B5CF6', gradient: ['#8B5CF622','#8B5CF608'] },
  // ── Social — playdates ───────────────────────────────────────────────────────
  playdate_request:              { icon: '🐾', label: 'Playdate',         tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  playdate_resend:               { icon: '🔄', label: 'Playdate',         tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  playdate_proposal:             { icon: '📋', label: 'Playdate',         tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  playdate_counter_proposal:     { icon: '🔄', label: 'Playdate',         tint: '#F59E0B', gradient: ['#F59E0B22','#F59E0B08'] },
  playdate_accepted:             { icon: '✅', label: 'Playdate',         tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  playdate_confirmed:            { icon: '🎉', label: 'Playdate',         tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  playdate_declined:             { icon: '❌', label: 'Playdate',         tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  playdate_proposal_declined:    { icon: '❌', label: 'Playdate',         tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  playdate_proposal_cancelled:   { icon: '🚫', label: 'Playdate',         tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  playdate_withdrawal:           { icon: '🚫', label: 'Playdate',         tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  playdate_cancelled:            { icon: '❌', label: 'Playdate',         tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  playdate_rescheduled:          { icon: '📅', label: 'Playdate',         tint: '#F59E0B', gradient: ['#F59E0B22','#F59E0B08'] },
  playdate_reminder:             { icon: '📍', label: 'Playdate',         tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  playdate_completion:           { icon: '🏅', label: 'Playdate',         tint: '#22C55E', gradient: ['#22C55E22','#22C55E08'] },
  playdate_expired:              { icon: '⏰', label: 'Playdate',         tint: '#6B7280', gradient: ['#6B728022','#6B728008'] },
  playdate_chat_message:         { icon: '💬', label: 'Playdate Chat',    tint: '#2196F3', gradient: ['#2196F322','#2196F308'] },
  playdate_message:              { icon: '💬', label: 'Playdate Chat',    tint: '#2196F3', gradient: ['#2196F322','#2196F308'] },
  chat_message:                  { icon: '💬', label: 'Message',          tint: '#2196F3', gradient: ['#2196F322','#2196F308'] },
  // ── Family ──────────────────────────────────────────────────────────────────
  invite:                        { icon: '👥', label: 'Family Invite',    tint: '#2196F3', gradient: ['#2196F322','#2196F308'] },
  family_invite:                 { icon: '👥', label: 'Family Invite',    tint: '#2196F3', gradient: ['#2196F322','#2196F308'] },
  family_invite_sent:            { icon: '📨', label: 'Family Invite',    tint: '#2196F3', gradient: ['#2196F322','#2196F308'] },
  invite_accepted:               { icon: '✅', label: 'Family',           tint: '#1D9E75', gradient: ['#1D9E7522','#1D9E7508'] },
  family_update:                 { icon: '🏠', label: 'Family',           tint: '#F59E0B', gradient: ['#F59E0B22','#F59E0B08'] },
  // ── Events ──────────────────────────────────────────────────────────────────
  event_rsvp:                    { icon: '🎟️', label: 'Event',            tint: '#8B5CF6', gradient: ['#8B5CF622','#8B5CF608'] },
  event_update:                  { icon: '📢', label: 'Event',            tint: '#8B5CF6', gradient: ['#8B5CF622','#8B5CF608'] },
  // ── System ──────────────────────────────────────────────────────────────────
  upgrade_nudge:                 { icon: '⭐', label: 'Upgrade',          tint: '#F59E0B', gradient: ['#F59E0B22','#F59E0B08'] },
  broadcast:                     { icon: '📢', label: 'Announcement',     tint: '#6B7280', gradient: ['#6B728022','#6B728008'] },
  account_deletion_scheduled:    { icon: '⚠️', label: 'Account',          tint: '#E24B4A', gradient: ['#E24B4A22','#E24B4A08'] },
  system:                        { icon: '🔔', label: 'System',           tint: '#6B7280', gradient: ['#6B728022','#6B728008'] },
};

export const ALERT_NAV: Record<string, string> = {
  // Health
  appointment_reminder:        '/health/appointments',
  appointment_complete_prompt: '/health/appointments',
  medication_reminder:         '/health/medications',
  med_missed_dose:             '/health/medications',
  med_monthly_nudge:           '/health/medications',
  med_monthly_followup:        '/health/medications',
  vaccine_reminder:            '/health/vaccines',
  symptom_scan_ready:          '/ai/symptom-scan',
  // Care
  mood_reminder:               '/ai/mood-camera',
  feeding_reminder:            '/(tabs)/care',
  walk_reminder:               '/(tabs)/care',
  birthday_notif:              '/(tabs)/care',
  memorial_notif:              '/(tabs)/care',
  daily_tip:                   '/(tabs)/notifications',
  // Alerts
  lost_alert:                  '/(tabs)/sos',
  pet_found:                   '/(tabs)/sos',
  lost_owner_checkin:          '/(tabs)/sos',
  // Social — posts
  post_like:                   '/(tabs)/social',
  post_comment:                '/(tabs)/social',
  post_comment_reply:          '/(tabs)/social',
  follow:                      '/(tabs)/social',
  mention:                     '/(tabs)/social',
  new_post:                    '/(tabs)/social',
  // Social — playdates
  playdate_request:            '/my-playdates',
  playdate_resend:             '/my-playdates',
  playdate_proposal:           '/my-playdates',
  playdate_counter_proposal:   '/my-playdates',
  playdate_accepted:           '/my-playdates',
  playdate_confirmed:          '/my-playdates',
  playdate_declined:           '/my-playdates',
  playdate_proposal_declined:  '/my-playdates',
  playdate_proposal_cancelled: '/my-playdates',
  playdate_withdrawal:         '/my-playdates',
  playdate_cancelled:          '/my-playdates',
  playdate_rescheduled:        '/my-playdates',
  playdate_reminder:           '/my-playdates',
  playdate_completion:         '/my-playdates',
  playdate_expired:            '/my-playdates',
  playdate_chat_message:       '/my-playdates',
  playdate_message:            '/my-playdates',
  chat_message:                '/(tabs)/connect',
  // Family
  invite:                      '/(tabs)/connect',
  family_invite:               '/(tabs)/connect',
  family_invite_sent:          '/(tabs)/connect',
  invite_accepted:             '/(tabs)/connect',
  family_update:               '/(tabs)/connect',
  // Events
  event_rsvp:                  '/(tabs)/social-notifications',
  event_update:                '/(tabs)/social-notifications',
  // System
  upgrade_nudge:               '/(tabs)/notifications',
  broadcast:                   '/(tabs)/notifications',
  account_deletion_scheduled:  '/(tabs)/notifications',
  system:                      '/(tabs)/notifications',
};

export const ALL_TYPES = Object.keys(TYPE_META);

export interface NotifCardProps {
  item: NotificationLog;
  isRead: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  selecting: boolean;
  colors: any;
  isDark: boolean;
  pets: any[];
  onPress: (i: NotificationLog) => void;
  onLongPress: (i: NotificationLog) => void;
  onViewProfile: (petId: string) => void;
  onCareAction: (item: NotificationLog, markDone: boolean) => void;
}

export const NotifCard = React.memo(function NotifCard({
  item, isRead, isSelected, isExpanded, selecting,
  colors, isDark, pets, onPress, onLongPress, onViewProfile, onCareAction,
}: NotifCardProps) {
  const meta           = TYPE_META[item.type] ?? TYPE_META.system;
  const alertData      = item.data as any;
  const petId          = alertData?.pet_id;
  const pet            = pets.find(p => p.id === petId);
  const isPetAlert     = item.type === 'lost_alert' || item.type === 'pet_found';
  const isMedAlert     = item.type === 'medication_reminder' || item.type === 'med_missed_dose'
                      || item.type === 'med_monthly_nudge'   || item.type === 'med_monthly_followup';
  const isHealthCard   = isMedAlert || item.type === 'appointment_reminder'
                      || item.type === 'appointment_complete_prompt' || item.type === 'vaccine_reminder';
  const isCareReminder = item.type === 'walk_reminder' || item.type === 'feeding_reminder' || item.type === 'mood_reminder';
  const singlePet      = pets.length === 1;
  const alertPetName   = alertData?.pet_name ?? pet?.name ?? null;
  const petAccent      = pet?.accent_color ?? meta.tint;
  const scaleAnim      = useRef(new Animated.Value(1)).current;

  const onPressIn  = () => Animated.spring(scaleAnim, { toValue: 0.975, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () => Animated.spring(scaleAnim, { toValue: 1,     useNativeDriver: true, speed: 50 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], marginBottom: 10 }}>
      <Pressable
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        delayLongPress={350}
      >
        <View style={[
          nc.card,
          {
            backgroundColor: isSelected
              ? meta.tint + '10'
              : isRead ? (isDark ? '#1A1530' : '#FAFAFA') : meta.tint + '0D',
            borderColor: isSelected
              ? meta.tint + 'CC'
              : isRead ? (isDark ? '#2A2045' : '#EDEBF5') : meta.tint + '45',
          },
          isSelected && { borderWidth: 1.5 },
        ]}>
          {!isRead && <View style={[nc.accentBar, { backgroundColor: meta.tint }]} />}

          <View style={nc.cardInner}>
            {/* Checkbox or avatar */}
            {selecting ? (
              <View style={[nc.checkbox, {
                borderColor: isSelected ? meta.tint : (isDark ? '#4A3A6A' : '#C4B5E0'),
                backgroundColor: isSelected ? meta.tint : 'transparent',
              }]}>
                {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            ) : (
              <View style={{ position: 'relative', flexShrink: 0 }}>
                <View style={[nc.avatarRing, { borderColor: petAccent + '70' }]}>
                  <View style={[nc.iconCircle, { backgroundColor: meta.tint + '20' }]}>
                    <Text style={nc.iconEmoji}>{meta.icon}</Text>
                  </View>
                </View>
                {!isRead && <View style={[nc.unreadBadge, { backgroundColor: meta.tint, borderColor: isDark ? '#1A1530' : '#FAFAFA' }]} />}
              </View>
            )}

            {/* Content */}
            <View style={nc.content}>
              <View style={nc.row1}>
                {alertPetName ? (
                  <Text style={[nc.subjectName, { color: petAccent }]} numberOfLines={1}>{alertPetName}</Text>
                ) : null}
                <View style={[nc.typeChip, { backgroundColor: meta.tint + '18' }]}>
                  <Text style={[nc.typeChipText, { color: meta.tint }]}>{meta.label}</Text>
                </View>
              </View>
              {!!alertData?.reporter_handle && (
                <Text style={[nc.body, { color: colors.textSecondary ?? colors.textSecondary, fontSize: TYPO.body, marginBottom: 1 }]} numberOfLines={1}>
                  by @{alertData.reporter_handle}
                </Text>
              )}
              <Text style={[nc.title, { color: colors.textPrimary, fontWeight: isRead ? '500' : '700' }]} numberOfLines={isExpanded ? undefined : 1}>
                {item.title}
              </Text>
              {!!item.body && (
                <Text style={[nc.body, { color: colors.textSecondary }]}
                  numberOfLines={isHealthCard || isCareReminder || (isPetAlert && isExpanded) ? undefined : 2}>
                  {item.body}
                </Text>
              )}

              {/* Care CTA */}
              {isCareReminder && (
                <View style={nc.actionRow}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={e => { (e as any).stopPropagation?.(); onCareAction(item, singlePet); }}
                    style={[nc.actionPill, { backgroundColor: meta.tint + '18', borderColor: meta.tint + '40' }]}>
                    <Ionicons name={singlePet ? 'checkmark-circle-outline' : 'arrow-forward-circle-outline'} size={13} color={meta.tint} />
                    <Text style={[nc.actionPillText, { color: meta.tint }]}>
                      {singlePet ? (item.type === 'mood_reminder' ? 'Scan Now' : 'Mark Done') : 'View in Care'}
                    </Text>
                    {!singlePet && <Ionicons name="arrow-forward" size={12} color={meta.tint} />}
                  </TouchableOpacity>
                </View>
              )}

              {/* Health CTA */}
              {isHealthCard && (
                <View style={nc.actionRow}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={e => { (e as any).stopPropagation?.(); onPress(item); }}
                    style={[nc.actionPill, { backgroundColor: meta.tint + '18', borderColor: meta.tint + '40' }]}>
                    <Ionicons
                      name={isMedAlert ? 'medical-outline' : item.type === 'vaccine_reminder' ? 'shield-checkmark-outline' : 'calendar-outline'}
                      size={13} color={meta.tint} />
                    <Text style={[nc.actionPillText, { color: meta.tint }]}>
                      {item.type === 'med_missed_dose'                ? 'Log medication now'
                       : item.type === 'med_monthly_nudge'           ? 'Log monthly med'
                       : item.type === 'med_monthly_followup'        ? 'Confirm dose given'
                       : item.type === 'medication_reminder'         ? 'Log medication'
                       : item.type === 'appointment_complete_prompt' ? 'Mark as complete'
                       : item.type === 'appointment_reminder'        ? 'View appointment'
                       : 'View vaccine'}
                    </Text>
                    <Ionicons name="arrow-forward" size={12} color={meta.tint} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Lost pet chips */}
              {isPetAlert && (!!alertData?.reward_amount || !!alertData?.contact_phone) && (
                <View style={nc.infoRow}>
                  {!!alertData?.reward_amount && (
                    <View style={nc.infoChip}>
                      <Ionicons name="cash-outline" size={11} color="#B45309" />
                      <Text style={[nc.infoChipText, { color: '#B45309' }]}>${alertData.reward_amount} reward</Text>
                    </View>
                  )}
                  {!!alertData?.contact_phone && (
                    <TouchableOpacity
                      onPress={e => { e.stopPropagation(); Linking.openURL(`tel:${alertData.contact_phone}`); }}
                      style={[nc.infoChip, { backgroundColor: meta.tint + '15' }]}
                    >
                      <Ionicons name="call-outline" size={11} color={meta.tint} />
                      <Text style={[nc.infoChipText, { color: meta.tint, textDecorationLine: 'underline' }]}>
                        {alertData.contact_phone}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Expanded lost/found detail panel */}
              {isPetAlert && isExpanded && (
                <View style={[nc.expandPanel, { borderTopColor: isDark ? '#3A2A5A' : '#E8E3F5' }]}>
                  {(!!alertData?.last_seen_address || (!!alertData?.lat && !!alertData?.lng)) && (
                    <View style={nc.expandRow}>
                      <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                      <Text style={[nc.expandText, { color: colors.textSecondary }]}>
                        {alertData.last_seen_address ?? `Near ${Number(alertData.lat).toFixed(4)}, ${Number(alertData.lng).toFixed(4)}`}
                      </Text>
                    </View>
                  )}
                  {!!(alertData?.pet_species || alertData?.pet_breed) && (
                    <View style={nc.expandRow}>
                      <Ionicons name="paw-outline" size={13} color={colors.textSecondary} />
                      <Text style={[nc.expandText, { color: colors.textSecondary }]}>
                        {[alertData.pet_species, alertData.pet_breed].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  )}
                  {!!alertData?.pet_microchip && (
                    <View style={nc.expandRow}>
                      <Ionicons name="hardware-chip-outline" size={13} color={colors.textSecondary} />
                      <Text style={[nc.expandText, { color: colors.textSecondary }]}>Microchip: {alertData.pet_microchip}</Text>
                    </View>
                  )}
                  {!!alertData?.found_details && (
                    <View style={nc.expandRow}>
                      <Ionicons name="search-outline" size={13} color={colors.textSecondary} />
                      <Text style={[nc.expandText, { color: colors.textSecondary }]}>{alertData.found_details}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    disabled={!petId}
                    onPress={e => { e.stopPropagation(); onViewProfile(petId); }}
                    style={[nc.profileBtn, { backgroundColor: meta.tint + '18', borderColor: meta.tint + '40' }]}
                  >
                    <Ionicons name="paw" size={14} color={meta.tint} />
                    <Text style={[nc.profileBtnText, { color: meta.tint }]}>View their profile</Text>
                    <Ionicons name="arrow-forward" size={13} color={meta.tint} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Right: time + indicator */}
            <View style={nc.rightCol}>
              <Text style={[nc.timeText, { color: colors.textSecondary }]}>{timeLabel(item.created_at)}</Text>
              {!isRead
                ? <View style={[nc.unreadDot, { backgroundColor: meta.tint }]} />
                : isPetAlert
                  ? <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={isDark ? '#4A3A6A' : '#C4B5E0'} />
                  : isHealthCard ? null
                  : ALERT_NAV[item.type]
                    ? <Ionicons name="chevron-forward" size={12} color={isDark ? '#4A3A6A' : '#C4B5E0'} />
                    : null
              }
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

export const nc = StyleSheet.create({
  card:           { borderRadius: 18, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8 },
  cardInner:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, paddingLeft: 18, gap: 13 },
  accentBar:      { position: 'absolute', left: 0, top: 8, bottom: 8, width: 4, borderRadius: 4 },
  avatarRing:     { borderRadius: 27, borderWidth: 2.5, padding: 2 },
  iconCircle:     { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  iconEmoji:      { fontSize: TYPO.title },
  unreadBadge:    { position: 'absolute', top: 0, right: 0, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  checkbox:       { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content:        { flex: 1, gap: 4 },
  row1:           { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  subjectName:    { fontSize: TYPO.body, fontWeight: '800' },
  typeChip:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeChipText:   { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.2 },
  title:          { fontSize: TYPO.body, lineHeight: 19 },
  body:           { fontSize: TYPO.body, lineHeight: 18 },
  rightCol:       { alignItems: 'flex-end', gap: 6, alignSelf: 'flex-start', paddingTop: 1 },
  timeText:       { fontSize: TYPO.body, fontWeight: '600' },
  unreadDot:      { width: 8, height: 8, borderRadius: 4 },
  infoRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  infoChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, backgroundColor: '#F59E0B15' },
  infoChipText:   { fontSize: TYPO.body, fontWeight: '600' },
  expandPanel:    { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  expandRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expandText:     { fontSize: TYPO.body, flex: 1, lineHeight: 18 },
  profileBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 10, marginTop: 6, borderWidth: 1 },
  profileBtnText: { fontSize: TYPO.body, fontWeight: '700' },
  actionRow:      { marginTop: 10 },
  actionPill:     { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  actionPillText: { fontSize: TYPO.caption, fontWeight: '700' },
});
