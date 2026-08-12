import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { format, parseISO } from 'date-fns';
import { showAlert } from '@/components/AppAlert';
import BottomSheet from '@/components/BottomSheet';
import { formatTime } from '@/lib/units';
import { PlaydateEntry } from '@/features/playdates/types';
import { Linking } from 'react-native';
import { TYPO } from '@/constants/theme';

export function buildIcsDt(date: string, time?: string | null, plusHours = 0): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = (time ?? '12:00').split(':').map(Number);
  const dt = new Date(y, mo - 1, d, h + plusHours, m, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

interface Props {
  entry: PlaydateEntry | null;
  myPetName: string;
  colors: any;
  ac: string;
  bottomInset: number;
  onClose: () => void;
}

export const CalendarSheet = React.memo(function CalendarSheet({ entry, myPetName, colors, ac, bottomInset, onClose }: Props) {
  const title = entry ? `Playdate: ${myPetName} & ${entry.pet.name}` : '';

  const addApple = async () => {
    if (!entry?.agreed_date) return;
    try {
      const dtStart = buildIcsDt(entry.agreed_date, entry.agreed_time);
      const dtEnd   = buildIcsDt(entry.agreed_date, entry.agreed_time, 1);
      const ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FamilyCube//EN',
        'BEGIN:VEVENT',
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${title}`,
        'DESCRIPTION:Scheduled via Family Cube',
        `UID:playdate-${entry.id}@familycube`,
        'END:VEVENT', 'END:VCALENDAR',
      ].join('\r\n');
      const path = `${FileSystem.cacheDirectory}playdate.ics`;
      await FileSystem.writeAsStringAsync(path, ics, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'text/calendar', UTI: 'public.calendar-event' });
      showAlert('Added to Calendar! 🐾', 'Your playdate has been saved. Tap "Add to Calendar" if prompted.');
      onClose();
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not export calendar event');
    }
  };

  const addGoogle = () => {
    if (!entry?.agreed_date) return;
    const dtStart = buildIcsDt(entry.agreed_date, entry.agreed_time);
    const dtEnd   = buildIcsDt(entry.agreed_date, entry.agreed_time, 1);
    const dates = `${dtStart}/${dtEnd}`;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dates}&details=${encodeURIComponent('Scheduled via Family Cube')}`;
    Linking.openURL(url);
    showAlert('Opening Google Calendar 🐾', 'Complete the event in Google Calendar to save your playdate.');
    onClose();
  };

  const fmtDate = entry?.agreed_date ? (() => {
    try {
      const parts = [format(parseISO(entry.agreed_date!), 'EEE, MMM d, yyyy')];
      if (entry.agreed_time) {
        const [h, m] = entry.agreed_time.split(':').map(Number);
        const d = new Date(); d.setHours(h, m, 0, 0);
        parts.push(formatTime(d));
      }
      return parts.join(' · ');
    } catch { return entry.agreed_date ?? ''; }
  })() : '';

  return (
    <BottomSheet visible={!!entry} onClose={onClose}>
      {entry && (
        <View style={{ paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <LinearGradient colors={[`${ac}40`, `${ac}18`]}
              style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: TYPO.title }}>📅</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }}>{title}</Text>
              {entry.agreed_date && (
                <Text style={{ fontSize: TYPO.body, color: '#22C55E', fontWeight: '600', marginTop: 2 }}>{fmtDate}</Text>
              )}
            </View>
          </View>

          <View style={{ gap: 10, marginBottom: 14 }}>
            <TouchableOpacity onPress={addApple}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: colors.inputBg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FF3B3018',
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: TYPO.heading }}>{Platform.OS === 'android' ? '📆' : ''}</Text>
                {Platform.OS !== 'android' && <Ionicons name="calendar" size={20} color="#FF3B30" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                  {Platform.OS === 'android' ? 'Phone Calendar' : 'Apple Calendar'}
                </Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>Add via .ics share</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity onPress={addGoogle}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: colors.inputBg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#4285F418',
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: TYPO.heading }}>🗓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Google Calendar</Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>Opens in browser / app</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onClose}
            style={{ alignItems: 'center', paddingVertical: 14, borderRadius: 14,
              backgroundColor: colors.inputBg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
});

export default CalendarSheet;
